/**
 * Altman Z''-score.
 *
 * Variante a quattro variabili per imprese **non quotate**: rispetto allo Z' non usa il
 * rapporto ricavi/attivo, che è la variabile più sensibile al settore, ed è quella
 * praticabile sulla stragrande maggioranza delle PMI italiane.
 *
 * Si è scelta deliberatamente una formula **pubblicata e verificabile** invece di un
 * modello proprietario opaco. Uno score che il cliente può ricalcolare a mano è uno
 * score che il cliente può contestare — ed è precisamente ciò che lo rende difendibile
 * davanti a un tribunale o a un'autorità di vigilanza.
 *
 * ## Perché il riferimento è cambiato
 *
 * Diceva «per imprese non quotate e **non manifatturiere**», e la scheda lo stampava
 * sotto lo Z'' di un'impresa manifatturiera — l'azienda dimostrativa lo è, ATECO 25.62,
 * cioè proprio la schermata che si mostra al cliente. Il modello si può usare lì, ma la
 * frase come stava affermava il contrario di ciò che il lettore aveva davanti: una
 * contraddizione fra due righe della stessa scheda.
 *
 * Ora il riferimento dice ciò che il modello è, e il limite di calibrazione compare come
 * riserva dichiarata quando l'impresa è manifatturiera — non come esclusione.
 */

import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import { Money } from '../shared/money.js';
import type { BilancioRiclassificato } from '../company/financials.js';
import type { FormaGiuridica } from '../company/profile.js';
import { normaRiduzioneCapitalePerPerdite } from '../governance/norme.js';

export type AltmanZone = 'sicurezza' | 'incertezza' | 'rischio';

export interface AltmanResult {
  readonly z: number;
  readonly zone: AltmanZone;
  readonly x1: number;
  readonly x2: number;
  readonly x3: number;
  readonly x4: number;
}

export const ALTMAN_COEFFICIENTS = {
  x1: 6.56,
  x2: 3.26,
  x3: 6.72,
  x4: 1.05,
} as const;

export const ALTMAN_SOGLIA_SICUREZZA = 2.6;
export const ALTMAN_SOGLIA_RISCHIO = 1.1;

export const ALTMAN_ZONE_LABEL: Readonly<Record<AltmanZone, string>> = {
  sicurezza: 'Zona di sicurezza',
  incertezza: 'Zona di incertezza',
  rischio: 'Zona di rischio di insolvenza',
};

/**
 * Ciò che serve sapere dell'impresa per non dire il falso accanto al numero.
 *
 * È facoltativo: senza, il calcolo è identico e le affermazioni si degradano a quello che
 * si sa davvero — nessuna riserva settoriale, ed entrambe le discipline sulla riduzione
 * del capitale nominate invece di sceglierne una a caso.
 */
export interface ContestoAltman {
  readonly formaGiuridica: FormaGiuridica;
  /** Sezione ATECO. `C` è la manifattura, l'unica su cui il modello porta una riserva. */
  readonly atecoSezione: string | null;
}

/** Sezione ATECO della manifattura: divisioni 10-33. */
const SEZIONE_MANIFATTURIERA = 'C';

export function computeAltmanZ(
  b: BilancioRiclassificato,
  contesto?: ContestoAltman,
): Explained<AltmanResult | null> {
  const { sp, ce } = b;

  const manifatturiera = contesto?.atecoSezione === SEZIONE_MANIFATTURIERA;

  const builder = explain("Altman Z''-score")
    .formula("Z'' = 6,56·X1 + 3,26·X2 + 6,72·X3 + 1,05·X4")
    .reference("Altman, E. I. — modello Z''-score a quattro variabili per imprese non quotate");

  if (!Money.isPositive(sp.totaleAttivo)) {
    return builder
      .note('Totale attivo nullo o negativo: lo Z-score non è calcolabile.')
      .confidence('bassa')
      .value(null);
  }

  const totaleAttivo = sp.totaleAttivo;

  // X1 — capitale circolante netto sul totale attivo: tensione di liquidità.
  const x1 = sp.capitaleCircolanteNetto / totaleAttivo;

  // X2 — utili accumulati sul totale attivo: capacità storica di autofinanziamento.
  // Proxy: riserve + utili portati a nuovo (il bilancio abbreviato non isola le riserve di utili).
  const utiliAccumulati = Money.add(b.origine.passivo.riserve, b.origine.passivo.utiliPortatiANuovo);
  const x2 = utiliAccumulati / totaleAttivo;

  // X3 — redditività operativa sul capitale investito.
  const x3 = ce.ebit / totaleAttivo;

  // X4 — mezzi propri su mezzi di terzi: cuscinetto patrimoniale.
  const x4 = Money.isPositive(sp.totaleDebiti) ? sp.patrimonioNetto / sp.totaleDebiti : 4;

  const z =
    ALTMAN_COEFFICIENTS.x1 * x1 +
    ALTMAN_COEFFICIENTS.x2 * x2 +
    ALTMAN_COEFFICIENTS.x3 * x3 +
    ALTMAN_COEFFICIENTS.x4 * x4;

  const zone: AltmanZone =
    z > ALTMAN_SOGLIA_SICUREZZA ? 'sicurezza' : z < ALTMAN_SOGLIA_RISCHIO ? 'rischio' : 'incertezza';

  return (
    builder
      .input('X1 — CCN / Totale attivo', formatRatio(x1))
      .input('X2 — Utili accumulati / Totale attivo', formatRatio(x2))
      .input('X3 — EBIT / Totale attivo', formatRatio(x3))
      .input('X4 — Patrimonio netto / Totale debiti', formatRatio(x4))
      .input('Esercizio', String(b.anno))
      // `toFixed` scrive il punto decimale inglese, e questo file scrive già «4,00» a mano
      // due note più giù: il documento sarebbe uscito con le due convenzioni mescolate.
      .note(`Z'' = ${formatDue(z)} → ${ALTMAN_ZONE_LABEL[zone]}.`)
      .note(
        `Soglie: > ${formatDue(ALTMAN_SOGLIA_SICUREZZA)} sicurezza · ` +
          `${formatDue(ALTMAN_SOGLIA_RISCHIO)}–${formatDue(ALTMAN_SOGLIA_SICUREZZA)} incertezza · ` +
          `< ${formatDue(ALTMAN_SOGLIA_RISCHIO)} rischio.`,
      )
      .noteIf(
        !Money.isPositive(sp.totaleDebiti),
        'Assenza di debiti: X4 posto convenzionalmente a 4,00 per evitare la divisione per zero.',
      )
      /*
      La riserva settoriale, dichiarata invece che nascosta.

      Il modello a quattro variabili nasce per ridurre l'effetto di settore, ma la sua
      calibrazione originaria non è su campioni manifatturieri: su una manifattura le
      soglie restano indicative. Dirlo costa una riga; tacerlo lasciava che una zona
      Altman fosse letta come un verdetto.
    */
      .noteIf(
        manifatturiera,
        "Impresa manifatturiera (sezione ATECO C): il modello Z'' a quattro variabili esclude il " +
          'rapporto ricavi/attivo proprio per ridurre l’effetto di settore, ma la sua calibrazione ' +
          'originaria non è su campioni manifatturieri. Le soglie qui vanno lette come indicative.',
      )
      .confidence(manifatturiera ? 'media' : 'alta')
      .noteIf(
        !Money.isPositive(sp.patrimonioNetto),
        `Patrimonio netto negativo: la società è in perdita di capitale, verificare ${normaCapitale(contesto)}.`,
      )
      .value({ z, zone, x1, x2, x3, x4 })
  );
}

/**
 * La disciplina sulla riduzione del capitale per perdite da citare a questa impresa.
 *
 * Erano gli artt. 2482-bis/ter — norme della **S.r.l.** — citati a chiunque, S.p.A.
 * comprese: nello stesso prodotto due file citavano incondizionatamente le norme di due
 * forme opposte. Senza forma giuridica nota non si sceglie: si nominano entrambe, che è
 * l'unica affermazione vera quando la fonte non dice quale delle due valga.
 */
function normaCapitale(contesto: ContestoAltman | undefined): string {
  if (contesto === undefined) {
    return (
      'la disciplina sulla riduzione del capitale per perdite (artt. 2446-2447 c.c. per la S.p.A., ' +
      'artt. 2482-bis e 2482-ter c.c. per la S.r.l.)'
    );
  }

  const norma = normaRiduzioneCapitalePerPerdite(contesto.formaGiuridica);
  return (
    norma ??
    // Società di persone e ditta individuale: nessun capitale minimo da ricostituire, e
    // la perdita arriva direttamente al patrimonio di chi risponde.
    'l’esposizione del patrimonio personale dei soci, che in questa forma risponde delle ' +
      'obbligazioni sociali'
  );
}

function formatRatio(value: number): string {
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(
    value,
  );
}

/** Lo Z'' e le sue soglie: due decimali, separatore italiano come tutto il resto. */
function formatDue(value: number): string {
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  );
}

/**
 * Converte lo Z'' in un punteggio 0–100 con andamento monotono, per poterlo comporre
 * con gli altri fattori dello score. La mappatura è lineare a tratti sulle soglie del modello.
 */
export function altmanToScore(z: number): number {
  if (z <= 0) return 0;
  if (z < ALTMAN_SOGLIA_RISCHIO) return (z / ALTMAN_SOGLIA_RISCHIO) * 30;
  if (z < ALTMAN_SOGLIA_SICUREZZA) {
    return 30 + ((z - ALTMAN_SOGLIA_RISCHIO) / (ALTMAN_SOGLIA_SICUREZZA - ALTMAN_SOGLIA_RISCHIO)) * 45;
  }
  // Oltre la soglia di sicurezza la curva si appiattisce: da 75 a 100, saturando a Z'' = 8.
  return Math.min(100, 75 + ((z - ALTMAN_SOGLIA_SICUREZZA) / (8 - ALTMAN_SOGLIA_SICUREZZA)) * 25);
}
