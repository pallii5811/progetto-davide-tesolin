/**
 * La rotella d'attesa, una sola per tutto il prodotto.
 *
 * ── IL DIFETTO ────────────────────────────────────────────────────────────────
 *
 * Sulla scheda di RED GROUP S.R.L. l'intermediario ha premuto «Analisi approfondita» e per
 * alcuni secondi non è cambiato niente: il server comprava il dato e ricalcolava l'analisi,
 * la pagina restava identica. Ha ricaricato credendo che il tasto non funzionasse. Il tasto
 * funzionava; mancava il segno che stesse lavorando.
 *
 * Un pulsante che tace invita a premerlo di nuovo, e su un pulsante che spende il secondo
 * clic è un secondo acquisto. Per questo la rotella sta su ogni pulsante che fa partire
 * qualcosa, e i pulsanti la prendono tutti da qui: tre forme diverse della stessa attesa
 * insegnerebbero a non riconoscerne nessuna.
 *
 * `aria-hidden`: la rotella è per gli occhi. Chi usa un lettore di schermo riceve l'attesa
 * dal testo o dallo stato del pulsante, che ogni componente dichiara accanto.
 */
export function Rotella({ className = '' }: { className?: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      data-rotella=""
      className={`inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
