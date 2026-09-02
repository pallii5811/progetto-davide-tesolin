'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CampoData,
  CampoNumero,
  CampoPercentuale,
  CampoSelezione,
  CampoTesto,
  CampoTriStato,
  GruppoCampi,
} from '@/components/campi';
import { COPERTURE } from '@/lib/coperture';
import { messaggioRigheIncomplete, righeIncomplete } from '@/lib/dossier-incompleto';

export interface ImmobileForm {
  descrizione: string;
  superficieMq: number | null;
  titolo: 'proprieta' | 'locazione' | 'comodato' | 'leasing' | 'misto';
  tipologiaCostruttiva:
    'muratura' | 'cemento-armato' | 'prefabbricato' | 'acciaio' | 'legno' | 'misto' | null;
  annoCostruzione: number | null;
  presenzaImpiantoAntincendio: boolean | null;
  presenzaAllarme: boolean | null;
  /**
   * Compartimentazione REI e impianto di estinzione automatica.
   *
   * Erano nel dominio, accettati dall'API con la loro validazione, e usati dal motore
   * come moltiplicatori della quota di danno probabile — 0,55 il primo, 0,70 il secondo.
   * Il modulo non li chiedeva: nessun utente reale poteva valorizzarli, quindi il calcolo
   * girava sempre sul ramo «non noto» e il capitale incendio usciva quasi doppio.
   *
   * Misurato sull'azienda dimostrativa: danno probabile da 2,2 a 4,3 milioni, e la forma
   * consigliata che si ribalta da primo rischio assoluto a valore intero.
   */
  compartimentazioneRei: boolean | null;
  impiantoSprinkler: boolean | null;
}

export interface PolizzaForm {
  id: string;
  coverage: string;
  compagnia: string;
  numeroPolizza: string | null;
  sommaAssicurataEuro: number | null;
  massimaleEuro: number | null;
  franchigiaEuro: number | null;
  premioAnnuoEuro: number | null;
  dataEffetto: string;
  dataScadenza: string;
  formaGaranzia: 'valore-a-nuovo' | 'valore-allo-stato-duso' | 'primo-rischio-assoluto' | null;
}

/**
 * Le voci del bilancio depositato, rilevate dal documento che il cliente porta.
 *
 * Sono la differenza fra un'analisi con quattro capitali «non determinabile» e
 * un'analisi completa. Misurato: contenuto, scorte, danni indiretti e fido clienti
 * passano da vuoti a valorizzati, l'esposizione non assicurata da 2,4 a 7,8 milioni, e le
 * coperture da quantificare da cinque a due — cioè lo stesso risultato del bilancio CEE
 * che costerebbe cinque euro a impresa.
 *
 * Gli importi sono in **euro** nel modulo e in centesimi al confine dell'API, come per le
 * polizze.
 */
export interface BilancioForm {
  anno: number | null;
  rimanenzeEuro: number | null;
  creditiVersoClientiEuro: number | null;
  impiantiEAttrezzatureEuro: number | null;
  impiantiAlCostoStorico: boolean | null;
  costiMateriePrimeEuro: number | null;
  costiServiziEuro: number | null;
}

export interface DatiForm {
  bilancio: BilancioForm;
  immobili: ImmobileForm[];
  numeroVeicoli: number | null;
  numeroDipendenti: number | null;
  quotaExportPercentuale: number | null;
  esportaVersoUsaCanada: boolean | null;
  trattaDatiPersonali: boolean | null;
  trattaDatiParticolari: boolean | null;
  haSitoEcommerce: boolean | null;
  haModello231: boolean | null;
  certificazioni: string[];
  concentrazionePrimoCliente: number | null;
  lavoraInCantiere: boolean | null;
  produceBeniFinali: boolean | null;
  trasportaMerciProprie: boolean | null;
  periodoIndennizzoMesi: number | null;
  /**
   * Quanto rischio il titolare è disposto a tenersi.
   *
   * È il primo passo dell'ISO 31000 — la definizione del contesto — e ciò che trasforma
   * il trattamento da calcolo a decisione dell'imprenditore. Il motore la usava già per
   * la capacità di ritenzione; il modulo non la chiedeva, quindi restava sempre nulla e
   * la franchigia proponibile veniva decisa dal motore al posto del cliente.
   */
  propensioneAlRischio: 'prudente' | 'equilibrata' | 'incline-a-ritenere' | null;
}

const CERTIFICAZIONI_NOTE = [
  'ISO 9001',
  'ISO 14001',
  'ISO 27001',
  'ISO 45001',
  'EMAS',
  'SOA',
  'IATF 16949',
] as const;

const TITOLI = [
  { valore: 'proprieta' as const, testo: 'Proprietà' },
  { valore: 'locazione' as const, testo: 'Locazione' },
  { valore: 'comodato' as const, testo: 'Comodato' },
  { valore: 'leasing' as const, testo: 'Leasing' },
  { valore: 'misto' as const, testo: 'Misto' },
];

const TIPOLOGIE = [
  { valore: 'prefabbricato' as const, testo: 'Prefabbricato — 750 €/mq' },
  { valore: 'acciaio' as const, testo: 'Acciaio — 850 €/mq' },
  { valore: 'cemento-armato' as const, testo: 'Cemento armato — 950 €/mq' },
  { valore: 'legno' as const, testo: 'Legno — 1.000 €/mq' },
  { valore: 'muratura' as const, testo: 'Muratura — 1.050 €/mq' },
  { valore: 'misto' as const, testo: 'Misto — 950 €/mq' },
];

/**
 * Le tre propensioni, dette come le direbbe un imprenditore.
 *
 * Il testo accanto a ciascuna non è decorativo: dice l'effetto sulla franchigia, che è
 * ciò che rende la domanda rispondibile invece che astratta.
 */
const PROPENSIONI = [
  { valore: 'prudente' as const, testo: 'Prudente — preferisce trasferire, franchigie basse' },
  { valore: 'equilibrata' as const, testo: 'Equilibrata — franchigie in linea con la capacità' },
  {
    valore: 'incline-a-ritenere' as const,
    testo: 'Incline a ritenere — franchigie alte per abbassare il premio',
  },
];

const FORME_GARANZIA = [
  { valore: 'valore-a-nuovo' as const, testo: 'Valore a nuovo' },
  { valore: 'valore-allo-stato-duso' as const, testo: 'Valore allo stato d’uso' },
  { valore: 'primo-rischio-assoluto' as const, testo: 'Primo rischio assoluto' },
];

export function EditorDossier({
  identificativo,
  datiIniziali,
  polizzeIniziali,
  salva,
  lettore,
  collegamentoAnalisi = null,
}: {
  identificativo: string;
  datiIniziali: DatiForm;
  polizzeIniziali: PolizzaForm[];
  /**
   * CHI STA LEGGENDO QUESTO MODULO.
   *
   * Lo stesso componente serve due porte: l'intermediario, che compila durante
   * l'intervista, e il CLIENTE, che riceve un collegamento e compila da solo. Finora le
   * spiegazioni erano scritte per il primo e le leggeva anche il secondo — cioè l'azienda
   * assicurata leggeva «è la domanda più redditizia dell'intera intervista» accanto alla
   * casella dell'export, e «cinque minuti che valgono quanto il servizio a pagamento da
   * 5 € per impresa», che le scopre quanto costa il dato al suo intermediario.
   *
   * OBBLIGATORIA, senza valore predefinito. Un default avrebbe fatto ricomparire i testi
   * del venditore il giorno in cui qualcuno apre una terza porta verso il cliente e si
   * dimentica di dichiararla: qui il compilatore lo impedisce.
   */
  lettore: 'intermediario' | 'cliente';
  /**
   * Dove porta il pulsante «Vedi l'analisi», quando ha senso che ci sia.
   *
   * Non si costruisce qui dentro, e la ragione è che `identificativo` **non è la stessa
   * cosa nelle due porte**: per l'intermediario è la partita IVA, per il cliente è il
   * token del questionario. La barra fissa rinviava a `/azienda/<identificativo>` in
   * entrambi i casi, quindi sul percorso del cliente portava al login di AEGIS con il suo
   * token nel parametro `ritorno` — cioè nella barra dell'indirizzo, nella cronologia del
   * suo browser e nell'intestazione `Referer` di ogni richiesta successiva. Un token che
   * apre il questionario di un'impresa, lasciato in tre posti dove nessuno lo cerca.
   *
   * Il valore predefinito è `null` — nessun pulsante — perché il caso pericoloso è quello
   * in cui ci si dimentica di dire qualcosa, e deve essere il caso sicuro.
   */
  collegamentoAnalisi?: string | null;
  salva: (
    id: string,
    payload: { datiDichiarati: unknown; polizze: unknown },
  ) => Promise<{ ok: boolean; messaggio: string; completezza?: { percentuale: number; livello: string } }>;
}) {
  const router = useRouter();
  const [dati, setDati] = useState<DatiForm>(datiIniziali);
  const [polizze, setPolizze] = useState<PolizzaForm[]>(polizzeIniziali);
  const [esito, setEsito] = useState<{ ok: boolean; messaggio: string } | null>(null);
  const [inCorso, avvia] = useTransition();

  /*
    C'È QUALCOSA DI NON SALVATO?

    Serve al pulsante «Vedi l'analisi», che stava accanto a «Salva» e navigava via
    all'istante: un'intervista lunga si perdeva senza una domanda, e chi la stava
    conducendo era seduto davanti al cliente.

    Si confronta con l'ULTIMO SALVATAGGIO e non con i dati iniziali: dopo un salvataggio
    riuscito le proprietà in ingresso restano quelle di prima — sono proprietà, non stato —
    e il modulo risulterebbe modificato per sempre.
  */
  const [ultimoSalvato, setUltimoSalvato] = useState<string>(() =>
    JSON.stringify({ dati: datiIniziali, polizze: polizzeIniziali }),
  );
  const modificato = JSON.stringify({ dati, polizze }) !== ultimoSalvato;

  const aggiorna = <K extends keyof DatiForm>(chiave: K, valore: DatiForm[K]): void => {
    setDati((precedente) => ({ ...precedente, [chiave]: valore }));
    setEsito(null);
  };

  const aggiornaImmobile = (indice: number, patch: Partial<ImmobileForm>): void => {
    setDati((precedente) => ({
      ...precedente,
      immobili: precedente.immobili.map((i, n) => (n === indice ? { ...i, ...patch } : i)),
    }));
    setEsito(null);
  };

  const onSalva = (dopoIlSalvataggio?: () => void): void => {
    /*
      Ciò che non si può salvare si dice, non si butta.

      Qui gli immobili senza descrizione e le polizze senza compagnia o senza date
      venivano tolti dal carico, e il salvataggio rispondeva «Risposte inviate. Grazie» —
      mentre al cliente, due riquadri più su, era stato promesso che nessun campo è
      obbligatorio. La polizza non arrivava all'intermediario e a valle il piano proponeva
      di **attivare** una garanzia che il cliente ha già.

      Adesso il salvataggio si ferma e nomina le righe e i campi mancanti. Non si perde
      nulla: ciò che è stato scritto resta nel modulo, e chi ha compilato può completare
      la riga o toglierla — è l'unico dei due a poterlo fare.
    */
    const incomplete = righeIncomplete(dati.immobili, polizze);
    if (incomplete.length > 0) {
      setEsito({ ok: false, messaggio: messaggioRigheIncomplete(incomplete) });
      return;
    }

    avvia(async () => {
      const risultato = await salva(identificativo, {
        datiDichiarati: {
          ...dati,
          // Euro nel modulo, centesimi al confine: la stessa convenzione delle polizze.
          // `null` resta `null` — un campo non compilato è ignoto, non zero.
          bilancio: {
            anno: dati.bilancio.anno,
            rimanenze: inCentesimi(dati.bilancio.rimanenzeEuro),
            creditiVersoClienti: inCentesimi(dati.bilancio.creditiVersoClientiEuro),
            impiantiEAttrezzature: inCentesimi(dati.bilancio.impiantiEAttrezzatureEuro),
            impiantiAlCostoStorico: dati.bilancio.impiantiAlCostoStorico,
            costiMateriePrime: inCentesimi(dati.bilancio.costiMateriePrimeEuro),
            costiServizi: inCentesimi(dati.bilancio.costiServiziEuro),
          },
        },
        polizze,
      });

      setEsito(risultato);
      if (risultato.ok) {
        setUltimoSalvato(JSON.stringify({ dati, polizze }));
        router.refresh();
        // Si naviga SOLO a salvataggio riuscito: andarsene dopo un errore perderebbe
        // esattamente ciò che si stava cercando di mettere al sicuro.
        dopoIlSalvataggio?.();
      }
    });
  };

  /** Euro nel modulo, centesimi al confine. `null` resta `null`: l'assenza non è zero. */
  const inCentesimi = (euro: number | null): number | null =>
    euro === null ? null : Math.round(euro * 100);

  const aggiornaBilancio = (patch: Partial<BilancioForm>): void => {
    aggiorna('bilancio', { ...dati.bilancio, ...patch });
  };

  return (
    <div className="space-y-5 pb-24">
      {/*
        Le voci del bilancio depositato.

        Stanno per prime perché sono quelle che cambiano di più: senza, quattro capitali
        su cinque restano «non determinabile» e il piano d'azione perde la business
        interruption, che è la garanzia dove il capitale sbagliato costa di più.

        Il documento ce l'ha il cliente. Le etichette dicono **dove guardare** — la voce e
        la lettera dello schema — perché un broker non è un contabile e cercare a occhio in
        un bilancio è il motivo per cui questi campi restano vuoti.
      */}
      <GruppoCampi
        titolo="Voci dal bilancio depositato"
        descrizione={
          lettore === 'cliente'
            ? 'Si leggono dal bilancio depositato, che l’impresa ha già. Senza queste voci, contenuto, scorte, danni indiretti e credito commerciale restano non quantificabili.'
            : 'Si leggono dal bilancio che l’impresa ha già: cinque minuti che valgono quanto il servizio a pagamento da 5 € per impresa. Senza, contenuto, scorte, danni indiretti e credito restano non quantificabili.'
        }
      >
        <CampoNumero
          etichetta="Esercizio di riferimento"
          valore={dati.bilancio.anno}
          onChange={(v) => aggiornaBilancio({ anno: v })}
          aiuto="L’anno del bilancio da cui si stanno leggendo le voci: serve a non mescolare due esercizi."
        />
        <CampoNumero
          etichetta="Rimanenze"
          valore={dati.bilancio.rimanenzeEuro}
          onChange={(v) => aggiornaBilancio({ rimanenzeEuro: v })}
          suffisso="€"
          aiuto="Stato patrimoniale, attivo, voce C-I. Base della somma assicuranda per merci e scorte, poi maggiorata del picco stagionale."
        />
        <CampoNumero
          etichetta="Crediti verso clienti"
          valore={dati.bilancio.creditiVersoClientiEuro}
          onChange={(v) => aggiornaBilancio({ creditiVersoClientiEuro: v })}
          suffisso="€"
          aiuto="Attivo, voce C-II-1. È il capitale dell’assicurazione del credito commerciale."
        />
        <CampoNumero
          etichetta="Impianti e attrezzature"
          valore={dati.bilancio.impiantiEAttrezzatureEuro}
          onChange={(v) => aggiornaBilancio({ impiantiEAttrezzatureEuro: v })}
          suffisso="€"
          aiuto="Attivo, voci B-II-2 e B-II-3 sommate. Se la nota integrativa riporta il costo storico lordo, usare quello e spuntare la casella qui sotto: è la base corretta per il valore a nuovo."
        />
        <CampoTriStato
          etichetta="Il valore sopra è al costo storico lordo"
          valore={dati.bilancio.impiantiAlCostoStorico}
          onChange={(v) => aggiornaBilancio({ impiantiAlCostoStorico: v })}
          aiuto="Il netto contabile è già decurtato dagli ammortamenti e sottostima il rimpiazzo: dichiararlo cambia il coefficiente applicato."
        />
        <CampoNumero
          etichetta="Costi per materie prime"
          valore={dati.bilancio.costiMateriePrimeEuro}
          onChange={(v) => aggiornaBilancio({ costiMateriePrimeEuro: v })}
          suffisso="€"
          aiuto="Conto economico, voce B-6. Serve al margine di contribuzione, che è il capitale della business interruption."
        />
        <CampoNumero
          etichetta="Costi per servizi"
          valore={dati.bilancio.costiServiziEuro}
          onChange={(v) => aggiornaBilancio({ costiServiziEuro: v })}
          suffisso="€"
          aiuto="Conto economico, voce B-7. Se ne considera variabile il 60%: è l’ipotesi dichiarata nella spiegazione del capitale."
        />
      </GruppoCampi>

      {/* ── Immobili ─────────────────────────────────────────────────────── */}
      <fieldset className="rounded-lg border border-bordo bg-superficie p-4">
        <legend className="px-1.5 text-sm font-semibold">Immobili e sedi</legend>
        <p className="mb-3 text-xs leading-relaxed text-testo-tenue">
          I metri quadri sono il dato che più incide sull&apos;intera analisi: senza, il capitale fabbricati
          resta una stima — dall&apos;impronta a terra rilevata da cartografia o dal valore contabile, già
          decurtato dagli ammortamenti — e la sottoassicurazione è quasi garantita.
        </p>

        <div className="space-y-4">
          {dati.immobili.map((immobile, indice) => (
            <div key={indice} className="rounded border border-bordo bg-fondo p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-testo-debole">
                  Immobile {indice + 1}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    aggiorna(
                      'immobili',
                      dati.immobili.filter((_, n) => n !== indice),
                    )
                  }
                  className="rounded px-2 py-1 text-xs text-alto hover:bg-alto-fondo"
                >
                  Rimuovi
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <CampoTesto
                  etichetta="Descrizione"
                  valore={immobile.descrizione}
                  onChange={(v) => aggiornaImmobile(indice, { descrizione: v })}
                  placeholder="Capannone produttivo — Adro (BS)"
                />
                <CampoNumero
                  etichetta="Superficie"
                  valore={immobile.superficieMq}
                  onChange={(v) => aggiornaImmobile(indice, { superficieMq: v })}
                  suffisso="mq"
                />
                <CampoSelezione
                  etichetta="Titolo di occupazione"
                  valore={immobile.titolo}
                  opzioni={TITOLI}
                  onChange={(v) => aggiornaImmobile(indice, { titolo: v ?? 'proprieta' })}
                />
                <CampoSelezione
                  etichetta="Tipologia costruttiva"
                  valore={immobile.tipologiaCostruttiva}
                  opzioni={TIPOLOGIE}
                  onChange={(v) => aggiornaImmobile(indice, { tipologiaCostruttiva: v })}
                  aiuto="Determina il costo di ricostruzione al metro quadro."
                />
                <CampoTriStato
                  etichetta="Impianto antincendio"
                  valore={immobile.presenzaImpiantoAntincendio}
                  onChange={(v) => aggiornaImmobile(indice, { presenzaImpiantoAntincendio: v })}
                  aiuto="Estintori, idranti, rilevazione: richiedono qualcuno che intervenga."
                />
                {/*
                  Le due domande che il motore poneva e il modulo non permetteva di
                  rispondere. Sono i moltiplicatori del danno massimo probabile, e senza
                  di esse il capitale incendio esce quasi doppio: sull'azienda
                  dimostrativa, 4,3 milioni invece di 2,2.
                */}
                <CampoTriStato
                  etichetta="Compartimentazione REI"
                  valore={immobile.compartimentazioneRei}
                  onChange={(v) => aggiornaImmobile(indice, { compartimentazioneRei: v })}
                  aiuto="Muri e porte tagliafuoco fra le aree. È la domanda che più abbassa il capitale da assicurare: un compartimento confina l’incendio, ed è struttura, non un dispositivo che deve attivarsi."
                />
                <CampoTriStato
                  etichetta="Estinzione automatica (sprinkler)"
                  valore={immobile.impiantoSprinkler}
                  onChange={(v) => aggiornaImmobile(indice, { impiantoSprinkler: v })}
                  aiuto="Agisce senza che nessuno sia presente. Vale meno della compartimentazione perché un impianto può non entrare in funzione."
                />
                <CampoTriStato
                  etichetta="Allarme antifurto"
                  valore={immobile.presenzaAllarme}
                  onChange={(v) => aggiornaImmobile(indice, { presenzaAllarme: v })}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            aggiorna('immobili', [
              ...dati.immobili,
              {
                descrizione: '',
                superficieMq: null,
                titolo: 'proprieta',
                tipologiaCostruttiva: null,
                annoCostruzione: null,
                presenzaImpiantoAntincendio: null,
                presenzaAllarme: null,
                compartimentazioneRei: null,
                impiantoSprinkler: null,
              },
            ])
          }
          className="mt-3 rounded border border-dashed border-bordo-forte px-3 py-2 text-sm text-testo-tenue transition hover:border-marchio hover:text-marchio"
        >
          + Aggiungi immobile
        </button>
      </fieldset>

      {/* ── Attività e mercati ───────────────────────────────────────────── */}
      <GruppoCampi
        titolo="Attività e mercati"
        descrizione={
          lettore === 'cliente'
            ? 'L’export verso Stati Uniti e Canada raddoppia il massimale di RC Prodotti consigliato: là il regime risarcitorio è più severo e ammette danni punitivi.'
            : 'L’export verso USA e Canada raddoppia il massimale RC Prodotti consigliato: è la domanda più redditizia dell’intera intervista.'
        }
      >
        <CampoNumero
          etichetta="Dipendenti"
          valore={dati.numeroDipendenti}
          onChange={(v) => aggiorna('numeroDipendenti', v)}
          aiuto="Attiva RCO e infortuni; concorre alla scadenza CAT NAT."
        />
        <CampoNumero
          etichetta="Veicoli aziendali"
          valore={dati.numeroVeicoli}
          onChange={(v) => aggiorna('numeroVeicoli', v)}
        />
        <CampoPercentuale
          etichetta="Quota di export"
          valore={dati.quotaExportPercentuale}
          onChange={(v) => aggiorna('quotaExportPercentuale', v)}
        />
        <CampoTriStato
          etichetta="Esporta verso USA o Canada"
          valore={dati.esportaVersoUsaCanada}
          onChange={(v) => aggiorna('esportaVersoUsaCanada', v)}
          aiuto="Regime risarcitorio con danni punitivi: richiede estensione territoriale espressa."
        />
        <CampoTriStato
          etichetta="Immette prodotti finiti sul mercato"
          valore={dati.produceBeniFinali}
          onChange={(v) => aggiorna('produceBeniFinali', v)}
        />
        <CampoTriStato
          etichetta="Lavora presso cantieri o sedi di terzi"
          valore={dati.lavoraInCantiere}
          onChange={(v) => aggiorna('lavoraInCantiere', v)}
        />
        <CampoTriStato
          etichetta="Trasporta merci proprie"
          valore={dati.trasportaMerciProprie}
          onChange={(v) => aggiorna('trasportaMerciProprie', v)}
        />
        <CampoPercentuale
          etichetta="Fatturato sul primo cliente"
          valore={dati.concentrazionePrimoCliente}
          onChange={(v) => aggiorna('concentrazionePrimoCliente', v)}
          aiuto="Sopra il 20% il rischio di concentrazione diventa rilevante."
        />
        {/*
          Il primo passo dell'ISO 31000, e l'unico che nessuno poteva compilare.

          Il motore la usava già per la capacità di ritenzione, l'API la accettava con la
          sua validazione, la completezza la contava fra le voci da compilare — e il
          modulo non la chiedeva. Restava nulla per sempre: la franchigia proponibile la
          decideva il motore al posto dell'imprenditore, che è esattamente la critica che
          si fa ai questionari standardizzati.
        */}
        <CampoSelezione
          etichetta="Propensione al rischio del titolare"
          valore={dati.propensioneAlRischio}
          opzioni={PROPENSIONI}
          onChange={(v) => aggiorna('propensioneAlRischio', v)}
          aiuto={
            lettore === 'cliente'
              ? 'Non si deduce dai numeri: un imprenditore prudente con mezzi solidi ha ogni diritto di assicurare tutto. La risposta dimezza o raddoppia la franchigia proposta, e non incide sul giudizio sull’impresa.'
              : 'Si chiede, non si deduce: un imprenditore prudente con mezzi solidi ha ogni diritto di assicurare tutto. Dimezza o raddoppia la franchigia proponibile, ed è una domanda da trenta secondi.'
          }
        />
      </GruppoCampi>

      {/* ── Dati e sistemi ───────────────────────────────────────────────── */}
      <GruppoCampi
        titolo="Dati, sistemi e governance"
        descrizione="Dimensionano il massimale cyber e l’esposizione sanzionatoria."
      >
        <CampoTriStato
          etichetta="Tratta dati personali"
          valore={dati.trattaDatiPersonali}
          onChange={(v) => aggiorna('trattaDatiPersonali', v)}
        />
        <CampoTriStato
          etichetta="Tratta categorie particolari di dati"
          valore={dati.trattaDatiParticolari}
          onChange={(v) => aggiorna('trattaDatiParticolari', v)}
          aiuto="Dati sanitari, biometrici, giudiziari (art. 9 GDPR)."
        />
        <CampoTriStato
          etichetta="Canale e-commerce attivo"
          valore={dati.haSitoEcommerce}
          onChange={(v) => aggiorna('haSitoEcommerce', v)}
        />
        <CampoTriStato
          etichetta="Modello 231 adottato"
          valore={dati.haModello231}
          onChange={(v) => aggiorna('haModello231', v)}
          aiuto="Ha efficacia esimente se attuato e vigilato."
        />
        <CampoNumero
          etichetta="Periodo di indennizzo danni indiretti"
          valore={dati.periodoIndennizzoMesi}
          onChange={(v) => aggiorna('periodoIndennizzoMesi', v)}
          suffisso="mesi"
          min={3}
          aiuto="Sotto i 12 mesi si è quasi certamente sottodimensionati: ricostruire un capannone richiede più di un anno."
        />
      </GruppoCampi>

      {/* ── Certificazioni ───────────────────────────────────────────────── */}
      <fieldset className="rounded-lg border border-bordo bg-superficie p-4">
        <legend className="px-1.5 text-sm font-semibold">Certificazioni di sistema</legend>
        <p className="mb-3 text-xs leading-relaxed text-testo-tenue">
          Ogni certificazione è un controllo documentato: abbassa il rischio residuo e dà argomenti in
          trattativa con la compagnia sul premio.
        </p>
        <div className="flex flex-wrap gap-2">
          {CERTIFICAZIONI_NOTE.map((norma) => {
            const attiva = dati.certificazioni.some((c) => c.toUpperCase().includes(norma));
            return (
              <button
                key={norma}
                type="button"
                aria-pressed={attiva}
                onClick={() =>
                  aggiorna(
                    'certificazioni',
                    attiva
                      ? dati.certificazioni.filter((c) => !c.toUpperCase().includes(norma))
                      : [...dati.certificazioni, norma],
                  )
                }
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  attiva
                    ? 'border-marchio bg-azione text-azione-testo'
                    : 'border-bordo-forte bg-fondo hover:border-marchio/50'
                }`}
              >
                {norma}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ── Polizze ──────────────────────────────────────────────────────── */}
      <fieldset className="rounded-lg border border-bordo bg-superficie p-4">
        <legend className="px-1.5 text-sm font-semibold">Polizze in essere</legend>
        <p className="mb-3 text-xs leading-relaxed text-testo-tenue">
          Senza le polizze esistenti la gap analysis può solo dire cosa serve, non cosa manca. I capitali si
          inseriscono in euro.
        </p>

        <div className="space-y-4">
          {polizze.map((polizza, indice) => (
            <div key={polizza.id} className="rounded border border-bordo bg-fondo p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-testo-debole">
                  Polizza {indice + 1}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPolizze(polizze.filter((_, n) => n !== indice));
                    setEsito(null);
                  }}
                  className="rounded px-2 py-1 text-xs text-alto hover:bg-alto-fondo"
                >
                  Rimuovi
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <CampoSelezione
                  etichetta="Copertura"
                  valore={polizza.coverage}
                  opzioni={COPERTURE}
                  onChange={(v) => aggiornaPolizza(indice, { coverage: v ?? 'incendio' })}
                />
                <CampoTesto
                  etichetta="Compagnia"
                  valore={polizza.compagnia}
                  onChange={(v) => aggiornaPolizza(indice, { compagnia: v })}
                />
                <CampoTesto
                  etichetta="Numero di polizza"
                  valore={polizza.numeroPolizza ?? ''}
                  onChange={(v) => aggiornaPolizza(indice, { numeroPolizza: v === '' ? null : v })}
                />
                <CampoSelezione
                  etichetta="Forma di garanzia"
                  valore={polizza.formaGaranzia}
                  opzioni={FORME_GARANZIA}
                  onChange={(v) => aggiornaPolizza(indice, { formaGaranzia: v })}
                  aiuto="Il primo rischio assoluto esclude la regola proporzionale."
                />
                <CampoNumero
                  etichetta="Somma assicurata"
                  valore={polizza.sommaAssicurataEuro}
                  onChange={(v) => aggiornaPolizza(indice, { sommaAssicurataEuro: v })}
                  suffisso="€"
                />
                <CampoNumero
                  etichetta="Massimale"
                  valore={polizza.massimaleEuro}
                  onChange={(v) => aggiornaPolizza(indice, { massimaleEuro: v })}
                  suffisso="€"
                />
                <CampoNumero
                  etichetta="Premio annuo"
                  valore={polizza.premioAnnuoEuro}
                  onChange={(v) => aggiornaPolizza(indice, { premioAnnuoEuro: v })}
                  suffisso="€"
                />
                <CampoNumero
                  etichetta="Franchigia"
                  valore={polizza.franchigiaEuro}
                  onChange={(v) => aggiornaPolizza(indice, { franchigiaEuro: v })}
                  suffisso="€"
                />
                <CampoData
                  etichetta="Data di effetto"
                  valore={polizza.dataEffetto}
                  onChange={(v) => aggiornaPolizza(indice, { dataEffetto: v })}
                />
                <CampoData
                  etichetta="Data di scadenza"
                  valore={polizza.dataScadenza}
                  onChange={(v) => aggiornaPolizza(indice, { dataScadenza: v })}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            const oggi = new Date().toISOString().slice(0, 10);
            const traUnAnno = new Date();
            traUnAnno.setFullYear(traUnAnno.getFullYear() + 1);
            setPolizze([
              ...polizze,
              {
                id: `pol-${Date.now()}`,
                coverage: 'incendio',
                compagnia: '',
                numeroPolizza: null,
                sommaAssicurataEuro: null,
                massimaleEuro: null,
                franchigiaEuro: null,
                premioAnnuoEuro: null,
                dataEffetto: oggi,
                dataScadenza: traUnAnno.toISOString().slice(0, 10),
                formaGaranzia: null,
              },
            ]);
            setEsito(null);
          }}
          className="mt-3 rounded border border-dashed border-bordo-forte px-3 py-2 text-sm text-testo-tenue transition hover:border-marchio hover:text-marchio"
        >
          + Aggiungi polizza
        </button>
      </fieldset>

      {/* ── Barra di salvataggio ─────────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 border-t border-bordo bg-superficie/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div aria-live="polite" className="min-h-5 text-sm">
            {esito !== null && (
              <span className={esito.ok ? 'text-basso' : 'text-critico'}>{esito.messaggio}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/*
              CON MODIFICHE APERTE, QUESTO PULSANTE SALVA PRIMA DI ANDARSENE.

              Stava accanto a «Salva» e faceva `router.push` all'istante: un'intervista
              compilata a metà spariva senza una domanda, e chi la stava conducendo era
              seduto davanti al cliente.

              Chiedere «vuoi salvare?» sarebbe stato il rimedio ovvio e il peggiore dei
              due: in un caso su due la risposta giusta è sì, e chiederla significa solo
              spostare sull'utente una decisione che il prodotto sa già prendere. Qui non
              si perde niente in nessuno dei due rami.

              L'ETICHETTA RESTA UNA SOLA, e il motivo è arrivato da una prova rossa. La
              prima versione diventava «Salva e vedi l'analisi» quando c'erano modifiche:
              accanto a «Salva e ricalcola» facevano due pulsanti che cominciano entrambi
              con la stessa parola, uno di fianco all'altro. Il collaudo, che ne cercava
              uno, ne ha trovati due — ma prima ancora è chi guarda a non sapere più quale
              premere. Ciò che sta per succedere si dice nella riga qui accanto, dove non
              compete con il nome dell'azione.
            */}
            {collegamentoAnalisi !== null && (
              <div className="flex items-center gap-2">
                {modificato && (
                  <span className="hidden text-xs text-testo-debole sm:inline">
                    le modifiche verranno salvate
                  </span>
                )}
                <button
                  type="button"
                  disabled={inCorso}
                  onClick={() => {
                    if (!modificato) {
                      router.push(collegamentoAnalisi);
                      return;
                    }
                    onSalva(() => router.push(collegamentoAnalisi));
                  }}
                  className="rounded border border-bordo-forte px-4 py-2 text-sm transition hover:border-marchio disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Vedi l’analisi
                </button>
              </div>
            )}
            <button
              type="button"
              // `() => onSalva()` e non `onSalva`: da quando la funzione accetta un seguito
              // facoltativo, passarla nuda a React le consegnerebbe l'evento del mouse al
              // posto di quel seguito, e il salvataggio proverebbe a eseguirlo.
              onClick={() => onSalva()}
              disabled={inCorso}
              className="rounded bg-azione px-5 py-2 text-sm font-medium text-azione-testo transition hover:opacity-90 disabled:opacity-50"
            >
              {inCorso ? 'Salvataggio…' : 'Salva e ricalcola'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  function aggiornaPolizza(indice: number, patch: Partial<PolizzaForm>): void {
    setPolizze((precedenti) => precedenti.map((p, n) => (n === indice ? { ...p, ...patch } : p)));
    setEsito(null);
  }
}
