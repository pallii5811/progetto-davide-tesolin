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

export const fetchLevelSchema = z.enum(['base', 'esteso', 'completo']).default('completo');

const indirizzoSchema = z.object({
  via: z.string(),
  civico: z.string().nullable().default(null),
  cap: z.string().default(''),
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

export const analisiRequestSchema = z.object({
  datiDichiarati: datiDichiaratiSchema.optional(),
  polizze: z.array(polizzaSchema).optional(),
  /** Data di riferimento dell'analisi. Utile per riprodurre una valutazione passata. */
  asOf: z.coerce.date().optional(),
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
