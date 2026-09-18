/**
 * La posta in uscita: conferma dell'indirizzo, nuova password, avviso al gestore.
 *
 * Decisione di Simone del 18/09/2026: le email passano da Resend. Nessuna libreria in più —
 * è una sola richiesta HTTP — e nessun invio se la configurazione non è completa: in quel
 * caso il servizio lo dichiara (`attiva: false`) e chi chiama lo dice all'utente invece di
 * fingere di aver spedito qualcosa.
 *
 * Le frasi si **compongono** da frammenti fissi e dai valori (regola 5 del progetto): nessuna
 * email scritta da un modello, nessun testo che il prodotto non sappia di dire.
 *
 * ── L'INDIRIZZO NEI COLLEGAMENTI VIENE SOLO DALLA CONFIGURAZIONE ──────────────
 *
 * Mai dalla richiesta. Se l'origine del collegamento si ricavasse dall'intestazione `Host` o
 * `Origin`, chiunque potrebbe chiedere una nuova password per l'indirizzo di un altro
 * mandando `Host: sito-mio.it`: la vittima riceverebbe dal mittente vero un collegamento
 * verso il sito dell'attaccante, con dentro un codice valido. `AEGIS_INDIRIZZO_PUBBLICO` è
 * scritto da chi installa, e basta.
 */

export interface MessaggioEmail {
  readonly a: string;
  readonly oggetto: string;
  readonly testo: string;
  readonly html: string;
}

export interface ServizioPosta {
  /** Vero solo con chiave, mittente e indirizzo pubblico tutti presenti e validi. */
  readonly attiva: boolean;
  /** L'origine del sito per i collegamenti (es. https://aegis.esempio.it), mai ricavata dalla richiesta. */
  readonly indirizzoPubblico: string | null;
  /** A chi avvisare quando uno studio si registra: facoltativo. */
  readonly avvisiGestore: string | null;
  invia(messaggio: MessaggioEmail): Promise<void>;
}

/** L'origine pubblica, solo https (o http su localhost, per lo sviluppo), senza percorso. */
export function origineValida(valore: string | undefined): string | null {
  if (valore === undefined || valore.trim() === '') return null;
  try {
    const url = new URL(valore.trim());
    const locale = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && locale)) return null;
    if (url.username !== '' || url.password !== '') return null;
    return url.origin;
  } catch {
    return null;
  }
}

const EMAIL_SEMPLICE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/**
 * La posta come la descrive l'ambiente.
 *
 *   RESEND_API_KEY            la chiave di Resend
 *   AEGIS_EMAIL_MITTENTE      «AEGIS <accesso@dominio-verificato.it>»: il dominio va verificato su Resend
 *   AEGIS_INDIRIZZO_PUBBLICO  l'origine del sito, per i collegamenti nelle email
 *   AEGIS_EMAIL_AVVISI        facoltativo: chi avvisare quando uno studio si registra
 */
export function postaDaAmbiente(ambiente: NodeJS.ProcessEnv = process.env): ServizioPosta {
  const chiave = ambiente['RESEND_API_KEY']?.trim() ?? '';
  const mittente = ambiente['AEGIS_EMAIL_MITTENTE']?.trim() ?? '';
  const indirizzoPubblico = origineValida(ambiente['AEGIS_INDIRIZZO_PUBBLICO']);
  const avvisi = ambiente['AEGIS_EMAIL_AVVISI']?.trim() ?? '';
  const attiva = chiave !== '' && mittente !== '' && indirizzoPubblico !== null;

  return {
    attiva,
    indirizzoPubblico,
    avvisiGestore: EMAIL_SEMPLICE.test(avvisi) ? avvisi : null,
    async invia(messaggio: MessaggioEmail): Promise<void> {
      if (!attiva) throw new Error('Posta non configurata');
      const risposta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: mittente,
          to: [messaggio.a],
          subject: messaggio.oggetto,
          text: messaggio.testo,
          html: messaggio.html,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!risposta.ok) {
        // Il corpo di Resend dice il motivo (dominio non verificato, chiave errata): serve nei
        // log a chi installa. Non contiene la chiave, e non arriva mai all'utente.
        const dettaglio = await risposta.text().catch(() => '');
        throw new Error(`Invio non riuscito (${risposta.status}): ${dettaglio.slice(0, 300)}`);
      }
    },
  };
}

/** Posta finta per i test: raccoglie i messaggi invece di spedirli. */
export class PostaDiProva implements ServizioPosta {
  readonly attiva: boolean;
  readonly indirizzoPubblico: string | null;
  readonly avvisiGestore: string | null;
  readonly inviati: MessaggioEmail[] = [];

  constructor(
    opzioni: { attiva?: boolean; indirizzoPubblico?: string; avvisiGestore?: string | null } = {},
  ) {
    this.attiva = opzioni.attiva ?? true;
    this.indirizzoPubblico = this.attiva ? (opzioni.indirizzoPubblico ?? 'https://aegis.esempio.it') : null;
    this.avvisiGestore = opzioni.avvisiGestore ?? null;
  }

  invia(messaggio: MessaggioEmail): Promise<void> {
    if (!this.attiva) return Promise.reject(new Error('Posta non configurata'));
    this.inviati.push(messaggio);
    return Promise.resolve();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// I messaggi, composti da frammenti fissi
// ─────────────────────────────────────────────────────────────────────────────

/** Il testo che arriva dall'utente (nome, denominazione) non entra mai nell'HTML senza escape. */
export function escapeHtml(testo: string): string {
  return testo
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Un nome dentro un'email di testo: senza a capo, che in un'intestazione o in una riga cambierebbero il senso. */
function inRiga(testo: string): string {
  return testo.replace(/[\r\n\t]+/g, ' ').trim();
}

function impagina(
  paragrafi: readonly string[],
  pulsante: { testo: string; collegamento: string } | null,
): string {
  const corpo = paragrafi.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join('');
  const bottone =
    pulsante === null
      ? ''
      : `<p style="margin:24px 0"><a href="${escapeHtml(pulsante.collegamento)}" style="display:inline-block;background:#111318;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">${escapeHtml(pulsante.testo)}</a></p>` +
        `<p style="margin:0 0 16px;color:#5b606b;font-size:13px">Se il pulsante non funziona, copia questo indirizzo nel browser:<br>${escapeHtml(pulsante.collegamento)}</p>`;
  return (
    '<!doctype html><html lang="it"><body style="margin:0;background:#f7f6f3;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111318;font-size:15px;line-height:1.55">' +
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e6e3dc;border-radius:16px;padding:32px">' +
    '<p style="margin:0 0 24px;font-weight:700;letter-spacing:-0.02em;font-size:18px">AEGIS</p>' +
    corpo +
    bottone +
    '</div></body></html>'
  );
}

/*
  Nessun testo scelto da chi si registra, nelle email che partono verso un indirizzo non ancora
  confermato: il saluto è fisso. Dalla revisione di sicurezza del 18/09/2026 — con il nome nel
  saluto, chiunque poteva registrare l'indirizzo di un altro con un «nome» come «il tuo
  abbonamento si rinnova oggi, annulla su …» e farlo spedire dal nostro mittente autenticato,
  tre volte l'ora. L'escape dell'HTML non basta: un indirizzo web in chiaro i programmi di posta
  lo rendono cliccabile lo stesso.
*/

export function emailConfermaIndirizzo(dati: {
  readonly a: string;
  readonly collegamento: string;
}): MessaggioEmail {
  return {
    a: dati.a,
    oggetto: 'Conferma il tuo indirizzo · AEGIS',
    testo:
      'Ciao,\n\n' +
      'qualcuno ha creato un account su AEGIS con questo indirizzo. Se sei stato tu, apri il ' +
      'collegamento qui sotto e premi «Conferma il mio indirizzo». Vale 48 ore.\n\n' +
      `${dati.collegamento}\n\n` +
      'Se non sei stato tu, ignora questa email: senza conferma lo studio non viene attivato.\n',
    html: impagina(
      [
        'Ciao,',
        'qualcuno ha creato un account su AEGIS con questo indirizzo. Se sei stato tu, apri il collegamento e premi «Conferma il mio indirizzo». Vale 48 ore.',
        'Se non sei stato tu, ignora questa email: senza conferma lo studio non viene attivato.',
      ],
      { testo: 'Apri la conferma', collegamento: dati.collegamento },
    ),
  };
}

export function emailNuovaPassword(dati: {
  readonly a: string;
  readonly collegamento: string;
}): MessaggioEmail {
  return {
    a: dati.a,
    oggetto: 'Scegli una nuova password · AEGIS',
    testo:
      'Ciao,\n\n' +
      'abbiamo ricevuto una richiesta di nuova password per il tuo account AEGIS. Per sceglierla apri ' +
      'il collegamento qui sotto: vale 60 minuti e una volta sola.\n\n' +
      `${dati.collegamento}\n\n` +
      'Se non l’hai chiesta tu, ignora questa email: la tua password resta quella di prima.\n',
    html: impagina(
      [
        'Ciao,',
        'abbiamo ricevuto una richiesta di nuova password per il tuo account AEGIS. Il collegamento vale 60 minuti e una volta sola.',
        'Se non l’hai chiesta tu, ignora questa email: la tua password resta quella di prima.',
      ],
      { testo: 'Scegli una nuova password', collegamento: dati.collegamento },
    ),
  };
}

export function emailNuovoStudioPerGestore(dati: {
  readonly a: string;
  readonly denominazione: string;
  readonly numeroRui: string;
  readonly referente: string;
  readonly email: string;
  readonly collegamento: string | null;
}): MessaggioEmail {
  const denominazione = inRiga(dati.denominazione);
  const referente = inRiga(dati.referente);
  const righe = [
    `Studio: ${denominazione}`,
    `RUI: ${dati.numeroRui}`,
    `Referente: ${referente} <${dati.email}>`,
  ];
  return {
    a: dati.a,
    oggetto: `Nuovo studio registrato: ${denominazione} · AEGIS`,
    testo:
      'Uno studio si è registrato su AEGIS. Può già entrare; gli acquisti di dati restano bloccati ' +
      'finché non lo attivi da Impostazioni › Studi.\n\n' +
      righe.join('\n') +
      '\n\nPrima di attivarlo, verifica il RUI sul registro IVASS.\n' +
      (dati.collegamento === null ? '' : `\n${dati.collegamento}\n`),
    html: impagina(
      [
        'Uno studio si è registrato su AEGIS. Può già entrare; gli acquisti di dati restano bloccati finché non lo attivi da Impostazioni › Studi.',
        righe.map(escapeHtml).join('<br>'),
        'Prima di attivarlo, verifica il RUI sul registro IVASS.',
      ],
      dati.collegamento === null
        ? null
        : { testo: 'Apri Impostazioni › Studi', collegamento: dati.collegamento },
    ),
  };
}
