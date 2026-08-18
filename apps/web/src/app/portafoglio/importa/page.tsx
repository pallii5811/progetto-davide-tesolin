import Link from 'next/link';
import { richiediSessione } from '@/lib/sessione';
import { ModuloImportazione } from './ModuloImportazione';

export const dynamic = 'force-dynamic';

export default async function PaginaImportazione() {
  await richiediSessione();

  return (
    <>
      <Link href="/portafoglio" className="mb-4 inline-block text-sm text-marchio hover:underline">
        ← Portafoglio
      </Link>

      <h1 className="mb-1.5 text-2xl font-bold tracking-tight">Prendi in carico il tuo portafoglio</h1>
      <p className="mb-8 max-w-3xl text-sm leading-relaxed text-testo-tenue">
        Carica l&apos;elenco dei clienti così com&apos;è: l&apos;esportazione del gestionale va bene, senza
        riformattarla. La piattaforma riconosce da sola separatore e intestazioni, reintegra gli zeri
        iniziali che i fogli di calcolo tolgono alle partite IVA, e dice riga per riga cosa non riesce a
        leggere.
      </p>

      <div className="mb-8 rounded-lg border border-marchio/30 bg-marchio-tenue p-4 text-sm leading-relaxed">
        <p className="font-medium">Prima si legge, poi si spende.</p>
        <p className="mt-1 text-testo-tenue">
          La lettura del file non costa nulla e non acquisisce niente: mostra quante aziende verrebbero
          prese in carico e quanto costerebbe. Solo dopo, e solo se confermi, partono le chiamate. Le
          aziende già in portafoglio non vengono riacquistate.
        </p>
      </div>

      <ModuloImportazione />
    </>
  );
}
