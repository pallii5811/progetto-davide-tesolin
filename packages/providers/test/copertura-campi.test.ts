/**
 * Quanto del record acquistato arriva davvero nel prodotto.
 *
 * È il presidio contro l'errore più costoso e più invisibile che questo software abbia
 * avuto: **si pagava l'intero e se ne usava una parte**. Il profilo completo costa
 * quarantotto centesimi e restituisce duecentotrentadue campi; per un periodo ne venivano
 * letti poco più della metà, e i mancanti erano proprio quelli che a un assicuratore
 * servono di più — indici di redditività e solidità, gare pubbliche, certificazione SOA,
 * import/export, composizione del personale.
 *
 * Nessun collaudo poteva accorgersene, perché tutti verificavano che *ciò che si legge*
 * fosse letto bene. Nessuno confrontava ciò che si **compra** con ciò che si **usa**.
 *
 * Qui il confronto è automatico e gira sulle risposte reali registrate: se un domani il
 * fornitore aggiunge un campo, o qualcuno ne toglie la lettura, il numero scende e questo
 * collaudo lo dice. La soglia è alta di proposito — un prodotto che butta via un quinto
 * di ciò che paga non è pronto da vendere.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Le risposte reali registrate. Assenti sulle macchine che non le hanno: si salta. */
const SONDA = join(process.cwd(), '.sonda');

/**
 * Campi che resteranno **deliberatamente** non letti, con il motivo.
 *
 * Ognuno va giustificato qui: è l'unico modo di distinguere «scartato con cognizione» da
 * «dimenticato». Un elenco che cresce senza motivazioni è il ritorno del difetto.
 */
const SCARTATI_A_RAGION_VEDUTA: Readonly<Record<string, string>> = {
  id: 'identificativo interno del fornitore: opaco, e usarlo come chiave farebbe riacquistare le aziende',
  openapiNumber: 'idem, sulle sedi e sui soci',
  creationTimestamp: 'quando il fornitore ha creato il proprio record: non è un fatto dell’impresa',
  lastUpdateTimestamp: 'sostituito dalla data di aggiornamento leggibile, già letta',
  sdiCodeTimestamp: 'marcatempo di un campo tecnico',
  taxCodeCeasedTimestamp: 'marcatempo: la cessazione del codice fiscale è letta come fatto',
  registryOk: 'flag di coerenza interna del registro IVA del fornitore',
};

/**
 * Campi comprati e **non letti**, dichiarati uno per uno, con la ragione e il costo.
 *
 * È il terzo stato che a questo collaudo mancava. Prima c'erano solo «letto» e «scartato a
 * ragion veduta», e un campo comprato e dimenticato non aveva dove stare: finiva per non
 * essere misurato affatto, perché il file che lo conteneva non veniva passato.
 *
 * L'elenco è confrontato per **uguaglianza esatta**, non per capienza: se qualcuno smette
 * di leggere un campo il collaudo diventa rosso, e se qualcuno ne legge uno di questi senza
 * toglierlo di qui diventa rosso lo stesso. Un elenco che può solo crescere sarebbe una
 * lista di scuse; questo è un conto aperto, e il collaudo lo stampa a ogni esecuzione.
 */
const NON_LETTI_DICHIARATI: Readonly<
  Record<string, { readonly perche: string; readonly campi: readonly string[] }>
> = {
  /*
      Difetto 37 dell'audit. Le persone coinvolte nelle procedure concorsuali — codice
      fiscale, data e comune di nascita, legale rappresentante, l'elenco delle cariche —
      sono esattamente ciò che una D&O deve valutare, e costano quarantacinque centesimi
      insieme al resto della pratica.

      Non sono letti perché il modello canonico non ha dove metterli: servono un'entità
      nuova in `packages/core/src/company/profile.ts`, la colonna che la conserva, il
      presentatore che la espone e la sezione che la mostra. È una funzione nuova, e le
      funzioni nuove sono una decisione del committente, non di chi corregge i difetti.
    */
  'prod-IT-negativita-10354890963.json': {
    perche:
      'difetto 37: persone coinvolte e dettagli della procedura — richiedono un’entità canonica nuova, una decisione del committente',
    campi: [
      'data.procedure.accordo_ristrutturazione_debiti',
      'data.procedure.codice_comune_tribunale',
      'data.procedure.codice_fiscale',
      'data.procedure.codice_natura_giuridica',
      'data.procedure.codice_procedura',
      'data.procedure.commento',
      'data.procedure.data_caricamento',
      'data.procedure.data_esecuzione',
      'data.procedure.domanda_ammissione_concordato',
      'data.procedure.identificativo_procedura',
      'data.procedure.indirizzo.altre_indicazioni',
      'data.procedure.indirizzo.codice_comune',
      'data.procedure.indirizzo.codice_comune_istat',
      'data.procedure.indirizzo.codice_stato_estero',
      'data.procedure.indirizzo.stato_estero',
      'data.procedure.natura_giuridica',
      'data.procedure.numero_rea',
      'data.procedure.persone_coinvolte.cariche.codice_carica',
      'data.procedure.persone_coinvolte.cariche.descrizione_carica',
      'data.procedure.persone_coinvolte.codice_comune_nascita',
      'data.procedure.persone_coinvolte.codice_fiscale',
      'data.procedure.persone_coinvolte.codice_istat_comune_nascita',
      'data.procedure.persone_coinvolte.codice_stato_nascita',
      'data.procedure.persone_coinvolte.comune_nascita',
      'data.procedure.persone_coinvolte.data_nascita',
      'data.procedure.persone_coinvolte.indirizzo_residenza.altre_indicazioni',
      'data.procedure.persone_coinvolte.indirizzo_residenza.codice_comune',
      'data.procedure.persone_coinvolte.indirizzo_residenza.codice_comune_istat',
      'data.procedure.persone_coinvolte.indirizzo_residenza.codice_stato_estero',
      'data.procedure.persone_coinvolte.indirizzo_residenza.stato_estero',
      'data.procedure.persone_coinvolte.legale_rappresentante',
      'data.procedure.persone_coinvolte.persona_fisica',
      'data.procedure.persone_coinvolte.provincia_nascita',
      'data.procedure.persone_coinvolte.sesso',
      'data.procedure.persone_coinvolte.stato_nascita',
      'data.procedure.progressivo_procedura',
      'data.procedure.provincia_tribunale',
      'data.procedure.riferimento_sentenza',
    ],
  },
  /*
      La ricevuta di apertura di una pratica asincrona. Non è un dato dell'impresa: è
      l'involucro della richiesta che l'abbiamo aperta. Ciò che serve — `status` e `id` —
      è letto; il resto descrive il PDF che il fornitore genererebbe e l'account che ha
      chiamato, e non ha un posto nel profilo di un'azienda.
    */
  'prod-negativita-avvio-10354890963.json': {
    perche:
      'involucro della pratica asincrona, non dati dell’impresa: si leggono lo stato e l’identificativo, il resto descrive il PDF del fornitore e l’account chiamante',
    campi: [
      'data.callback',
      'data.cf_piva',
      'data.date_completion',
      'data.date_request',
      // `data.esito` è uscito da questo elenco quando il controllo ha imparato a vedere
      // anche gli accessi per proprietà: il codice lo legge, e dichiararlo non letto era
      // un debito che nessuno avrebbe più riletto.
      'data.logo_pdf',
      'data.owner',
      'data.soggetto',
      'data.text_pdf',
      'data.timestamp',
      'data.title_pdf',
    ],
  },
  /*
    L'adeguata verifica: liste sanzioni, PEP e stampa avversa su una persona.

    Ciò che serve al fascicolo è letto: i nomi in tutte le loro translitterazioni, gli anni
    di nascita con il flag che dice se la fonte li ha dedotti, le nazionalità, i paesi, i
    tag delle liste, i codici delle autorità che elencano il soggetto e la data di
    aggiornamento. Quello che resta si divide in tre gruppi, e nessuno dei tre è un dato
    dell'impresa o della persona.
  */
  'prod-WW-kyc-full-prova-schema.json': {
    perche:
      'l’eco della domanda inviata, le opzioni del PDF che il fornitore genererebbe, e i dettagli anagrafici che non servono a distinguere un omonimo: il fascicolo li cita per nome, anno e nazionalità',
    campi: [
      // 1 · L'eco della nostra stessa domanda: il servizio la rimanda indietro.
      'data.query.entityType',
      'data.query.firstName',
      'data.query.lastName',
      'data.query.removeDeceased',
      // 2 · Le opzioni del rapporto in PDF del fornitore, che non usiamo: il fascicolo
      //     lo compone AEGIS, con le proprie parole e la propria intestazione.
      'data.callback',
      'data.logoPdf',
      'data.textPdf',
      'data.titlePdf',
      /*
        3 · Anagrafica che non distingue un omonimo. Il sesso non separa due «Mario Rossi»;
        giorno e mese di nascita sarebbero utili, ma la fonte li dà solo su una parte dei
        soggetti e su nessuno dei due del campione: usarli quando ci sono e ignorarli quando
        mancano darebbe una corrispondenza «forte» a chi ha la data completa e «possibile» a
        chi non ce l'ha, cioè una forza che misura la fonte invece della persona.
        `primary`, `title` e `native` descrivono come la fonte ordina i nomi, e noi li
        leggiamo tutti; le due date di `last_update` si prendono già come la più recente.
      */
      'data.entities.birth_dates.day',
      'data.entities.birth_dates.month',
      'data.entities.gender',
      'data.entities.last_update.adverse_media',
      'data.entities.last_update.entity',
      'data.entities.names.native',
      'data.entities.names.primary',
      'data.entities.names.title',
    ],
  },
};

function sorgenti(dir: string, acc: string[] = []): string[] {
  for (const voce of readdirSync(dir)) {
    const p = join(dir, voce);
    if (statSync(p).isDirectory()) sorgenti(p, acc);
    else if (p.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

/**
 * I nomi di campo citati nel codice di mappatura.
 *
 * Misura per eccesso: un campo citato potrebbe essere letto e poi ignorato. Va bene così —
 * significa che ciò che risulta **mancante manca di sicuro**, e il collaudo non produce
 * falsi allarmi.
 */
function campiLetti(): ReadonlySet<string> {
  const codice = sorgenti(join(process.cwd(), 'packages', 'providers', 'src'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');

  /*
    Due forme, perché il codice legge in due modi.

    La prima è la stringa fra apici singoli, con cui i lettori generici ricevono il nome
    del campo: `str(source, 'streetName')`. Lo spazio finale è ammesso perché il fornitore
    ha davvero una chiave che lo contiene.

    La seconda è l'accesso per proprietà — `e.tags`, `n.full_name` — che i mappatori
    tipizzati usano al posto dei lettori generici. Senza, questo controllo dichiarava «mai
    letti» ventitré campi che il codice legge riga per riga: un controllo che grida su ciò
    che è a posto insegna a ignorarlo, esattamente come uno che tace su ciò che è rotto.
  */
  const daStringhe = [...codice.matchAll(/'([A-Za-z][A-Za-z0-9_]{2,} ?)'/g)].map((m) => m[1]!);
  const daProprieta = [...codice.matchAll(/\.([A-Za-z][A-Za-z0-9_]{2,})\b/g)].map((m) => m[1]!);
  return new Set([...daStringhe, ...daProprieta]);
}

/** Ogni percorso foglia della risposta, con il nome del campo terminale. */
function foglie(valore: unknown, percorso: string, out: Set<string>): void {
  if (valore === null || typeof valore !== 'object') {
    out.add(percorso);
    return;
  }
  if (Array.isArray(valore)) {
    // Un elemento campione basta: la forma è la stessa per tutti.
    if (valore[0] !== undefined) foglie(valore[0], percorso, out);
    return;
  }
  for (const [chiave, v] of Object.entries(valore)) {
    foglie(v, percorso === '' ? chiave : `${percorso}.${chiave}`, out);
  }
}

const INVOLUCRO = new Set(['success', 'message', 'error', 'data']);

function divario(file: string): { totale: number; mancanti: readonly string[] } {
  const raw: unknown = JSON.parse(readFileSync(join(SONDA, file), 'utf8'));
  const letti = campiLetti();

  const percorsi = new Set<string>();
  foglie(raw, '', percorsi);

  const mancanti: string[] = [];
  let totale = 0;

  for (const percorso of percorsi) {
    const segmenti = percorso.split('.');
    const foglia = segmenti[segmenti.length - 1]!;
    if (INVOLUCRO.has(foglia)) continue;
    totale += 1;
    if (letti.has(foglia) || letti.has(`${foglia} `)) continue;
    if (foglia in SCARTATI_A_RAGION_VEDUTA) continue;
    mancanti.push(percorso);
  }

  return { totale, mancanti };
}

const disponibile = existsSync(SONDA);

/**
 * Ogni risposta registrata, non tre scelte a mano.
 *
 * Era il difetto di questo collaudo, e l'audit l'ha misurato: girava su **tre** campioni,
 * scelti uno per servizio. Due dei tre erano i più poveri che ci fossero — quello degli
 * eventi negativi ha sei campi, tutti `null`, e l'asserzione chiedeva «più di tre» — e i
 * due file che contenevano i quindici e i trentotto buchi non venivano passati mai. Il
 * collaudo era verde **per assenza di dato**: la stessa forma dell'errore che avrebbe
 * dovuto sorvegliare.
 *
 * Ora si scandisce la cartella: quello che entra in `.sonda` entra nel conto, e chi
 * registra una risposta nuova non deve ricordarsi di aggiungerla qui.
 */
function campioniConDati(): readonly { file: string; totale: number }[] {
  return (
    readdirSync(SONDA)
      .filter((f) => f.endsWith('.json'))
      .map((file) => ({ file, totale: divario(file).totale }))
      /*
      Si escludono le risposte che non contengono dati d'impresa: gli errori di
      autenticazione da ottantacinque byte e le ricevute di apertura pratica. Non è una
      scelta di comodo — una risposta senza campi non misura la copertura di niente — ed è
      dichiarata con una soglia esplicita invece che con un elenco di nomi, che
      invecchierebbe.
    */
      .filter((c) => c.totale >= 10)
  );
}

describe.skipIf(!disponibile)('Copertura dei campi acquistati', () => {
  const campioni = disponibile ? campioniConDati() : [];

  it('i campioni su cui si misura sono tutti quelli registrati con dati', () => {
    // Se questo numero scende, il collaudo sta misurando meno di prima e nessuno lo
    // vedrebbe: le asserzioni sotto continuerebbero a passare su un insieme più piccolo.
    expect(campioni.length).toBeGreaterThanOrEqual(6);
  });

  it.each(campioni)('$file: ogni campo acquistato viene letto o è dichiarato', ({ file, totale }) => {
    const { mancanti } = divario(file);
    const dichiarati = NON_LETTI_DICHIARATI[file]?.campi ?? [];

    // Uguaglianza esatta nei due versi: un campo che smette di essere letto rende rosso il
    // collaudo, e un campo dichiarato che invece viene letto lo rende rosso finché non lo
    // si toglie dall'elenco. Una soglia «non più di N» lascerebbe marcire il conto aperto.
    expect(
      [...mancanti].sort(),
      `campi acquistati e mai letti (${mancanti.length} su ${totale}): ${mancanti.join(', ')}`,
    ).toEqual([...dichiarati].sort());
  });

  it('ogni campo non letto ha un motivo scritto e un file che lo contiene', () => {
    for (const [file, voce] of Object.entries(NON_LETTI_DICHIARATI)) {
      expect(existsSync(join(SONDA, file)), `${file} non è fra le risposte registrate`).toBe(true);
      expect(voce.perche.length, `«${file}» è nell’elenco senza spiegare perché`).toBeGreaterThan(40);
      expect(voce.campi.length, `«${file}» è nell’elenco senza campi`).toBeGreaterThan(0);
    }
  });

  it('il conto aperto è quello dichiarato: 38, 10 e 16', () => {
    /*
      I numeri del rapporto, scritti qui perché il lettore possa fare la sottrazione. Se un
      domani salgono, qualcuno ha comprato dati nuovi e non li ha letti; se scendono,
      qualcuno li ha letti e questo elenco va accorciato.

      Erano 38 e 11, e sono cambiati due volte nello stesso giorno per due ragioni opposte.
      Il secondo file è sceso a 10 perché il controllo ha imparato a vedere gli accessi per
      proprietà e ha scoperto che un campo dichiarato «non letto» si leggeva già: un debito
      che non esisteva. Il terzo è nuovo, ed è l'adeguata verifica.
    */
    const perFile = Object.values(NON_LETTI_DICHIARATI).map((v) => v.campi.length);
    expect(perFile).toEqual([38, 10, 16]);
  });

  it('il profilo completo resta il campione più ricco, e resta ricco', () => {
    // Duecentotrenta campi: se il fornitore ne togliesse metà, il collaudo sopra
    // resterebbe verde misurando un servizio dimezzato.
    expect(divario('prod-IT-full-12485671007.json').totale).toBeGreaterThan(200);
    expect(divario('prod-IT-advanced-12485671007.json').totale).toBeGreaterThan(50);
  });

  it('ogni campo scartato ha una motivazione scritta', () => {
    // Un elenco di eccezioni senza motivi torna a essere una lista di dimenticanze.
    for (const [campo, motivo] of Object.entries(SCARTATI_A_RAGION_VEDUTA)) {
      expect(motivo.length, `«${campo}» è scartato senza spiegare perché`).toBeGreaterThan(20);
    }
  });
});

/**
 * L'elenco dei campi noti serve alla sorveglianza a runtime, che confronta ogni risposta
 * del fornitore con esso e segnala ciò che non vi compare.
 *
 * Se invecchia, la sorveglianza smette di sorvegliare proprio i campi nuovi — cioè l'unica
 * cosa per cui esiste. Qui lo si rigenera dai sorgenti e lo si confronta con quello
 * committato: chi aggiunge una lettura senza rigenerarlo se ne accorge subito.
 */
describe('Elenco dei campi noti', () => {
  it('è allineato con quello che i mappatori leggono davvero', async () => {
    const { CAMPI_NOTI } = await import('../src/openapi/campi-noti.js');

    /*
      Si usa **lo stesso estrattore** che genera il file, non una seconda lettura
      approssimata: due estrattori diversi divergono, e il collaudo finirebbe per passare
      misurando qualcos'altro. È esattamente l'errore che ha lasciato passare per mesi la
      metà dei campi acquistati.
    */
    const { estraiCampi } = (await import('../../../strumenti/estrai-campi.mjs')) as {
      estraiCampi: (dir: string) => readonly string[];
    };
    const attesi = estraiCampi(join(process.cwd(), 'packages', 'providers', 'src'));

    expect(
      [...CAMPI_NOTI],
      'campi-noti.ts non è allineato ai mappatori. Rigenerare con: npm run campi-noti',
    ).toEqual([...attesi]);
  });
});
