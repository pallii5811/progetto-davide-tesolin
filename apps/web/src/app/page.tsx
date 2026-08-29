import { richiediSessione } from '@/lib/sessione';
import { INDIRIZZO_API, cercaAziende, statoServizio } from '@/lib/api';
import { Avviso, Scheda } from '@/components/ui';
import { ModuloRicerca } from './ModuloRicerca';
import { SchedaRisultato } from './SchedaRisultato';
import { formattaGiornoEsteso } from '@aegis/core/tempo';

export const dynamic = 'force-dynamic';

export default async function PaginaRicerca({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; piva?: string; provincia?: string }>;
}) {
  await richiediSessione();
  const parametri = await searchParams;
  const haCriteri = (parametri.q ?? '').trim() !== '' || (parametri.piva ?? '').trim() !== '';

  const stato = await statoServizio().catch(() => null);

  let risultati: Awaited<ReturnType<typeof cercaAziende>> | null = null;
  let errore: string | null = null;

  if (haCriteri) {
    try {
      risultati = await cercaAziende({
        ...(parametri.q === undefined ? {} : { denominazione: parametri.q }),
        ...(parametri.piva === undefined ? {} : { partitaIva: parametri.piva }),
        ...(parametri.provincia === undefined ? {} : { provincia: parametri.provincia }),
      });
    } catch (e) {
      errore = e instanceof Error ? e.message : 'Errore imprevisto';
    }
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Analisi integrata di un&apos;azienda</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-testo-tenue">
          Da una partita IVA: profilo camerale, merito creditizio, registro dei rischi ISO 31000, somme
          assicurande calcolate dal bilancio, verifica dell&apos;obbligo catastrofale e piano d&apos;azione
          sulle coperture.
        </p>
      </div>

      {/*
        Due messaggi diversi per lo stesso guasto, perché i lettori sono due.
        In sviluppo serve l'indirizzo che non risponde e il comando per riavviare; in
        esercizio quel testo direbbe a un intermediario di lanciare comandi che non può
        lanciare, facendo sembrare rotto il prodotto invece del servizio.
      */}
      {stato === null && (
        <div className="mb-6">
          {process.env.NODE_ENV === 'production' ? (
            <Avviso tono="critico" titolo="Servizio momentaneamente non disponibile">
              Non è al momento possibile interrogare gli archivi. I dati già acquisiti restano consultabili
              dal portafoglio. Se la situazione persiste, segnalarlo all&apos;assistenza.
            </Avviso>
          ) : (
            <Avviso tono="critico" titolo="Servizio API non raggiungibile">
              Nessuna risposta da <code className="font-mono">{INDIRIZZO_API}</code>. Avviare il servizio
              con <code className="font-mono">npm run dev:api</code>, oppure indicare l&apos;indirizzo
              corretto nella variabile <code className="font-mono">AEGIS_API_URL</code>.
            </Avviso>
          )}
        </div>
      )}

      {/*
        La modalità va dichiarata in entrambi i versi. Sapere di essere in dimostrativo
        evita di prendere per buoni dei numeri inventati; sapere di essere sui dati reali
        evita di scoprire a fine mese quanto è costato provare.
      */}
      {/*
        Il rimedio è diverso perché lo è chi legge, e dirgliene uno che non lo riguarda è
        peggio del silenzio: la versione precedente rimandava «alle impostazioni», dove
        non c'è nulla da attivare. Il collegamento agli archivi dipende dalla
        configurazione con cui il servizio è stato avviato — chi sviluppa può cambiarla
        con un comando, un intermediario no, e mandarcelo lo fa sentire incapace di una
        cosa che è semplicemente fuori dalla sua portata.
      */}
      {stato !== null && !stato.datiReali && (
        <div className="mb-6">
          <Avviso tono="informativo" titolo="Modalità dimostrativa">
            Le aziende che compaiono qui sono <strong>inventate</strong>, per quanto coerenti: servono a
            provare il percorso e non consumano credito, ma su di esse non si fonda nessuna proposta a un
            cliente.{' '}
            {process.env.NODE_ENV === 'production' ? (
              <>
                Il collegamento agli archivi camerali non è attivo su questa installazione: segnalarlo
                all&apos;assistenza.
              </>
            ) : (
              <>
                Per lavorare sulle aziende vere, riavviare il servizio con{' '}
                <code className="font-mono">npm run dev:api</code> al posto di{' '}
                <code className="font-mono">npm run dev:api:demo</code>.
              </>
            )}
          </Avviso>
        </div>
      )}

      {stato !== null && stato.datiReali && (
        <div className="mb-6">
          <Avviso tono="attenzione" titolo="Dati reali — ogni analisi consuma credito">
            Ogni analisi interroga gli archivi camerali e consuma credito:{' '}
            <strong>
              {(stato.costoAnalisiCentesimi / 100).toFixed(2).replace('.', ',')} € per analisi
            </strong>
            , {(stato.costoAnalisiApprofonditaCentesimi / 100).toFixed(2).replace('.', ',')} € se
            approfondita. Le aziende già in portafoglio non vengono riacquistate, e la ricerca per provincia
            conta i risultati senza costo prima di scaricarne uno.
            {process.env.NODE_ENV !== 'production' && (
              <>
                {' '}
                Per provare senza spendere: <code className="font-mono">npm run dev:api:demo</code>.
              </>
            )}
          </Avviso>
        </div>
      )}

      <Scheda className="mb-8">
        <ModuloRicerca
          denominazione={parametri.q ?? ''}
          partitaIva={parametri.piva ?? ''}
          aPagamento={stato?.datiReali === true}
        />

        {/*
          Gli esempi hanno senso solo quando sono utilizzabili: sui dati reali quelle tre
          partite IVA non esistono, e chi le provasse pagherebbe una ricerca per non
          trovare nulla.
        */}
        {stato !== null && !stato.datiReali && (
          <p className="mt-3 text-xs text-testo-debole">
            Esempi in modalità dimostrativa: <code className="font-mono">03158460174</code> (meccanica,
            Brescia) · <code className="font-mono">02657870644</code> (costruzioni, Avellino) ·{' '}
            <code className="font-mono">02413390390</code> (logistica, Ravenna)
          </p>
        )}
      </Scheda>

      {errore !== null && (
        <Avviso tono="attenzione" titolo="Ricerca non eseguita">
          {errore}
        </Avviso>
      )}

      {risultati !== null && risultati.risultati.length === 0 && (
        <p className="text-sm text-testo-tenue">Nessuna azienda trovata con questi criteri.</p>
      )}

      {/*
        Cosa si è ottenuto e cosa manca ancora.

        Il risultato della ricerca è **una conferma di identità**, non l'analisi: cinque
        campi per stabilire che l'azienda è quella giusta prima di spendere per il resto.
        Senza dirlo, chi ha appena visto scalare del credito guarda cinque colonne e
        conclude che il prodotto non funzioni — è successo davvero, e la domanda era
        «dove sono tutti i dati?».

        Il dato camerale che si sta leggendo è **già pagato**: l'analisi lo riusa e non lo
        ricompra. Dirlo serve a far capire che il passo successivo costa meno di quanto
        sembri, non a giustificare la spesa.
      */}
      {/*
        Quando il risultato viene dall'archivio, dirlo cambia due cose.

        La prima è la fiducia: chi ha appena cercato si aspetta di aver speso, e vedere
        scritto «nessun costo» è l'unico modo di sapere che non è successo. La seconda è la
        decisione: un dato acquistato mesi fa può essere vecchio, e chi lo sa può scegliere
        di rinfrescarlo invece di scoprirlo dopo aver fatto una proposta.
      */}
      {risultati !== null && risultati.daArchivio === true && risultati.risultati.length > 0 && (
        <p className="mb-3 rounded border-l-2 border-basso bg-basso/5 py-1.5 pl-3 text-sm leading-relaxed">
          <strong>Trovata nel suo archivio — nessun costo.</strong> Questi dati sono già stati acquistati
          {risultati.aggiornatoIl == null ? '' : ` il ${formattaGiornoEsteso(risultati.aggiornatoIl)}`}: la
          ricerca non ha consumato credito. Aprendo l&apos;azienda, l&apos;analisi userà gli stessi dati
          senza ricomprarli.
        </p>
      )}

      {risultati !== null && risultati.risultati.length > 0 && (
        <div className="mb-3 space-y-4">
          {risultati.risultati.map((azienda) => (
            <SchedaRisultato key={azienda.providerId} azienda={azienda} />
          ))}
        </div>
      )}

      {/*
        La ricerca per denominazione usa l'elenco camerale, che non porta il settore.
        Dirlo solo quando manca davvero: una nota che compare sempre non viene più letta.
      */}
      {risultati !== null && risultati.risultati.some((a) => a.ateco === null) && (
        <p className="mt-3 text-xs text-testo-debole">
          Il settore delle aziende senza ATECO viene acquisito con l&apos;analisi.
        </p>
      )}
    </>
  );
}

/**
 * Il risultato di una ricerca, con quello che il record acquistato contiene già.
 *
 * Era una riga di tabella con sei colonne. Ma il record che la ricerca compra —
 * `IT-advanced`, dieci centesimi — porta addetti, fatturato, patrimonio, capitale sociale,
 * retribuzione media, la compagine sociale e dieci anni di bilanci sintetici: mostrarne
 * sei campi significava pagare l'intero e far vedere l'ATECO.
 *
 * Non era solo spreco. Chi vede scalare del credito e riceve cinque colonne conclude che
 * il prodotto non funzioni — ed è successo davvero, con la domanda «dove sono tutti i
 * dati?». Il difetto stava in un mappatore che scartava campi già pagati, e nel fatto che
 * nessuno avesse mai confrontato ciò che si comprava con ciò che si mostrava.
 *
 * L'analisi resta il passo che conta: bilanci riclassificati, merito creditizio, rischi,
 * somme assicurande. Ma qui si vede già se vale la pena di farla, ed è esattamente ciò a
 * cui serve una ricerca.
 */
