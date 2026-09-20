/**
 * Un punteggio da 1 a 7 come un cerchio che si riempie, dal verde al rosso.
 *
 * Richiesta di Simone del 18/09/2026, sulla slide di Luca: ogni rischio con il suo cerchio, al
 * posto delle tabelle di voci, pesi e contributi. Il numero sta al centro, com'è uscito dal
 * motore — intero quando lo è, altrimenti al centesimo: «5,67», non «6».
 *
 * Senza punteggio il cerchio resta grigio e vuoto e al centro c'è «n.d.»: un cerchio riempito
 * per un settimo direbbe «rischio minimo», che è un'affermazione, non un'assenza.
 *
 * Nessun gancio né stato: si disegna uguale sul server e nel browser. La lunghezza dell'arco è
 * arrotondata al centesimo per la stessa ragione delle lancette del popup — un attributo che
 * differisce all'ultima cifra fra Node e Chrome è un errore di idratazione in console.
 */

const RAGGIO = 52;
const CIRCONFERENZA = Math.round(2 * Math.PI * RAGGIO * 100) / 100;

/**
 * Con la virgola, come il resto della scheda: interi senza decimali, gli altri al centesimo.
 *
 * `decimali` quando il motore arrotonda diversamente: il Cyber esce a un decimale, e scritto
 * «5,10» nel cerchio contraddirebbe il «5,1 su 7» del riquadro in testa alla pagina.
 */
export function punteggioIt(valore: number, decimali?: number): string {
  const cifre = decimali ?? (Number.isInteger(valore) ? 0 : 2);
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: cifre,
    maximumFractionDigits: cifre,
  }).format(valore);
}

/** Il colore della scala di gravità del tema: segue anche il tema scuro. */
function colore(valore: number): string {
  if (valore < 2.5) return 'var(--color-basso)';
  if (valore < 3.5) return 'var(--color-moderato)';
  if (valore < 4.5) return 'var(--color-rilevante)';
  if (valore < 5.5) return 'var(--color-alto)';
  return 'var(--color-critico)';
}

export function Cerchio({
  valore,
  etichetta,
  grande = false,
  piccolo = false,
  decimali,
}: {
  valore: number | null;
  /** Il nome del rischio: lo legge chi usa un lettore di schermo, insieme al punteggio. */
  etichetta: string;
  grande?: boolean;
  /**
   * La misura da elenco, per il CRM (19/09/2026): il numero resta leggibile, «su 7» sparisce —
   * in una riga con tre cerchi affiancati la scala la dice l'intestazione della colonna.
   */
  piccolo?: boolean;
  decimali?: number;
}) {
  const limitato = valore === null ? null : Math.min(7, Math.max(0, valore));
  const pieno = limitato === null ? 0 : Math.round(((CIRCONFERENZA * limitato) / 7) * 100) / 100;

  return (
    <svg
      viewBox="0 0 128 128"
      role="img"
      aria-label={
        valore === null
          ? `${etichetta}: non calcolabile`
          : `${etichetta}: ${punteggioIt(valore, decimali)} su 7`
      }
      className={grande ? 'h-36 w-36 shrink-0' : piccolo ? 'h-12 w-12 shrink-0' : 'h-20 w-20 shrink-0'}
    >
      <circle
        cx="64"
        cy="64"
        r={RAGGIO}
        fill="none"
        strokeWidth={piccolo ? 14 : 12}
        className="stroke-bordo"
      />
      {limitato !== null && (
        <circle
          cx="64"
          cy="64"
          r={RAGGIO}
          fill="none"
          strokeWidth={piccolo ? 14 : 12}
          strokeLinecap="round"
          strokeDasharray={`${pieno} ${CIRCONFERENZA}`}
          transform="rotate(-90 64 64)"
          style={{ stroke: colore(limitato) }}
        />
      )}
      <text
        x="64"
        y={piccolo ? 78 : valore === null ? 70 : 68}
        textAnchor="middle"
        className={`fill-testo font-semibold ${grande ? 'text-[30px]' : piccolo ? 'text-[42px]' : 'text-[32px]'}`}
      >
        {valore === null ? 'n.d.' : punteggioIt(valore, decimali)}
      </text>
      {valore !== null && !piccolo && (
        <text x="64" y="90" textAnchor="middle" className="fill-testo-tenue text-[14px]">
          su 7
        </text>
      )}
    </svg>
  );
}
