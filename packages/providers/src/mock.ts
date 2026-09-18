/**
 * Provider dimostrativo.
 *
 * Non è un ripiego per i test: è ciò che consente di installare, avviare e mostrare
 * l'intera piattaforma **senza credenziali**. Un software che per essere visto richiede
 * prima un contratto con un fornitore di dati non viene mai visto.
 *
 * Genera profili coerenti e deterministici a partire dalla chiave di ricerca, così che
 * la stessa P.IVA restituisca sempre la stessa azienda.
 */

import { DATI_DICHIARATI_VUOTI, demoCompanyProfile, euro, parsePartitaIva } from '@aegis/core';
import type { CandidatoDiRiscontro } from '@aegis/core';
import type { AtecoCode, CompanyProfile, EventiNegativi } from '@aegis/core';
import { ProviderError } from './port.js';
import type {
  CompanyDataProvider,
  CompanySearchResult,
  CriteriProspezione,
  FetchLevel,
  RisultatoProspezione,
  SearchCriteria,
  SintesiAzienda,
} from './port.js';

interface Variante {
  readonly denominazione: string;
  readonly partitaIva: string;
  /**
   * Telefono, PEC e sito dell'azienda dimostrativa.
   *
   * Assenti, restano vuoti: NON si ereditano dal profilo di base. Fino al 17/09/2026 si
   * ereditavano, e nel CRM tre aziende su quattro mostravano la PEC e il sito di MECCANICA
   * BRESCIANA — un dato falso che sembrava un difetto della lettura dei contatti.
   *
   * I domini sono .example, riservati dalla RFC 2606: non esistono e nessuno può registrarli,
   * quindi un contatto dimostrativo non può finire addosso a un'impresa vera.
   */
  readonly contatti?: {
    readonly telefono: string;
    readonly pec: string;
    readonly sitoWeb: string;
  };
  readonly comune: string;
  readonly provincia: string;
  /** Codice catastale del comune: la ricerca di nuovi clienti filtra per questo. */
  readonly codiceCatastale: string;
  readonly ateco: string;
  readonly atecoDescrizione: string;
  readonly moltiplicatore: number;
  /**
   * Se `true`, il profilo arriva con i dati di intervista già rilevati.
   *
   * Serve a mostrare entrambi gli stati del prodotto: un cliente già lavorato, con
   * analisi al massimo dell'affidabilità, e due prospetti freschi con il questionario da
   * compilare. Un provider dimostrativo che pre-compila *tutto* nasconderebbe proprio la
   * funzione che distingue la piattaforma.
   */
  readonly conIntervista: boolean;
  /**
   * Un quadro di eventi negativi proprio della variante.
   *
   * Le aziende dimostrative condividevano tutte lo stesso — un protesto pagato — e
   * nessuna aveva procedure concorsuali: il percorso che le mostra non si vedeva mai,
   * e chi prova la piattaforma non poteva farsi un'idea di cosa succede quando
   * l'impresa è in difficoltà, che è il caso in cui un profilo di credito serve
   * davvero. Restano aziende inventate.
   */
  readonly eventiNegativi?: EventiNegativi;
}

/** Piccolo catalogo di aziende dimostrative, con settori e territori diversi. */
const VARIANTI: readonly Variante[] = [
  {
    denominazione: 'MECCANICA BRESCIANA S.R.L.',
    partitaIva: '03158460174',
    comune: 'Adro',
    provincia: 'BS',
    codiceCatastale: 'A060',
    ateco: '25.62.00',
    atecoDescrizione: 'Lavori di meccanica generale',
    moltiplicatore: 1,
    conIntervista: true,
  },
  {
    denominazione: 'COSTRUZIONI IRPINE S.R.L.',
    partitaIva: '02657870644',
    contatti: {
      telefono: '+39 0825 000000',
      pec: 'costruzioniirpine@pec.example',
      sitoWeb: 'https://www.costruzioniirpine.example',
    },
    comune: 'Avellino',
    provincia: 'AV',
    codiceCatastale: 'A509',
    ateco: '41.20.00',
    atecoDescrizione: 'Costruzione di edifici residenziali e non residenziali',
    moltiplicatore: 0.65,
    conIntervista: false,
  },
  {
    denominazione: 'ADRIATICA LOGISTICA S.R.L.',
    partitaIva: '02413390390',
    contatti: {
      telefono: '+39 0544 000000',
      pec: 'adriaticalogistica@pec.example',
      sitoWeb: 'https://www.adriaticalogistica.example',
    },
    comune: 'Ravenna',
    provincia: 'RA',
    codiceCatastale: 'H199',
    ateco: '52.10.10',
    atecoDescrizione: 'Magazzini di custodia e deposito',
    moltiplicatore: 1.4,
    conIntervista: false,
    eventiNegativi: {
      protesti: [
        {
          data: new Date('2024-11-08T00:00:00Z'),
          importo: euro(48_500),
          tipo: 'Cambiale',
          luogo: 'Ravenna',
          levato: false,
        },
        {
          data: new Date('2023-03-21T00:00:00Z'),
          importo: euro(9_200),
          tipo: 'Assegno bancario',
          luogo: 'Ravenna',
          // Pagato dopo la levata: pesa, ma molto meno di uno insoluto.
          levato: true,
        },
      ],
      pregiudizievoli: [
        {
          data: new Date('2024-06-12T00:00:00Z'),
          tipo: 'ipoteca-giudiziale',
          importo: euro(320_000),
          descrizione: 'Ipoteca giudiziale su immobile strumentale',
        },
      ],
      procedure: [
        {
          tipo: 'concordato-preventivo',
          descrizione: 'CONCORDATO PREVENTIVO',
          dataApertura: new Date('2022-04-05T00:00:00Z'),
          dataChiusura: new Date('2023-10-19T00:00:00Z'),
          dataRevoca: null,
          dataOmologa: new Date('2023-02-28T00:00:00Z'),
          tribunale: 'Ravenna',
          aperta: false,
        },
        {
          // Chiusa per revoca e non per chiusura: il registro lo dice su un campo
          // diverso, e per un periodo la piattaforma la contava ancora aperta.
          tipo: 'misure-protettive',
          descrizione: 'MISURE CAUTELARI E PROTETTIVE',
          dataApertura: new Date('2022-02-14T00:00:00Z'),
          dataChiusura: null,
          dataRevoca: new Date('2022-09-30T00:00:00Z'),
          dataOmologa: null,
          tribunale: 'Ravenna',
          aperta: false,
        },
      ],
      presenzaDichiarataSenzaDettaglio: [],
    },
  },
  /*
    Sei aziende a Bergamo, per gli elenchi (18/09/2026).

    Dal 18/09/2026 un'azienda già nel CRM non esce più negli elenchi, e ricomprare gli stessi
    filtri porta le successive. Con tre sole aziende dimostrative, che i collaudi analizzano e
    comprano presto, ogni elenco successivo della stessa corsa tornava vuoto: il collaudo non
    avrebbe più provato né la tabella né il salvataggio nel CRM. Queste servono a quello, ognuna
    con un settore suo; due hanno «bergamasch» nel nome, per provare che un secondo acquisto
    con gli stessi filtri porta la successiva. Nessun contatto: sono inventate.
  */
  {
    denominazione: 'OFFICINE OROBICHE S.R.L.',
    partitaIva: '04801010168',
    comune: 'Bergamo',
    provincia: 'BG',
    codiceCatastale: 'A794',
    ateco: '25.11.00',
    atecoDescrizione: 'Fabbricazione di strutture metalliche e di parti di strutture',
    moltiplicatore: 0.8,
    conIntervista: false,
  },
  {
    denominazione: 'TESSITURA SERIANA S.R.L.',
    partitaIva: '04801020167',
    comune: 'Bergamo',
    provincia: 'BG',
    codiceCatastale: 'A794',
    ateco: '13.20.00',
    atecoDescrizione: 'Tessitura',
    moltiplicatore: 1.1,
    conIntervista: false,
  },
  {
    denominazione: 'ALIMENTARI BREMBANI S.R.L.',
    partitaIva: '04801030166',
    comune: 'Bergamo',
    provincia: 'BG',
    codiceCatastale: 'A794',
    ateco: '10.89.09',
    atecoDescrizione: 'Altri prodotti alimentari n.c.a.',
    moltiplicatore: 0.7,
    conIntervista: false,
  },
  {
    denominazione: 'CARTIERA VALSERIANA S.R.L.',
    partitaIva: '04801040165',
    comune: 'Bergamo',
    provincia: 'BG',
    codiceCatastale: 'A794',
    ateco: '17.12.00',
    atecoDescrizione: 'Fabbricazione di carta e cartone',
    moltiplicatore: 1.3,
    conIntervista: false,
  },
  {
    denominazione: 'TRASPORTI BERGAMASCHI S.R.L.',
    partitaIva: '04801050164',
    comune: 'Bergamo',
    provincia: 'BG',
    codiceCatastale: 'A794',
    ateco: '49.41.00',
    atecoDescrizione: 'Trasporto di merci su strada',
    moltiplicatore: 0.9,
    conIntervista: false,
  },
  {
    denominazione: 'MECCANICHE BERGAMASCHE S.R.L.',
    partitaIva: '04801060163',
    comune: 'Bergamo',
    provincia: 'BG',
    codiceCatastale: 'A794',
    ateco: '28.41.00',
    atecoDescrizione: 'Fabbricazione di macchine utensili per la formatura dei metalli',
    moltiplicatore: 1.0,
    conIntervista: false,
  },
];

export class MockCompanyProvider implements CompanyDataProvider {
  readonly name = 'Demo (dati dimostrativi)';

  // Nessun `async`: l'implementazione è sincrona e restituisce una promessa già risolta.
  // Marcarla `async` senza alcun `await` mentirebbe sul suo comportamento.
  search(criteria: SearchCriteria): Promise<readonly CompanySearchResult[]> {
    const termine = (criteria.denominazione ?? '').trim().toLowerCase();
    const piva = criteria.partitaIva === undefined ? null : parsePartitaIva(criteria.partitaIva);

    // P.IVA indicata ma non valida: nessun risultato, non "tutti i risultati".
    if (criteria.partitaIva !== undefined && piva === null) return Promise.resolve([]);

    const risultati = VARIANTI.filter((v) => {
      if (piva !== null) return v.partitaIva === piva;
      if (criteria.provincia !== undefined && v.provincia !== criteria.provincia.toUpperCase())
        return false;
      if (termine === '') return true;
      return v.denominazione.toLowerCase().includes(termine);
    });

    return Promise.resolve(
      risultati.map((v) => ({
        partitaIva: parsePartitaIva(v.partitaIva),
        denominazione: v.denominazione,
        comune: v.comune,
        provincia: v.provincia,
        ateco: v.ateco,
        attiva: true,
        statoAttivita: 'attiva' as const,
        providerId: v.partitaIva,
        // Anche la dimostrazione deve mostrare ciò che la ricerca vera porta con sé:
        // altrimenti il difetto «pago il record e vedo l'ATECO» tornerebbe invisibile
        // proprio nella modalità con cui si collauda.
        sintesi: sintesiDimostrativa(v),
        ...recordDimostrativo(v),
      })),
    );
  }

  /**
   * Prospezione dimostrativa.
   *
   * Filtra il piccolo catalogo di varianti con gli stessi criteri del servizio reale.
   * Il conteggio resta gratuito anche qui: la modalità dimostrativa deve insegnare il
   * gesto giusto — guarda quante sono, poi decidi se pagarle — non un gesto diverso da
   * quello che si farà sui dati veri.
   */
  cercaProspect(
    criteri: CriteriProspezione,
    opzioni: { readonly soloConteggio?: boolean | undefined } = {},
  ): Promise<RisultatoProspezione> {
    const soloConteggio = opzioni.soloConteggio ?? false;
    const ateco = criteri.ateco?.replace(/[^0-9]/g, '') ?? '';
    const termine = (criteri.denominazione ?? '').trim().toLowerCase();

    const corrispondenti = VARIANTI.filter((v) => {
      if (criteri.provincia !== undefined && v.provincia !== criteri.provincia.toUpperCase()) {
        return false;
      }
      // Come il fornitore reale: la città per codice catastale, non per nome.
      if (criteri.comune !== undefined && v.codiceCatastale !== criteri.comune.trim().toUpperCase()) {
        return false;
      }
      // Come il fornitore reale: il confronto è sul codice senza punti, dall'inizio.
      if (ateco !== '' && !v.ateco.replace(/[^0-9]/g, '').startsWith(ateco)) return false;
      if (termine !== '' && !v.denominazione.toLowerCase().includes(termine)) return false;
      return true;
    });

    // Come il fornitore reale: salta le prime N, cioè quelle già comprate con questi filtri.
    const rimaste = corrispondenti.slice(Math.max(0, criteri.salta ?? 0));
    const lotto = Math.min(criteri.limite ?? 25, rimaste.length);

    return Promise.resolve({
      totale: corrispondenti.length,
      lotto,
      // Cinque centesimi ad azienda, come il servizio reale: la modalità dimostrativa
      // deve insegnare anche l'ordine di grandezza della spesa, non solo i gesti.
      costoElencoCentesimi: lotto * 5,
      soloConteggio,
      aziende: soloConteggio
        ? []
        : rimaste.slice(0, criteri.limite ?? 50).map((v) => ({
            partitaIva: parsePartitaIva(v.partitaIva),
            denominazione: v.denominazione,
            comune: v.comune,
            provincia: v.provincia,
            ateco: v.ateco,
            attiva: true,
            statoAttivita: 'attiva' as const,
            providerId: v.partitaIva,
            sintesi: sintesiDimostrativa(v),
            ...recordDimostrativo(v),
            ...recordDimostrativo(v),
          })),
    });
  }

  /**
   * In modalità dimostrativa nessun clic addebita niente: la risposta è sempre «sì».
   *
   * Non è una scorciatoia. La domanda che questo metodo risponde è «premendo, spendo?», e
   * qui la risposta vera è che non si spende mai — le aziende sono inventate e nessun
   * fornitore viene interrogato. Rispondere «no» farebbe annunciare a schermo un prezzo che
   * non verrà addebitato, che è esattamente il difetto per cui il metodo esiste.
   */
  acquistoSenzaSpesa(): Promise<boolean> {
    return Promise.resolve(true);
  }

  /**
   * In dimostrativa nessuno risulta in lista, e questo va detto per quello che è.
   *
   * Un elenco vuoto qui significa «la fonte non è stata interrogata», non «la persona è
   * pulita»: chi mostra il risultato dichiara la modalità dimostrativa accanto, come già
   * fa per l'analisi. Inventare un riscontro sarebbe peggio — un cliente inventato
   * accusato di essere sanzionato — e inventare una risposta rassicurante insegnerebbe a
   * fidarsi di un controllo che non è avvenuto.
   */
  screeningPersona(): Promise<readonly CandidatoDiRiscontro[]> {
    return Promise.resolve([]);
  }

  fetchProfile(identifier: string, level: FetchLevel): Promise<CompanyProfile> {
    const normalizzato = identifier.replace(/\s/g, '');
    const nota = VARIANTI.find((v) => v.partitaIva === normalizzato);

    /*
      Una partita IVA sconosciuta ricade sul primo profilo dimostrativo — ma **conservando
      la partita IVA richiesta**.

      Restituire l'identità della variante di ripiego significa rispondere «ecco l'azienda
      X» a chi ha chiesto l'azienda Y: davanti a un cliente confonde, e in archivio fa
      comparire un'azienda che nessuno ha analizzato. I numeri restano quelli del profilo
      di ripiego, e la modalità dimostrativa è dichiarata in testa a ogni pagina: nessuno
      può scambiarli per dati reali.
    */
    // Un'azienda inventata sul momento non ha contatti: quelli della prima variante sono suoi.
    const { contatti: _contatti, ...ripiego } = VARIANTI[0]!;
    const variante: Variante = nota ?? {
      ...ripiego,
      partitaIva: normalizzato,
      denominazione: `AZIENDA DIMOSTRATIVA ${normalizzato}`,
    };

    const base = demoCompanyProfile();
    const conVariante = applicaVariante(base, variante);

    // I dati di intervista non vengono mai da un provider: sono il lavoro dell'intermediario.
    const profilo = variante.conIntervista
      ? conVariante
      : { ...conVariante, datiDichiarati: DATI_DICHIARATI_VUOTI };

    if (level === 'base') {
      return Promise.resolve({
        ...profilo,
        assetti: null,
        bilanci: [],
        bilanciSintetici: [],
        eventiNegativi: null,
        unitaLocali: null,
      });
    }
    // Come il provider reale: al livello esteso arrivano i bilanci sintetici, non quelli
    // in schema CEE, che sono un prodotto a parte.
    if (level === 'esteso') {
      return Promise.resolve({ ...profilo, bilanci: [], eventiNegativi: null });
    }
    return Promise.resolve(profilo);
  }
}

function applicaVariante(base: CompanyProfile, variante: Variante): CompanyProfile {
  // La scorciatoia vale solo se anche l'identità coincide: altrimenti si restituirebbe
  // il profilo di base con la sua partita IVA, cioè un'azienda diversa da quella chiesta.
  if (variante.moltiplicatore === 1 && variante.partitaIva === base.identity.partitaIva) {
    return base;
  }

  const scala = (value: number): number => Math.round(value * variante.moltiplicatore);

  return {
    ...base,
    identity: {
      ...base.identity,
      denominazione: variante.denominazione,
      partitaIva: parsePartitaIva(variante.partitaIva),
    },
    anagrafica: {
      ...base.anagrafica,
      value: {
        ...base.anagrafica.value,
        atecoPrimario: parseAtecoOrThrow(variante.ateco),
        atecoPrimarioDescrizione: variante.atecoDescrizione,
        numeroAddetti: scala(base.anagrafica.value.numeroAddetti ?? 30),
        // I contatti sono di questa azienda, o non ci sono: mai quelli del profilo di base.
        telefono: variante.contatti?.telefono ?? null,
        pec: variante.contatti?.pec ?? null,
        sitoWeb: variante.contatti?.sitoWeb ?? null,
        // Il codice catastale segue il comune: ereditato dal profilo di base, le aziende di
        // Avellino e Ravenna mostravano quello di Adro accanto a una sede in un'altra città.
        codiceCatastale: variante.codiceCatastale,
        sedeLegale:
          base.anagrafica.value.sedeLegale === null
            ? null
            : {
                ...base.anagrafica.value.sedeLegale,
                comune: variante.comune,
                provincia: variante.provincia,
              },
      },
    },
    eventiNegativi:
      variante.eventiNegativi === undefined || base.eventiNegativi === null
        ? base.eventiNegativi
        : { ...base.eventiNegativi, value: variante.eventiNegativi },
    bilanci: base.bilanci.map((b) => ({
      ...b,
      value: {
        ...b.value,
        contoEconomico: scalaOggetto(b.value.contoEconomico, variante.moltiplicatore),
        attivo: scalaOggetto(b.value.attivo, variante.moltiplicatore),
        passivo: scalaOggetto(b.value.passivo, variante.moltiplicatore),
      },
    })),
  };
}

/** Scala tutte le voci monetarie mantenendo la quadratura del bilancio. */
function scalaOggetto<T extends object>(source: T, fattore: number): T {
  const out: Record<string, unknown> = {};
  for (const [chiave, valore] of Object.entries(source)) {
    out[chiave] = typeof valore === 'number' ? Math.round(valore * fattore) : valore;
  }
  return out as T;
}

function parseAtecoOrThrow(code: string): AtecoCode {
  if (!/^\d{2}(\.\d{2}){0,2}$/.test(code)) {
    throw new ProviderError(`Codice ATECO dimostrativo non valido: ${code}`, 'risposta-non-valida');
  }
  return code as AtecoCode;
}

/**
 * La sintesi dimostrativa, coerente con il bilancio della stessa variante.
 *
 * I numeri si ricavano dallo stesso moltiplicatore che scala il bilancio: mostrare in
 * ricerca un fatturato diverso da quello che l'analisi calcolerà due clic dopo sarebbe
 * peggio che non mostrarlo, perché insegnerebbe a non fidarsi della prima schermata.
 */
function sintesiDimostrativa(variante: Variante): SintesiAzienda {
  const scala = (valore: number): number => Math.round(valore * variante.moltiplicatore);

  return {
    annoUltimoBilancio: 2025,
    dipendenti: scala(35),
    fatturatoEuro: scala(6_480_000),
    patrimonioNettoEuro: scala(1_280_000),
    totaleAttivoEuro: scala(5_550_000),
    capitaleSocialeEuro: scala(500_000),
    // Costo del personale diviso gli addetti: è il modo in cui si ricava dai bilanci
    // sintetici, e resta un ordine di grandezza, non una busta paga.
    retribuzioneMediaEuro: Math.round(1_600_000 / 35),
    numeroSoci: 2,
    eserciziDisponibili: 10,
  };
}

/**
 * Il record completo dimostrativo: anagrafica, esercizi e soci.
 *
 * Si ricava dal profilo che l'analisi restituirebbe per la stessa azienda, così che la
 * ricerca e l'analisi non raccontino due storie diverse. Una dimostrazione che mostra meno
 * campi di quella reale nasconde proprio i difetti che dovrebbe far emergere.
 */
function recordDimostrativo(
  variante: Variante,
): Pick<CompanySearchResult, 'anagrafica' | 'bilanciSintetici' | 'soci'> {
  const base = demoCompanyProfile();
  const conVariante = applicaVariante(base, variante);
  return {
    anagrafica: conVariante.anagrafica.value,
    bilanciSintetici: conVariante.bilanciSintetici.map((b) => b.value),
    soci: conVariante.assetti?.value.soci ?? [],
  };
}
