import { richiediSessione } from '@/lib/sessione';
import { leggiCatalogoCoperture, leggiCatalogoRischi } from '@/lib/api';
import type { RischioCatalogo } from '@/lib/api';
import { Scheda, ServizioNonRaggiungibile, Sezione } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PaginaCatalogo() {
  await richiediSessione();

  // Attraverso il client condiviso, che inoltra il cookie di sessione: una `fetch` nuda
  // verso l'API riceverebbe un 401, il cui corpo è JSON valido — quindi nessun errore da
  // intercettare, e una pagina che si rompe su un campo assente invece di dire cosa manca.
  const [rischi, coperture] = await Promise.all([
    leggiCatalogoRischi().catch(() => null),
    leggiCatalogoCoperture().catch(() => null),
  ]);

  if (rischi === null || coperture === null) {
    return (
      <ServizioNonRaggiungibile titolo="Cataloghi non disponibili" cosa="i cataloghi di riferimento" />
    );
  }

  const perCategoria = new Map<string, RischioCatalogo[]>();
  for (const rischio of rischi.rischi) {
    perCategoria.set(rischio.categoria, [...(perCategoria.get(rischio.categoria) ?? []), rischio]);
  }

  return (
    <>
      <h1 className="mb-1.5 text-2xl font-bold tracking-tight">Cataloghi di riferimento</h1>
      <p className="mb-8 max-w-2xl text-sm leading-relaxed text-testo-tenue">
        Il vocabolario comune della piattaforma. Catalogo chiuso e versionato: due analisi condotte a mesi
        di distanza devono parlare la stessa lingua, altrimenti il confronto storico e il monitoraggio non
        hanno significato.
      </p>

      <Sezione titolo="Rischi d’impresa" sottotitolo={`${rischi.rischi.length} rischi · ISO 31000:2018`}>
        <div className="space-y-6">
          {[...perCategoria.entries()].map(([categoria, elenco]) => (
            <div key={categoria}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-testo-debole">
                {categoria.replace(/-/g, ' ')}
              </h3>
              <div className="grid gap-2 md:grid-cols-2">
                {elenco.map((rischio) => (
                  <Scheda key={rischio.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium">{rischio.etichetta}</p>
                      <span className="tabular text-xs text-testo-debole">
                        P{rischio.probabilitaBase} × I{rischio.impattoBase}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-testo-tenue">{rischio.descrizione}</p>
                    {!rischio.assicurabile && (
                      <p className="mt-1.5 text-xs text-alto">
                        Non trasferibile: si assicurano le spese di difesa, non la sanzione.
                      </p>
                    )}
                    {rischio.riferimenti.length > 0 && (
                      <p className="mt-1.5 text-xs text-testo-debole">{rischio.riferimenti.join(' · ')}</p>
                    )}
                  </Scheda>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Sezione>

      <Sezione
        titolo="Coperture assicurative"
        sottotitolo={`${coperture.coperture.length} garanzie · mercato italiano, rami danni`}
      >
        <div className="grid gap-2 md:grid-cols-2">
          {coperture.coperture.map((copertura) => (
            <Scheda key={copertura.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">{copertura.etichetta}</p>
                {copertura.obbligoDiLegge && (
                  <span className="rounded border border-critico/40 bg-critico-fondo px-1.5 py-0.5 text-xs font-medium text-critico">
                    ⚖ obbligo
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-testo-tenue">{copertura.descrizione}</p>
              {copertura.insidie.length > 0 && (
                <details className="group mt-2">
                  <summary className="cursor-pointer list-none text-xs font-medium text-marchio hover:underline">
                    <span className="group-open:hidden">▸ Errori ricorrenti</span>
                    <span className="hidden group-open:inline">▾ Nascondi</span>
                  </summary>
                  <ul className="mt-1.5 space-y-1 text-xs">
                    {copertura.insidie.map((insidia) => (
                      <li key={insidia} className="border-l-2 border-bordo-forte pl-2 text-testo-tenue">
                        {insidia}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Scheda>
          ))}
        </div>
      </Sezione>
    </>
  );
}
