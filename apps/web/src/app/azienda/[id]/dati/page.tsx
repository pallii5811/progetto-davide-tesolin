import { richiediSessione } from '@/lib/sessione';
import Link from 'next/link';
import { analizzaAzienda, leggiDossier, leggiInvitoQuestionario } from '@/lib/api';
import { Avviso, Scheda } from '@/components/ui';
import { EditorDossier } from './EditorDossier';
import { convertiPolizze, unisciDati } from './modulo';
import { salvaDossier } from './actions';
import { CollegamentoQuestionario } from './CollegamentoQuestionario';

export const dynamic = 'force-dynamic';

export default async function PaginaDati({ params }: { params: Promise<{ id: string }> }) {
  await richiediSessione();
  const { id } = await params;

  const [dossier, analisi, invito] = await Promise.all([
    leggiDossier(id).catch(() => null),
    analizzaAzienda(id).catch(() => null),
    // Senza persistenza non esistono inviti: la pagina resta intera, senza il riquadro.
    leggiInvitoQuestionario(id)
      .then((r) => r.invito)
      .catch(() => null),
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

  const datiIniziali = unisciDati(dossier?.datiDichiarati ?? null, analisi.azienda.addetti);
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

      <div className="mb-6">
        <CollegamentoQuestionario identificativo={id} invito={invito} />
      </div>

      {/*
        Il collegamento all'analisi si passa **da qui**, dove `id` è davvero la partita
        IVA. Costruito dentro l'editor valeva anche sul percorso del cliente, dove lo
        stesso parametro è il token del questionario.
      */}
      <EditorDossier
        identificativo={id}
        datiIniziali={datiIniziali}
        polizzeIniziali={polizzeIniziali}
        salva={salvaDossier}
        collegamentoAnalisi={`/azienda/${id}`}
      />
    </>
  );
}
