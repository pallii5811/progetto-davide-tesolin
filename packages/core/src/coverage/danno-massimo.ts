/**
 * Danno massimo possibile e danno massimo probabile.
 *
 * È il ragionamento con cui un assicuratore dimensiona davvero una copertura incendio, e
 * quello che distingue una proposta fatta da chi conosce il mestiere.
 *
 * - Il **danno massimo possibile** è lo scenario in cui tutto va perduto: nessuna
 *   protezione funziona, il fuoco si propaga a tutto. Coincide con il valore dei beni.
 * - Il **danno massimo probabile** è ciò che ragionevolmente accade in un sinistro grave:
 *   le protezioni passive — muri e porte tagliafuoco — tengono, perché sono strutture e
 *   non dispositivi, mentre di quelle attive si dà credito prudente.
 *
 * Perché conta, concretamente. Quando il danno probabile è molto sotto il valore intero,
 * una polizza a primo rischio assoluto dimensionata su di esso protegge in pratica
 * quanto una a valore intero, costa meno, e — questo è il punto che nessuno spiega al
 * cliente — **non è soggetta alla regola proporzionale dell'art. 1907 c.c.**
 *
 * Per una PMI che non sa quanto valgono davvero i propri beni, e che quindi dichiarerà un
 * numero approssimato, il primo rischio assoluto è spesso la scelta migliore: non perché
 * copra di più, ma perché toglie di mezzo il meccanismo che al sinistro punisce la stima
 * sbagliata. È una decisione del cliente, non del motore: qui si mette in condizione di
 * prenderla.
 */

import { Money } from '../shared/money.js';
import type { Money as Euro } from '../shared/money.js';
import { explain } from '../shared/explain.js';
import type { Explained } from '../shared/explain.js';
import type { CompanyFacts } from '../company/facts.js';
import type { ImmobileDichiarato } from '../company/profile.js';
import { RAGGIO_COMPLESSO_METRI } from '../company/ubicazioni.js';
import type { AnalisiUbicazioni } from '../company/ubicazioni.js';

export type FormaConsigliata = 'valore-intero' | 'primo-rischio-assoluto';

export interface DannoMassimo {
  /** Perdita totale: nessuna protezione regge. Coincide con il valore dei beni. */
  readonly possibile: Euro;
  /** Perdita attesa in un sinistro grave, tenuto conto delle protezioni accertate. */
  readonly probabile: Euro;
  /** Quota del valore, da 0 a 1. */
  readonly quota: number;
  readonly forma: FormaConsigliata;
  readonly motivazioneForma: string;
  /** Cosa chiedere al cliente per stimare meglio, in ordine di impatto. */
  readonly domandeCheAbbassanoLaStima: readonly string[];
}

/**
 * Quota di partenza per classe di combustibilità, dedotta dall'attività.
 *
 * Non è un'invenzione: le classi di rischio incendio per settore sono la base con cui le
 * compagnie assumono. Un deposito di legname o di plastiche brucia per intero; un'officina
 * meccanica ha carico d'incendio basso e il danno si ferma prima.
 *
 * In assenza di ATECO si applica la quota più alta: non sapere che attività si assicura
 * non è una ragione per essere ottimisti.
 */
function quotaBase(divisioneAteco: string | null): { quota: number; motivo: string } {
  if (divisioneAteco === null) {
    return { quota: 1, motivo: 'Attività non nota: si assume la perdita totale.' };
  }

  const divisione = Number(divisioneAteco);

  // Legno, carta, plastica, gomma, tessile, mobili: carico d'incendio elevato,
  // propagazione rapida, danno che tende al totale.
  if ([13, 14, 15, 16, 17, 18, 20, 22, 31].includes(divisione)) {
    return {
      quota: 0.9,
      motivo: 'Materiali ad alto carico d’incendio (legno, carta, plastica, tessile): il fuoco tende a distruggere l’intero contenuto.',
    };
  }

  // Chimica, farmaceutica, raffinazione: carico elevato e rischio di esplosione.
  if ([19, 21].includes(divisione)) {
    return {
      quota: 0.95,
      motivo: 'Lavorazioni chimiche: al carico d’incendio si somma il rischio di esplosione, che vanifica la compartimentazione.',
    };
  }

  // Alimentare, bevande: carico medio, presenza di celle e impianti.
  if ([10, 11].includes(divisione)) {
    return { quota: 0.75, motivo: 'Lavorazione alimentare: carico d’incendio medio.' };
  }

  // Logistica e magazzinaggio: dipende dalla merce, ma i valori sono concentrati e
  // impilati in altezza, il che favorisce la propagazione.
  if ([52, 53].includes(divisione)) {
    return {
      quota: 0.85,
      motivo: 'Magazzinaggio: valori concentrati e stoccaggio in altezza favoriscono la propagazione.',
    };
  }

  // Metallurgia, meccanica, elettronica: carico d'incendio contenuto.
  if (divisione >= 24 && divisione <= 30) {
    return {
      quota: 0.6,
      motivo: 'Lavorazioni metalmeccaniche: carico d’incendio contenuto, propagazione più lenta.',
    };
  }

  // Uffici, commercio, servizi.
  if (divisione >= 45 && divisione <= 99) {
    return { quota: 0.7, motivo: 'Attività commerciale o di servizi: carico d’incendio moderato.' };
  }

  return { quota: 0.8, motivo: 'Settore senza classe di combustibilità specifica: stima prudenziale.' };
}

/**
 * La quota non scende mai sotto un terzo del valore.
 *
 * Nessuna protezione è certa: le porte tagliafuoco si trovano bloccate aperte, gli
 * sprinkler non partono, i muri hanno passaggi impiantistici non sigillati. Un modello che
 * arrivasse al 10% produrrebbe capitali che al sinistro non bastano — e la responsabilità
 * di quel numero sarebbe dell'intermediario che l'ha proposto.
 */
const QUOTA_MINIMA = 0.35;

/** Sotto questa quota il primo rischio assoluto diventa un'alternativa da presentare. */
const SOGLIA_PRIMO_RISCHIO = 0.65;

export function stimaDannoMassimo(
  valoreBeni: Euro | null,
  facts: CompanyFacts,
  immobili: readonly ImmobileDichiarato[],
  ubicazioni: AnalisiUbicazioni | null = null,
): Explained<DannoMassimo | null> {
  const costruttore = explain('Danno massimo probabile')
    .reference('Prassi assuntiva rami elementari — EML / Estimated Maximum Loss')
    .reference('Art. 1907 c.c. — non si applica al primo rischio assoluto');

  if (valoreBeni === null || !Money.isPositive(valoreBeni)) {
    return costruttore
      .note('Il valore dei beni non è quantificabile: senza di esso il danno massimo non ha base di calcolo.')
      .confidence('bassa')
      .value<DannoMassimo | null>(null);
  }

  const base = quotaBase(facts.atecoDivisione);
  let quota = base.quota;

  costruttore
    .formula('Valore dei beni × quota di danno probabile')
    .input('Valore dei beni', Money.format(valoreBeni))
    .input('Quota di partenza (settore)', `${Math.round(base.quota * 100)}%`)
    .note(base.motivo);

  const domande: string[] = [];

  // ── Protezione passiva: è struttura, non dispositivo, e regge ────────────────
  const compartimentata = anyDichiarato(immobili.map((i) => i.compartimentazioneRei));
  if (compartimentata === true) {
    quota *= 0.55;
    costruttore.note(
      'Compartimentazione REI dichiarata: l’incendio resta confinato nel compartimento di origine. È la protezione che incide di più, perché è struttura e non dipende da un dispositivo che deve attivarsi.',
    );
  } else if (compartimentata === null) {
    domande.push(
      'I fabbricati hanno compartimentazione antincendio (muri e porte REI)? È la domanda che più abbassa il danno probabile, e con esso il capitale da assicurare.',
    );
    costruttore.note(
      'Compartimentazione non nota: si stima sul valore intero. Non è prudenza formale — non c’è nulla che dica il contrario.',
    );
  } else {
    costruttore.note('Compartimentazione assente: nulla ferma la propagazione fra le aree.');
  }

  // ── Protezione attiva: credito prudente, perché deve funzionare ──────────────
  const sprinkler = anyDichiarato(immobili.map((i) => i.impiantoSprinkler));
  if (sprinkler === true) {
    quota *= 0.7;
    costruttore.note(
      'Impianto di estinzione automatica: agisce senza che nessuno sia presente. Il credito è prudente perché un impianto può non entrare in funzione.',
    );
  } else if (sprinkler === null) {
    domande.push('È presente un impianto sprinkler o altra estinzione automatica?');
  }

  /*
    Concentrazione: un solo corpo di fabbrica non ha nulla da salvare.

    Il conteggio degli immobili non basta a dirlo. Due capannoni contigui sono un unico
    complesso — l'incendio passa dall'uno all'altro — mentre due stabilimenti in province
    diverse non lo sono, e trattarli come tali gonfia il capitale del quindici per cento
    su valori che nessun singolo evento può raggiungere insieme. Quando le coordinate ci
    sono, la contiguità si misura invece di dedurla dal numero di righe.
  */
  const unicaUbicazione =
    ubicazioni !== null && ubicazioni.ubicazioni.length > 0
      ? ubicazioni.unicoComplesso
      : immobili.length <= 1 && (facts.numeroUnitaLocali ?? 1) <= 1;

  if (unicaUbicazione) {
    quota = Math.min(1, quota * 1.15);
    costruttore.note(
      ubicazioni !== null && ubicazioni.ubicazioni.length > 1
        ? `Le ${ubicazioni.ubicazioni.length} ubicazioni note sorgono entro ${RAGGIO_COMPLESSO_METRI} m l'una dall'altra: un unico sinistro può raggiungerle tutte.`
        : 'Valori concentrati in un’unica ubicazione: non esiste una parte del patrimonio che il sinistro non possa raggiungere.',
    );
  } else if (ubicazioni !== null && ubicazioni.complessiIncendio.length > 1) {
    costruttore.note(
      `Valori distribuiti su ${ubicazioni.complessiIncendio.length} complessi separati${
        ubicazioni.distanzaMassimaKm === null ? '' : ` (fino a ${ubicazioni.distanzaMassimaKm} km di distanza)`
      }: il danno massimo non li comprende tutti.`,
    );
  }

  if (immobili.length === 0) {
    domande.push(
      'Quanti sono i fabbricati e come sono distribuiti i valori? Ubicazioni separate riducono il danno massimo.',
    );
  }

  const quotaFinale = Math.max(QUOTA_MINIMA, Math.min(1, quota));
  if (quotaFinale > quota) {
    costruttore.note(
      `Quota portata al minimo del ${Math.round(QUOTA_MINIMA * 100)}%: nessuna protezione è certa, e un capitale stimato più in basso al sinistro non basterebbe.`,
    );
  }

  const probabile = Money.commercialRoundUp(Money.multiply(valoreBeni, quotaFinale));
  const forma: FormaConsigliata =
    quotaFinale <= SOGLIA_PRIMO_RISCHIO ? 'primo-rischio-assoluto' : 'valore-intero';

  costruttore
    .input('Quota di danno probabile', `${Math.round(quotaFinale * 100)}%`)
    .noteIf(
      domande.length > 0,
      'La stima migliora con i dati raccolti in intervista: finché mancano, resta prudenziale.',
    )
    // La confidenza segue ciò che si sa davvero: dichiarare un capitale più basso
    // basandosi su protezioni mai accertate sposta il rischio sull'intermediario.
    .confidence(domande.length === 0 ? 'alta' : domande.length === 1 ? 'media' : 'bassa');

  return costruttore.value<DannoMassimo | null>({
    possibile: valoreBeni,
    probabile,
    quota: quotaFinale,
    forma,
    motivazioneForma: motivazioneForma(forma, valoreBeni, probabile, quotaFinale),
    domandeCheAbbassanoLaStima: domande,
  });
}

function motivazioneForma(
  forma: FormaConsigliata,
  possibile: Euro,
  probabile: Euro,
  quota: number,
): string {
  if (forma === 'valore-intero') {
    return (
      `Il danno probabile è il ${Math.round(quota * 100)}% del valore: troppo vicino al totale perché ` +
      'una formula a primo rischio porti un vantaggio reale. Si assicura a valore intero, e la somma ' +
      'assicurata va tenuta allineata al valore effettivo — è su quella che opera la regola proporzionale.'
    );
  }

  return (
    `Il danno probabile si ferma al ${Math.round(quota * 100)}% del valore (${Money.formatCompact(probabile)} ` +
    `su ${Money.formatCompact(possibile)}). Una polizza a primo rischio assoluto su questo capitale protegge ` +
    'in pratica quanto una a valore intero e costa meno, ma soprattutto non è soggetta alla regola ' +
    'proporzionale: se la stima dei beni è approssimata — e per una PMI lo è quasi sempre — al sinistro ' +
    'non subisce la riduzione dell’art. 1907 c.c. In cambio, una perdita che superasse quel capitale ' +
    'resterebbe scoperta per l’eccedenza: è una scelta che spetta al cliente, messo davanti a entrambi i lati.'
  );
}

/** Vero se qualcuno l'ha dichiarato, falso se tutti l'hanno negato, `null` se non si sa. */
function anyDichiarato(valori: readonly (boolean | null)[]): boolean | null {
  const noti = valori.filter((v): v is boolean => v !== null);
  if (noti.length === 0) return null;
  return noti.some((v) => v);
}
