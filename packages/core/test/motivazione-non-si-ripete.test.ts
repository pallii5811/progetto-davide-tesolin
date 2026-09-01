import { describe, expect, it } from 'vitest';
import { COVERAGE_CATALOG } from '../src/coverage/taxonomy.js';
import { componiMotivazioneCopertura } from '../src/coverage/motivazione.js';
import type { CompanyFacts } from '../src/company/facts.js';
import type { FormaGiuridica } from '../src/company/profile.js';

/**
 * Una motivazione che ripete sé stessa.
 *
 * IL RECLAMO, parola per parola, dopo aver letto la scheda intera:
 * «A ME SEMBRANO FRASI GENERICHE TUTTE UGUALI».
 *
 * Aveva ragione, e il difetto non era nella scrittura delle singole frasi — ognuna, presa
 * da sola, era esatta e con la sua norma. Era nel modo in cui venivano messe in fila.
 *
 * `componiMotivazioneCopertura` stampava sempre la frase di catalogo e **poi** i frammenti
 * accesi dai fatti. Ma i frammenti sono nati dopo, per dire meglio ciò che la frase di
 * catalogo diceva in generale. Il risultato, sulla scheda che l'intermediario aveva davanti:
 *
 *   RCO              «L'indennizzo INAIL non esaurisce il danno risarcibile» — due volte
 *                     nello stesso paragrafo, a tre righe di distanza
 *   RC Inquinamento   i costi di bonifica esclusi dalla RCT ordinaria — tre volte nella
 *                     stessa scheda: catalogo, frammento e azione consigliata
 *   RC Prodotti       il regime che prescinde dalla colpa, detto due volte con parole
 *                     appena diverse
 *
 * Perché conta più di quanto sembri: un documento di adeguatezza vale per la distinzione
 * fra ciò che è stato **accertato su questa impresa** e ciò che vale per tutte. Quando la
 * stessa affermazione compare due volte, riformulata, quella distinzione sparisce — e il
 * lettore conclude che il testo sia stato generato a macchina. È la conclusione a cui è
 * arrivato il proprietario del prodotto leggendo la propria scheda.
 *
 * QUESTA PROVA non guarda le tre frasi che sono state corrette: guarda **ogni** copertura
 * su ogni combinazione di fatti che accende un frammento, e cerca affermazioni ripetute.
 * Correggere tre stringhe non impedisce alla quarta copertura di reintrodurre il difetto;
 * questo controllo sì.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Come si riconosce un'affermazione ripetuta
// ─────────────────────────────────────────────────────────────────────────────

/*
  Non si cercano frasi identiche: nessuna delle tre lo era.

  «I costi di bonifica e di ripristino ambientale non sono coperti dalla RCT ordinaria»
  e «i costi di bonifica e ripristino restano esclusi dalla RCT ordinaria» non condividono
  nemmeno sei parole di fila, e un confronto letterale le avrebbe dichiarate diverse.

  Si tolgono quindi le parole di servizio — articoli, preposizioni, ausiliari — e si
  confrontano le sequenze di tre parole di contenuto. Su quella coppia resta
  «costi bonifica ripristino» in entrambe, che è esattamente l'affermazione ripetuta.

  Tre è la soglia scelta a ragion veduta: con due parole «danno terzi» o «costi bonifica»
  comparirebbero ovunque senza che nulla sia ripetuto; con quattro la coppia qui sopra
  sfugge, perché la quarta parola è «ambientale» in una e «esclusi» nell'altra.
*/
const PAROLE_DI_SERVIZIO = new Set([
  'il',
  'lo',
  'la',
  'i',
  'gli',
  'le',
  'un',
  'uno',
  'una',
  'l',
  'di',
  'a',
  'ad',
  'da',
  'in',
  'con',
  'su',
  'per',
  'tra',
  'fra',
  'del',
  'dello',
  'della',
  'dei',
  'degli',
  'delle',
  'dell',
  'al',
  'allo',
  'alla',
  'ai',
  'agli',
  'alle',
  'all',
  'dal',
  'dallo',
  'dalla',
  'dai',
  'dagli',
  'dalle',
  'dall',
  'nel',
  'nello',
  'nella',
  'nei',
  'negli',
  'nelle',
  'nell',
  'sul',
  'sullo',
  'sulla',
  'sui',
  'sugli',
  'sulle',
  'sull',
  'e',
  'o',
  'ed',
  'od',
  'ma',
  'che',
  'chi',
  'cui',
  'non',
  'ne',
  'si',
  'se',
  'come',
  'anche',
  'è',
  'sono',
  'ha',
  'hanno',
  'essere',
  'stato',
  'stata',
  'resta',
  'restano',
  'più',
  'meno',
  'quando',
  'dove',
  'ciò',
  'questo',
  'questa',
  'quello',
  'quella',
  'entrambi',
  'casi',
  'caso',
  'sua',
  'suo',
  'sue',
  'suoi',
  'loro',
  'ogni',
  'tutti',
  'tutte',
  'solo',
  'soltanto',
  'stessa',
  'stesso',
]);

/*
  E si tronca a sei lettere, perché la ripetizione cambia la desinenza e resta ripetizione.

  Sulla RC Prodotti le due frasi erano «prodotto difettoso **prescinde** dalla colpa» e
  «danno da prodotto difettoso a **prescindere** dalla colpa»: parole diverse per il
  confronto letterale, la medesima affermazione per chi legge. Senza il troncamento questo
  controllo dichiarava pulita una delle tre schede da cui è nato.
*/
const RADICE = 6;

const parole = (testo: string): string[] =>
  testo
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-zàèéìòù0-9]+/g, ' ')
    .split(' ')
    .filter((p) => p.length > 1 && !PAROLE_DI_SERVIZIO.has(p))
    .map((p) => p.slice(0, RADICE));

/** Le sequenze di tre parole di contenuto che compaiono più di una volta. */
function affermazioniRipetute(testo: string): string[] {
  const p = parole(testo);
  const viste = new Map<string, number>();
  for (let i = 0; i + 2 < p.length; i += 1) {
    const tris = `${p[i]} ${p[i + 1]} ${p[i + 2]}`;
    viste.set(tris, (viste.get(tris) ?? 0) + 1);
  }
  return [...viste.entries()].filter(([, n]) => n > 1).map(([tris]) => tris);
}

// ─────────────────────────────────────────────────────────────────────────────
// I fatti che accendono i frammenti
// ─────────────────────────────────────────────────────────────────────────────

function fatti(modifiche: Partial<CompanyFacts> = {}): CompanyFacts {
  return {
    denominazione: 'ALFA MECCANICA S.R.L.',
    formaGiuridica: 'srl',
    statoAttivita: 'attiva',
    dimensione: 'piccola',
    ateco: null,
    atecoSezione: 'C',
    atecoDivisione: '25',
    atecoSecondari: [],
    addetti: null,
    fatturato: null,
    numeroVeicoli: 0,
    haDipendenti: false,
    produceBeniFinali: null,
    numeroSoci: 2,
    haSociPersonaGiuridica: false,
    esercitaDirezioneECoordinamento: false,
    soggettaADirezioneECoordinamento: false,
    ...modifiche,
  } as CompanyFacts;
}

/*
  Un frammento non acceso non può ripetersi: le combinazioni servono a metterli tutti in
  scena almeno una volta, ciascuno in ogni sua forma — accertata, negata e ipotetica.
*/
const TERNARIO: readonly (boolean | null)[] = [true, false, null];
const FORME: readonly FormaGiuridica[] = ['srl', 'snc', 'ditta-individuale'];

const combinazioni: CompanyFacts[] = [];
for (const haDipendenti of TERNARIO) {
  for (const produceBeniFinali of TERNARIO) {
    for (const formaGiuridica of FORME) {
      for (const numeroVeicoli of [0, 3, null]) {
        for (const dimensione of ['micro', 'media'] as const) {
          for (const atecoSezione of ['C', 'M']) {
            for (const numeroSoci of [1, 2]) {
              combinazioni.push(
                fatti({
                  haDipendenti,
                  produceBeniFinali,
                  formaGiuridica,
                  numeroVeicoli,
                  dimensione,
                  atecoSezione,
                  numeroSoci,
                }),
              );
            }
          }
        }
      }
    }
  }
}

describe('La motivazione di adeguatezza non ripete sé stessa', () => {
  it('nessuna affermazione compare due volte, su nessuna copertura e nessuna combinazione di fatti', () => {
    const colpevoli = new Set<string>();

    for (const definition of Object.values(COVERAGE_CATALOG)) {
      for (const f of combinazioni) {
        const composta = componiMotivazioneCopertura(definition, f, [], null);
        for (const ripetuta of affermazioniRipetute(composta.testo)) {
          colpevoli.add(`${definition.id}: «${ripetuta}»`);
        }
      }
    }

    expect([...colpevoli], [...colpevoli].join(' · ')).toEqual([]);
  });

  /*
    Il rovescio, e senza di esso la correzione sarebbe una scorciatoia: togliere la frase
    di catalogo non deve togliere ciò che quella frase diceva. Il frammento che prende il
    suo posto deve dirlo tutto.
  */
  it('togliere la frase di catalogo non toglie ciò che diceva', () => {
    const conDipendenti = componiMotivazioneCopertura(
      COVERAGE_CATALOG.rco,
      fatti({ haDipendenti: true }),
      [],
      null,
    );
    expect(conDipendenti.testo).toContain('INAIL');
    expect(conDipendenti.testo.match(/INAIL/g)).toHaveLength(1);

    const produttore = componiMotivazioneCopertura(
      COVERAGE_CATALOG['rc-prodotti'],
      fatti({ produceBeniFinali: true }),
      [],
      null,
    );
    expect(produttore.testo).toMatch(/prescind\w+ dalla colpa/);
    expect(produttore.testo).toContain('esimenti');

    const fornitore = componiMotivazioneCopertura(
      COVERAGE_CATALOG['rc-prodotti'],
      fatti({ produceBeniFinali: false }),
      [],
      null,
    );
    // Art. 116, c. 1: il fornitore risponde «alla stessa maniera» quando la sussidiarietà
    // scatta. Dire solo «sussidiaria» faceva sembrare la sua posizione più mite di quello
    // che è: sussidiaria nel presupposto, identica nella misura.
    expect(fornitore.testo).toContain('sussidiaria');
    expect(fornitore.testo).toMatch(/prescind\w+ dalla colpa/);

    const inquinamento = componiMotivazioneCopertura(
      COVERAGE_CATALOG['rc-inquinamento'],
      fatti(),
      [],
      null,
    );
    expect(inquinamento.testo).toContain('bonifica');
    // La ragione assicurativa per cui serve un massimale dedicato: senza questa clausola
    // il frammento avrebbe descritto il regime e taciuto il motivo della copertura.
    expect(inquinamento.testo).toContain('eccedere di molto il danno cagionato a terzi');
  });

  /*
    Chi non ha un frammento che la assorbe conserva la frase di catalogo. È il
    comportamento di prima, e va bene finché quella frase è vera per chiunque: la prova
    serve a non scambiare «nessuna ripetizione» per «nessuna motivazione».
  */
  it('la copertura senza frammenti conserva la sua frase', () => {
    const professionale = componiMotivazioneCopertura(
      COVERAGE_CATALOG['rc-professionale'],
      fatti({ atecoSezione: 'C' }),
      [],
      null,
    );
    expect(professionale.testo).toBe(COVERAGE_CATALOG['rc-professionale'].motivazioneTipo);
  });

  /*
    Un controllo che non ha mai fallito non è un controllo.

    Le tre motivazioni qui sotto sono quelle che il prodotto stampava davvero, ricopiate
    dal codice di prima: frase di catalogo più frammento, nell'ordine in cui uscivano. Se
    un domani il riconoscitore smettesse di vedere il difetto — un'altra soglia, un'altra
    lista di parole di servizio — la prova qui sopra diventerebbe verde per assenza di
    informazione, che è il modo in cui un presidio muore senza che nessuno lo cancelli.

    Queste tre restano rosse per sempre, e sono l'unica prova che la prima abbia occhi.
  */
  it('il riconoscitore vede il difetto che è stato corretto', () => {
    /* RCO: frase di catalogo più frammento sui dipendenti, come uscivano insieme. */
    const rco =
      'L’indennizzo INAIL non esaurisce il danno risarcibile: restano a carico del datore di ' +
      'lavoro il danno differenziale e le voci che l’istituto non indennizza. ' +
      'Il datore di lavoro è tenuto ad adottare le misure necessarie a tutelare l’integrità ' +
      'fisica dei prestatori di lavoro, e ne risponde civilmente. L’indennizzo INAIL non ' +
      'esaurisce il danno risarcibile: restano a carico il differenziale e le voci non indennizzate.';

    const inquinamento =
      'I costi di bonifica e di ripristino ambientale non sono coperti dalla RCT ordinaria e ' +
      'possono eccedere di molto il danno cagionato a terzi. La responsabilità per danno ' +
      'ambientale è oggettiva per gli operatori delle attività elencate nell’Allegato 5 alla ' +
      'Parte VI del Codice dell’ambiente; per le altre attività risponde chi ha agito con dolo o ' +
      'colpa. In entrambi i casi i costi di bonifica e ripristino restano esclusi dalla RCT ordinaria.';

    const prodotti =
      'La responsabilità da prodotto difettoso prescinde dalla colpa, nei limiti delle esimenti ' +
      'previste dalla legge. L’impresa immette sul mercato prodotti finiti: risponde del danno ' +
      'da prodotto difettoso a prescindere dalla colpa, salve le esimenti di legge.';

    expect(affermazioniRipetute(rco)).toContain('indenn inail esauri');
    expect(affermazioniRipetute(inquinamento)).toContain('costi bonifi ripris');
    expect(affermazioniRipetute(prodotti)).toContain('prodot difett presci');
  });
});
