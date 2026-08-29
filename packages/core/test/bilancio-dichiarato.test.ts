/**
 * Il bilancio che il cliente porta all'appuntamento vale quanto quello che si compra.
 *
 * Il difetto misurato: l'anagrafica estesa porta gli aggregati sintetici, non lo schema
 * CEE, e il bilancio dettagliato è un servizio a parte dichiarato non verificato che
 * quindi non viene mai chiamato. Risultato in produzione, su ogni impresa reale:
 *
 *   contenuto, scorte, danni indiretti e fido clienti tutti «non determinabile»,
 *   coperture da quantificare da 2 a 5,
 *   esposizione non assicurata da 8,1 a 2,4 milioni — il 70% in meno, non perché
 *   l'impresa sia più coperta ma perché il prodotto non sa contare.
 *
 * Il documento dimostrativo invece li mostrava tutti, perché la sua fixture ha il CEE
 * completo. Il cliente prova la demo, resta colpito, apre la sua prima azienda vera e
 * trova metà dei capitali vuoti — compreso il margine di contribuzione, che la
 * metodologia dichiara essere il punto di massimo valore del prodotto.
 *
 * Quelle voci però non vanno comprate: stanno nel bilancio depositato che l'imprenditore
 * ha in cassetto. Qui si verifica che la via gratuita funzioni, e soprattutto che rispetti
 * le tre regole che la rendono onesta.
 */

import { describe, expect, it } from 'vitest';
import {
  DEMO_AS_OF,
  Money,
  analyzeCompany,
  demoCompanyProfile,
  demoPolizze,
  deriveFacts,
  euro,
  reclassify,
} from '../src/index.js';
import type { BilancioDichiarato, CompanyProfile } from '../src/index.js';

/** Il profilo come lo vede la produzione: aggregati sintetici, nessuno schema CEE. */
function soloSintetico(): CompanyProfile {
  return { ...demoCompanyProfile(), bilanci: [] };
}

/** Le sei voci che un broker legge dal bilancio depositato in due minuti. */
const LETTE_DAL_BILANCIO: BilancioDichiarato = {
  anno: 2025,
  rimanenze: euro(890_000),
  creditiVersoClienti: euro(1_640_000),
  impiantiEAttrezzature: euro(1_190_000),
  impiantiAlCostoStorico: false,
  costiMateriePrime: euro(2_850_000),
  costiServizi: euro(1_180_000),
};

function conDichiarato(bilancio: Partial<BilancioDichiarato>): CompanyProfile {
  const base = soloSintetico();
  return {
    ...base,
    datiDichiarati: {
      ...base.datiDichiarati,
      bilancio: { ...base.datiDichiarati.bilancio, ...bilancio },
    },
  };
}

const analizza = (p: CompanyProfile) => analyzeCompany(p, demoPolizze(), DEMO_AS_OF);

/** Il bilancio riclassificato del profilo, o `null` se non ne ha uno dettagliato. */
const riclassificato = (p: CompanyProfile) => {
  const primo = p.bilanci[0];
  return primo === undefined ? null : reclassify(primo.value);
};

// ─────────────────────────────────────────────────────────────────────────────

describe('Senza schema CEE e senza intervista, il prodotto dichiara di non sapere', () => {
  const senza = analizza(soloSintetico());

  it('non inventa i capitali che non può calcolare', () => {
    expect(senza.sommeAssicurande.contenuto.value).toBeNull();
    expect(senza.sommeAssicurande.scorte.value).toBeNull();
    expect(senza.sommeAssicurande.danniIndiretti.value).toBeNull();
    expect(senza.sommeAssicurande.fidoClienti.value).toBeNull();
  });

  it('ma dice dove trovarli, invece di limitarsi a tacere', () => {
    const testo = JSON.stringify(senza.sommeAssicurande.scorte.explanation);
    expect(testo).toContain('C-I');
    expect(testo).toContain('bilancio depositato');
  });

  it('il monte salari invece si ricava dagli aggregati gratuiti, senza spendere', () => {
    // Il costo del personale è uno dei pochi aggregati che l'anagrafica estesa porta con
    // sé: leggerlo solo dal CEE lasciava vuoto un capitale che era già in casa.
    expect(senza.sommeAssicurande.monteSalari.value).not.toBeNull();
  });
});

describe('Con le voci rilevate in intervista i capitali tornano', () => {
  const con = analizza(conDichiarato(LETTE_DAL_BILANCIO));

  it('contenuto, scorte, danni indiretti e credito smettono di essere ignoti', () => {
    expect(con.sommeAssicurande.contenuto.value).not.toBeNull();
    expect(con.sommeAssicurande.scorte.value).not.toBeNull();
    expect(con.sommeAssicurande.danniIndiretti.value).not.toBeNull();
    expect(con.sommeAssicurande.fidoClienti.value).not.toBeNull();
  });

  it('e le coperture da quantificare tornano quante ne dà il bilancio comprato', () => {
    const conCee = analizza(demoCompanyProfile());
    expect(con.gap.coperturaDaQuantificare).toBe(conCee.gap.coperturaDaQuantificare);
  });

  it('l’esposizione non assicurata torna dello stesso ordine di grandezza', () => {
    const conCee = analizza(demoCompanyProfile());
    const rapporto =
      Money.toEuro(con.gap.esposizioneNonAssicurata) / Money.toEuro(conCee.gap.esposizioneNonAssicurata);
    // 96% del risultato del bilancio da cinque euro, a costo zero.
    expect(rapporto).toBeGreaterThan(0.9);
    expect(rapporto).toBeLessThanOrEqual(1);
  });
});

describe('Le tre regole che rendono onesta la via gratuita', () => {
  it('il dichiarato NON scavalca il registro, nei fatti', () => {
    /*
      Se il bilancio dettagliato è stato comprato, vince lui. Un dato di intervista che
      sovrascrivesse un dato del registro trasformerebbe una fonte verificabile in una
      dichiarazione, e il fascicolo perderebbe la sua parte più difendibile.

      La verifica va fatta **su `deriveFacts`**, che è dove la precedenza è scritta.
      Provata sul capitale finale passava per un'altra ragione — `calcolaScorte` ha una
      precedenza propria che mascherava questa — e un controllo che passa per la ragione
      sbagliata non è un controllo: invertendo la regola restava verde.
    */
    const base = demoCompanyProfile();
    const conEntrambi: CompanyProfile = {
      ...base,
      datiDichiarati: {
        ...base.datiDichiarati,
        bilancio: { ...LETTE_DAL_BILANCIO, rimanenze: euro(1), creditiVersoClienti: euro(1) },
      },
    };

    const soloRegistro = deriveFacts(base, riclassificato(base), DEMO_AS_OF);
    const conDichiarazione = deriveFacts(conEntrambi, riclassificato(conEntrambi), DEMO_AS_OF);

    expect(conDichiarazione.rimanenze).toBe(soloRegistro.rimanenze);
    expect(conDichiarazione.creditiVersoClienti).toBe(soloRegistro.creditiVersoClienti);
    expect(conDichiarazione.rimanenze).not.toBe(euro(1));
  });

  it('e il capitale che ne esce non si muove', () => {
    const base = demoCompanyProfile();
    const conEntrambi: CompanyProfile = {
      ...base,
      datiDichiarati: {
        ...base.datiDichiarati,
        bilancio: { ...LETTE_DAL_BILANCIO, rimanenze: euro(1) },
      },
    };
    expect(analizza(conEntrambi).sommeAssicurande.scorte.value).toBe(
      analizza(base).sommeAssicurande.scorte.value,
    );
  });

  it('un campo vuoto resta ignoto e non diventa zero', () => {
    // Uno zero sulle rimanenze produce «attività senza magazzino» su un'impresa che il
    // magazzino ce l'ha: è la differenza fra un buco dichiarato e un'affermazione falsa.
    const soloCrediti = analizza(conDichiarato({ creditiVersoClienti: euro(500_000) }));
    expect(soloCrediti.sommeAssicurande.fidoClienti.value).not.toBeNull();
    expect(soloCrediti.sommeAssicurande.scorte.value).toBeNull();
  });

  it('il margine non si compone con una sola delle due voci di costo', () => {
    /*
      Con le sole materie prime il margine uscirebbe gonfiato dei costi per servizi, e un
      capitale di business interruption gonfiato è premio che il cliente paga per niente.
      Meglio nessun numero che un numero sbagliato.
    */
    const meta = analizza(conDichiarato({ costiMateriePrime: euro(2_850_000) }));
    expect(meta.sommeAssicurande.danniIndiretti.value).toBeNull();
  });

  it('dove il capitale nasce da una dichiarazione, la confidenza scende e il documento lo scrive', () => {
    const con = analizza(conDichiarato(LETTE_DAL_BILANCIO));
    const conCee = analizza(demoCompanyProfile());

    expect(con.sommeAssicurande.scorte.confidence).toBe('bassa');
    expect(conCee.sommeAssicurande.scorte.confidence).toBe('media');
    expect(JSON.stringify(con.sommeAssicurande.scorte.explanation)).toContain('rilevato in intervista');
  });
});

describe('Il costo storico lordo cambia il coefficiente, e va dichiarato', () => {
  it('al lordo si applica l’adeguamento a nuovo, non il raddoppio del netto', () => {
    const netto = analizza(
      conDichiarato({ impiantiEAttrezzature: euro(1_000_000), impiantiAlCostoStorico: false }),
    ).sommeAssicurande.contenuto.value;
    const lordo = analizza(
      conDichiarato({ impiantiEAttrezzature: euro(1_000_000), impiantiAlCostoStorico: true }),
    ).sommeAssicurande.contenuto.value;

    // Il netto è già ammortizzato: si raddoppia. Il lordo no: si adegua di un quarto.
    expect(netto).not.toBe(lordo);
    expect(Money.toEuro(netto ?? 0)).toBeGreaterThan(Money.toEuro(lordo ?? 0));
  });

  it('e i fatti tengono separate le due letture', () => {
    const alLordo = deriveFacts(
      conDichiarato({ impiantiEAttrezzature: euro(1_000_000), impiantiAlCostoStorico: true }),
      null,
      DEMO_AS_OF,
    );
    expect(alLordo.costoStoricoImmobilizzazioni).not.toBeNull();
    expect(alLordo.valoreImpiantiNetto).toBeNull();
  });
});
