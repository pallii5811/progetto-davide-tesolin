/**
 * Schemi di validazione degli input.
 *
 * Validare al confine e una volta sola: dentro, il dominio lavora su tipi già garantiti.
 * Gli importi arrivano dalla UI in euro e vengono convertiti in `Money` qui, così che
 * nessun `number` grezzo attraversi il confine.
 */

import { euro } from '@aegis/core';
import type { DatiDichiarati, ImmobileDichiarato, PolizzaInEssere } from '@aegis/core';
import { z } from 'zod';

export const searchQuerySchema = z.object({
  denominazione: z.string().trim().min(2).optional(),
  partitaIva: z.string().trim().optional(),
  provincia: z.string().trim().length(2).optional(),
  ateco: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const fetchLevelSchema = z.enum(['base', 'esteso', 'completo', 'profondito']).default('completo');

const indirizzoSchema = z.object({
  via: z.string(),
  civico: z.string().nullable().default(null),
  cap: z.string().default(''),
  frazione: z.string().nullable().default(null),
  comune: z.string(),
  provincia: z.string().length(2),
  regione: z.string().nullable().default(null),
  latitudine: z.number().nullable().default(null),
  longitudine: z.number().nullable().default(null),
});

const immobileSchema = z.object({
  descrizione: z.string().min(1),
  indirizzo: indirizzoSchema.nullable().default(null),
  superficieMq: z.number().positive().nullable().default(null),
  titolo: z.enum(['proprieta', 'locazione', 'comodato', 'leasing', 'misto']),
  tipologiaCostruttiva: z
    .enum(['muratura', 'cemento-armato', 'prefabbricato', 'acciaio', 'legno', 'misto'])
    .nullable()
    .default(null),
  annoCostruzione: z.number().int().min(1800).max(2100).nullable().default(null),
  presenzaImpiantoAntincendio: z.boolean().nullable().default(null),
  presenzaAllarme: z.boolean().nullable().default(null),
  compartimentazioneRei: z.boolean().nullable().default(null),
  impiantoSprinkler: z.boolean().nullable().default(null),
});

export const datiDichiaratiSchema = z
  .object({
    immobili: z.array(immobileSchema).optional(),
    numeroVeicoli: z.number().int().min(0).nullable().optional(),
    numeroDipendenti: z.number().int().min(0).nullable().optional(),
    quotaExportPercentuale: z.number().min(0).max(1).nullable().optional(),
    esportaVersoUsaCanada: z.boolean().nullable().optional(),
    trattaDatiPersonali: z.boolean().nullable().optional(),
    trattaDatiParticolari: z.boolean().nullable().optional(),
    haSitoEcommerce: z.boolean().nullable().optional(),
    haModello231: z.boolean().nullable().optional(),
    certificazioni: z.array(z.string()).optional(),
    numeroClientiPrincipaliSuFatturato: z.number().int().min(0).nullable().optional(),
    concentrazionePrimoCliente: z.number().min(0).max(1).nullable().optional(),
    lavoraInCantiere: z.boolean().nullable().optional(),
    produceBeniFinali: z.boolean().nullable().optional(),
    trasportaMerciProprie: z.boolean().nullable().optional(),
    periodoIndennizzoMesi: z.number().int().min(3).max(36).nullable().optional(),
    propensioneAlRischio: z.enum(['prudente', 'equilibrata', 'incline-a-ritenere']).nullable().optional(),
  })
  .strict();

const coverageIdSchema = z.enum([
  'incendio',
  'furto-rapina',
  'catastrofali',
  'guasti-macchine',
  'elettronica',
  'danni-indiretti',
  'rct',
  'rco',
  'rc-prodotti',
  'rc-inquinamento',
  'rc-professionale',
  'd-and-o',
  'cyber',
  'infortuni-dipendenti',
  'infortuni-titolare',
  'malattia-key-man',
  'tcm-key-man',
  'rca-flotta',
  'kasko-flotta',
  'merci-trasportate',
  'credito-commerciale',
  'cauzioni',
  'tutela-legale',
]);

export const polizzaSchema = z.object({
  id: z.string().min(1),
  coverage: coverageIdSchema,
  compagnia: z.string().min(1),
  numeroPolizza: z.string().nullable().default(null),
  /** Importi in euro: la conversione in centesimi avviene qui, non nella UI. */
  sommaAssicurataEuro: z.number().min(0).nullable().default(null),
  massimaleEuro: z.number().min(0).nullable().default(null),
  franchigiaEuro: z.number().min(0).nullable().default(null),
  scoperto: z.number().min(0).max(1).nullable().default(null),
  dataEffetto: z.coerce.date(),
  dataScadenza: z.coerce.date(),
  premioAnnuoEuro: z.number().min(0).nullable().default(null),
  formaGaranzia: z
    .enum(['valore-a-nuovo', 'valore-allo-stato-duso', 'primo-rischio-assoluto'])
    .nullable()
    .default(null),
  note: z.string().nullable().default(null),
});

/**
 * Dati di solidità di una compagnia, come si leggono nella SFCR.
 *
 * Tutto facoltativo tranne denominazione, anno e fonte: il motore sa lavorare con un dato
 * parziale e dichiara quali componenti non ha potuto valutare. Pretendere l'elenco
 * completo significherebbe non far censire nessuna compagnia.
 */
export const compagniaSchema = z.object({
  denominazione: z.string().trim().min(2).max(160),
  gruppo: z.string().trim().max(160).optional(),
  codiceIvass: z.string().trim().max(20).optional(),
  anno: z.coerce.number().int().min(2000).max(2100),
  /** Rapporto, non percentuale: 2,6 significa 260%. */
  solvencyRatio: z.coerce.number().min(0).max(20).optional(),
  quotaTier1Unrestricted: z.coerce.number().min(0).max(1).optional(),
  fondiPropriEuro: z.coerce.number().min(0).optional(),
  scrEuro: z.coerce.number().min(0).optional(),
  premiLordiEuro: z.coerce.number().min(0).optional(),
  reclamiAnno: z.coerce.number().int().min(0).optional(),
  ratingAgenzia: z.string().trim().max(40).optional(),
  ratingValore: z.string().trim().max(10).optional(),
  fonte: z.string().trim().min(2).max(120),
});

export const analisiRequestSchema = z.object({
  datiDichiarati: datiDichiaratiSchema.optional(),
  polizze: z.array(polizzaSchema).optional(),
  /** Data di riferimento dell'analisi. Utile per riprodurre una valutazione passata. */
  asOf: z.coerce.date().optional(),
  /**
   * Analisi approfondita: aggiunge cariche, sedi operative e struttura del gruppo.
   *
   * Predefinito `false`. Costa quasi cinque volte l'analisi ordinaria e va chiesto:
   * nessuno deve trovarselo addebitato per una svista.
   */
  approfondita: z.boolean().optional(),
  /**
   * Verifica protesti, pregiudizievoli e procedure concorsuali: **45 centesimi**.
   *
   * Separata dall'analisi e falsa per definizione. Costa quattro volte e mezzo
   * l'anagrafica, e comprarla in automatico faceva sì che «Analizza» ne costasse
   * cinquantacinque invece di dieci — senza che da nessuna parte lo si dicesse.
   */
  eventiNegativi: z.boolean().optional(),
});

export type AnalisiRequest = z.infer<typeof analisiRequestSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Conversioni verso il dominio
// ─────────────────────────────────────────────────────────────────────────────

export function toPolizza(input: z.infer<typeof polizzaSchema>): PolizzaInEssere {
  return {
    id: input.id,
    coverage: input.coverage,
    compagnia: input.compagnia,
    numeroPolizza: input.numeroPolizza,
    sommaAssicurata: input.sommaAssicurataEuro === null ? null : euro(input.sommaAssicurataEuro),
    massimale: input.massimaleEuro === null ? null : euro(input.massimaleEuro),
    franchigia: input.franchigiaEuro === null ? null : euro(input.franchigiaEuro),
    scoperto: input.scoperto,
    dataEffetto: input.dataEffetto,
    dataScadenza: input.dataScadenza,
    premioAnnuo: input.premioAnnuoEuro === null ? null : euro(input.premioAnnuoEuro),
    formaGaranzia: input.formaGaranzia,
    note: input.note,
  };
}

export function toDatiDichiarati(input: z.infer<typeof datiDichiaratiSchema>): Partial<DatiDichiarati> {
  const immobili: readonly ImmobileDichiarato[] | undefined =
    input.immobili === undefined ? undefined : input.immobili.map((i) => ({ ...i }));

  return {
    ...input,
    ...(immobili === undefined ? {} : { immobili }),
  } as Partial<DatiDichiarati>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Immagini delle ubicazioni
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formati ammessi: solo fotografie raster.
 *
 * Niente SVG, a differenza del logo dello studio. Un SVG è un documento, non una
 * fotografia: può contenere script e riferimenti esterni, e qui il file arriva da chi
 * carica in un fascicolo che poi qualcun altro apre. Per la facciata di un capannone non
 * serve, quindi non si concede.
 */
export const TIPI_IMMAGINE_AMMESSI = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Tetto per singola immagine, sul file originale.
 *
 * **Un megabyte, e il numero è misurato, non scelto a sentimento.** Nel report ogni
 * fotografia costa circa **2,7 volte** la propria dimensione: la codifica base64 aggiunge
 * un terzo, e Next scrive il data URI due volte — una nell'attributo `src` e una nel
 * payload di idratazione. Verificato il 20/08/2026 contando le occorrenze nell'HTML
 * servito: dodici per sei immagini.
 *
 * Con questo tetto un fascicolo generoso — tre ubicazioni, quattro scatti ciascuna —
 * produce un documento intorno ai trenta megabyte: pesante ma stampabile e spedibile, che
 * è il modo in cui questo report viaggia davvero. A due megabyte per scatto lo stesso
 * fascicolo ne produrrebbe sessanta, e diventerebbe inutilizzabile proprio nel momento in
 * cui serve.
 *
 * Un megabyte è comunque abbondante: una fotografia 1600×1200 in JPEG di buona qualità
 * pesa fra i quattrocento e i seicento kilobyte.
 *
 * Per alzarlo davvero non basta cambiare questo numero: andrebbero servite le immagini da
 * una rotta dedicata invece che come data URI, così che l'HTML porti indirizzi e non byte.
 */
export const LIMITE_IMMAGINE_BYTE = 1024 * 1024;

/** Quante immagini può avere una singola ubicazione. */
export const MAX_IMMAGINI_PER_UBICAZIONE = 6;

/*
  La codifica base64 cresce di circa un terzo, più l'intestazione del data URI. Il
  controllo vero si fa **sui byte decodificati**, non su questa soglia: qui si respinge
  presto un corpo abnorme, prima di decodificarlo.
*/
const LIMITE_DATI_URI = Math.ceil(LIMITE_IMMAGINE_BYTE * 1.4) + 100;

export const immagineSchema = z.object({
  ubicazioneId: z.string().trim().min(1).max(200),
  didascalia: z.string().trim().max(200).nullable().default(null),
  tipoMime: z.enum(TIPI_IMMAGINE_AMMESSI),
  /*
    Il data URI deve dichiarare **lo stesso tipo** del campo accanto e usare base64.
    Accettare una forma qualunque significherebbe conservare un contenuto arbitrario in
    un campo che poi finisce nell'attributo `src` di un documento consegnato a un cliente.
  */
  dati: z
    .string()
    .max(LIMITE_DATI_URI, 'Immagine troppo grande')
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/, 'Formato immagine non valido'),
});

/** Byte reali di un data URI base64, senza decodificarlo per intero. */
export function byteDiDataUri(dataUri: string): number {
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  const riempimento = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - riempimento;
}
