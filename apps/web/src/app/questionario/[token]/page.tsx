import { EditorDossier } from '../../azienda/[id]/dati/EditorDossier';
import { convertiPolizze, unisciDati } from '../../azienda/[id]/dati/modulo';
import { salvaQuestionarioCliente } from './actions';
import { Avviso, Scheda } from '@/components/ui';
import { chiamaQuestionarioPubblico } from '@/lib/chiamata-server';
import { formattaGiornoEsteso } from '@aegis/core/tempo';

export const dynamic = 'force-dynamic';

/**
 * Il questionario, aperto dal cliente.
 *
 * **Nessuna `richiediSessione`**, ed è deliberato: chi arriva qui non ha un accesso alla
 * piattaforma. L'autorizzazione è il token nell'indirizzo, verificata dall'API.
 *
 * La pagina mostra il questionario e nient'altro — niente barra di navigazione, niente
 * portafoglio, niente analisi. Non è una scelta di grafica: chiunque abbia il collegamento
 * è qui, e l'unica cosa che ha diritto di vedere è ciò che gli si sta chiedendo di
 * compilare.
 *
 * Lo stesso `EditorDossier` dell'intermediario, con una funzione di salvataggio diversa:
 * due questionari separati divergerebbero al primo campo aggiunto, e il cliente si
 * troverebbe a rispondere a domande diverse da quelle che il broker vede.
 */

interface QuestionarioApertura {
  denominazione: string;
  scadeIl: string;
  /** Il marchio dell'intermediario: è il suo cliente che apre questa pagina, non il nostro. */
  studio: { denominazione: string; logo: string | null; numeroRui: string | null } | null;
  datiDichiarati: Record<string, unknown> | null;
  polizze: {
    id: string;
    coverage: string;
    compagnia: string;
    numeroPolizza: string | null;
    sommaAssicurata: number | null;
    massimale: number | null;
    franchigia: number | null;
    premioAnnuo: number | null;
    dataEffetto: string;
    dataScadenza: string;
    formaGaranzia: string | null;
  }[];
}

export default async function PaginaQuestionario({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const risposta = await chiamaQuestionarioPubblico(token, { metodo: 'GET' }).catch(() => null);

  if (risposta === null || !risposta.ok) {
    /*
      Un solo messaggio per tutti i casi — collegamento inesistente, scaduto o revocato.

      Distinguerli sarebbe più gentile ma direbbe a chi prova indirizzi a caso quando ne ha
      trovato uno che è esistito. Il rimedio indicato è comunque quello giusto in tutti e
      tre i casi.
    */
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Avviso tono="critico" titolo="Collegamento non valido">
          Questo collegamento non è più attivo. Può succedere se è scaduto o se l&apos;intermediario ne ha
          generato uno nuovo. Basta richiederglielo: ne riceverà un altro in pochi secondi.
        </Avviso>
      </div>
    );
  }

  const apertura = (await risposta.json()) as QuestionarioApertura;
  const scadenza = formattaGiornoEsteso(apertura.scadeIl);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 border-b border-bordo pb-5">
        {apertura.studio !== null && (
          <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-bordo pb-3">
            {apertura.studio.logo !== null && apertura.studio.logo !== '' && (
              // Data URI: nulla da ottimizzare, e `next/image` vorrebbe un dominio noto.
              <img
                src={apertura.studio.logo}
                alt={`Logo di ${apertura.studio.denominazione}`}
                className="h-9 w-auto max-w-[10rem] object-contain"
              />
            )}
            <div>
              <p className="text-sm font-bold tracking-tight">{apertura.studio.denominazione}</p>
              {apertura.studio.numeroRui !== null && (
                <p className="text-xs text-testo-tenue">RUI n. {apertura.studio.numeroRui}</p>
              )}
            </div>
          </div>
        )}

        <p className="text-xs font-semibold uppercase tracking-widest text-testo-tenue">
          Questionario assicurativo
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{apertura.denominazione}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-testo-tenue">
          Il suo intermediario le chiede di completare queste informazioni: sono i dati che nessun bilancio
          contiene e che servono a dimensionare correttamente le coperture. Può salvare più volte e
          riprendere in un secondo momento — le risposte restano.
        </p>
        <p className="mt-2 text-xs text-testo-debole">
          Collegamento valido fino al {scadenza}. Se non riesce a completarlo entro quella data, ne chieda
          uno nuovo al suo intermediario.
        </p>
      </header>

      <Scheda className="mb-6">
        <p className="text-sm leading-relaxed text-testo-tenue">
          <strong className="text-testo">Nessun campo è obbligatorio.</strong> Ciò che resta vuoto viene
          semplicemente rilevato come «da confermare», e il suo intermediario lo vedrà come tale: è
          preferibile a una risposta data a caso, che entrerebbe nei calcoli come se fosse certa.
        </p>
      </Scheda>

      <EditorDossier
        identificativo={token}
        datiIniziali={unisciDati(apertura.datiDichiarati, null)}
        polizzeIniziali={convertiPolizze(apertura.polizze)}
        salva={salvaQuestionarioCliente}
      />
    </div>
  );
}
