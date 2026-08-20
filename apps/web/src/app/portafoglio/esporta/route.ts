import { chiamaApiConSessione } from '@/lib/chiamata-server';

/**
 * Scaricamento del portafoglio in CSV.
 *
 * Un gestore di rotta e non una Server Action: le azioni restituiscono dati a React, non
 * un file al browser. Qui serve una risposta con il proprio tipo e il proprio nome, che il
 * browser salvi invece di mostrare.
 *
 * Passa dal server di Next come ogni altra chiamata — l'indirizzo dell'API non finisce nel
 * bundle e il cookie di sessione viaggia — e **inoltra il filtro** che l'utente sta
 * guardando: si scarica ciò che si vede, non tutto.
 */
export const dynamic = 'force-dynamic';

export async function GET(richiesta: Request): Promise<Response> {
  const filtro = new URL(richiesta.url).searchParams.get('filtro');
  const percorso =
    filtro === null || filtro === ''
      ? '/api/portafoglio/esporta'
      : `/api/portafoglio/esporta?filtro=${encodeURIComponent(filtro)}`;

  const risposta = await chiamaApiConSessione(percorso, { metodo: 'GET' });

  if (!risposta.ok) {
    /*
      Un errore va restituito come testo leggibile, non come un CSV vuoto.

      Un file scaricato con zero righe è la peggiore delle risposte: sembra un portafoglio
      vuoto, e chi lo apre conclude che ha perso i clienti invece che la sessione.
    */
    const messaggio =
      risposta.status === 401
        ? 'Sessione scaduta: rientrare e riprovare.'
        : `Esportazione non riuscita (errore ${risposta.status}).`;
    return new Response(messaggio, {
      status: risposta.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  /*
    I byte passano **intatti**: `arrayBuffer()`, non `text()`.

    `Response.text()` esegue una decodifica UTF-8 che per specifica **rimuove il BOM
    iniziale**. Il BOM è però esattamente ciò che dice a Excel di leggere il file come
    UTF-8: senza, ogni accento di una ragione sociale italiana diventa illeggibile alla
    prima riga. Il difetto non si vedeva in nessuna prova unitaria — l'API lo produceva
    correttamente, e a mangiarlo era questo passaggio intermedio — e sarebbe arrivato al
    broker come «l'esportazione è rotta».

    Tipo e nome del file arrivano dall'API, che è dove sono decisi: ricostruirli qui
    significherebbe due posti da tenere allineati.
  */
  return new Response(await risposta.arrayBuffer(), {
    status: 200,
    headers: {
      'Content-Type': risposta.headers.get('content-type') ?? 'text/csv; charset=utf-8',
      'Content-Disposition':
        risposta.headers.get('content-disposition') ?? 'attachment; filename="portafoglio.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
