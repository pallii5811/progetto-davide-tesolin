import { describe, expect, it } from 'vitest';
import {
  DEMO_AS_OF,
  Money,
  analyzeCompany,
  assessCatNat,
  classifySize,
  computeIndicators,
  computeUnderinsurance,
  demoCompanyProfile,
  demoPolizze,
  deriveFacts,
  euro,
  isBilancioQuadrato,
  reclassify,
  squadraturaBilancio,
} from '../src/index.js';

const profilo = demoCompanyProfile();
const polizze = demoPolizze();
const bilancio = reclassify(profilo.bilanci[0]!.value);

describe('Riclassificazione del bilancio', () => {
  it('quadra attivo e passivo', () => {
    expect(isBilancioQuadrato(bilancio)).toBe(true);
    expect(Money.toEuro(squadraturaBilancio(bilancio))).toBe(0);
  });

  it('ricostruisce la scala del conto economico a valore aggiunto', () => {
    const { ce } = bilancio;
    // Valore della produzione = ricavi + variazione prodotti + altri ricavi
    expect(Money.toEuro(ce.valoreDellaProduzione)).toBe(6_480_000 + 45_000 + 78_000);
    // EBITDA = valore aggiunto − costo del personale
    expect(Money.toEuro(ce.ebitda)).toBe(
      Money.toEuro(ce.valoreAggiunto) - Money.toEuro(ce.costoDelPersonale),
    );
    // EBIT = EBITDA − ammortamenti
    expect(Money.toEuro(ce.ebit)).toBe(Money.toEuro(ce.ebitda) - Money.toEuro(ce.ammortamenti));
  });

  it('calcola la posizione finanziaria netta come debiti finanziari meno liquidità', () => {
    expect(Money.toEuro(bilancio.sp.posizioneFinanziariaNetta)).toBe(620_000 + 1_150_000 - 380_000);
  });

  it('esclude le immobilizzazioni immateriali dal patrimonio netto tangibile', () => {
    expect(Money.toEuro(bilancio.sp.patrimonioNettoTangibile)).toBe(
      Money.toEuro(bilancio.sp.patrimonioNetto) - 120_000,
    );
  });

  it('calcola il margine di contribuzione escludendo i soli costi variabili', () => {
    // Il costo del personale NON è variabile: deve restare dentro il margine,
    // perché a impianto fermo si continua a pagarlo.
    expect(Money.toEuro(bilancio.ce.margineDiContribuzione)).toBeGreaterThan(
      Money.toEuro(bilancio.ce.costoDelPersonale),
    );
  });
});

describe('Classificazione dimensionale UE', () => {
  it('classifica la fixture come piccola impresa', () => {
    const risultato = classifySize({
      addetti: 35,
      fatturato: euro(6_480_000),
      totaleAttivo: euro(6_055_000),
    });
    expect(risultato.value).toBe('piccola');
  });

  it('il criterio degli addetti è vincolante', () => {
    // 300 addetti con fatturato modesto resta comunque grande impresa.
    const risultato = classifySize({
      addetti: 300,
      fatturato: euro(8_000_000),
      totaleAttivo: euro(9_000_000),
    });
    expect(risultato.value).toBe('grande');
  });

  it('il criterio finanziario è alternativo: basta soddisfarne uno', () => {
    const risultato = classifySize({
      addetti: 40,
      fatturato: euro(12_000_000), // oltre soglia piccola
      totaleAttivo: euro(9_000_000), // entro soglia piccola
    });
    expect(risultato.value).toBe('piccola');
  });

  it('in assenza totale di dati assume prudenzialmente piccola con confidenza bassa', () => {
    const risultato = classifySize({ addetti: null, fatturato: null, totaleAttivo: null });
    expect(risultato.value).toBe('piccola');
    expect(risultato.confidence).toBe('bassa');
  });
});

describe('Indici di bilancio', () => {
  const indicatori = computeIndicators(bilancio, reclassify(profilo.bilanci[1]!.value));

  it('restituisce null e non zero quando il calcolo non è significativo', () => {
    const senzaDebiti = reclassify({
      ...profilo.bilanci[0]!.value,
      contoEconomico: { ...profilo.bilanci[0]!.value.contoEconomico, oneriFinanziari: euro(0) },
    });
    expect(computeIndicators(senzaDebiti).coperturaOneriFinanziari).toBeNull();
  });

  it('calcola la crescita dei ricavi rispetto all’esercizio precedente', () => {
    expect(indicatori.crescitaRicavi).toBeCloseTo(6_480_000 / 5_940_000 - 1, 6);
  });

  it('calcola il ciclo del circolante come DSO + DIO − DPO', () => {
    expect(indicatori.cicloCircolante).toBe(
      (indicatori.dso ?? 0) + (indicatori.dio ?? 0) - (indicatori.dpo ?? 0),
    );
  });
});

describe('Analisi completa', () => {
  const analisi = analyzeCompany(profilo, polizze, DEMO_AS_OF);

  it('produce uno score di credito nella scala 1-100 con classe coerente', () => {
    const score = analisi.creditScore.value;
    expect(score.value).toBeGreaterThanOrEqual(1);
    expect(score.value).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D', 'E']).toContain(score.classe);
  });

  it('ogni fattore dello score dichiara peso, punteggio e motivazione', () => {
    for (const fattore of analisi.creditScore.value.factors) {
      expect(fattore.weight).toBeGreaterThan(0);
      expect(fattore.rationale.length).toBeGreaterThan(10);
    }
  });

  it('il fido consigliato non supera nessuno dei tre vincoli', () => {
    const fido = analisi.creditLimit.value;
    expect(fido.importo).toBeLessThanOrEqual(fido.limitePatrimoniale);
    expect(fido.importo).toBeLessThanOrEqual(fido.limiteDimensionale);
    expect(fido.importo).toBeLessThanOrEqual(fido.limiteFlusso);
  });

  it('identifica i rischi ordinandoli per gravità residua decrescente', () => {
    const punteggi = analisi.rischi.risks.map((r) => r.residualScore);
    expect(punteggi.length).toBeGreaterThan(10);
    expect([...punteggi].sort((a, b) => b - a)).toEqual(punteggi);
  });

  it('il rischio residuo non è mai superiore al rischio inerente', () => {
    for (const rischio of analisi.rischi.risks) {
      expect(rischio.residualScore).toBeLessThanOrEqual(rischio.inherentScore);
    }
  });

  it('identifica la RC prodotti e la aggrava per l’export verso USA e Canada', () => {
    const rcProdotto = analisi.rischi.risks.find((r) => r.definition.id === 'rc-prodotto');
    expect(rcProdotto).toBeDefined();
    expect(rcProdotto!.modulationRules.some((r) => r.ruleId === 'rc-prodotto/export-nord-america')).toBe(
      true,
    );
  });

  it('non attribuisce rischi di cantiere a un’azienda manifatturiera', () => {
    const rct = analisi.rischi.risks.find((r) => r.definition.id === 'rc-verso-terzi');
    expect(rct!.modulationRules.some((r) => r.ruleId === 'rct/cantiere')).toBe(false);
  });

  it('riconosce la certificazione ISO 9001 come controllo che riduce il rischio residuo', () => {
    const rcProdotto = analisi.rischi.risks.find((r) => r.definition.id === 'rc-prodotto')!;
    expect(rcProdotto.controlRules.some((r) => r.ruleId === 'controllo/iso-9001-prodotto')).toBe(true);
    expect(rcProdotto.residualScore).toBeLessThan(rcProdotto.inherentScore);
  });

  it('calcola i fabbricati dalla superficie e non dal valore contabile', () => {
    // 2.400 mq + 800 mq di prefabbricato a 750 €/mq = 2.400.000 €
    expect(Money.toEuro(analisi.sommeAssicurande.fabbricati.value)).toBe(3_200 * 750);
    expect(analisi.sommeAssicurande.fabbricati.confidence).toBe('alta');
  });

  it('dimensiona i danni indiretti sul margine di contribuzione, non sul fatturato', () => {
    const bi = Money.toEuro(analisi.sommeAssicurande.danniIndiretti.value);
    const fatturato = 6_480_000;
    expect(bi).toBeGreaterThan(0);
    expect(bi).toBeLessThan(fatturato);
    // Il capitale è arrotondato per eccesso: mai sotto il margine reale.
    expect(bi).toBeGreaterThanOrEqual(Money.toEuro(bilancio.ce.margineDiContribuzione));
    expect(bi).toBeLessThan(Money.toEuro(bilancio.ce.margineDiContribuzione) * 1.05);
  });

  it('arrotonda le somme assicurande per eccesso, mai per difetto', () => {
    const somme = analisi.sommeAssicurande;
    expect(Money.toEuro(somme.scorte.value)).toBeGreaterThanOrEqual(890_000 * 1.3);
    expect(Money.toEuro(somme.danniIndiretti.value)).toBeGreaterThanOrEqual(
      Money.toEuro(bilancio.ce.margineDiContribuzione),
    );
  });

  it('rileva la sottoassicurazione della polizza incendio', () => {
    const incendio = analisi.gap.gaps.find((g) => g.definition.id === 'incendio');
    expect(incendio).toBeDefined();
    expect(incendio!.status).toBe('sottoassicurata');
    expect(incendio!.sottoassicurazione?.value?.sottoassicurata).toBe(true);
  });

  it('mette la CAT NAT in cima al piano d’azione quando l’obbligo è scaduto', () => {
    expect(analisi.catNat.value.soggetta).toBe(true);
    expect(analisi.catNat.value.status).toBe('inadempiente');
    expect(analisi.gap.gaps[0]!.definition.id).toBe('catastrofali');
    expect(analisi.gap.gaps[0]!.priorita).toBe(100);
  });

  it('segnala il massimale RCT insufficiente rispetto al benchmark di settore', () => {
    const rct = analisi.gap.gaps.find((g) => g.definition.id === 'rct');
    expect(rct!.status).toBe('massimale-insufficiente');
  });

  it('considera adeguata la RCA flotta già in essere con massimale capiente', () => {
    const rca = analisi.gap.gaps.find((g) => g.definition.id === 'rca-flotta');
    expect(['adeguata', 'in-scadenza', 'da-quantificare']).toContain(rca!.status);
  });

  it('produce una motivazione di adeguatezza non vuota per ogni gap', () => {
    for (const gap of analisi.gap.gaps) {
      expect(gap.motivazioneAdeguatezza.length).toBeGreaterThan(30);
      expect(gap.azione.length).toBeGreaterThan(10);
    }
  });

  it('quantifica l’esposizione complessiva non assicurata', () => {
    expect(Money.toEuro(analisi.gap.esposizioneNonAssicurata)).toBeGreaterThan(0);
  });

  it('non conteggia due volte lo stesso patrimonio su garanzie concorrenti', () => {
    // Incendio, CAT NAT, guasti macchine, elettronica e furto assicurano gli stessi beni
    // contro cause diverse. Il tetto è patrimonio + margine, e **non** comprende un
    // addendo per le scorte: il patrimonio esposto le include già
    // (fabbricati + contenuto + scorte). Sommarle di nuovo — come faceva questo stesso
    // test prima di essere corretto — gonfia l'esposizione del loro intero valore e
    // rende il numero di copertina indifendibile davanti a un cliente.
    const tetto =
      Money.toEuro(analisi.sommeAssicurande.patrimonioEsposto.value) +
      Money.toEuro(analisi.sommeAssicurande.danniIndiretti.value);

    expect(Money.toEuro(analisi.gap.esposizioneNonAssicurata)).toBeLessThanOrEqual(tetto);
  });

  it('le scorte non compaiono due volte nell’esposizione', () => {
    // Prova diretta: il valore delle merci sta dentro il capitale incendio e dentro
    // quello del furto. Se l'esposizione le contasse entrambe, supererebbe il tetto
    // esattamente del valore delle scorte.
    const scorte = Money.toEuro(analisi.sommeAssicurande.scorte.value);
    expect(scorte).toBeGreaterThan(0);

    const tetto =
      Money.toEuro(analisi.sommeAssicurande.patrimonioEsposto.value) +
      Money.toEuro(analisi.sommeAssicurande.danniIndiretti.value);

    const eccedenza = Money.toEuro(analisi.gap.esposizioneNonAssicurata) - tetto;
    expect(eccedenza).toBeLessThan(scorte);
  });

  it('la sintesi espone le tre azioni prioritarie', () => {
    expect(analisi.sintesi.azioniPrioritarie).toHaveLength(3);
    expect(analisi.sintesi.catNatConforme).toBe(false);
  });
});

describe('Onestà dello score con dati incompleti', () => {
  it('non regala 20 punti quando gli eventi negativi non sono stati acquisiti', () => {
    // «Non ho controllato» non è «non ci sono protesti». Trattarli allo stesso modo
    // significa far concedere un fido a un soggetto già protestato.
    const senzaEventi = analyzeCompany({ ...profilo, eventiNegativi: null }, polizze, DEMO_AS_OF);
    const conEventi = analyzeCompany(profilo, polizze, DEMO_AS_OF);

    const fattore = senzaEventi.creditScore.value.factors.find((f) => f.key === 'eventi-negativi');
    expect(fattore?.score).toBeNull();
    expect(senzaEventi.creditScore.confidence).toBe('bassa');
    expect(conEventi.creditScore.confidence).not.toBe('bassa');
  });

  it('sui soli dati sintetici la confidenza non può essere alta', () => {
    const soloSintetici = analyzeCompany({ ...profilo, bilanci: [] }, polizze, DEMO_AS_OF);
    expect(soloSintetici.livelloDatiEconomici).toBe('sintetico');
    expect(soloSintetici.creditScore.confidence).not.toBe('alta');
  });

  it('con i soli dati sintetici il fido si calcola comunque, senza il vincolo di flusso', () => {
    const soloSintetici = analyzeCompany({ ...profilo, bilanci: [] }, polizze, DEMO_AS_OF);
    const fido = soloSintetici.creditLimit.value;

    // Patrimonio e fatturato ci sono: rinunciare al fido sarebbe rinunciare a rispondere
    // a una domanda a cui si può rispondere in parte.
    expect(Money.toEuro(fido.importo)).toBeGreaterThan(0);
    expect(fido.vincoloAttivo).not.toBe('flusso');
    expect(soloSintetici.creditLimit.explanation.notes.join(' ')).toContain('EBITDA non disponibile');
  });

  it('dichiara quali acquisizioni migliorerebbero l’analisi', () => {
    const parziale = analyzeCompany({ ...profilo, bilanci: [], eventiNegativi: null }, polizze, DEMO_AS_OF);
    const dati = parziale.arricchimentiPossibili.map((a) => a.dato);
    expect(dati).toContain('Bilancio in schema CEE dettagliato');
    expect(dati).toContain('Protesti e pregiudizievoli');
  });

  it('la classificazione dimensionale è identica con dati sintetici e dettagliati', () => {
    // È il dato che determina la scadenza CAT NAT: non deve dipendere da quanto si è speso.
    const completa = analyzeCompany(profilo, polizze, DEMO_AS_OF);
    const sintetica = analyzeCompany({ ...profilo, bilanci: [] }, polizze, DEMO_AS_OF);
    expect(sintetica.dimensione.value).toBe(completa.dimensione.value);
    expect(sintetica.catNat.value.termine?.getTime()).toBe(completa.catNat.value.termine?.getTime());
  });
});

describe('Regola proporzionale (art. 1907 c.c.)', () => {
  it('riduce l’indennizzo in proporzione alla sottoassicurazione', () => {
    // Capannone da 2 M€ assicurato per 1,2 M€, danno di 500 k€ → indennizzo 300 k€.
    const risultato = computeUnderinsurance(euro(2_000_000), euro(1_200_000), {
      dannoSimulato: euro(500_000),
    });
    expect(Money.toEuro(risultato.value!.simulazione.indennizzo)).toBe(300_000);
    expect(Money.toEuro(risultato.value!.simulazione.aCaricoAssicurato)).toBe(200_000);
    expect(risultato.value!.gradoDiCopertura).toBeCloseTo(0.6, 6);
  });

  it('non si applica alle garanzie a primo rischio assoluto', () => {
    const risultato = computeUnderinsurance(euro(2_000_000), euro(1_200_000), {
      dannoSimulato: euro(500_000),
      soggettaARegolaProporzionale: false,
    });
    expect(Money.toEuro(risultato.value!.simulazione.indennizzo)).toBe(500_000);
  });

  it('non produce risultati con valore reale nullo', () => {
    expect(computeUnderinsurance(euro(0), euro(100_000)).value).toBeNull();
  });
});

describe('Obbligo CAT NAT', () => {
  const facts = deriveFacts(profilo, bilancio, DEMO_AS_OF);

  it('esclude le imprese agricole per le quali opera il Fondo AGRICAT', () => {
    const agricola = assessCatNat({
      facts: { ...facts, atecoSezione: 'A' },
      baseAssicurabile: euro(500_000),
      giaCoperta: false,
      asOf: DEMO_AS_OF,
    });
    expect(agricola.value.soggetta).toBe(false);
    expect(agricola.value.motivoEsclusione).toContain('AGRICAT');
  });

  it('applica alle piccole imprese il termine del 1° gennaio 2026', () => {
    const risultato = assessCatNat({
      facts,
      baseAssicurabile: euro(1_000_000),
      giaCoperta: false,
      asOf: DEMO_AS_OF,
    });
    expect(risultato.value.termine?.getUTCFullYear()).toBe(2026);
    expect(risultato.value.status).toBe('inadempiente');
  });

  it('applica la proroga settoriale alle micro imprese della somministrazione', () => {
    const bar = assessCatNat({
      facts: { ...facts, dimensione: 'micro', atecoDivisione: '56', atecoSezione: 'I' },
      baseAssicurabile: euro(120_000),
      giaCoperta: false,
      asOf: new Date('2026-02-01T00:00:00Z'),
    });
    expect(bar.value.termine?.toISOString().slice(0, 10)).toBe('2026-03-31');
    expect(bar.value.status).toBe('in-scadenza');
  });

  it('riconosce l’adempimento se una copertura conforme è in essere', () => {
    const coperta = assessCatNat({
      facts,
      baseAssicurabile: euro(1_000_000),
      giaCoperta: true,
      asOf: DEMO_AS_OF,
    });
    expect(coperta.value.status).toBe('adempiente');
    expect(coperta.value.conseguenzeInadempimento).toHaveLength(0);
  });
});

/**
 * Zero euro e «non lo sappiamo» sono due cose diverse.
 *
 * Emerso su un'azienda reale: uno studio di architettura che non deposita il bilancio in
 * forma analitica. Nessuna somma assicuranda risultava calcolabile, tutte le garanzie
 * finivano in stato «da quantificare», e la sintesi dichiarava — testualmente —
 * «esposizione non assicurata: 0 €» accanto a «6 coperture assenti».
 *
 * Letto da un intermediario, quello zero significa «nulla da fare qui». È esattamente il
 * contrario: significa che manca la rilevazione, cioè che lì il lavoro deve ancora
 * cominciare. E se lo zero arriva fino al report consegnato al cliente, non è più un
 * numero impreciso: è un'attestazione di adeguatezza che nessuno ha verificato.
 */
describe('Esposizione non quantificabile', () => {
  // Un profilo senza alcun dato economico: né bilancio analitico né bilanci sintetici.
  const senzaDatiEconomici = analyzeCompany(
    { ...profilo, bilanci: [], bilanciSintetici: [] },
    [],
    DEMO_AS_OF,
  );

  it('conta a parte le garanzie prive di capitale determinabile', () => {
    expect(senzaDatiEconomici.gap.coperturaDaQuantificare).toBeGreaterThan(0);
    expect(senzaDatiEconomici.sintesi.coperturaDaQuantificare).toBe(
      senzaDatiEconomici.gap.coperturaDaQuantificare,
    );
  });

  it('non somma nell’esposizione ciò che non ha potuto quantificare', () => {
    const daQuantificare = senzaDatiEconomici.gap.gaps.filter((g) => g.status === 'da-quantificare');

    // Nessuna di queste ha un capitale: l'esposizione non può che ignorarle.
    for (const gap of daQuantificare) {
      expect(gap.capitaleRaccomandato.value).toBeNull();
    }
  });

  it('il conteggio corrisponde esattamente agli stati «da quantificare»', () => {
    // Un conteggio scollegato dagli stati sarebbe peggio dell'assenza del conteggio:
    // darebbe l'impressione di una verifica che non c'è.
    expect(senzaDatiEconomici.gap.coperturaDaQuantificare).toBe(
      senzaDatiEconomici.gap.gaps.filter((g) => g.status === 'da-quantificare').length,
    );
  });

  it('con i dati completi non resta nulla da quantificare fra le garanzie a valore', () => {
    // Il contrappeso: il conteggio deve scendere quando i dati ci sono, altrimenti
    // segnalerebbe sempre e non distinguerebbe nulla.
    const completa = analyzeCompany(profilo, polizze, DEMO_AS_OF);
    expect(completa.gap.coperturaDaQuantificare).toBeLessThan(
      senzaDatiEconomici.gap.coperturaDaQuantificare,
    );
  });
});
