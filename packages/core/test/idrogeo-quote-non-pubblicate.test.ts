import { describe, expect, it } from 'vitest';
import { idrogeoComunale } from '../src/risk/data/idrogeo-comunale.js';
import { frasiIdrogeo, livelloFrana, livelloIdraulico } from '../src/risk/idrogeo.js';
import type { IndicatoriIdrogeo } from '../src/risk/idrogeo.js';
import { indicatoriIdrogeoDelComune, territorialExposureDi } from '../src/risk/geo.js';
import { predicates } from '../src/risk/rules.js';
import type { CompanyFacts } from '../src/company/facts.js';
import { calcolaPropertyRisk } from '../src/protezioni/property-risk.js';
import type { UbicazionePerProperty } from '../src/protezioni/property-risk.js';

/**
 * Le quote ISPRA non pubblicate, e la quota media che comprende l'elevata.
 *
 * Trovati il 14/09/2026 guardando la scheda. IdroGEO segnala un dato non pubblicato con −1, e
 * l'archivio lo conservava come numero: 311 comuni con «−1 % delle imprese» in pericolosità
 * idraulica elevata, e livelli calcolati su quel −1. E la soglia sommava la quota elevata alla
 * media, che la comprende già: le imprese in area elevata contate due volte.
 *
 * I valori attesi vengono dall'archivio ISPRA e dal conto fatto a mano, non dal codice.
 */

const livelli = idrogeoComunale.livelli as Readonly<Record<string, IndicatoriIdrogeo>>;
const vuoto: IndicatoriIdrogeo = { idrA: 0, idrM: 0, impIdrA: 0, impIdrM: 0, frnA: 0, impFrnA: 0 };

function indicatori(comune: string, provincia: string): IndicatoriIdrogeo {
  const trovati = indicatoriIdrogeoDelComune(comune, provincia);
  if (trovati === null) throw new Error(`${comune} (${provincia}) non è nell'archivio`);
  return trovati;
}

describe('L’archivio ISPRA non contiene numeri inventati', () => {
  it('nessun valore negativo: dove ISPRA non pubblica il dato c’è null', () => {
    const negativi: string[] = [];
    let nulli = 0;
    for (const [chiave, valori] of Object.entries(livelli)) {
      for (const [campo, valore] of Object.entries(valori)) {
        if (valore === null) nulli += 1;
        else if (typeof valore !== 'number' || valore < 0)
          negativi.push(`${chiave}.${campo} = ${String(valore)}`);
      }
    }
    expect(negativi).toEqual([]);
    // Il caso esiste davvero: senza, i test qui sotto proverebbero una situazione immaginaria.
    expect(nulli).toBeGreaterThan(0);
  });

  it('la quota media non è mai minore dell’elevata, perché la comprende', () => {
    const contraddizioni = Object.entries(livelli).filter(
      ([, v]) =>
        (v.impIdrA !== null && v.impIdrM !== null && v.impIdrA > v.impIdrM + 0.001) ||
        (v.idrA !== null && v.idrM !== null && v.idrA > v.idrM + 0.001),
    );
    expect(contraddizioni.map(([chiave]) => chiave)).toEqual([]);
  });
});

describe('Il livello idraulico non somma due volte le stesse imprese', () => {
  it('sui comuni veri', () => {
    // Ozegna: 12,5 % in elevata e 29,9 % in media o elevata. Sommate davano 42,4 %, «alta».
    expect(livelloIdraulico(indicatori('Ozegna', 'TO'))).toBe('media');
    // Dello: 28,8 % in elevata, alta per la sola elevata. Ravenna: 99,8 % in media o elevata.
    expect(livelloIdraulico(indicatori('Dello', 'BS'))).toBe('alta');
    expect(livelloIdraulico(indicatori('Ravenna', 'RA'))).toBe('alta');
  });

  it('ai bordi delle soglie', () => {
    expect(livelloIdraulico({ ...vuoto, impIdrA: 10, impIdrM: 35 })).toBe('media');
    expect(livelloIdraulico({ ...vuoto, impIdrA: 10, impIdrM: 40 })).toBe('alta');
    expect(livelloIdraulico({ ...vuoto, impIdrA: 2, impIdrM: 14.9 })).toBe('bassa');
    expect(livelloIdraulico({ ...vuoto, impIdrA: 2, impIdrM: 15 })).toBe('media');
    expect(livelloIdraulico({ ...vuoto, impIdrA: 3, impIdrM: 3 })).toBe('media');
  });
});

describe('Con una quota non pubblicata il livello si decide solo se è certo', () => {
  it('sui comuni veri', () => {
    // Anterivo: elevata non pubblicata, media 0 %: anche l'elevata, che vi è compresa, è 0.
    expect(livelloIdraulico(indicatori('Anterivo/Altrei', 'BZ'))).toBe('bassa');
    // Villabassa: elevata non pubblicata, media 59,8 %: alta comunque.
    expect(livelloIdraulico(indicatori('Villabassa/Niederdorf', 'BZ'))).toBe('alta');
    // Aldino (media 3,4 %) e Petriano (media 15,5 %): l'elevata potrebbe cambiare il livello.
    expect(livelloIdraulico(indicatori('Aldino/Aldein', 'BZ'))).toBeNull();
    expect(livelloIdraulico(indicatori('Petriano', 'PU'))).toBeNull();
  });

  it('ai bordi delle soglie', () => {
    expect(livelloIdraulico({ ...vuoto, impIdrA: null, impIdrM: 2.9 })).toBe('bassa');
    expect(livelloIdraulico({ ...vuoto, impIdrA: null, impIdrM: 3 })).toBeNull();
    expect(livelloIdraulico({ ...vuoto, impIdrA: null, impIdrM: 39.9 })).toBeNull();
    expect(livelloIdraulico({ ...vuoto, impIdrA: null, impIdrM: 40 })).toBe('alta');
    expect(livelloIdraulico({ ...vuoto, impIdrA: 15, impIdrM: null })).toBe('alta');
    expect(livelloIdraulico({ ...vuoto, impIdrA: 14, impIdrM: null })).toBeNull();
    expect(livelloIdraulico({ ...vuoto, impIdrA: null, impIdrM: null })).toBeNull();
  });

  it('una quota da frana non pubblicata non è «bassa»', () => {
    expect(livelloFrana({ ...vuoto, impFrnA: null })).toBeNull();
    expect(livelloFrana({ ...vuoto, impFrnA: 0 })).toBe('bassa');
  });
});

describe('Le frasi dicono che il dato non è pubblicato, invece di stamparlo', () => {
  it('senza la quota elevata', () => {
    const testo = frasiIdrogeo(indicatori('Aldino/Aldein', 'BZ'), 'ALDINO').join(' ');
    expect(testo).toContain('3,4 % delle imprese di ALDINO è in area a pericolosità media o elevata');
    expect(testo).toContain('ISPRA non pubblica la quota della sola elevata');
    expect(testo).not.toMatch(/[-−]1\s*%/);
  });

  it('senza nessuna quota idraulica, e senza la quota da frana', () => {
    const testo = frasiIdrogeo({ ...vuoto, impIdrA: null, impIdrM: null, impFrnA: null }, 'PROVA').join(
      ' ',
    );
    expect(testo).toContain(
      'ISPRA non pubblica la quota di imprese di PROVA in area a pericolosità idraulica',
    );
    expect(testo).toContain(
      'ISPRA non pubblica la quota di imprese di PROVA in area a pericolosità da frana',
    );
  });

  it('con la quota media a zero non c’è niente da non pubblicare: nemmeno l’elevata', () => {
    // Anterivo: elevata non pubblicata, media 0 %. L'elevata vi è compresa, quindi è zero anche lei.
    const testo = frasiIdrogeo(indicatori('Anterivo/Altrei', 'BZ'), 'ANTERIVO').join(' ');
    expect(testo).toContain('nessuna impresa di ANTERIVO risulta in area a pericolosità idraulica mappata');
    expect(testo).not.toContain('ISPRA non pubblica');
  });

  it('senza la sola quota media, l’elevata pubblicata si dice', () => {
    const testo = frasiIdrogeo({ ...vuoto, impIdrA: 20, impIdrM: null }, 'PROVA').join(' ');
    expect(testo).toContain(
      '20 % delle imprese di PROVA è in area a pericolosità elevata; ISPRA non pubblica la quota in area media o elevata',
    );
  });

  it('con entrambe le quote, la media si dice «media o elevata»', () => {
    const testo = frasiIdrogeo(indicatori('Ozegna', 'TO'), 'OZEGNA').join(' ');
    expect(testo).toContain('12,5 % delle imprese di OZEGNA è in area a pericolosità elevata');
    expect(testo).toContain('29,9 % in area a pericolosità media o elevata');
  });
});

describe('Nell’esposizione della sede e nel registro dei rischi', () => {
  const fattiCon = (...esposizioni: ReturnType<typeof territorialExposureDi>[]): CompanyFacts =>
    ({ esposizioniTerritoriali: esposizioni, provinceOperative: [] }) as unknown as CompanyFacts;

  it('il comune riconosciuto senza quota pubblicata resta «non determinata», e non ripiega sulla provincia', () => {
    const aldino = territorialExposureDi({ provincia: 'BZ', comune: 'Aldino/Aldein' });
    expect(aldino.idraulica).toBeNull();
    expect(aldino.idraulicaEtichetta).toBe('non determinata');
    expect(aldino.idrogeoComunale).toBe(true);
    // La frana invece è pubblicata: 6,8 % delle imprese, media.
    expect(aldino.frane).toBe('media');
  });

  it('la regola della zona idraulica alta risponde «ignoto» dove ISPRA non pubblica', () => {
    const aldino = territorialExposureDi({ provincia: 'BZ', comune: 'Aldino/Aldein' });
    const ozegna = territorialExposureDi({ provincia: 'TO', comune: 'Ozegna' });
    const ravenna = territorialExposureDi({ provincia: 'RA', comune: 'Ravenna' });

    expect(predicates.idraulicaAlta(fattiCon(aldino))).toBe('ignoto');
    expect(predicates.idraulicaAlta(fattiCon(ozegna, aldino))).toBe('ignoto');
    expect(predicates.idraulicaAlta(fattiCon(ozegna))).toBe(false);
    expect(predicates.idraulicaAlta(fattiCon(ravenna, aldino))).toBe(true);
  });

  it('sul ripiego provinciale il comportamento non cambia', () => {
    // Nessuna sede risolta: la tabella provinciale classifica alta Ravenna e tace su Milano.
    const soloProvince = (...sigle: string[]): CompanyFacts =>
      ({ esposizioniTerritoriali: [], provinceOperative: sigle }) as unknown as CompanyFacts;
    expect(predicates.idraulicaAlta(soloProvince('MI'))).toBe(false);
    expect(predicates.idraulicaAlta(soloProvince('RA'))).toBe(true);
  });
});

describe('Nel Property Risk', () => {
  const sede = (ind: IndicatoriIdrogeo): UbicazionePerProperty => ({
    id: 'prova|via-1',
    etichetta: 'Sede legale — VIA PROVA 1, PROVA (XX)',
    tipo: 'sede-legale',
    zonaSismica: 3,
    indicatoriIdrogeo: ind,
  });

  it('una quota che non stabilisce il livello lascia l’alluvione senza punteggio, e lo dice', () => {
    const [u] = calcolaPropertyRisk('49', [sede(indicatori('Aldino/Aldein', 'BZ'))]).ubicazioni;
    const pericoli = u?.voci.find((v) => v.voce === 'Pericoli naturali');

    expect(u?.punteggi.alluvione).toBeNull();
    expect(u?.punteggi.frana).toBe(4);
    expect(u?.punteggio).toBeNull();
    expect(u?.didascalie.alluvione).toBe('quote ISPRA non pubblicate');
    expect(pericoli?.dettaglio).toContain(
      'Alluvione: ISPRA non pubblica per questo comune le quote che servono a stabilire il livello',
    );
    expect(pericoli?.dettaglio).not.toMatch(/[-−]1\s*%/);
  });

  it('con la quota media a zero l’alluvione vale 1, senza avvertire che manca l’elevata', () => {
    // Anterivo: elevata non pubblicata, media 0 %, frana 4,2 % (media).
    const [u] = calcolaPropertyRisk('49', [sede(indicatori('Anterivo/Altrei', 'BZ'))]).ubicazioni;
    const pericoli = u?.voci.find((v) => v.voce === 'Pericoli naturali');

    expect(u?.punteggi.alluvione).toBe(1);
    expect(u?.punteggi.frana).toBe(4);
    expect(pericoli?.dettaglio).toContain(
      'pericolosità idraulica bassa nel comune secondo ISPRA, senza imprese in area media o elevata.',
    );
    expect(pericoli?.dettaglio).not.toContain('non è pubblicata');
  });

  it('con la sola quota media sopra il 40 % l’alluvione vale 7, e la frase lo dichiara', () => {
    /*
      Villabassa-come: elevata non pubblicata, 59,8 % in media o elevata, frana 0.
      Attività 4, sito 4 (sede legale), terremoto 3, alluvione 7, frana 1.
      Medio (7 + 3 + 1) / 3 = 3,67; pericoli 50% × 7 + 50% × 3,67 = 5,335 → 5,34.
      Property 4 × 30% + 4 × 20% + 5,34 × 50% = 1,20 + 0,80 + 2,67 = 4,67.
    */
    const [u] = calcolaPropertyRisk('49', [
      sede({ ...vuoto, impIdrA: null, impIdrM: 59.813, impFrnA: 0 }),
    ]).ubicazioni;
    const pericoli = u?.voci.find((v) => v.voce === 'Pericoli naturali');

    expect(u?.punteggi.alluvione).toBe(7);
    expect(u?.punteggio).toBe(4.67);
    expect(pericoli?.dettaglio).toContain(
      '59,8 % delle imprese in area media o elevata; la quota della sola elevata non è pubblicata',
    );
  });
});
