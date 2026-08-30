/**
 * I bloccanti della corsia del merito creditizio.
 *
 * Ogni prova qui dentro è stata **vista fallire** sul codice non corretto, e il numero che
 * stampava è scritto nel commento che la precede. Una prova che non è mai stata rossa non
 * è una prova: è una riga che rassicura.
 *
 * Il percorso esercitato è quello che gira davvero in produzione — l'impresa **senza** il
 * bilancio in schema CEE — perché il bilancio dettagliato non raggiunge mai il motore. La
 * fixture dimostrativa ce l'ha, ed è l'unica che le prove esistenti guardavano.
 */

import { describe, expect, it } from 'vitest';
import {
  DEMO_AS_OF,
  Money,
  analyzeCompany,
  demoCompanyProfile,
  demoPolizze,
  euro,
  mediaPesataDefinita,
  weightedAverageDefined,
} from '../src/index.js';
import type { CompanyProfile, CreditLimit, EventiNegativi } from '../src/index.js';

const polizze = demoPolizze();

/** Il profilo che gira in produzione: gli aggregati sintetici ci sono, lo schema CEE no. */
function senzaBilancioCee(profilo: CompanyProfile = demoCompanyProfile()): CompanyProfile {
  return { ...profilo, bilanci: [] };
}

/** Sostituisce gli eventi negativi conservando fonte, data di osservazione e confidenza. */
function conEventi(profilo: CompanyProfile, eventi: EventiNegativi): CompanyProfile {
  const originale = profilo.eventiNegativi;
  if (originale === null) throw new Error('la fixture deve avere la sezione eventi negativi');
  return { ...profilo, eventiNegativi: { ...originale, value: eventi } };
}

/** Il vincolo che il documento dichiara «il più stringente», o null se non ce n'è. */
function vincoloDichiarato(fido: CreditLimit): CreditLimit['limitePatrimoniale'] | null {
  switch (fido.vincoloAttivo) {
    case 'patrimoniale':
      return fido.limitePatrimoniale;
    case 'dimensionale':
      return fido.limiteDimensionale;
    case 'flusso':
      return fido.limiteFlusso;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * La media pesata, misurata dove nasce.
 *
 * È la causa del difetto 5 una riva più su: senza pavimento il denominatore è la somma
 * dei soli pesi presenti, e i valori superstiti si spartiscono il peso degli assenti.
 */
describe('shared/math · la media pesata dichiara la copertura e non la regala', () => {
  const meta = [
    { value: 90, weight: 0.45 },
    { value: null, weight: 0.55 },
  ];

  it('senza pavimento il valore presente si prende tutto il peso — comportamento storico', () => {
    expect(weightedAverageDefined(meta)).toBe(90);
  });

  it('con il pavimento a metà il denominatore non scende sotto la metà del peso totale', () => {
    // 0,45 × 90 / max(0,45; 0,50) = 40,5 / 0,50 = 81
    expect(mediaPesataDefinita(meta, { pavimentoDiCopertura: 0.5 }).media).toBeCloseTo(81, 9);
  });

  it('a copertura piena il pavimento non tocca nulla', () => {
    const pieni = [
      { value: 90, weight: 0.45 },
      { value: 50, weight: 0.55 },
    ];
    expect(mediaPesataDefinita(pieni, { pavimentoDiCopertura: 0.5 }).media).toBeCloseTo(
      weightedAverageDefined(pieni) ?? Number.NaN,
      9,
    );
  });

  it('senza nessun valore resta null, e non diventa zero', () => {
    const vuoti = [
      { value: null, weight: 0.5 },
      { value: null, weight: 0.5 },
    ];
    expect(mediaPesataDefinita(vuoti, { pavimentoDiCopertura: 0.5 }).media).toBeNull();
  });

  it('riporta quanti valori e quanto peso hanno risposto', () => {
    const m = mediaPesataDefinita(meta, { pavimentoDiCopertura: 0.5 });
    expect(m.valutati).toBe(1);
    expect(m.totali).toBe(2);
    expect(m.copertura).toBeCloseTo(0.45, 9);
  });
});

/**
 * Difetto 5 — lo score migliora togliendo dati.
 *
 * Misurato prima della correzione, stessa impresa, unico ingresso cambiato:
 * con il bilancio CEE **76, classe B**, PD 1,12%; senza, **85, classe A “Rischio molto
 * basso”**, PD 0,57%. La media pesata rinormalizzava senza pavimento e regalava il peso
 * dei quattro fattori spariti ai tre superstiti, che erano i più alti.
 */
describe('Difetto 5 · il punteggio non sale per assenza di dati', () => {
  const conCee = analyzeCompany(demoCompanyProfile(), polizze, DEMO_AS_OF);
  const senzaCee = analyzeCompany(senzaBilancioCee(), polizze, DEMO_AS_OF);

  it('togliere il bilancio in schema CEE non fa salire lo score', () => {
    expect(
      senzaCee.creditScore.value.value,
      `senza bilancio CEE ${senzaCee.creditScore.value.value}, con bilancio CEE ` +
        `${conCee.creditScore.value.value}: l'assenza di quattro fattori su sette ha ` +
        'migliorato il giudizio',
    ).toBeLessThanOrEqual(conCee.creditScore.value.value);
  });

  it('non attribuisce la classe A a un punteggio che si regge su meno di metà del modello', () => {
    const s = senzaCee.creditScore.value;
    const valutati = s.factors.filter((f) => f.score !== null).length;
    expect(s.classe, `classe ${s.classe} su ${valutati} fattori valutati su ${s.factors.length}`).not.toBe(
      'A',
    );
  });

  it('dichiara a schermo su quanti fattori il punteggio si regge', () => {
    const spiegazione = senzaCee.creditScore.explanation;
    const copertura = spiegazione.inputs.find((i) => i.label.startsWith('Copertura del modello'));
    expect(copertura, 'la spiegazione non dichiara la copertura del modello').toBeDefined();
    // Tre fattori su sette: solidità (dagli aggregati sintetici), eventi negativi, anzianità.
    expect(copertura?.value).toContain('3 fattori su 7');
  });
});

/**
 * Difetto 8 — i pesi stampati non sono quelli usati, e i sette dichiarati sommano al 105%.
 *
 * Misurato prima della correzione: la scheda stampava «peso 20% … peso 20% … peso 5%»
 * mentre i pesi che avevano prodotto l'85 erano 44,4 / 44,4 / 11,1. E la somma dei sette
 * pesi nominali valeva 1,05.
 */
describe('Difetto 8 · i pesi dichiarati sono quelli usati', () => {
  const senzaCee = analyzeCompany(senzaBilancioCee(), polizze, DEMO_AS_OF);

  it('i sette pesi del modello sommano al 100%', () => {
    const somma = senzaCee.creditScore.value.factors.reduce((t, f) => t + f.weight, 0);
    expect(somma, `la somma dei sette pesi vale ${somma}`).toBeCloseTo(1, 9);
  });

  it('accanto al peso nominale stampa quello che ha davvero pesato', () => {
    const spiegazione = senzaCee.creditScore.explanation;
    const solidita = spiegazione.inputs.find((i) => i.label.startsWith('Solidità patrimoniale'));
    expect(solidita, 'la solidità patrimoniale non compare fra gli input').toBeDefined();
    // Il fattore vale il 19,0% del modello ma, essendo uno dei tre superstiti, ne ha
    // deciso il 38,1%: la riga deve dire tutti e due i numeri, non solo il primo.
    expect(
      `${solidita?.label ?? ''} ${solidita?.value ?? ''}`,
      'la riga stampa il peso nominale e tace quello effettivo',
    ).toMatch(/effettiv/i);
  });
});

/**
 * Difetto 6 — il fido supera il vincolo che la nota accanto chiama «il più stringente».
 *
 * Misurato prima della correzione, sul percorso di produzione: fido **390.000 €** contro
 * un limite patrimoniale di **366.000 €**, con fattore di score 1,07×. La curva saliva
 * fino a 1,25 su score ≥ 80.
 */
describe('Difetto 6 · il fido resta dentro il vincolo che dichiara', () => {
  it('il fattore di score non supera 1,00 su nessuno score da 1 a 100', () => {
    const profiloBase = senzaBilancioCee();
    const fattori: { score: number; fattore: number }[] = [];
    for (const analisi of [
      analyzeCompany(demoCompanyProfile(), polizze, DEMO_AS_OF),
      analyzeCompany(profiloBase, polizze, DEMO_AS_OF),
    ]) {
      fattori.push({
        score: analisi.creditScore.value.value,
        fattore: analisi.creditLimit.value.fattoreScore,
      });
    }
    for (const f of fattori) {
      expect(f.fattore, `score ${f.score} → fattore ${f.fattore.toFixed(3)}×`).toBeLessThanOrEqual(1);
    }
  });

  it('il fido consigliato non supera il vincolo più stringente, sul percorso di produzione', () => {
    const analisi = analyzeCompany(senzaBilancioCee(), polizze, DEMO_AS_OF);
    const fido = analisi.creditLimit.value;
    const vincolo = vincoloDichiarato(fido);
    expect(vincolo, 'nessun vincolo calcolabile: la prova non misurerebbe nulla').not.toBeNull();
    expect(
      Money.toEuro(fido.importo),
      `fido ${Money.toEuro(fido.importo)} € oltre il vincolo ${fido.vincoloAttivo} di ` +
        `${Money.toEuro(vincolo ?? Money.ZERO)} € (score ${analisi.creditScore.value.value}, ` +
        `fattore ${fido.fattoreScore.toFixed(2)}×)`,
    ).toBeLessThanOrEqual(Money.toEuro(vincolo ?? Money.ZERO));
  });
});

/**
 * Difetto 7 — il tetto «patrimonio netto negativo → 35» non scatta mai.
 *
 * La condizione leggeva il solo bilancio in schema CEE, che in produzione è sempre nullo.
 * Misurato prima della correzione con PN −1.200.000 € su attivo 3.000.000 €: **53/100,
 * classe C “Rischio medio”**, `cap` nullo, nessun avviso — mentre il fido, nella stessa
 * esecuzione, stampava «Patrimonio netto tangibile: −1.200.000 €».
 */
describe('Difetto 7 · il tetto sul patrimonio netto negativo scatta anche senza schema CEE', () => {
  const profilo = demoCompanyProfile();
  const conPnNegativo: CompanyProfile = {
    ...senzaBilancioCee(profilo),
    bilanciSintetici: profilo.bilanciSintetici.map((s) => ({
      ...s,
      value: { ...s.value, patrimonioNetto: euro(-1_200_000), totaleAttivo: euro(3_000_000) },
    })),
  };
  const analisi = analyzeCompany(conPnNegativo, polizze, DEMO_AS_OF);

  it('taglia il punteggio a 35', () => {
    const s = analisi.creditScore.value;
    expect(s.value, `score ${s.value}, classe ${s.classe}`).toBeLessThanOrEqual(35);
  });

  it('dichiara il motivo del taglio invece di tacerlo', () => {
    const s = analisi.creditScore.value;
    expect(s.cap, 'nessun avviso accanto a un patrimonio netto negativo').not.toBeNull();
    expect(s.cap ?? '').toMatch(/patrimonio netto negativo/i);
  });

  it('non inventa un tetto quando il patrimonio netto non è noto', () => {
    const senzaPn: CompanyProfile = {
      ...senzaBilancioCee(profilo),
      bilanciSintetici: profilo.bilanciSintetici.map((s) => ({
        ...s,
        value: { ...s.value, patrimonioNetto: null },
      })),
    };
    const esito = analyzeCompany(senzaPn, polizze, DEMO_AS_OF).creditScore.value;
    expect(esito.cap ?? '').not.toMatch(/patrimonio netto negativo/i);
  });
});

/**
 * Difetto anti-contraddizione — «Nessun protesto» con i protesti elencati due riquadri sotto.
 *
 * Il taglio a dieci anni avveniva **prima** di scrivere in `details`, e il controllo che
 * doveva impedire la contraddizione guardava un elenco già svuotato. Misurato prima della
 * correzione: due protesti e un'ipoteca giudiziale da 800.000 € del 2014 → fattore
 * **100/100** e la frase «Nessun protesto, pregiudizievole o procedura concorsuale a
 * carico della società», mentre la schermata li elenca tutti e tre con data e importo.
 */
describe('Difetto · il fattore non dichiara pulita un’impresa che elenca protesti', () => {
  const eventiVecchi: EventiNegativi = {
    protesti: [
      {
        data: new Date('2013-04-11T00:00:00Z'),
        importo: euro(250_000),
        tipo: 'Cambiale',
        luogo: 'Brescia',
        levato: false,
      },
      {
        data: new Date('2012-11-03T00:00:00Z'),
        importo: euro(90_000),
        tipo: 'Assegno',
        luogo: 'Brescia',
        levato: false,
      },
    ],
    pregiudizievoli: [
      {
        data: new Date('2014-06-20T00:00:00Z'),
        tipo: 'ipoteca-giudiziale',
        importo: euro(800_000),
        descrizione: 'Ipoteca giudiziale',
      },
    ],
    procedure: [],
    presenzaDichiarataSenzaDettaglio: [],
  };

  const analisi = analyzeCompany(conEventi(senzaBilancioCee(), eventiVecchi), polizze, DEMO_AS_OF);
  const fattore = analisi.creditScore.value.factors.find((f) => f.key === 'eventi-negativi');

  it('non scrive «nessun protesto» quando il registro ne ha elencati tre', () => {
    expect(fattore, 'il fattore eventi negativi non esiste').toBeDefined();
    expect(fattore?.rationale ?? '', `motivazione stampata: «${fattore?.rationale ?? ''}»`).not.toMatch(
      /nessun protesto/i,
    );
  });

  it('li elenca nei dettagli del fattore, oltre i dieci anni compresi', () => {
    const dettagli = (fattore?.details ?? []).join(' | ');
    expect(dettagli, `dettagli: «${dettagli}»`).toMatch(/protesto/i);
    expect(dettagli).toMatch(/ipoteca/i);
    expect(dettagli).not.toMatch(/Nessun protesto/i);
  });
});

/**
 * Difetto 21 — la discordanza parziale.
 *
 * Il registro dichiara la presenza di protesti senza fornirne l'elenco, e nello stesso
 * responso manda una pregiudizievole con data e importo. Misurato prima della correzione:
 * il ramo della discordanza scartava **tutti** i dettagli già calcolati, e la scheda
 * affermava che nessun elenco era stato fornito accanto a una pregiudizievole che c'era.
 */
describe('Difetto 21 · la discordanza parziale non cancella ciò che è arrivato', () => {
  const parziale: EventiNegativi = {
    protesti: [],
    pregiudizievoli: [
      {
        data: new Date('2025-02-10T00:00:00Z'),
        tipo: 'ipoteca-giudiziale',
        importo: euro(400_000),
        descrizione: 'Ipoteca giudiziale',
      },
    ],
    procedure: [],
    presenzaDichiarataSenzaDettaglio: ['protesti'],
  };

  const analisi = analyzeCompany(conEventi(senzaBilancioCee(), parziale), polizze, DEMO_AS_OF);
  const fattore = analisi.creditScore.value.factors.find((f) => f.key === 'eventi-negativi');

  it('conserva nei dettagli la pregiudizievole di cui il dettaglio è arrivato', () => {
    const dettagli = (fattore?.details ?? []).join(' | ');
    expect(dettagli, `dettagli: «${dettagli}»`).toMatch(/ipoteca giudiziale/i);
  });

  it('dichiara mancante il solo elenco che manca, non tutti', () => {
    const dettagli = (fattore?.details ?? []).join(' | ');
    expect(dettagli, `dettagli: «${dettagli}»`).not.toMatch(/Elenchi non forniti/i);
  });

  /*
    Chi sappiamo protestato non risulta più affidabile di chi non abbiamo controllato.

    Misurato prima della correzione: la sezione **non acquistata** usciva a confidenza
    «bassa» con l'avviso in testata; la presenza **dichiarata dal registro senza elenco**
    usciva a confidenza «media» e senza una riga. L'impresa di cui il registro dice «ha
    protesti» era presentata come la più solida delle due.
  */
  it('abbassa la confidenza come farebbe una sezione non acquisita', () => {
    expect(analisi.creditScore.confidence).toBe('bassa');
  });

  it('e lo scrive in testata, invece di limitarsi a non attribuire il punteggio', () => {
    const note = analisi.creditScore.explanation.notes.join(' | ');
    expect(note, `note: «${note}»`).toMatch(/dichiara la presenza di protesti/i);
  });

  /*
    MISURA, non pretesa — e il numero è scritto perché si veda muovere se qualcuno lo
    cambia.

    Il punteggio con la discordanza parziale e quello con la sezione mai acquistata sono
    **identici**: in entrambi i casi il fattore eventi negativi non è attribuibile, e
    attribuirgliene uno richiederebbe una penalità inventata su protesti di cui non si
    conosce né importo né data. Non è un difetto che si possa correggere senza inventare:
    ciò che distingue i due casi è la dichiarazione, non la cifra, ed è quella che le due
    prove qui sopra pretendono.

    Ciò che invece si muove, e prima non si muoveva, è il confronto con una visura pulita:
    il pavimento di copertura fa costare il fattore mancante 37 punti (36 contro 73), dove
    prima il suo peso veniva regalato agli altri fattori.
  */
  it('i 45 centesimi spesi si vedono nel punteggio rispetto a una visura pulita', () => {
    const nonAcquisita = analyzeCompany(
      { ...senzaBilancioCee(), eventiNegativi: null },
      polizze,
      DEMO_AS_OF,
    ).creditScore.value.value;
    const visuraPulita = analyzeCompany(senzaBilancioCee(), polizze, DEMO_AS_OF).creditScore.value.value;

    expect(analisi.creditScore.value.value).toBe(nonAcquisita);
    expect(
      visuraPulita,
      `visura pulita ${visuraPulita}, elenco non attribuibile ${nonAcquisita}`,
    ).toBeGreaterThan(nonAcquisita);
  });
});

/**
 * Difetto 20 — il patrimonio netto **lordo** etichettato «Patrimonio netto tangibile».
 *
 * Sul percorso di produzione il fido riceve `bilanciSintetici[0].patrimonioNetto`, che è
 * lordo: comprende avviamento, marchi e software capitalizzati. La riga della spiegazione
 * lo chiamava comunque «tangibile». Misurato prima della correzione: 1.830.000 € contro i
 * 1.710.000 € tangibili della stessa impresa — 120.000 € di immateriali dentro
 * un'etichetta che dichiara di averli tolti.
 */
describe('Difetto 20 · il patrimonio netto non si dichiara tangibile se non lo è', () => {
  it('sul percorso di produzione non lo chiama «tangibile»', () => {
    const analisi = analyzeCompany(senzaBilancioCee(), polizze, DEMO_AS_OF);
    const riga = analisi.creditLimit.explanation.inputs.find((i) => i.label.startsWith('Patrimonio netto'));
    expect(riga, 'il patrimonio netto non compare fra gli input del fido').toBeDefined();
    expect(riga?.label ?? '', `etichetta stampata: «${riga?.label ?? ''}» su un valore lordo`).not.toMatch(
      /tangibile/i,
    );
  });

  it('lo chiama «tangibile» quando lo è davvero, cioè dal bilancio in schema CEE', () => {
    const analisi = analyzeCompany(demoCompanyProfile(), polizze, DEMO_AS_OF);
    const riga = analisi.creditLimit.explanation.inputs.find((i) => i.label.startsWith('Patrimonio netto'));
    expect(riga?.label ?? '').toMatch(/tangibile/i);
  });
});
