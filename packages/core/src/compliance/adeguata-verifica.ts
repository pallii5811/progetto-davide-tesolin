/**
 * Adeguata verifica della clientela: candidati, non verdetti.
 *
 * ── L'OBBLIGO ─────────────────────────────────────────────────────────────────
 *
 * Il D.Lgs. 231/2007 impone all'intermediario assicurativo, prima di instaurare un
 * rapporto continuativo, di identificare il cliente e i suoi titolari effettivi e di
 * verificarli contro le liste di sanzioni e le persone politicamente esposte. Non è un
 * miglioramento dell'analisi: è una condizione per lavorare, e la sua assenza è
 * contestabile in ispezione a prescindere da come sia andata la polizza.
 *
 * AEGIS il titolare effettivo lo ricava già dai soci che ha comprato — `titolare-effettivo.ts` —
 * e quindi sa **chi** va verificato senza spendere un euro in più. Qui si aggiunge il
 * confronto con le liste, e soprattutto il modo di leggerlo.
 *
 * ── PERCHÉ IL SERVIZIO NON PUÒ DARE UN VERDETTO ──────────────────────────────
 *
 * La fonte cerca per nome e restituisce **candidati**. Sulla prima chiamata vera, con un
 * nome solo, sono tornate due persone distinte: una nata nel 1952, sanzionata e
 * politicamente esposta, e una con anni di nascita dedotti fra il 1977 e il 1979, presente
 * solo nella stampa avversa. Sono due esseri umani diversi che condividono un nome.
 *
 * Un prodotto che rispondesse «questa persona è sanzionata» sbaglierebbe una volta su due
 * su ogni omonimia, e sbaglierebbe nel verso peggiore: accusare un cliente. Un prodotto che
 * rispondesse «nessun riscontro» perché nessun candidato convince nasconderebbe all'
 * intermediario proprio ciò che deve guardare.
 *
 * Quindi qui non si decide. Si misura quanto ogni candidato somiglia alla persona cercata,
 * si dice **su cosa** si fonda la somiglianza, e si lascia la conferma a chi ha davanti il
 * documento d'identità. È la regola 4 del progetto — mai mostrare come certo ciò che è
 * ambiguo — nel punto in cui costa di più.
 */

/** Le liste su cui la fonte ha trovato il candidato. Sono i `tags` della risposta. */
export type ListaDiRiscontro =
  'sanzioni' | 'pep' | 'stampa-avversa' | 'provvedimenti' | 'collegato-a-sanzionato' | 'collegato-a-pep';

/**
 * Come la fonte etichetta i riscontri, e come li chiamiamo noi.
 *
 * I tag «…_related» non dicono che la persona sia sanzionata: dicono che è **collegata** a
 * qualcuno che lo è — un familiare, un socio, un'impresa. Per l'obbligo contano, perché
 * fanno scattare la verifica rafforzata, ma sono una cosa diversa e vanno dette diverse.
 * Appiattirli sul riscontro diretto trasformerebbe il parente di un sanzionato in un
 * sanzionato.
 */
const TAG_NOTI: Readonly<Record<string, ListaDiRiscontro>> = {
  sanctions: 'sanzioni',
  pep: 'pep',
  adverse_media: 'stampa-avversa',
  legal_enforcement: 'provvedimenti',
  sanctions_related: 'collegato-a-sanzionato',
  pep_related: 'collegato-a-pep',
  public_functions_related: 'collegato-a-pep',
};

export const ETICHETTA_LISTA: Readonly<Record<ListaDiRiscontro, string>> = {
  sanzioni: 'Liste di sanzioni',
  pep: 'Persona politicamente esposta',
  'stampa-avversa': 'Stampa avversa',
  provvedimenti: 'Provvedimenti dell’autorità',
  'collegato-a-sanzionato': 'Collegata a un soggetto sanzionato',
  'collegato-a-pep': 'Collegata a una persona politicamente esposta',
};

/** Quanto pesa un riscontro per l'obbligo: non tutte le liste chiedono la stessa cosa. */
export const GRAVITA_LISTA: Readonly<Record<ListaDiRiscontro, 'bloccante' | 'rafforzata' | 'da-valutare'>> =
  {
    // Un soggetto in lista sanzioni non si può servire: non è una valutazione, è un divieto.
    sanzioni: 'bloccante',
    // PEP e collegamenti fanno scattare la verifica rafforzata, non il rifiuto.
    pep: 'rafforzata',
    'collegato-a-sanzionato': 'rafforzata',
    'collegato-a-pep': 'rafforzata',
    provvedimenti: 'rafforzata',
    // La stampa avversa è un indizio, non un fatto accertato da un'autorità.
    'stampa-avversa': 'da-valutare',
  };

/** Chi si sta verificando: nome, e ciò che si sa per distinguerlo da un omonimo. */
export interface PersonaDaVerificare {
  readonly nome: string;
  readonly annoDiNascita?: number | undefined;
  readonly nazionalita?: string | undefined;
  /** Perché costui va verificato: titolare effettivo, amministratore, contraente. */
  readonly ruolo: string;
}

/** Un candidato restituito dalla fonte, già tradotto. */
export interface CandidatoDiRiscontro {
  readonly identificativo: string;
  /** Persona fisica o ente: cambia il documento con cui l'intermediario lo identifica. */
  readonly tipo: 'persona' | 'ente';
  readonly nomi: readonly string[];
  readonly anniDiNascita: readonly { readonly anno: number; readonly dedotto: boolean }[];
  readonly nazionalita: readonly string[];
  readonly paesi: readonly string[];
  readonly liste: readonly ListaDiRiscontro[];
  /** I codici delle autorità che lo elencano: OFAC, UE, ONU. Sono la fonte da citare. */
  readonly riferimenti: readonly { readonly autorita: string; readonly codice: string }[];
  readonly aggiornatoIl: string | null;
}

export type ForzaDellaSomiglianza = 'forte' | 'possibile' | 'debole';

/** Un candidato pesato contro la persona cercata, con il perché scritto. */
export interface RiscontroPesato {
  readonly candidato: CandidatoDiRiscontro;
  readonly forza: ForzaDellaSomiglianza;
  /** Le ragioni, in italiano, che l'intermediario legge prima di confermare o scartare. */
  readonly perche: readonly string[];
  readonly gravita: 'bloccante' | 'rafforzata' | 'da-valutare';
}

/**
 * L'esito di una verifica, che non è un verdetto ma uno stato del fascicolo.
 *
 * `nessun-riscontro` è l'unico caso in cui il prodotto conclude da solo, ed è quello in cui
 * concludere è sicuro: se la fonte non ha trovato nessuno, non c'è nessuno da confondere.
 * In tutti gli altri decide l'intermediario, e la sua decisione va nel registro.
 */
export type StatoVerifica = 'nessun-riscontro' | 'da-esaminare' | 'non-eseguita';

export interface EsitoAdeguataVerifica {
  readonly persona: PersonaDaVerificare;
  readonly stato: StatoVerifica;
  readonly riscontri: readonly RiscontroPesato[];
  /** La frase che va nel fascicolo, composta dai valori e mai da un modello linguistico. */
  readonly conclusione: string;
  readonly verificatoIl: Date | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// La misura della somiglianza
// ─────────────────────────────────────────────────────────────────────────────

/** Accenti via, punteggiatura via, tutto minuscolo: «Putin, Vladimir» = «vladimir putin». */
export function normalizzaNome(valore: string): string {
  return valore
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function paroleDelNome(valore: string): Set<string> {
  return new Set(normalizzaNome(valore).split(' ').filter(Boolean));
}

/**
 * Quanta parte del nome cercato ricompare nel candidato.
 *
 * Non si usa una distanza di edit: i nomi tornano riordinati, translitterati e con i
 * patronimici in mezzo — «Putin Vladimir», «Vladimir Vladimirovich Putin», «Poutine». Ciò
 * che regge a tutte queste forme è quante parole del nome cercato si ritrovano, e questa
 * misura non pretende di essere più fine di così.
 */
export function copertura(cercato: string, candidato: string): number {
  const a = paroleDelNome(cercato);
  const b = paroleDelNome(candidato);
  if (a.size === 0) return 0;
  let trovate = 0;
  for (const parola of a) if (b.has(parola)) trovate += 1;
  return trovate / a.size;
}

/**
 * Pesa un candidato contro la persona cercata.
 *
 * Il nome da solo non basta mai a dire «forte»: gli omonimi esistono, e il caso provato
 * sul servizio vero ne conteneva due. Serve un secondo elemento che concordi — l'anno di
 * nascita o la nazionalità — e finché l'intermediario non li ha inseriti, il massimo che si
 * può dire è «possibile», che è la verità.
 *
 * Un anno di nascita **dedotto** dalla fonte non conferma niente: la fonte stessa lo
 * dichiara incerto, e usarlo per rafforzare una corrispondenza vorrebbe dire prendere la
 * sua incertezza per una prova.
 */
export function pesaCandidato(
  persona: PersonaDaVerificare,
  candidato: CandidatoDiRiscontro,
): RiscontroPesato {
  const migliore = Math.max(0, ...candidato.nomi.map((n) => copertura(persona.nome, n)));
  const perche: string[] = [];

  const nomeIntero = migliore >= 0.999;
  perche.push(
    nomeIntero
      ? 'Il nome corrisponde per intero.'
      : migliore >= 0.5
        ? `Il nome corrisponde in parte (${Math.round(migliore * 100)} % delle parole).`
        : 'Il nome corrisponde solo marginalmente.',
  );

  const anniCerti = candidato.anniDiNascita.filter((a) => !a.dedotto).map((a) => a.anno);
  const anniDedotti = candidato.anniDiNascita.filter((a) => a.dedotto).map((a) => a.anno);

  let annoConcorda: boolean | null = null;
  if (persona.annoDiNascita !== undefined && anniCerti.length > 0) {
    annoConcorda = anniCerti.includes(persona.annoDiNascita);
    perche.push(
      annoConcorda
        ? `L’anno di nascita coincide (${persona.annoDiNascita}).`
        : `L’anno di nascita NON coincide: cercato ${persona.annoDiNascita}, in lista ${anniCerti.join(', ')}.`,
    );
  } else if (persona.annoDiNascita === undefined) {
    perche.push(
      'Anno di nascita della persona non indicato: non è stato possibile distinguerla da un omonimo.',
    );
  } else if (anniDedotti.length > 0) {
    perche.push(
      `La fonte dichiara l’anno di nascita come dedotto (${anniDedotti.join(', ')}): non conferma né esclude.`,
    );
  } else {
    perche.push('La fonte non riporta l’anno di nascita del candidato.');
  }

  let nazionalitaConcorda: boolean | null = null;
  if (persona.nazionalita !== undefined && candidato.nazionalita.length > 0) {
    const cercata = normalizzaNome(persona.nazionalita);
    nazionalitaConcorda = candidato.nazionalita.some((n) => normalizzaNome(n) === cercata);
    if (nazionalitaConcorda) perche.push(`La nazionalità coincide (${persona.nazionalita}).`);
  }

  const forza: ForzaDellaSomiglianza =
    annoConcorda === false
      ? 'debole'
      : nomeIntero && (annoConcorda === true || nazionalitaConcorda === true)
        ? 'forte'
        : migliore >= 0.5
          ? 'possibile'
          : 'debole';

  const gravita = candidato.liste
    .map((l) => GRAVITA_LISTA[l])
    .reduce<'bloccante' | 'rafforzata' | 'da-valutare'>(
      (peggiore, corrente) =>
        peggiore === 'bloccante' || corrente === 'bloccante'
          ? 'bloccante'
          : peggiore === 'rafforzata' || corrente === 'rafforzata'
            ? 'rafforzata'
            : 'da-valutare',
      'da-valutare',
    );

  return { candidato, forza, perche, gravita };
}

/**
 * Compone l'esito, con la frase che finisce nel fascicolo.
 *
 * La frase si costruisce dai valori: quanti candidati, di che forza, su quali liste. Non
 * afferma mai che la persona sia sanzionata, perché questo lo stabilisce l'intermediario
 * guardando un documento, e nemmeno che sia pulita quando qualcosa è tornato indietro.
 */
export function componiEsito(
  persona: PersonaDaVerificare,
  candidati: readonly CandidatoDiRiscontro[],
  verificatoIl: Date,
): EsitoAdeguataVerifica {
  const riscontri = candidati
    .map((c) => pesaCandidato(persona, c))
    .sort((a, b) => ordineForza(a.forza) - ordineForza(b.forza));

  if (riscontri.length === 0) {
    return {
      persona,
      stato: 'nessun-riscontro',
      riscontri,
      conclusione:
        `Nessun riscontro su liste di sanzioni, persone politicamente esposte o stampa avversa ` +
        `per ${persona.nome} (${persona.ruolo}). La ricerca è per nome: un omonimo assente dalle ` +
        `liste non prova l’identità della persona, che resta accertata dal documento.`,
      verificatoIl,
    };
  }

  const bloccanti = riscontri.filter((r) => r.gravita === 'bloccante' && r.forza !== 'debole').length;
  const forti = riscontri.filter((r) => r.forza === 'forte').length;
  const liste = [...new Set(riscontri.flatMap((r) => r.candidato.liste))].map((l) => ETICHETTA_LISTA[l]);

  return {
    persona,
    stato: 'da-esaminare',
    riscontri,
    conclusione:
      `${riscontri.length} ${riscontri.length === 1 ? 'candidato trovato' : 'candidati trovati'} per ` +
      `${persona.nome} (${persona.ruolo}) su: ${liste.join(', ')}. ` +
      `${forti === 0 ? 'Nessuno' : forti === 1 ? 'Uno' : forti} con corrispondenza forte` +
      `${bloccanti > 0 ? `, di cui ${bloccanti} su liste di sanzioni` : ''}. ` +
      `La corrispondenza va confermata o esclusa dall’intermediario sul documento d’identità: ` +
      `la ricerca è per nome, e gli omonimi in queste liste sono la norma, non l’eccezione.`,
    verificatoIl,
  };
}

function ordineForza(f: ForzaDellaSomiglianza): number {
  return f === 'forte' ? 0 : f === 'possibile' ? 1 : 2;
}

/** L'esito di chi non è stato verificato: si dichiara, non si tace. */
export function nonEseguita(persona: PersonaDaVerificare, motivo: string): EsitoAdeguataVerifica {
  return {
    persona,
    stato: 'non-eseguita',
    riscontri: [],
    conclusione: `Adeguata verifica non eseguita per ${persona.nome} (${persona.ruolo}): ${motivo}`,
    verificatoIl: null,
  };
}

/** I tag della fonte, tradotti. Quelli che non conosciamo si scartano invece di indovinarli. */
export function listeDaiTag(tags: readonly string[]): readonly ListaDiRiscontro[] {
  const viste = new Set<ListaDiRiscontro>();
  for (const t of tags) {
    const nota = TAG_NOTI[t];
    if (nota !== undefined) viste.add(nota);
  }
  return [...viste];
}
