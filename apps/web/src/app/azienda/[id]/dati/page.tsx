import { richiediSessione } from '@/lib/sessione';
import Link from 'next/link';
import { analizzaAzienda, leggiDossier } from '@/lib/api';
import { Avviso, Scheda } from '@/components/ui';
import { EditorDossier } from './EditorDossier';
import type { DatiForm, ImmobileForm, PolizzaForm } from './EditorDossier';
import { salvaDossier } from './actions';

export const dynamic = 'force-dynamic';

const DATI_VUOTI: DatiForm = {
  immobili: [],
  numeroVeicoli: null,
  numeroDipendenti: null,
  quotaExportPercentuale: null,
  esportaVersoUsaCanada: null,
  trattaDatiPersonali: null,
  trattaDatiParticolari: null,
  haSitoEcommerce: null,
  haModello231: null,
  certificazioni: [],
  concentrazionePrimoCliente: null,
  lavoraInCantiere: null,
  produceBeniFinali: null,
  trasportaMerciProprie: null,
  periodoIndennizzoMesi: null,
};

export default async function PaginaDati({ params }: { params: Promise<{ id: string }> }) {
  await richiediSessione();
  const { id } = await params;

  const [dossier, analisi] = await Promise.all([
    leggiDossier(id).catch(() => null),
    analizzaAzienda(id).catch(() => null),
  ]);

  if (analisi === null) {
    return (
      <Avviso tono="critico" titolo="Azienda non disponibile">
        Impossibile caricare l&apos;azienda richiesta.{' '}
        <Link href="/" className="text-marchio underline">
          Torna alla ricerca
        </Link>
      </Avviso>
    );
  }

  const datiIniziali = unisci(dossier?.datiDichiarati ?? null, analisi);
  const polizzeIniziali = convertiPolizze(dossier?.polizze ?? []);
  const { completezza } = analisi;

  return (
    <>
      <div className="mb-6">
        <Link href={`/azienda/${id}`} className="text-xs text-marchio hover:underline">
          ← {analisi.azienda.denominazione}
        </Link>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight">Dati di intervista</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-testo-tenue">
          Ciò che il bilancio non può dire. Ogni campo qui migliora una parte precisa dell&apos;analisi:
          l&apos;elenco qui sotto è ordinato per impatto, non per comodità di compilazione.
        </p>
      </div>

      {/* ── Completezza e cosa manca ─────────────────────────────────────── */}
      <Scheda className="mb-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm font-semibold">
            Completezza dell&apos;analisi:{' '}
            <span className="tabular">{Math.round(completezza.percentuale * 100)}%</span>{' '}
            <span className="font-normal text-testo-tenue">({completezza.livello})</span>
          </p>
          <p className="text-xs text-testo-debole">
            {completezza.compilati.length} campi su{' '}
            {completezza.compilati.length + completezza.mancanti.length}
          </p>
        </div>

        <div
          role="progressbar"
          aria-valuenow={Math.round(completezza.percentuale * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Completezza dei dati di intervista"
          className="h-2 w-full overflow-hidden rounded-full bg-bordo"
        >
          <div
            className={`h-full rounded-full transition-all ${
              completezza.percentuale >= 0.65
                ? 'bg-basso'
                : completezza.percentuale >= 0.3
                  ? 'bg-moderato'
                  : 'bg-alto'
            }`}
            style={{ width: `${Math.max(2, Math.round(completezza.percentuale * 100))}%` }}
          />
        </div>

        {completezza.mancanti.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-testo-debole">
              Cosa chiedere per primo
            </p>
            <ol className="space-y-2">
              {completezza.mancanti.slice(0, 5).map((mancante) => (
                <li key={mancante.chiave} className="flex gap-3 text-sm">
                  <span className="tabular mt-0.5 shrink-0 rounded bg-fondo px-1.5 py-0.5 text-xs font-semibold text-testo-tenue">
                    +{mancante.peso}
                  </span>
                  <span>
                    <span className="font-medium">{mancante.etichetta}</span>
                    <span className="ml-1.5 text-xs text-testo-debole">· {mancante.areaEtichetta}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-testo-tenue">
                      {mancante.beneficio}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {completezza.mancanti.length === 0 && (
          <p className="mt-3 text-sm text-basso">
            Questionario completo: l&apos;analisi lavora al massimo dell&apos;affidabilità consentita dai
            dati disponibili.
          </p>
        )}
      </Scheda>

      <EditorDossier
        identificativo={id}
        datiIniziali={datiIniziali}
        polizzeIniziali={polizzeIniziali}
        salva={salvaDossier}
      />
    </>
  );
}

/**
 * Precompila il modulo con quanto già noto.
 * I dati salvati dall'intermediario prevalgono; in loro assenza si usa ciò che l'analisi
 * ha già dedotto, così che il broker confermi invece di ridigitare.
 */
function unisci(
  salvati: Record<string, unknown> | null,
  analisi: { azienda: { addetti: number | null } },
): DatiForm {
  const base: DatiForm = {
    ...DATI_VUOTI,
    numeroDipendenti: analisi.azienda.addetti,
  };

  if (salvati === null) return base;

  const immobili = Array.isArray(salvati['immobili'])
    ? (salvati['immobili'] as Record<string, unknown>[]).map((i): ImmobileForm => ({
        descrizione: testoOrVuoto(i['descrizione']),
        superficieMq: numeroOrNull(i['superficieMq']),
        titolo: unoDi(i['titolo'], TITOLI_VALIDI) ?? 'proprieta',
        tipologiaCostruttiva: unoDi(i['tipologiaCostruttiva'], TIPOLOGIE_VALIDE),
        annoCostruzione: numeroOrNull(i['annoCostruzione']),
        presenzaImpiantoAntincendio: booleanOrNull(i['presenzaImpiantoAntincendio']),
        presenzaAllarme: booleanOrNull(i['presenzaAllarme']),
      }))
    : [];

  return {
    ...base,
    immobili,
    numeroVeicoli: numeroOrNull(salvati['numeroVeicoli']) ?? base.numeroVeicoli,
    numeroDipendenti: numeroOrNull(salvati['numeroDipendenti']) ?? base.numeroDipendenti,
    quotaExportPercentuale: numeroOrNull(salvati['quotaExportPercentuale']),
    esportaVersoUsaCanada: booleanOrNull(salvati['esportaVersoUsaCanada']),
    trattaDatiPersonali: booleanOrNull(salvati['trattaDatiPersonali']),
    trattaDatiParticolari: booleanOrNull(salvati['trattaDatiParticolari']),
    haSitoEcommerce: booleanOrNull(salvati['haSitoEcommerce']),
    haModello231: booleanOrNull(salvati['haModello231']),
    certificazioni: Array.isArray(salvati['certificazioni']) ? (salvati['certificazioni'] as string[]) : [],
    concentrazionePrimoCliente: numeroOrNull(salvati['concentrazionePrimoCliente']),
    lavoraInCantiere: booleanOrNull(salvati['lavoraInCantiere']),
    produceBeniFinali: booleanOrNull(salvati['produceBeniFinali']),
    trasportaMerciProprie: booleanOrNull(salvati['trasportaMerciProprie']),
    periodoIndennizzoMesi: numeroOrNull(salvati['periodoIndennizzoMesi']),
  };
}

/** Gli importi arrivano dal dominio in centesimi e vanno mostrati in euro. */
function convertiPolizze(
  polizze: {
    id: string;
    coverage: string;
    compagnia: string;
    numeroPolizza: string | null;
    sommaAssicurata: number | null;
    massimale: number | null;
    franchigia: number | null;
    premioAnnuo: number | null;
    dataEffetto: string;
    dataScadenza: string;
    formaGaranzia: string | null;
  }[],
): PolizzaForm[] {
  return polizze.map((p) => ({
    id: p.id,
    coverage: p.coverage,
    compagnia: p.compagnia,
    numeroPolizza: p.numeroPolizza,
    sommaAssicurataEuro: p.sommaAssicurata === null ? null : p.sommaAssicurata / 100,
    massimaleEuro: p.massimale === null ? null : p.massimale / 100,
    franchigiaEuro: p.franchigia === null ? null : p.franchigia / 100,
    premioAnnuoEuro: p.premioAnnuo === null ? null : p.premioAnnuo / 100,
    dataEffetto: p.dataEffetto.slice(0, 10),
    dataScadenza: p.dataScadenza.slice(0, 10),
    formaGaranzia: p.formaGaranzia as PolizzaForm['formaGaranzia'],
  }));
}

const TITOLI_VALIDI = ['proprieta', 'locazione', 'comodato', 'leasing', 'misto'] as const;
const TIPOLOGIE_VALIDE = [
  'muratura',
  'cemento-armato',
  'prefabbricato',
  'acciaio',
  'legno',
  'misto',
] as const;

/**
 * Verifica invece di asserire.
 *
 * Il dossier arriva come JSON: un `as` direbbe al compilatore «fidati», e un valore
 * legacy o corrotto entrerebbe nel modulo producendo un menu a tendina vuoto senza che
 * nessuno se ne accorga. Qui un valore non riconosciuto diventa `null`, cioè «da rilevare».
 */
function unoDi<T extends string>(valore: unknown, ammessi: readonly T[]): T | null {
  return typeof valore === 'string' && (ammessi as readonly string[]).includes(valore)
    ? (valore as T)
    : null;
}

function testoOrVuoto(valore: unknown): string {
  return typeof valore === 'string' ? valore : '';
}

function numeroOrNull(valore: unknown): number | null {
  return typeof valore === 'number' && Number.isFinite(valore) ? valore : null;
}

function booleanOrNull(valore: unknown): boolean | null {
  return typeof valore === 'boolean' ? valore : null;
}
