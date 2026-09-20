/**
 * Il marchio di AEGIS: lo scudo con dentro i tre punteggi che salgono.
 *
 * Rifatto il 20/09/2026 su richiesta di Simone («cambia il logo che fa cagare e fanne uno al
 * top»). Prima era uno scudo di filo sottile con la spunta: a diciotto pixel il tratto spariva e
 * la spunta si leggeva come «fatto», che è la promessa di un gestionale, non di un'analisi.
 *
 * ── PERCHÉ QUESTO SEGNO ──────────────────────────────────────────────────────
 *
 * Lo scudo resta: è il nome (aegis è l'egida) ed è la cosa che si vende, la protezione. Dentro,
 * al posto della spunta, tre barre che salgono — Property, Business Interruption, Cyber: il
 * prodotto non dice «sei coperto», dice «ecco quanto rischi». Le barre sono **vuoti** ritagliati
 * nello scudo pieno (`fill-rule: evenodd`), non tratti sottili: una forma piena regge la
 * riduzione, un filo no. A diciotto pixel restano tre tacche nette.
 *
 * Un segno solo, in `currentColor`, per la barra laterale del prodotto, la vetrina e l'icona
 * della scheda del browser (app/icon.svg, che porta la stessa geometria).
 */

/*
  La geometria, una volta sola: la scrive anche `app/icon.svg`, e due copie che divergono sono
  due marchi. Riquadro 24 × 24, scudo centrato, barre con la base sulla stessa linea.
*/
export const SEGNO_AEGIS =
  'M12 2.5 L19.5 5.2 A1.2 1.2 0 0 1 20.3 6.35 V11.9 C20.3 16.6 16.9 20.6 12 21.8 ' +
  'C7.1 20.6 3.7 16.6 3.7 11.9 V6.35 A1.2 1.2 0 0 1 4.5 5.2 Z ' +
  'M7.6 15.9 V12.95 Q7.6 12.4 8.15 12.4 H9.45 Q10 12.4 10 12.95 V15.9 Z ' +
  'M10.8 15.9 V11.15 Q10.8 10.6 11.35 10.6 H12.65 Q13.2 10.6 13.2 11.15 V15.9 Z ' +
  'M14 15.9 V9.15 Q14 8.6 14.55 8.6 H15.85 Q16.4 8.6 16.4 9.15 V15.9 Z';

/** Il solo segno, del colore del testo: si mette dove serve, dalla tessera al piè di pagina. */
export function SegnoAegis({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d={SEGNO_AEGIS} fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
}
