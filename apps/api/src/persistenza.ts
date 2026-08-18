/**
 * Persistenza su PostgreSQL.
 *
 * Implementa gli stessi contratti degli store in memoria, più ciò che solo un database
 * può dare: snapshot immutabili dei dati di provider, analisi congelate con le versioni
 * di motore che le hanno prodotte, audit trail e registro dei costi.
 *
 * **Ogni accesso passa da un contesto legato a un intermediario.** Non esiste un modo di
 * leggere o scrivere senza dichiarare per conto di chi: è ciò che impedisce a un `where`
 * dimenticato di mostrare a un broker il portafoglio di un concorrente.
 */

import { DATI_DICHIARATI_VUOTI, Money, statoSorvegliato, valutaCompletezza } from '@aegis/core';
import type { CompanyAnalysis, CoverageId, DatiDichiarati, PolizzaInEssere } from '@aegis/core';
import {
  assicuraAzienda,
  assicuraTenantPredefinito,
  connetti,
  elencoPortafoglio,
  leggiDatiDichiarati,
  leggiPolizze,
  registraAudit,
  registraCosto,
  riepilogoCosti,
  aggiornaStudio,
  collegamentiSocietari,
  leggiStudio,
  salvaAnalisi,
  salvaDatiDichiarati,
  salvaPartecipazioni,
  salvaSnapshot,
  sostituisciPolizze,
} from '@aegis/db';
import type { Connessione, DatiStudio, Database, ModificheStudio, RigaPolizza } from '@aegis/db';
import type {
  DossierAzienda,
  DossierStore,
  PatchDossier,
  PortafoglioStore,
  VoceportafoglioAzienda,
} from './store.js';
import { normalizza, perUrgenza, unisciDati } from './store.js';

export interface RiepilogoCostiDto {
  readonly totaleCentesimi: number;
  readonly risparmioCentesimi: number;
  readonly chiamate: number;
  readonly perServizio: readonly { servizio: string; chiamate: number; costoCentesimi: number }[];
}

/** Accesso ai dati per conto di un singolo intermediario. */
export interface ContestoTenant {
  readonly tenantId: string;
  readonly dossier: DossierStore;
  readonly portafoglio: PortafoglioStore;
  /** Chi ha redatto i documenti: intesta il report e adempie al Reg. IVASS 40/2018. */
  readonly studio: {
    leggi(): Promise<DatiStudio | null>;
    aggiorna(dati: ModificheStudio): Promise<void>;
  };
  registraAnalisi(identificativo: string, analisi: CompanyAnalysis, provider: string): Promise<void>;
  registraCostiDati(
    eventi: readonly {
      provider: string;
      service: string;
      costoStimatoCentesimi: number;
      cacheHit: boolean;
    }[],
  ): Promise<void>;
  riepilogoCosti(): Promise<RiepilogoCostiDto>;
}

export interface Persistenza {
  readonly db: Database;
  readonly descrizione: string;
  /** Intermediario creato al primo avvio: usato dai comandi di servizio e dai test. */
  readonly tenantPredefinito: string;
  perTenant(tenantId: string): ContestoTenant;
  chiudi(): Promise<void>;
}

export interface PersistenzaOptions {
  /** URL PostgreSQL. Se assente si usa PGlite. */
  readonly url?: string | undefined;
  /** Cartella dati PGlite. Se assente il database è in memoria e si azzera alla chiusura. */
  readonly cartellaDati?: string | undefined;
  readonly denominazioneTenant?: string | undefined;
}

/**
 * Su PostgreSQL lo schema non si crea da solo: lo applicano le migrazioni versionate.
 *
 * Se qualcuno imposta `DATABASE_URL` e dimentica di eseguirle, senza questo controllo il
 * servizio si avvierebbe apparentemente bene e fallirebbe alla prima richiesta con un
 * «relation "aziende" does not exist», che non dice a nessuno cosa fare. Meglio fermarsi
 * subito, dicendo esattamente quale comando manca.
 */
async function verificaSchemaApplicato(connessione: Connessione): Promise<void> {
  const { sql } = await import('drizzle-orm');
  // `execute` restituisce un risultato non tipizzato: il tipo lo dichiariamo qui, dove
  // sappiamo cosa abbiamo chiesto.
  const esito = (await connessione.db.execute(sql`
    SELECT to_regclass('public.aziende') IS NOT NULL AS presente
  `)) as { rows?: readonly { presente?: boolean }[] };

  if (esito.rows?.[0]?.presente === true) return;

  throw new Error(
    'Il database indicato da DATABASE_URL non contiene lo schema di AEGIS.\n' +
      'Applicare le migrazioni prima di avviare il servizio:\n\n' +
      '  DATABASE_URL=… npm run migra\n',
  );
}

export async function creaPersistenza(options: PersistenzaOptions = {}): Promise<Persistenza> {
  const connessione: Connessione = await connetti({
    url: options.url,
    cartellaDati: options.cartellaDati,
  });

  // Su PGlite lo schema si crea all'avvio (idempotente); su PostgreSQL si usano le
  // migrazioni versionate, perché creare tabelle a runtime su dati reali è una pratica
  // che prima o poi si paga.
  if (connessione.tipo === 'pglite') {
    const { applicaSchemaTollerante } = await import('@aegis/db');
    await applicaSchemaTollerante(connessione);
  } else {
    await verificaSchemaApplicato(connessione);
  }

  const { db } = connessione;
  const tenantPredefinito = await assicuraTenantPredefinito(
    db,
    options.denominazioneTenant ?? 'Intermediario predefinito',
  );

  return {
    db,
    descrizione: connessione.descrizione,
    tenantPredefinito,
    perTenant: (tenantId: string) => creaContesto(db, tenantId),
    chiudi: () => connessione.chiudi(),
  };
}

function creaContesto(db: Database, tenantId: string): ContestoTenant {
  const dossier: DossierStore = {
    async get(identificativo: string): Promise<DossierAzienda | null> {
      const chiave = normalizza(identificativo);
      const aziendaId = await trovaAzienda(db, tenantId, chiave);
      if (aziendaId === null) return null;

      const [dati, polizze] = await Promise.all([
        leggiDatiDichiarati(db, aziendaId),
        leggiPolizze(db, aziendaId),
      ]);

      // L'asserzione conserva `undefined`: applicandola all'intera espressione con
      // l'optional chaining, il compilatore smetterebbe di vedere il caso «riga assente»
      // e il `??` sembrerebbe superfluo pur restando l'unica cosa che lo gestisce.
      const dichiarati = dati?.dati as DatiDichiarati | undefined;

      return {
        identificativo: chiave,
        datiDichiarati: dichiarati ?? DATI_DICHIARATI_VUOTI,
        polizze: polizze.map(daRigaPolizza),
        aggiornatoIl: dati?.aggiornatoIl ?? new Date(),
      };
    },

    async upsert(identificativo: string, patch: PatchDossier): Promise<DossierAzienda> {
      const chiave = normalizza(identificativo);
      const aziendaId = await assicuraAzienda(db, tenantId, {
        partitaIva: chiave,
        codiceFiscale: null,
        denominazione: chiave,
        providerId: chiave,
        provincia: null,
        atecoPrimario: null,
      });

      const corrente = await leggiDatiDichiarati(db, aziendaId);
      const uniti = unisciDati(
        corrente?.dati as unknown as DatiDichiarati | undefined,
        patch.datiDichiarati,
      );

      await salvaDatiDichiarati(
        db,
        tenantId,
        aziendaId,
        uniti as unknown as Record<string, unknown>,
        valutaCompletezza(uniti).percentuale,
      );

      if (patch.polizze !== undefined) {
        await sostituisciPolizze(db, tenantId, aziendaId, patch.polizze.map(aRigaPolizza));
      }

      await registraAudit(db, {
        tenantId,
        azione: 'dossier.aggiornato',
        entita: 'azienda',
        entitaId: aziendaId,
        dettagli: { polizzeAggiornate: patch.polizze !== undefined },
      });

      const polizze = await leggiPolizze(db, aziendaId);
      return {
        identificativo: chiave,
        datiDichiarati: uniti,
        polizze: polizze.map(daRigaPolizza),
        aggiornatoIl: new Date(),
      };
    },
  };

  const portafoglio: PortafoglioStore = {
    // La registrazione avviene dentro `registraAnalisi`: il portafoglio è una proiezione
    // delle analisi salvate, non una lista mantenuta a parte che può divergere.
    registra: () => Promise.resolve(),

    async elenco(): Promise<readonly VoceportafoglioAzienda[]> {
      const voci = await elencoPortafoglio(db, tenantId);
      return voci
        .map((v): VoceportafoglioAzienda => ({
          identificativo: v.identificativo,
          denominazione: v.denominazione,
          partitaIva: v.partitaIva,
          provincia: v.provincia,
          atecoDescrizione: v.atecoPrimario,
          scoreCredito: v.scoreCredito ?? 0,
          classeCredito: v.classeCredito ?? '—',
          statoCatNat: v.statoCatNat ?? 'non-soggetta',
          catNatConforme: v.statoCatNat === 'adempiente' || v.statoCatNat === 'non-soggetta',
          coperturaAssente: v.coperturaAssente ?? 0,
          coperturaDaQuantificare: v.coperturaDaQuantificare ?? 0,
          rischiCritici: v.rischiCritici ?? 0,
          esposizioneNonAssicurataCentesimi: v.esposizioneNonAssicurataCentesimi ?? 0,
          completezza: v.completezza ?? 0,
          azionePrioritaria: v.azionePrioritaria,
          analizzataIl: v.analizzataIl,
        }))
        .sort(perUrgenza);
    },

    async collegamenti(identificativo: string) {
      const aziendaId = await trovaAzienda(db, tenantId, identificativo);
      if (aziendaId === null) return [];
      return collegamentiSocietari(db, tenantId, aziendaId);
    },
  };

  const studio = {
    leggi: () => leggiStudio(db, tenantId),
    aggiorna: (dati: ModificheStudio) => aggiornaStudio(db, tenantId, dati),
  };

  return {
    tenantId,
    dossier,
    portafoglio,
    studio,

    async registraAnalisi(identificativo, analisi, provider): Promise<void> {
      const chiave = normalizza(identificativo);
      const anagrafica = analisi.profile.anagrafica.value;

      const aziendaId = await assicuraAzienda(db, tenantId, {
        partitaIva: analisi.profile.identity.partitaIva ?? chiave,
        codiceFiscale: analisi.profile.identity.codiceFiscale,
        denominazione: analisi.profile.identity.denominazione,
        providerId: chiave,
        provincia: anagrafica.sedeLegale?.provincia ?? null,
        atecoPrimario: anagrafica.atecoPrimario,
      });

      // Snapshot immutabile: è ciò che rende l'analisi riproducibile fra tre anni,
      // quando qualcuno chiederà su quali dati si fondava la proposta.
      const snapshotId = await salvaSnapshot(db, {
        aziendaId,
        tenantId,
        provider,
        livello: 'completo',
        profilo: JSON.parse(JSON.stringify(analisi.profile)) as unknown,
        osservatoIl: analisi.profile.anagrafica.observedAt,
        costoCentesimi: 0,
      });

      await salvaAnalisi(db, {
        aziendaId,
        tenantId,
        snapshotId,
        asOf: analisi.asOf,
        scoreCredito: analisi.sintesi.scoreCredito,
        classeCredito: analisi.sintesi.classeCredito,
        fidoConsigliatoCentesimi: analisi.sintesi.fidoConsigliato,
        patrimonioEspostoCentesimi: analisi.sintesi.patrimonioEsposto,
        esposizioneNonAssicurataCentesimi: analisi.sintesi.esposizioneNonAssicurata,
        rischiCritici: analisi.sintesi.rischiCritici,
        coperturaAssente: analisi.sintesi.coperturaAssente,
        statoCatNat: analisi.catNat.value.status,
        risultato: JSON.parse(JSON.stringify(analisi.sintesi)) as unknown,
        // Le polizze si ricavano dai gap: sono le stesse con cui l'analisi è stata
        // calcolata, e prenderle da lì evita che le due cose possano divergere.
        statoSorvegliato: JSON.parse(
          JSON.stringify(
            statoSorvegliato(
              analisi,
              analisi.gap.gaps.map((g) => g.polizza).filter((p): p is PolizzaInEssere => p !== null),
            ),
          ),
        ) as unknown,
        versioneCore: '0.1.0',
        versioneCatalogoRischi: analisi.rischi.catalogVersion,
        versioneRegole: analisi.rischi.rulesVersion,
        gap: analisi.gap.gaps.map((g) => ({
          copertura: g.definition.id,
          stato: g.status,
          priorita: g.priorita,
          obbligoDiLegge: g.obbligoDiLegge,
          capitaleRaccomandatoCentesimi: g.capitaleRaccomandato.value,
          capitaleInEssereCentesimi: g.capitaleInEssere,
          azione: g.azione,
          motivazioneAdeguatezza: g.motivazioneAdeguatezza,
        })),
      });

      // La compagine si conserva a parte: è ciò che permette, più tardi, di scoprire che
      // tre clienti diversi fanno capo alla stessa persona.
      await salvaPartecipazioni(
        db,
        tenantId,
        aziendaId,
        analisi.assetto.soci.map((socio) => ({
          socioDenominazione: socio.denominazione,
          socioCodiceFiscale: socio.codiceFiscale,
          socioTipo: socio.tipo,
          quotaPercentuale: socio.quotaPercentuale,
          diControllo:
            analisi.assetto.capogruppo !== null &&
            socio.codiceFiscale !== null &&
            socio.codiceFiscale === analisi.assetto.capogruppo.partitaIva,
        })),
      );

      await registraAudit(db, {
        tenantId,
        azione: 'analisi.eseguita',
        entita: 'azienda',
        entitaId: aziendaId,
        dettagli: { score: analisi.sintesi.scoreCredito, catNat: analisi.catNat.value.status },
      });
    },

    async registraCostiDati(eventi): Promise<void> {
      for (const evento of eventi) {
        await registraCosto(db, {
          tenantId,
          provider: evento.provider,
          servizio: evento.service,
          costoCentesimi: evento.costoStimatoCentesimi,
          servitoDaCache: evento.cacheHit,
        });
      }
    },

    riepilogoCosti: () => riepilogoCosti(db, tenantId),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

async function trovaAzienda(db: Database, tenantId: string, chiave: string): Promise<string | null> {
  const { and, eq } = await import('drizzle-orm');
  const { schema } = await import('@aegis/db');

  const righe = await db
    .select({ id: schema.aziende.id })
    .from(schema.aziende)
    .where(and(eq(schema.aziende.tenantId, tenantId), eq(schema.aziende.partitaIva, chiave)))
    .limit(1);

  return righe[0]?.id ?? null;
}

/** Gli importi restano in centesimi anche nel database: nessuna conversione, nessun errore. */
function aRigaPolizza(p: PolizzaInEssere): RigaPolizza {
  return {
    copertura: p.coverage,
    compagnia: p.compagnia,
    numeroPolizza: p.numeroPolizza,
    sommaAssicurataCentesimi: p.sommaAssicurata,
    massimaleCentesimi: p.massimale,
    franchigiaCentesimi: p.franchigia,
    scoperto: p.scoperto,
    premioAnnuoCentesimi: p.premioAnnuo,
    formaGaranzia: p.formaGaranzia,
    dataEffetto: p.dataEffetto.toISOString().slice(0, 10),
    dataScadenza: p.dataScadenza.toISOString().slice(0, 10),
    note: p.note,
  };
}

function daRigaPolizza(r: RigaPolizza): PolizzaInEssere {
  return {
    id: `${r.copertura}-${r.dataEffetto}`,
    coverage: r.copertura as CoverageId,
    compagnia: r.compagnia,
    numeroPolizza: r.numeroPolizza,
    sommaAssicurata: r.sommaAssicurataCentesimi === null ? null : Money.cents(r.sommaAssicurataCentesimi),
    massimale: r.massimaleCentesimi === null ? null : Money.cents(r.massimaleCentesimi),
    franchigia: r.franchigiaCentesimi === null ? null : Money.cents(r.franchigiaCentesimi),
    scoperto: r.scoperto,
    premioAnnuo: r.premioAnnuoCentesimi === null ? null : Money.cents(r.premioAnnuoCentesimi),
    dataEffetto: new Date(`${r.dataEffetto}T00:00:00Z`),
    dataScadenza: new Date(`${r.dataScadenza}T00:00:00Z`),
    formaGaranzia: r.formaGaranzia as PolizzaInEssere['formaGaranzia'],
    note: r.note,
  };
}
