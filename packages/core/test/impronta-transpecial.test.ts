import { describe, expect, it } from 'vitest';
import { DEMO_AS_OF, Money, analyzeCompany, demoCompanyProfile } from '../src/index.js';
import type { CompanyProfile } from '../src/index.js';
import { immobilizzazioniDiBilancio } from '../src/assessment/analyze.js';
import { analizzaUbicazioni } from '../src/company/ubicazioni.js';
import { computeSumsInsured } from '../src/coverage/sums-insured.js';
import type { CompanyFacts } from '../src/company/facts.js';

/**
 * Il capitale fabbricati da cartografia, e il controllo con il bilancio.
 *
 * TRANSPECIAL S.R.L., autotrasporto, 12 dipendenti: la scheda assicurava 18.000.000 € di
 * fabbricati — la somma di sette capannoni — con immobilizzazioni a bilancio di 774.212 € in
 * tutto. Anche il solo fabbricato dell'indirizzo, 5.928 m², vale sette volte il bilancio.
 */
const fatti = { dimensione: 'piccola', atecoSezione: 'H', atecoDivisione: '49' } as unknown as CompanyFacts;

describe('Le immobilizzazioni a bilancio dagli indici dell’archivio', () => {
  const profilo = demoCompanyProfile();
  const conArchivio = (margine: number | null, indice: number | null): CompanyProfile => ({
    ...profilo,
    bilanci: [],
    indicatoriFornitore: {
      ...profilo.indicatoriFornitore,
      aggregati: { patrimonioNetto: 393_127 },
      solidita: {
        ...profilo.indicatoriFornitore.solidita!,
        margineDiStruttura: margine,
        indiceMargineDiStruttura: indice,
      },
    },
  });

  it('TRANSPECIAL: margine e indice concordano su 774.212 €', () => {
    expect(immobilizzazioniDiBilancio(conArchivio(-381_085, 0.51), null)).toBe(774_212);
  });

  it('se le due strade non concordano non si usa niente', () => {
    expect(immobilizzazioniDiBilancio(conArchivio(-381_085, 2), null)).toBeNull();
    expect(immobilizzazioniDiBilancio(conArchivio(null, 0.51), null)).toBeNull();
  });
});

describe('La stima da cartografia oltre cinque volte il bilancio va verificata', () => {
  const opzioni = (immobilizzazioni?: number) => ({
    superficieCartograficaMq: 5_928,
    ubicazioniConSuperficie: 1,
    ubicazioniTotali: 1,
    immobilizzazioniDiBilancioEuro: immobilizzazioni,
  });

  it('TRANSPECIAL: confidenza bassa, e la nota dice i due importi', () => {
    const f = computeSumsInsured(fatti, null, [], opzioni(774_212)).fabbricati;
    expect(f.confidence).toBe('bassa');
    const note = f.explanation.notes.join(' ');
    expect(note).toContain('DA VERIFICARE PRIMA DI QUOTARE');
    expect(note).toContain('titolo di godimento');
    expect(f.explanation.inputs.map((i) => i.label)).toContain('Immobilizzazioni a bilancio');
  });

  it('con un bilancio proporzionato la stima resta a confidenza media, senza nota', () => {
    const f = computeSumsInsured(fatti, null, [], opzioni(2_000_000)).fabbricati;
    expect(f.confidence).toBe('media');
    expect(f.explanation.notes.join(' ')).not.toContain('DA VERIFICARE');
  });

  it('senza bilancio nessun controllo, come prima', () => {
    const f = computeSumsInsured(fatti, null, [], opzioni()).fabbricati;
    expect(f.confidence).toBe('media');
  });

  it('la nota di metodo dice che si conta il solo fabbricato dell’indirizzo', () => {
    const f = computeSumsInsured(fatti, null, [], opzioni()).fabbricati;
    expect(f.explanation.notes.join(' ')).toContain('I fabbricati vicini non sono contati');
  });
});

describe('L’ubicazione di TRANSPECIAL: un’etichetta sola, e una domanda al singolare', () => {
  const indirizzo = (via: string, civico: string | null, coordinate: boolean) => ({
    via,
    civico,
    cap: '25032',
    comune: 'CHIARI',
    provincia: 'BS',
    regione: 'Lombardia',
    frazione: null,
    latitudine: coordinate ? 45.53 : null,
    longitudine: coordinate ? 9.93 : null,
  });

  it('l’etichetta si compone dalla scrittura tenuta, quella con le coordinate', () => {
    // La tabella diceva «VIA FORNACI 20/22» e le fotografie «VIA FORNACI, 20/22».
    const a = analizzaUbicazioni({
      sedeLegale: indirizzo('VIA FORNACI, 20/22', null, true),
      unitaLocali: [
        {
          tipo: 'sede-operativa',
          indirizzo: indirizzo('VIA FORNACI', '20/22', false),
          attivita: null,
          addetti: null,
        },
      ],
      immobili: [],
    });
    expect(a.ubicazioni, 'le due scritture devono restare un’ubicazione sola').toHaveLength(1);
    const u = a.ubicazioni[0]!;
    expect(u.indirizzo.latitudine).not.toBeNull();
    expect(u.etichetta).toContain('VIA FORNACI, 20/22,');
  });

  it('una sola ubicazione: «Il capitale fabbricati», non «Su una di esse»', () => {
    const sede = indirizzo('VIA SAN BERNARDINO', '10', true);
    const id = analizzaUbicazioni({ sedeLegale: sede, unitaLocali: [], immobili: [] }).ubicazioni[0]!.id;
    const contesto = {
      vigiliDelFuoco: [],
      attivitaVicine: [],
      fabbricati: {
        quanti: 7,
        superficieCopertaMq: 18_944,
        maggioreMq: 7_985,
        principaleMq: 5_928,
        principaleDistanzaMetri: 1,
      },
      meteo: null,
      attivitaCheAggravano: 0,
      raggioAnalizzatoMetri: 300,
      fonte: '© contributori OpenStreetMap',
    };
    const d = analizzaUbicazioni({
      sedeLegale: sede,
      unitaLocali: [],
      immobili: [],
      contesti: new Map([[id, contesto]]),
    }).domande.join(' ');
    expect(d).toContain('Il capitale fabbricati è stato stimato dall’impronta a terra');
    expect(d).not.toContain('di esse');
  });
});

describe('Il controllo con il bilancio arriva fino all’analisi', () => {
  it('TRANSPECIAL: 5.928 m² con 774.212 € di immobilizzazioni escono da verificare', () => {
    const profilo = demoCompanyProfile();
    const sede = { ...profilo.anagrafica.value.sedeLegale!, latitudine: 45.62741, longitudine: 10.08347 };
    const transpecial: CompanyProfile = {
      ...profilo,
      bilanci: [],
      datiDichiarati: { ...profilo.datiDichiarati, immobili: [] },
      anagrafica: { ...profilo.anagrafica, value: { ...profilo.anagrafica.value, sedeLegale: sede } },
      unitaLocali: null,
      indicatoriFornitore: {
        ...profilo.indicatoriFornitore,
        aggregati: { patrimonioNetto: 393_127 },
        solidita: {
          ...profilo.indicatoriFornitore.solidita!,
          margineDiStruttura: -381_085,
          indiceMargineDiStruttura: 0.51,
        },
      },
    };
    const contesto = {
      vigiliDelFuoco: [],
      attivitaVicine: [],
      fabbricati: {
        quanti: 7,
        superficieCopertaMq: 18_944,
        maggioreMq: 7_985,
        principaleMq: 5_928,
        principaleDistanzaMetri: 1,
      },
      meteo: null,
      attivitaCheAggravano: 0,
      raggioAnalizzatoMetri: 300,
      fonte: '© contributori OpenStreetMap',
    };
    const id = analizzaUbicazioni({ sedeLegale: sede, unitaLocali: [], immobili: [] }).ubicazioni[0]!.id;
    const f = analyzeCompany(transpecial, [], DEMO_AS_OF, {
      contestiTerritoriali: new Map([[id, contesto]]),
    }).sommeAssicurande.fabbricati;
    const etichette = f.explanation.inputs.map((i) => i.label);
    expect(
      etichette.some((e) => e.startsWith('Superficie coperta')),
      'la stima da cartografia non è partita: la prova non misurerebbe il controllo',
    ).toBe(true);
    expect(etichette).toContain('Immobilizzazioni a bilancio');
    expect(f.confidence).toBe('bassa');
  });
});

describe('Nell’analisi entra il fabbricato dell’indirizzo, mai la somma', () => {
  it('un contesto con la somma dell’isolato e il fabbricato dell’indirizzo stima sul secondo', () => {
    const profilo = demoCompanyProfile();
    const senzaImmobili: CompanyProfile = {
      ...profilo,
      datiDichiarati: { ...profilo.datiDichiarati, immobili: [] },
    };
    const contesto = {
      vigiliDelFuoco: [],
      attivitaVicine: [],
      fabbricati: {
        quanti: 7,
        superficieCopertaMq: 18_944,
        maggioreMq: 7_985,
        principaleMq: 5_928,
        principaleDistanzaMetri: 1,
      },
      meteo: null,
      attivitaCheAggravano: 0,
      raggioAnalizzatoMetri: 300,
      fonte: '© contributori OpenStreetMap',
    };
    const sede = {
      ...senzaImmobili.anagrafica.value.sedeLegale!,
      latitudine: 45.62741,
      longitudine: 10.08347,
    };
    const conCoordinate: CompanyProfile = {
      ...senzaImmobili,
      anagrafica: {
        ...senzaImmobili.anagrafica,
        value: { ...senzaImmobili.anagrafica.value, sedeLegale: sede },
      },
      unitaLocali: null,
    };
    // L'id si chiede alla stessa funzione che lo produce: una chiave scritta a mano, se non
    // combacia, farebbe passare la prova senza agganciare il contesto.
    const id = analizzaUbicazioni({ sedeLegale: sede, unitaLocali: [], immobili: [] }).ubicazioni[0]!.id;
    const a = analyzeCompany(conCoordinate, [], DEMO_AS_OF, {
      contestiTerritoriali: new Map([[id, contesto]]),
    });
    const stimata = a.sommeAssicurande.fabbricati.explanation.inputs.find((i) =>
      i.label.startsWith('Superficie coperta'),
    );
    expect(stimata, 'il contesto non si è agganciato: la prova non misurerebbe niente').toBeDefined();
    expect(stimata!.value).toContain('5928');
    expect(Money.toEuro(a.sommeAssicurande.fabbricati.value!)).toBeLessThan(10_000_000);
  });
});
