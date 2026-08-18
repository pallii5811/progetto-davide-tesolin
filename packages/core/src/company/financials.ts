/**
 * Bilancio: dalle voci CEE agli schemi gestionali.
 *
 * Il bilancio civilistico (artt. 2424-2425 c.c.) è pensato per la tutela dei creditori,
 * non per l'analisi. Prima di poterci ragionare va riclassificato:
 *  - Stato patrimoniale → criterio finanziario (liquidità/esigibilità)
 *  - Conto economico    → a valore aggiunto (per arrivare a EBITDA ed EBIT)
 *
 * Da qui discendono sia lo score di credito sia — ed è il punto originale della piattaforma —
 * le somme assicurande.
 */

import { Money, ZERO } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';

// ─────────────────────────────────────────────────────────────────────────────
// Voci del bilancio civilistico (input)
// ─────────────────────────────────────────────────────────────────────────────

/** Attivo dello stato patrimoniale, art. 2424 c.c. */
export interface AttivoCEE {
  /** A) Crediti verso soci per versamenti ancora dovuti */
  readonly creditiVersoSoci: Euro;
  /** B.I) Immobilizzazioni immateriali (nette) */
  readonly immobilizzazioniImmateriali: Euro;
  /** B.II.1) Terreni e fabbricati (netti) */
  readonly terreniEFabbricati: Euro;
  /** B.II.2) Impianti e macchinario (netti) */
  readonly impiantiEMacchinario: Euro;
  /** B.II.3) Attrezzature industriali e commerciali (nette) */
  readonly attrezzature: Euro;
  /** B.II.4-5) Altri beni e immobilizzazioni in corso (netti) */
  readonly altreImmobilizzazioniMateriali: Euro;
  /** B.III) Immobilizzazioni finanziarie */
  readonly immobilizzazioniFinanziarie: Euro;
  /** C.I) Rimanenze */
  readonly rimanenze: Euro;
  /** C.II.1) Crediti verso clienti (entro l'esercizio) */
  readonly creditiVersoClienti: Euro;
  /** C.II) Altri crediti */
  readonly altriCrediti: Euro;
  /** C.III) Attività finanziarie che non costituiscono immobilizzazioni */
  readonly attivitaFinanziarieNonImmobilizzate: Euro;
  /** C.IV) Disponibilità liquide */
  readonly disponibilitaLiquide: Euro;
  /** D) Ratei e risconti attivi */
  readonly rateiRiscontiAttivi: Euro;

  /**
   * Costo storico lordo delle immobilizzazioni materiali, se disponibile dalla nota integrativa.
   * È il dato **decisivo** per le somme assicurande a valore di rimpiazzo: il valore netto
   * contabile è già ammortizzato e sottostima sistematicamente il costo di ricostruzione.
   */
  readonly costoStoricoImmobilizzazioniMateriali?: Euro | undefined;
}

/** Passivo dello stato patrimoniale, art. 2424 c.c. */
export interface PassivoCEE {
  /** A.I) Capitale sociale */
  readonly capitaleSociale: Euro;
  /** A.II-VII) Riserve (di capitale e di utili) */
  readonly riserve: Euro;
  /** A.VIII) Utili (perdite) portati a nuovo */
  readonly utiliPortatiANuovo: Euro;
  /** A.IX) Utile (perdita) dell'esercizio */
  readonly utileEsercizio: Euro;
  /** B) Fondi per rischi e oneri */
  readonly fondiRischiOneri: Euro;
  /** C) Trattamento di fine rapporto */
  readonly tfr: Euro;
  /** D.4) Debiti verso banche entro l'esercizio successivo */
  readonly debitiVersoBancheBreve: Euro;
  /** D.4) Debiti verso banche oltre l'esercizio successivo */
  readonly debitiVersoBancheOltre: Euro;
  /** D.7) Debiti verso fornitori */
  readonly debitiVersoFornitori: Euro;
  /** D.12) Debiti tributari */
  readonly debitiTributari: Euro;
  /** D) Altri debiti entro l'esercizio */
  readonly altriDebitiBreve: Euro;
  /** D) Altri debiti oltre l'esercizio */
  readonly altriDebitiOltre: Euro;
  /** E) Ratei e risconti passivi */
  readonly rateiRiscontiPassivi: Euro;
}

/** Conto economico, art. 2425 c.c. */
export interface ContoEconomicoCEE {
  /** A.1) Ricavi delle vendite e delle prestazioni */
  readonly ricaviVendite: Euro;
  /** A.2-3) Variazioni rimanenze prodotti e lavori in corso */
  readonly variazioneRimanenzeProdotti: Euro;
  /** A.4-5) Incrementi di immobilizzazioni per lavori interni e altri ricavi */
  readonly altriRicavi: Euro;
  /** B.6) Costi per materie prime, sussidiarie, di consumo e merci */
  readonly costiMateriePrime: Euro;
  /** B.11) Variazioni delle rimanenze di materie prime (segno: + se diminuiscono) */
  readonly variazioneRimanenzeMateriePrime: Euro;
  /** B.7) Costi per servizi */
  readonly costiServizi: Euro;
  /** B.8) Costi per godimento di beni di terzi */
  readonly costiGodimentoBeniTerzi: Euro;
  /** B.9.a) Salari e stipendi */
  readonly salariStipendi: Euro;
  /** B.9.b-e) Oneri sociali, TFR, trattamento di quiescenza, altri costi del personale */
  readonly oneriSocialiEAltri: Euro;
  /** B.10) Ammortamenti e svalutazioni */
  readonly ammortamentiSvalutazioni: Euro;
  /** B.12-13) Accantonamenti per rischi e altri accantonamenti */
  readonly accantonamenti: Euro;
  /** B.14) Oneri diversi di gestione */
  readonly oneriDiversiGestione: Euro;
  /** C.15-16) Proventi finanziari */
  readonly proventiFinanziari: Euro;
  /** C.17) Interessi e altri oneri finanziari */
  readonly oneriFinanziari: Euro;
  /** D) Rettifiche di valore di attività e passività finanziarie */
  readonly rettificheAttivitaFinanziarie: Euro;
  /** 20) Imposte sul reddito dell'esercizio */
  readonly imposte: Euro;
}

/** Un esercizio completo. */
export interface Bilancio {
  readonly anno: number;
  readonly dataChiusura: Date;
  /** Durata dell'esercizio in mesi: il primo esercizio può essere non annuale. */
  readonly mesiEsercizio: number;
  readonly attivo: AttivoCEE;
  readonly passivo: PassivoCEE;
  readonly contoEconomico: ContoEconomicoCEE;
  readonly numeroDipendenti?: number | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bilancio sintetico
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bilancio in forma sintetica: i pochi aggregati che le anagrafiche estese
 * restituiscono senza costo aggiuntivo.
 *
 * Non è un ripiego di serie B. Con questi cinque numeri si determinano la classificazione
 * dimensionale UE (e quindi la scadenza CAT NAT), i benchmark di massimale, la base RCO e
 * una parte consistente dello score. Il bilancio in schema CEE dettagliato è un prodotto
 * a parte, più caro di un ordine di grandezza: va acquisito quando serve davvero — per il
 * margine di contribuzione dei danni indiretti e per gli indici di liquidità — non per
 * abitudine.
 *
 * La piattaforma dichiara sempre su quale livello di dati sta lavorando.
 */
export interface BilancioSintetico {
  readonly anno: number;
  readonly dataChiusura: Date | null;
  readonly fatturato: Euro | null;
  readonly patrimonioNetto: Euro | null;
  readonly totaleAttivo: Euro | null;
  readonly costoDelPersonale: Euro | null;
  readonly capitaleSociale: Euro | null;
  readonly dipendenti: number | null;
  readonly retribuzioneMediaLorda: Euro | null;
}

/**
 * Un esercizio è utilizzabile solo se porta almeno un aggregato economico.
 * Le anagrafiche restituiscono anche l'anno in corso, con tutti i valori a `null`:
 * contarlo come esercizio disponibile falserebbe il fattore di continuità dello score.
 */
export function isBilancioSinteticoUtile(b: BilancioSintetico): boolean {
  return b.fatturato !== null || b.totaleAttivo !== null || b.patrimonioNetto !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemi riclassificati (output)
// ─────────────────────────────────────────────────────────────────────────────

export interface StatoPatrimonialeRiclassificato {
  readonly liquiditaImmediate: Euro;
  readonly liquiditaDifferite: Euro;
  readonly rimanenze: Euro;
  readonly attivoCorrente: Euro;

  readonly immobilizzazioniImmateriali: Euro;
  readonly immobilizzazioniMateriali: Euro;
  readonly immobilizzazioniFinanziarie: Euro;
  readonly attivoImmobilizzato: Euro;

  readonly totaleAttivo: Euro;

  readonly debitiFinanziariBreve: Euro;
  readonly debitiCommerciali: Euro;
  readonly altriDebitiBreve: Euro;
  readonly passivoCorrente: Euro;

  readonly debitiFinanziariMedioLungo: Euro;
  readonly tfrEFondi: Euro;
  readonly passivoConsolidato: Euro;

  readonly patrimonioNetto: Euro;
  /** Patrimonio netto al netto delle immobilizzazioni immateriali: la sostanza aggredibile. */
  readonly patrimonioNettoTangibile: Euro;

  readonly totalePassivo: Euro;

  /** Attivo corrente − Passivo corrente. */
  readonly capitaleCircolanteNetto: Euro;
  /** Debiti finanziari totali − liquidità. */
  readonly posizioneFinanziariaNetta: Euro;
  readonly totaleDebiti: Euro;
}

export interface ContoEconomicoRiclassificato {
  readonly ricavi: Euro;
  readonly valoreDellaProduzione: Euro;
  readonly costiEsterni: Euro;
  readonly valoreAggiunto: Euro;
  readonly costoDelPersonale: Euro;
  readonly ebitda: Euro;
  readonly ammortamenti: Euro;
  readonly ebit: Euro;
  readonly saldoGestioneFinanziaria: Euro;
  readonly oneriFinanziari: Euro;
  readonly risultatoAnteImposte: Euro;
  readonly imposte: Euro;
  readonly utileNetto: Euro;
  /**
   * Costi variabili: base del margine di contribuzione, che è a sua volta la base
   * della somma assicuranda per i danni indiretti (business interruption).
   */
  readonly costiVariabili: Euro;
  readonly margineDiContribuzione: Euro;
}

export interface BilancioRiclassificato {
  readonly anno: number;
  readonly dataChiusura: Date;
  readonly mesiEsercizio: number;
  readonly sp: StatoPatrimonialeRiclassificato;
  readonly ce: ContoEconomicoRiclassificato;
  readonly numeroDipendenti: number | null;
  /** Riferimento al bilancio di origine, per risalire alle voci grezze. */
  readonly origine: Bilancio;
}

// ─────────────────────────────────────────────────────────────────────────────
// Riclassificazione
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quota dei costi per servizi considerata variabile.
 *
 * I costi per servizi (B.7) sono un calderone: lavorazioni esterne e trasporti sono variabili,
 * consulenze e assicurazioni no. In assenza del dettaglio si adotta un'euristica prudenziale
 * del 60%. Il valore è configurabile perché in sede di analisi il broker può raffinarlo
 * con il cliente, e la differenza si riflette direttamente sulla somma assicuranda dei
 * danni indiretti.
 */
export const QUOTA_SERVIZI_VARIABILE_DEFAULT = 0.6;

export interface ReclassifyOptions {
  readonly quotaServiziVariabile?: number | undefined;
}

export function reclassify(bilancio: Bilancio, options: ReclassifyOptions = {}): BilancioRiclassificato {
  const { attivo, passivo, contoEconomico: ce } = bilancio;
  const quotaServiziVariabile = options.quotaServiziVariabile ?? QUOTA_SERVIZI_VARIABILE_DEFAULT;

  // ── Stato patrimoniale ────────────────────────────────────────────────────
  const liquiditaImmediate = Money.add(
    attivo.disponibilitaLiquide,
    attivo.attivitaFinanziarieNonImmobilizzate,
  );
  const liquiditaDifferite = Money.add(
    attivo.creditiVersoClienti,
    attivo.altriCrediti,
    attivo.creditiVersoSoci,
    attivo.rateiRiscontiAttivi,
  );
  const attivoCorrente = Money.add(liquiditaImmediate, liquiditaDifferite, attivo.rimanenze);

  const immobilizzazioniMateriali = Money.add(
    attivo.terreniEFabbricati,
    attivo.impiantiEMacchinario,
    attivo.attrezzature,
    attivo.altreImmobilizzazioniMateriali,
  );
  const attivoImmobilizzato = Money.add(
    attivo.immobilizzazioniImmateriali,
    immobilizzazioniMateriali,
    attivo.immobilizzazioniFinanziarie,
  );
  const totaleAttivo = Money.add(attivoCorrente, attivoImmobilizzato);

  const debitiFinanziariBreve = passivo.debitiVersoBancheBreve;
  const debitiCommerciali = passivo.debitiVersoFornitori;
  const altriDebitiBreve = Money.add(
    passivo.debitiTributari,
    passivo.altriDebitiBreve,
    passivo.rateiRiscontiPassivi,
  );
  const passivoCorrente = Money.add(debitiFinanziariBreve, debitiCommerciali, altriDebitiBreve);

  const debitiFinanziariMedioLungo = passivo.debitiVersoBancheOltre;
  const tfrEFondi = Money.add(passivo.tfr, passivo.fondiRischiOneri);
  const passivoConsolidato = Money.add(debitiFinanziariMedioLungo, tfrEFondi, passivo.altriDebitiOltre);

  const patrimonioNetto = Money.add(
    passivo.capitaleSociale,
    passivo.riserve,
    passivo.utiliPortatiANuovo,
    passivo.utileEsercizio,
  );
  const patrimonioNettoTangibile = Money.subtract(patrimonioNetto, attivo.immobilizzazioniImmateriali);

  const totalePassivo = Money.add(passivoCorrente, passivoConsolidato, patrimonioNetto);
  const totaleDebiti = Money.add(passivoCorrente, passivoConsolidato);

  const capitaleCircolanteNetto = Money.subtract(attivoCorrente, passivoCorrente);
  const posizioneFinanziariaNetta = Money.subtract(
    Money.add(debitiFinanziariBreve, debitiFinanziariMedioLungo),
    liquiditaImmediate,
  );

  // ── Conto economico a valore aggiunto ─────────────────────────────────────
  const valoreDellaProduzione = Money.add(ce.ricaviVendite, ce.variazioneRimanenzeProdotti, ce.altriRicavi);
  const consumiMateriePrime = Money.add(ce.costiMateriePrime, ce.variazioneRimanenzeMateriePrime);
  const costiEsterni = Money.add(
    consumiMateriePrime,
    ce.costiServizi,
    ce.costiGodimentoBeniTerzi,
    ce.oneriDiversiGestione,
  );
  const valoreAggiunto = Money.subtract(valoreDellaProduzione, costiEsterni);

  const costoDelPersonale = Money.add(ce.salariStipendi, ce.oneriSocialiEAltri);
  const ebitda = Money.subtract(valoreAggiunto, costoDelPersonale);
  const ammortamenti = Money.add(ce.ammortamentiSvalutazioni, ce.accantonamenti);
  const ebit = Money.subtract(ebitda, ammortamenti);

  const saldoGestioneFinanziaria = Money.add(
    Money.subtract(ce.proventiFinanziari, ce.oneriFinanziari),
    ce.rettificheAttivitaFinanziarie,
  );
  const risultatoAnteImposte = Money.add(ebit, saldoGestioneFinanziaria);
  const utileNetto = Money.subtract(risultatoAnteImposte, ce.imposte);

  const costiVariabili = Money.add(
    consumiMateriePrime,
    Money.multiply(ce.costiServizi, quotaServiziVariabile),
  );
  const margineDiContribuzione = Money.max(ZERO, Money.subtract(valoreDellaProduzione, costiVariabili));

  return {
    anno: bilancio.anno,
    dataChiusura: bilancio.dataChiusura,
    mesiEsercizio: bilancio.mesiEsercizio,
    numeroDipendenti: bilancio.numeroDipendenti ?? null,
    origine: bilancio,
    sp: {
      liquiditaImmediate,
      liquiditaDifferite,
      rimanenze: attivo.rimanenze,
      attivoCorrente,
      immobilizzazioniImmateriali: attivo.immobilizzazioniImmateriali,
      immobilizzazioniMateriali,
      immobilizzazioniFinanziarie: attivo.immobilizzazioniFinanziarie,
      attivoImmobilizzato,
      totaleAttivo,
      debitiFinanziariBreve,
      debitiCommerciali,
      altriDebitiBreve,
      passivoCorrente,
      debitiFinanziariMedioLungo,
      tfrEFondi,
      passivoConsolidato,
      patrimonioNetto,
      patrimonioNettoTangibile,
      totalePassivo,
      capitaleCircolanteNetto,
      posizioneFinanziariaNetta,
      totaleDebiti,
    },
    ce: {
      ricavi: ce.ricaviVendite,
      valoreDellaProduzione,
      costiEsterni,
      valoreAggiunto,
      costoDelPersonale,
      ebitda,
      ammortamenti,
      ebit,
      saldoGestioneFinanziaria,
      oneriFinanziari: ce.oneriFinanziari,
      risultatoAnteImposte,
      imposte: ce.imposte,
      utileNetto,
      costiVariabili,
      margineDiContribuzione,
    },
  };
}

/**
 * Sbilanciamento fra totale attivo e totale passivo.
 * Un bilancio riclassificato che non quadra segnala dati del provider incompleti:
 * meglio saperlo prima di costruirci sopra uno score.
 */
export function squadraturaBilancio(r: BilancioRiclassificato): Euro {
  return Money.subtract(r.sp.totaleAttivo, r.sp.totalePassivo);
}

/** Tolleranza dell'1% del totale attivo, o 1.000 € se l'attivo è modesto. */
export function isBilancioQuadrato(r: BilancioRiclassificato): boolean {
  const tolleranza = Money.max(Money.multiply(r.sp.totaleAttivo, 0.01), Money.euro(1_000));
  return Money.abs(squadraturaBilancio(r)) <= tolleranza;
}
