/**
 * Rilevazione degli eventi fra due fotografie.
 *
 * Funzione pura: due stati e una data producono sempre gli stessi eventi. È ciò che rende
 * il monitoraggio verificabile — e che permette di rieseguirlo su dati storici per capire
 * cosa l'intermediario *avrebbe* dovuto sapere.
 *
 * Il criterio di inclusione è uno solo: **un evento entra se, non agendo, il cliente
 * rischia di restare scoperto o l'intermediario di dover giustificare un'omissione.**
 * Le variazioni che non spostano una copertura non compaiono: una coda piena di rumore
 * viene ignorata per intero, ed è il modo più rapido per rendere inutile uno strumento.
 */

import { Money } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import { COVERAGE_CATALOG } from '../coverage/taxonomy.js';
import type { CoverageId } from '../coverage/taxonomy.js';
import type { EventoMonitoraggio } from './events.js';
import { perRilevanza } from './events.js';
import type { PolizzaSorvegliata, StatoSorvegliato } from './state.js';

export interface OpzioniRilevazione {
  /** Data di riferimento: le scadenze si valutano rispetto a questa. */
  readonly asOf: Date;
  /** Con quanti giorni di anticipo segnalare una polizza in scadenza. */
  readonly preavvisoScadenzaGiorni?: number;
  /** Variazione di score, in punti, oltre la quale vale la pena avvisare. */
  readonly sogliaScorePunti?: number;
  /**
   * Scostamento del capitale raccomandato rispetto a quello in polizza oltre il quale si
   * segnala la sottoassicurazione sopravvenuta. Sotto questa soglia si tratta di
   * fisiologica oscillazione, e segnalarla ogni anno svuoterebbe l'avviso di significato.
   */
  readonly sogliaScostamentoCapitale?: number;
}

const PREAVVISO_PREDEFINITO = 60;
const SOGLIA_SCORE_PREDEFINITA = 8;
const SOGLIA_SCOSTAMENTO_PREDEFINITA = 0.15;

const ORDINE_DIMENSIONI = ['micro', 'piccola', 'media', 'grande'] as const;

export function rilevaEventi(
  precedente: StatoSorvegliato | null,
  corrente: StatoSorvegliato,
  opzioni: OpzioniRilevazione,
): readonly EventoMonitoraggio[] {
  const eventi: EventoMonitoraggio[] = [];

  // Le scadenze e gli obblighi si valutano sullo stato corrente: valgono anche alla prima
  // osservazione, quando non c'è nulla da confrontare. È il caso dell'azienda appena
  // presa in carico, che è precisamente quando serve sapere cosa scade.
  eventi.push(...scadenzePolizze(corrente, opzioni));
  eventi.push(...obbligoCatNat(precedente, corrente));

  if (precedente !== null) {
    eventi.push(...variazioneAteco(precedente, corrente));
    eventi.push(...nuoveSedi(precedente, corrente));
    eventi.push(...saltoDimensionale(precedente, corrente));
    eventi.push(...nuovoBilancio(precedente, corrente, opzioni));
    eventi.push(...variazioneScore(precedente, corrente, opzioni));
    eventi.push(...deterioramentoLegale(precedente, corrente));
    eventi.push(...variazioneAnagrafica(precedente, corrente));
  }

  return [...eventi].sort(perRilevanza);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scadenze
// ─────────────────────────────────────────────────────────────────────────────

function scadenzePolizze(
  corrente: StatoSorvegliato,
  opzioni: OpzioniRilevazione,
): readonly EventoMonitoraggio[] {
  const preavviso = opzioni.preavvisoScadenzaGiorni ?? PREAVVISO_PREDEFINITO;

  return corrente.polizze.flatMap((polizza): EventoMonitoraggio[] => {
    const giorni = giorniA(polizza.scadenza, opzioni.asOf);
    if (giorni === null || giorni > preavviso) return [];

    const etichetta = etichettaCopertura(polizza.coverage);
    const scaduta = giorni < 0;

    return [
      {
        tipo: 'polizza-in-scadenza',
        titolo: scaduta
          ? `${etichetta}: polizza scaduta da ${Math.abs(giorni)} giorni`
          : `${etichetta}: scade fra ${giorni} giorni`,
        descrizione: scaduta
          ? `La copertura ${etichetta} con ${polizza.compagnia} è scaduta il ${formattaData(polizza.scadenza)} e non risulta rinnovata.`
          : `La copertura ${etichetta} con ${polizza.compagnia} scade il ${formattaData(polizza.scadenza)}.`,
        conseguenza: scaduta
          ? 'Il rischio è oggi interamente a carico del cliente: un sinistro avvenuto adesso non troverebbe indennizzo.'
          : 'Alla scadenza la garanzia cessa. È anche l’unico momento in cui i capitali si possono adeguare senza appendici.',
        azioneSuggerita: scaduta
          ? `Contattare il cliente oggi: verificare se ha rinnovato altrove e, in caso contrario, ripristinare la copertura ${etichetta}.`
          : `Programmare il rinnovo della ${etichetta} e cogliere l’occasione per verificare che i capitali siano ancora congrui.`,
        rilevanza: scaduta ? 5 : giorni <= 15 ? 4 : 3,
        valorePrecedente: null,
        valoreNuovo: polizza.scadenza,
        riferimenti: ['Art. 1901 c.c. — sospensione della garanzia per mancato pagamento'],
      },
    ];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Obbligo normativo
// ─────────────────────────────────────────────────────────────────────────────

function obbligoCatNat(
  precedente: StatoSorvegliato | null,
  corrente: StatoSorvegliato,
): readonly EventoMonitoraggio[] {
  if (corrente.statoCatNat !== 'inadempiente' && corrente.statoCatNat !== 'in-scadenza') return [];

  // L'evento si emette **ogni volta** che l'obbligo risulta non adempiuto, anche se lo era
  // già al giro precedente: è uno stato che persiste, non una variazione. Tacerlo perché
  // «non è cambiato nulla» lo farebbe sparire proprio dalle installazioni dove dura da più
  // tempo. A non riempire la coda di doppioni pensa chi la coda la tiene — qui si dicono
  // i fatti, non si decide cosa l'intermediario ha già visto.
  const inadempiente = corrente.statoCatNat === 'inadempiente';

  return [
    {
      tipo: 'obbligo-normativo',
      /*
        «Non adempiuto» è un accertamento, e la piattaforma non l'ha fatto.

        Sa soltanto che fra le polizze **che le sono state censite** non ce n'è una
        catastrofale — e se di polizze censite non ce n'è nessuna, quella frase non afferma
        niente. Qui pesa quanto altrove e forse di più: è la coda di lavoro
        dell'intermediario, l'elenco di chi chiamare, e «cliente inadempiente a una legge»
        è una telefonata che si fa una volta sola.

        Il fatto resta e va segnalato — una copertura obbligatoria non risulta —, ma
        dichiarato per quello che è: una verifica da completare sulle polizze, non una
        colpa già accertata.
      */
      titolo: inadempiente
        ? 'Copertura catastrofale non censita: obbligo da verificare'
        : 'Obbligo assicurativo catastrofale in scadenza',
      descrizione: inadempiente
        ? 'Il termine di legge per la copertura contro terremoto, alluvione e frana è decorso e, fra le polizze censite, non ne risulta alcuna che lo adempia.'
        : 'Il termine di legge per la copertura contro terremoto, alluvione e frana si avvicina.',
      /*
        «Si tiene conto», non «preclude». E l'art. 2086 non è di tutti.

        Due sovradichiarazioni in una riga, e sono le due che il cliente può controllare
        da solo in dieci minuti. L'art. 1 c. 102 della L. 213/2023 prevede che
        dell'inadempimento si tenga conto nell'assegnazione di contributi, sovvenzioni e
        agevolazioni a valere su risorse pubbliche, comprese quelle previste in occasione
        di eventi calamitosi: non è un'esclusione automatica dai sostegni. La lettura
        corretta è già scritta in `coverage/motivazione.ts`, ed è quella che si copia.

        Il comma 2 dell'art. 2086 c.c. grava sull'imprenditore «che operi in forma
        societaria o collettiva»: alla ditta individuale non si applica. La fotografia
        sorvegliata porta la forma giuridica come descrizione camerale, non come categoria
        normalizzata — quindi non si indovina la forma, si dichiara il perimetro della
        norma, che è vero per chiunque legga.
      */
      conseguenza:
        'Se l’obbligo risultasse davvero non adempiuto, dell’inadempimento si tiene conto nell’assegnazione di contributi, sovvenzioni e agevolazioni di carattere finanziario a valere su risorse pubbliche, comprese quelle previste in occasione di eventi calamitosi. Per l’imprenditore che operi in forma societaria o collettiva può inoltre rilevare nella valutazione degli adeguati assetti organizzativi in capo all’organo amministrativo.',
      azioneSuggerita:
        'Verificare con il cliente se la copertura CAT NAT esista già; se non esiste, presentarne una quotazione. È un obbligo di legge, non una proposta commerciale, e va documentato di averlo rappresentato.',
      rilevanza: inadempiente ? 5 : 4,
      valorePrecedente: precedente?.statoCatNat ?? null,
      valoreNuovo: corrente.statoCatNat,
      riferimenti: [
        'L. 213/2023 art. 1 co. 101-111',
        'DM 30/01/2025 n. 18',
        'Art. 2086, c. 2, c.c. — per l’imprenditore che operi in forma societaria o collettiva',
      ],
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Variazioni che rendono inoperante una garanzia
// ─────────────────────────────────────────────────────────────────────────────

function variazioneAteco(
  precedente: StatoSorvegliato,
  corrente: StatoSorvegliato,
): readonly EventoMonitoraggio[] {
  if (corrente.ateco === null || precedente.ateco === corrente.ateco) return [];

  return [
    {
      tipo: 'ateco-variato',
      titolo: 'Attività esercitata variata',
      descrizione: `Il codice ATECO è passato da ${precedente.ateco ?? 'non noto'} a ${corrente.ateco}.`,
      conseguenza:
        'Le polizze descrivono l’attività assicurata: se quella esercitata non corrisponde più a quella dichiarata, la compagnia può eccepire l’inoperatività della garanzia o ridurre l’indennizzo. Cambia inoltre il profilo di rischio, e con esso i massimali congrui.',
      azioneSuggerita:
        'Comunicare la variazione alle compagnie e far aggiornare la descrizione dell’attività su tutte le polizze in essere.',
      rilevanza: 5,
      valorePrecedente: precedente.ateco,
      valoreNuovo: corrente.ateco,
      riferimenti: [
        'Art. 1898 c.c. — aggravamento del rischio',
        'Art. 1892-1893 c.c. — dichiarazioni inesatte',
      ],
    },
  ];
}

function nuoveSedi(
  precedente: StatoSorvegliato,
  corrente: StatoSorvegliato,
): readonly EventoMonitoraggio[] {
  const eventi: EventoMonitoraggio[] = [];

  const traslocata =
    corrente.indirizzoSedeLegale !== null &&
    precedente.indirizzoSedeLegale !== null &&
    corrente.indirizzoSedeLegale !== precedente.indirizzoSedeLegale;

  if (traslocata) {
    eventi.push({
      tipo: 'nuova-sede',
      titolo: 'Sede legale trasferita',
      descrizione: `La sede legale è passata da «${precedente.indirizzoSedeLegale}» a «${corrente.indirizzoSedeLegale}».`,
      conseguenza:
        'Le garanzie sui beni operano sull’ubicazione indicata in polizza: nella nuova sede i beni sono scoperti finché non viene comunicata. Cambiano anche la pericolosità sismica e idraulica su cui è tarata la copertura catastrofale.',
      azioneSuggerita:
        'Far emettere l’appendice di variazione di ubicazione su incendio, furto ed elettronica, e rivalutare la CAT NAT sulla nuova zona.',
      rilevanza: 5,
      valorePrecedente: precedente.indirizzoSedeLegale,
      valoreNuovo: corrente.indirizzoSedeLegale,
      riferimenti: ['Art. 1898 c.c. — aggravamento del rischio'],
    });
  }

  /*
    Si confrontano due conteggi solo quando esistono entrambi.

    `null` significa «unità locali non acquisite», e un'assenza non è uno zero da cui
    contare le aperture: fra un'analisi ordinaria e una approfondita l'unica cosa
    cambiata è quanto si è pagato, non le sedi dell'impresa.
  */
  const prima = precedente.numeroUnitaLocali;
  const adesso = corrente.numeroUnitaLocali;

  if (prima !== null && adesso !== null && adesso > prima) {
    const nuove = adesso - prima;
    eventi.push({
      tipo: 'nuova-sede',
      titolo: nuove === 1 ? 'Nuova unità locale aperta' : `${nuove} nuove unità locali aperte`,
      descrizione: `Le unità locali sono passate da ${prima} a ${adesso}.`,
      conseguenza:
        'Un’ubicazione non elencata in polizza non è coperta: beni, merci e responsabilità che vi si trovano restano interamente a carico dell’impresa.',
      azioneSuggerita:
        'Rilevare i valori presenti nella nuova ubicazione e includerla nelle polizze a valore, oppure quotarne una dedicata.',
      rilevanza: 5,
      valorePrecedente: String(prima),
      valoreNuovo: String(adesso),
      riferimenti: [],
    });
  }

  return eventi;
}

// ─────────────────────────────────────────────────────────────────────────────
// Crescita e sottoassicurazione sopravvenuta
// ─────────────────────────────────────────────────────────────────────────────

function saltoDimensionale(
  precedente: StatoSorvegliato,
  corrente: StatoSorvegliato,
): readonly EventoMonitoraggio[] {
  const prima = ORDINE_DIMENSIONI.indexOf(precedente.dimensione);
  const dopo = ORDINE_DIMENSIONI.indexOf(corrente.dimensione);
  if (prima === -1 || dopo === -1 || prima === dopo) return [];

  const cresciuta = dopo > prima;

  return [
    {
      tipo: 'salto-dimensionale',
      titolo: cresciuta
        ? `L’impresa è passata da ${precedente.dimensione} a ${corrente.dimensione}`
        : `L’impresa è rientrata da ${precedente.dimensione} a ${corrente.dimensione}`,
      descrizione: cresciuta
        ? 'Il superamento delle soglie dimensionali cambia i riferimenti di mercato per i massimali e apre coperture che prima non erano proporzionate.'
        : 'La riduzione dimensionale consente di rivedere capitali e premi verso il basso.',
      conseguenza: cresciuta
        ? 'I massimali tarati sulla dimensione precedente diventano insufficienti: in un sinistro di responsabilità civile la parte eccedente resta a carico dell’impresa. Con la crescita diventano inoltre rilevanti D&O e cyber.'
        : 'Capitali sovradimensionati significano premio pagato su un rischio che non esiste più.',
      azioneSuggerita: cresciuta
        ? 'Rivedere i massimali RCT/RCO sul nuovo benchmark di fatturato e proporre D&O e cyber se assenti.'
        : 'Rivedere i capitali in eccesso alla prossima scadenza.',
      rilevanza: cresciuta ? 4 : 2,
      valorePrecedente: precedente.dimensione,
      valoreNuovo: corrente.dimensione,
      riferimenti: ['Racc. UE 2003/361 — classificazione dimensionale'],
    },
  ];
}

function nuovoBilancio(
  precedente: StatoSorvegliato,
  corrente: StatoSorvegliato,
  opzioni: OpzioniRilevazione,
): readonly EventoMonitoraggio[] {
  if (corrente.annoUltimoBilancio === null) return [];
  if (
    precedente.annoUltimoBilancio !== null &&
    corrente.annoUltimoBilancio <= precedente.annoUltimoBilancio
  ) {
    return [];
  }

  const eventi: EventoMonitoraggio[] = [
    {
      tipo: 'bilancio-depositato',
      titolo: `Depositato il bilancio ${corrente.annoUltimoBilancio}`,
      descrizione:
        'È disponibile un esercizio più recente: score, fido e capitali raccomandati sono stati ricalcolati su dati aggiornati.',
      conseguenza:
        'Un’analisi condotta su un bilancio vecchio di due anni è difficilmente difendibile davanti a una contestazione sull’adeguatezza.',
      azioneSuggerita: 'Rivedere l’analisi e verificare gli scostamenti sui capitali assicurati.',
      rilevanza: 2,
      valorePrecedente:
        precedente.annoUltimoBilancio === null ? null : String(precedente.annoUltimoBilancio),
      valoreNuovo: String(corrente.annoUltimoBilancio),
      riferimenti: [],
    },
  ];

  // Il nuovo bilancio è il momento in cui la sottoassicurazione sopravvenuta si vede.
  eventi.push(...sottoassicurazioneSopravvenuta(corrente, opzioni));
  return eventi;
}

/**
 * Il capitale raccomandato è cresciuto oltre soglia rispetto a quello in polizza.
 *
 * È il guasto assicurativo più frequente e meno visibile: la polizza non è cambiata, non
 * è scaduta, il premio è pagato — e in caso di sinistro l'indennizzo viene ridotto in
 * proporzione, per una crescita aziendale che nessuno ha comunicato.
 */
function sottoassicurazioneSopravvenuta(
  corrente: StatoSorvegliato,
  opzioni: OpzioniRilevazione,
): readonly EventoMonitoraggio[] {
  const soglia = opzioni.sogliaScostamentoCapitale ?? SOGLIA_SCOSTAMENTO_PREDEFINITA;

  return corrente.polizze.flatMap((polizza): EventoMonitoraggio[] => {
    const inEssere = capitaleInPolizza(polizza);
    const raccomandato = corrente.capitaliRaccomandati[polizza.coverage];

    if (inEssere === undefined || raccomandato === undefined) return [];
    if (!Money.isPositive(inEssere) || !Money.isPositive(raccomandato)) return [];
    if (raccomandato <= inEssere) return [];

    const scostamento = Money.toEuro(Money.subtract(raccomandato, inEssere)) / Money.toEuro(inEssere);
    if (scostamento < soglia) return [];

    const etichetta = etichettaCopertura(polizza.coverage);
    const gradoDiCopertura = Money.toEuro(inEssere) / Money.toEuro(raccomandato);

    return [
      {
        tipo: 'bilancio-depositato',
        titolo: `${etichetta}: capitale non più capiente`,
        descrizione: `Il capitale raccomandato è salito a ${Money.formatCompact(raccomandato)}, mentre la polizza con ${polizza.compagnia} ne assicura ${Money.formatCompact(inEssere)}.`,
        conseguenza: `In caso di sinistro l’indennizzo verrebbe ridotto in proporzione: su un danno di 100.000 € ne sarebbero liquidati circa ${Math.round(gradoDiCopertura * 100_000).toLocaleString('it-IT')} €, il resto a carico dell’impresa.`,
        azioneSuggerita: `Proporre l’adeguamento della somma assicurata ${etichetta} a ${Money.formatCompact(raccomandato)}, con appendice o alla prossima scadenza.`,
        rilevanza: scostamento >= 0.3 ? 5 : 4,
        valorePrecedente: Money.formatCompact(inEssere),
        valoreNuovo: Money.formatCompact(raccomandato),
        riferimenti: ['Art. 1907 c.c. — assicurazione parziale'],
      },
    ];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Credito
// ─────────────────────────────────────────────────────────────────────────────

function variazioneScore(
  precedente: StatoSorvegliato,
  corrente: StatoSorvegliato,
  opzioni: OpzioniRilevazione,
): readonly EventoMonitoraggio[] {
  const soglia = opzioni.sogliaScorePunti ?? SOGLIA_SCORE_PREDEFINITA;
  const delta = corrente.scoreCredito - precedente.scoreCredito;
  if (Math.abs(delta) < soglia) return [];

  const peggiorato = delta < 0;

  return [
    {
      tipo: 'score-variato',
      titolo: peggiorato
        ? `Merito creditizio in calo: ${precedente.scoreCredito} → ${corrente.scoreCredito}`
        : `Merito creditizio in miglioramento: ${precedente.scoreCredito} → ${corrente.scoreCredito}`,
      descrizione: `La classe è passata da ${precedente.classeCredito} a ${corrente.classeCredito}.`,
      conseguenza: peggiorato
        ? 'Il fido commerciale consigliato si riduce. Se il cliente è anche fornitore o partecipa a gare, il peggioramento incide su cauzioni e fideiussioni già rilasciate.'
        : 'Il miglioramento consente di rivedere al rialzo il fido commerciale e di rinegoziare le condizioni sulle cauzioni.',
      azioneSuggerita: peggiorato
        ? 'Rivedere il fido concesso e valutare l’assicurazione del credito commerciale se il cliente vende a dilazione.'
        : 'Segnalare al cliente la possibilità di rinegoziare cauzioni e fideiussioni.',
      rilevanza: peggiorato ? (Math.abs(delta) >= 20 ? 4 : 3) : 2,
      valorePrecedente: String(precedente.scoreCredito),
      valoreNuovo: String(corrente.scoreCredito),
      riferimenti: [],
    },
  ];
}

function deterioramentoLegale(
  precedente: StatoSorvegliato,
  corrente: StatoSorvegliato,
): readonly EventoMonitoraggio[] {
  const eventi: EventoMonitoraggio[] = [];

  if (!precedente.proceduraConcorsualeAperta && corrente.proceduraConcorsualeAperta) {
    eventi.push({
      tipo: 'procedura-aperta',
      titolo: 'Procedura concorsuale aperta',
      descrizione: 'Risulta aperta una procedura concorsuale a carico dell’impresa.',
      conseguenza:
        'Il rapporto assicurativo prosegue ma i premi non pagati sospendono le garanzie. Le posizioni di cauzione e credito vanno esaminate subito, e il fido commerciale va azzerato.',
      azioneSuggerita:
        'Verificare lo stato dei premi, informare le compagnie e sospendere ogni nuova concessione di fido.',
      rilevanza: 5,
      valorePrecedente: 'no',
      valoreNuovo: 'sì',
      riferimenti: ['Art. 1901 c.c. — sospensione della garanzia', 'D.Lgs. 14/2019 — codice della crisi'],
    });
  }

  if (!precedente.eventiNegativiPresenti && corrente.eventiNegativiPresenti) {
    eventi.push({
      tipo: 'evento-negativo',
      titolo: 'Rilevati protesti o pregiudizievoli',
      descrizione: 'Compaiono eventi negativi che prima non risultavano.',
      conseguenza:
        'Il merito creditizio ne risente e il fido consigliato si riduce. Alcune compagnie ne tengono conto in assunzione, soprattutto su cauzioni e credito.',
      azioneSuggerita:
        'Approfondire con il cliente natura ed entità degli eventi prima della prossima assunzione o rinnovo.',
      rilevanza: 4,
      valorePrecedente: 'assenti',
      valoreNuovo: 'presenti',
      riferimenti: [],
    });
  }

  if (precedente.attiva && !corrente.attiva) {
    eventi.push({
      tipo: 'anagrafica-variata',
      titolo: 'Impresa non più attiva',
      descrizione: 'Lo stato dell’attività risulta cessato o sospeso.',
      conseguenza:
        'Le coperture in essere vanno esaminate: continuare a pagare premi su un rischio che non esiste più è un danno per il cliente, disdettarle prima del tempo può lasciare scoperte responsabilità pregresse.',
      azioneSuggerita:
        'Verificare con il cliente la cessazione effettiva e valutare le garanzie postume sulle responsabilità già maturate.',
      rilevanza: 4,
      valorePrecedente: 'attiva',
      valoreNuovo: 'non attiva',
      riferimenti: [],
    });
  }

  return eventi;
}

function variazioneAnagrafica(
  precedente: StatoSorvegliato,
  corrente: StatoSorvegliato,
): readonly EventoMonitoraggio[] {
  const eventi: EventoMonitoraggio[] = [];

  if (precedente.denominazione !== corrente.denominazione) {
    eventi.push({
      tipo: 'anagrafica-variata',
      titolo: 'Denominazione variata',
      descrizione: `Da «${precedente.denominazione}» a «${corrente.denominazione}».`,
      conseguenza:
        'Il contraente indicato in polizza non corrisponde più alla denominazione attuale: una difformità che emerge nel momento peggiore, cioè alla denuncia di sinistro.',
      azioneSuggerita: 'Far aggiornare l’intestazione di tutte le polizze in essere.',
      rilevanza: 3,
      valorePrecedente: precedente.denominazione,
      valoreNuovo: corrente.denominazione,
      riferimenti: [],
    });
  }

  if (precedente.formaGiuridica !== corrente.formaGiuridica) {
    eventi.push({
      tipo: 'anagrafica-variata',
      titolo: 'Forma giuridica variata',
      descrizione: `Da ${precedente.formaGiuridica} a ${corrente.formaGiuridica}.`,
      conseguenza:
        'Cambia il regime di responsabilità dei soci e degli amministratori, e con esso l’assetto delle coperture: una D&O ha senso in una società di capitali, la responsabilità illimitata dei soci richiede altre risposte.',
      azioneSuggerita: 'Rivedere l’assetto delle coperture di responsabilità alla luce della nuova forma.',
      rilevanza: 3,
      valorePrecedente: precedente.formaGiuridica,
      valoreNuovo: corrente.formaGiuridica,
      riferimenti: [],
    });
  }

  return eventi;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilità
// ─────────────────────────────────────────────────────────────────────────────

function capitaleInPolizza(polizza: PolizzaSorvegliata): Euro | undefined {
  return polizza.sommaAssicurata ?? polizza.massimale ?? undefined;
}

function etichettaCopertura(id: CoverageId): string {
  // Il catalogo è un `Record` totale sui `CoverageId`: la definizione c’è sempre.
  return COVERAGE_CATALOG[id].label;
}

/** Giorni interi fra `asOf` e una data ISO. Negativo se già trascorsa. */
function giorniA(dataIso: string, asOf: Date): number | null {
  const scadenza = new Date(`${dataIso}T00:00:00Z`);
  if (Number.isNaN(scadenza.getTime())) return null;

  const oggi = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  return Math.round((scadenza.getTime() - oggi) / 86_400_000);
}

function formattaData(dataIso: string): string {
  const [anno, mese, giorno] = dataIso.split('-');
  return giorno === undefined ? dataIso : `${giorno}/${mese}/${anno}`;
}
