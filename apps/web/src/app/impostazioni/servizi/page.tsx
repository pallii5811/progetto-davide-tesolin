import { redirect } from 'next/navigation';
import { richiediSessione } from '@/lib/sessione';
import { statoFornitura, statoServiziDati } from '@/lib/api';
import type { StatoFornitura, StatoServizioDati } from '@/lib/api';
import { Avviso, Scheda } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Servizi dati: cosa il token può chiamare, e cosa no.
 *
 * Risponde alla domanda che un intermediario si pone davanti a un'analisi incompleta —
 * «manca il dato o manca l'abbonamento?» — e che finora richiedeva di aprire un terminale.
 * La differenza non è cosmetica: nel primo caso si chiede al cliente, nel secondo si va
 * nella console del fornitore, e confondere i due casi costa giornate.
 *
 * La verifica è gratuita: si sonda con una partita IVA inesistente, e il rifiuto per
 * autorizzazione mancante arriva prima di ogni lavorazione a pagamento.
 */
export default async function PaginaServizi() {
  const utente = await richiediSessione();
  // Non `ruolo`: la fornitura dei dati è di chi gestisce la piattaforma, e un
  // amministratore di studio cliente non deve nemmeno sapere da chi arrivano i dati.
  if (utente.gestorePiattaforma !== true) redirect('/impostazioni');

  const [esito, fornitura] = await Promise.all([
    statoServiziDati().catch(() => null),
    statoFornitura().catch(() => null),
  ]);

  /*
    L'intestazione si disegna **sempre**, qualunque sia l'esito.

    Una pagina che in un caso mostra il proprio titolo e in un altro solo un riquadro
    d'avviso lascia chi la guarda senza sapere dove si trova: l'avviso è una notizia sullo
    stato, non un sostituto della pagina.
  */
  const intestazione = (
    <>
      <h2 className="mb-1 text-lg font-semibold tracking-tight">Servizi dati</h2>
      <p className="mb-6 text-sm leading-relaxed text-testo-tenue">
        I token di OpenAPI.com sono <strong>per servizio, non per account</strong>: avere
        credito non basta, ogni servizio va autorizzato dalla console. Questa verifica non
        consuma credito.
      </p>
      {fornitura !== null && fornitura.persistenza && <Fornitura stato={fornitura} />}
    </>
  );

  if (esito === null) {
    return (
      <div className="max-w-3xl">
        {intestazione}
        <Avviso tono="critico" titolo="Verifica non riuscita">
          Il servizio non ha risposto. Riprovare fra qualche istante.
        </Avviso>
      </div>
    );
  }

  if (!esito.datiReali) {
    return (
      <div className="max-w-3xl">
        {intestazione}
        <Avviso tono="informativo" titolo="Modalità dimostrativa">
          Nessun token OpenAPI.com configurato: la piattaforma sta lavorando su dati
          dimostrativi e non consuma credito. Le autorizzazioni si verificano solo quando il
          token è presente in <code className="font-mono">.env</code>.
        </Avviso>
      </div>
    );
  }

  const attivi = esito.servizi.filter((s) => s.stato === 'autorizzato');
  const mancanti = esito.servizi.filter((s) => s.stato === 'non-autorizzato');
  const irraggiungibili = esito.servizi.filter((s) => s.stato === 'non-raggiungibile');

  return (
    <div className="max-w-3xl">
      {intestazione}

      {mancanti.length > 0 && (
        <div className="mb-6">
          <Avviso tono="attenzione" titolo="Autorizzazioni da aggiungere">
            <p>
              {mancanti.length === 1
                ? 'Un servizio non è autorizzato'
                : `${mancanti.length} servizi non sono autorizzati`}
              : l&apos;analisi funziona lo stesso, ma senza quei dati.{' '}
              <strong>Non serve acquistare nulla</strong>, è una modifica di autorizzazione.
            </p>
            <p className="mt-2 text-xs">
              Console OpenAPI.com → API Keys → modifica il token → aggiungi lo scope → salva.
            </p>
          </Avviso>
        </div>
      )}

      <div className="space-y-3">
        {[...attivi, ...mancanti, ...irraggiungibili].map((servizio) => (
          <Servizio key={servizio.chiave} servizio={servizio} />
        ))}
      </div>

      {mancanti.length === 0 && irraggiungibili.length === 0 && (
        <p className="mt-4 text-sm text-basso">
          Tutti i servizi configurati sono autorizzati.
        </p>
      )}
    </div>
  );
}

/**
 * Credito residuo e consumo, sotto gli occhi di chi paga il contratto.
 *
 * Il residuo non si chiede al fornitore: si calcola per differenza fra il credito
 * dichiarato caricato e quanto il **nostro** registro ha segnato, che annota ogni
 * centesimo al momento della risposta e non conta ciò che è arrivato dalla cache. Un
 * residuo che non torna con il proprio registro è un problema da vedere, non da nascondere.
 *
 * Quando il credito caricato non è stato dichiarato lo si dice, invece di mostrare un
 * numero che sembrerebbe un residuo e sarebbe soltanto una sottrazione senza minuendo.
 */
function Fornitura({ stato }: { stato: StatoFornitura }) {
  const euro = (c: number): string =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(c / 100);

  const residuo = stato.residuoCentesimi ?? null;
  const consumatoOggi = stato.consumatoOggiCentesimi ?? 0;
  const soglia = stato.creditoCaricatoCentesimi * 0.15;
  const scarso = residuo !== null && residuo <= soglia;

  return (
    <div className="mb-6 rounded-lg border border-bordo bg-superficie p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-testo-debole">Credito residuo</p>
          {residuo === null ? (
            <p className="mt-0.5 text-sm text-testo-tenue">
              Non calcolabile: il credito caricato non è stato dichiarato.
            </p>
          ) : (
            <p className={`tabular mt-0.5 text-2xl font-bold ${scarso ? 'text-critico' : ''}`}>
              {euro(residuo)}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-testo-debole">Consumato oggi</p>
          <p className="tabular mt-0.5 text-lg font-semibold">{euro(consumatoOggi)}</p>
          <p className="text-xs text-testo-debole">tutti gli studi insieme</p>
        </div>
      </div>

      {scarso && (
        <p className="mt-3 border-l-2 border-critico/50 pl-2 text-sm text-critico">
          Credito in esaurimento. Quando finisce si fermano <strong>tutti</strong> gli studi
          contemporaneamente, senza preavviso.
        </p>
      )}

      {(stato.tettoComplessivoCentesimi ?? 0) > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-testo-debole">
          Limite giornaliero della piattaforma {euro(stato.tettoComplessivoCentesimi ?? 0)} · per
          singolo studio {euro(stato.tettoPerStudioCentesimi ?? 0)}
        </p>
      )}
    </div>
  );
}

function Servizio({ servizio }: { servizio: StatoServizioDati }) {
  const autorizzato = servizio.stato === 'autorizzato';

  return (
    <Scheda>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold">
          <span
            className={`mr-2 inline-block ${autorizzato ? 'text-basso' : 'text-attenzione'}`}
            aria-hidden="true"
          >
            {autorizzato ? '●' : '○'}
          </span>
          {servizio.descrizione}
        </h3>
        <span className="tabular text-sm text-testo-tenue">
          {(servizio.costoCentesimi / 100).toFixed(2).replace('.', ',')} € a chiamata
        </span>
      </div>

      <p className={`mt-1 text-sm ${autorizzato ? 'text-testo-tenue' : 'text-attenzione'}`}>
        {servizio.dettaglio}
      </p>

      {!autorizzato && (
        <p className="mt-2 text-xs text-testo-debole">
          Scope da abilitare: <code className="font-mono">{servizio.scope}</code>
        </p>
      )}
    </Scheda>
  );
}
