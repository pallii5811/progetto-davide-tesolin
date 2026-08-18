'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CampoData,
  CampoNumero,
  CampoPercentuale,
  CampoSelezione,
  CampoTesto,
  CampoTriStato,
  GruppoCampi,
} from '@/components/campi';
import { COPERTURE } from '@/lib/coperture';

export interface ImmobileForm {
  descrizione: string;
  superficieMq: number | null;
  titolo: 'proprieta' | 'locazione' | 'comodato' | 'leasing' | 'misto';
  tipologiaCostruttiva:
    'muratura' | 'cemento-armato' | 'prefabbricato' | 'acciaio' | 'legno' | 'misto' | null;
  annoCostruzione: number | null;
  presenzaImpiantoAntincendio: boolean | null;
  presenzaAllarme: boolean | null;
}

export interface PolizzaForm {
  id: string;
  coverage: string;
  compagnia: string;
  numeroPolizza: string | null;
  sommaAssicurataEuro: number | null;
  massimaleEuro: number | null;
  franchigiaEuro: number | null;
  premioAnnuoEuro: number | null;
  dataEffetto: string;
  dataScadenza: string;
  formaGaranzia: 'valore-a-nuovo' | 'valore-allo-stato-duso' | 'primo-rischio-assoluto' | null;
}

export interface DatiForm {
  immobili: ImmobileForm[];
  numeroVeicoli: number | null;
  numeroDipendenti: number | null;
  quotaExportPercentuale: number | null;
  esportaVersoUsaCanada: boolean | null;
  trattaDatiPersonali: boolean | null;
  trattaDatiParticolari: boolean | null;
  haSitoEcommerce: boolean | null;
  haModello231: boolean | null;
  certificazioni: string[];
  concentrazionePrimoCliente: number | null;
  lavoraInCantiere: boolean | null;
  produceBeniFinali: boolean | null;
  trasportaMerciProprie: boolean | null;
  periodoIndennizzoMesi: number | null;
}

const CERTIFICAZIONI_NOTE = [
  'ISO 9001',
  'ISO 14001',
  'ISO 27001',
  'ISO 45001',
  'EMAS',
  'SOA',
  'IATF 16949',
] as const;

const TITOLI = [
  { valore: 'proprieta' as const, testo: 'Proprietà' },
  { valore: 'locazione' as const, testo: 'Locazione' },
  { valore: 'comodato' as const, testo: 'Comodato' },
  { valore: 'leasing' as const, testo: 'Leasing' },
  { valore: 'misto' as const, testo: 'Misto' },
];

const TIPOLOGIE = [
  { valore: 'prefabbricato' as const, testo: 'Prefabbricato — 750 €/mq' },
  { valore: 'acciaio' as const, testo: 'Acciaio — 850 €/mq' },
  { valore: 'cemento-armato' as const, testo: 'Cemento armato — 950 €/mq' },
  { valore: 'legno' as const, testo: 'Legno — 1.000 €/mq' },
  { valore: 'muratura' as const, testo: 'Muratura — 1.050 €/mq' },
  { valore: 'misto' as const, testo: 'Misto — 950 €/mq' },
];

const FORME_GARANZIA = [
  { valore: 'valore-a-nuovo' as const, testo: 'Valore a nuovo' },
  { valore: 'valore-allo-stato-duso' as const, testo: 'Valore allo stato d’uso' },
  { valore: 'primo-rischio-assoluto' as const, testo: 'Primo rischio assoluto' },
];

export function EditorDossier({
  identificativo,
  datiIniziali,
  polizzeIniziali,
  salva,
}: {
  identificativo: string;
  datiIniziali: DatiForm;
  polizzeIniziali: PolizzaForm[];
  salva: (
    id: string,
    payload: { datiDichiarati: unknown; polizze: unknown },
  ) => Promise<{ ok: boolean; messaggio: string; completezza?: { percentuale: number; livello: string } }>;
}) {
  const router = useRouter();
  const [dati, setDati] = useState<DatiForm>(datiIniziali);
  const [polizze, setPolizze] = useState<PolizzaForm[]>(polizzeIniziali);
  const [esito, setEsito] = useState<{ ok: boolean; messaggio: string } | null>(null);
  const [inCorso, avvia] = useTransition();

  const aggiorna = <K extends keyof DatiForm>(chiave: K, valore: DatiForm[K]): void => {
    setDati((precedente) => ({ ...precedente, [chiave]: valore }));
    setEsito(null);
  };

  const aggiornaImmobile = (indice: number, patch: Partial<ImmobileForm>): void => {
    setDati((precedente) => ({
      ...precedente,
      immobili: precedente.immobili.map((i, n) => (n === indice ? { ...i, ...patch } : i)),
    }));
    setEsito(null);
  };

  const onSalva = (): void => {
    avvia(async () => {
      // Un immobile senza descrizione non passa la validazione al confine API:
      // meglio scartarlo qui che restituire un errore su una riga vuota lasciata per sbaglio.
      const immobiliValidi = dati.immobili.filter((i) => i.descrizione.trim() !== '');
      const polizzeValide = polizze.filter(
        (p) => p.compagnia.trim() !== '' && p.dataEffetto !== '' && p.dataScadenza !== '',
      );

      const risultato = await salva(identificativo, {
        datiDichiarati: { ...dati, immobili: immobiliValidi },
        polizze: polizzeValide,
      });

      setEsito(risultato);
      if (risultato.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-5 pb-24">
      {/* ── Immobili ─────────────────────────────────────────────────────── */}
      <fieldset className="rounded-lg border border-bordo bg-superficie p-4">
        <legend className="px-1.5 text-sm font-semibold">Immobili e sedi</legend>
        <p className="mb-3 text-xs leading-relaxed text-testo-tenue">
          I metri quadri sono il dato che più incide sull&apos;intera analisi: senza, i fabbricati vengono
          stimati dal valore contabile, già decurtato dagli ammortamenti, e la sottoassicurazione è quasi
          garantita.
        </p>

        <div className="space-y-4">
          {dati.immobili.map((immobile, indice) => (
            <div key={indice} className="rounded border border-bordo bg-fondo p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-testo-debole">
                  Immobile {indice + 1}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    aggiorna(
                      'immobili',
                      dati.immobili.filter((_, n) => n !== indice),
                    )
                  }
                  className="rounded px-2 py-1 text-xs text-alto hover:bg-alto-fondo focus:outline-none focus:ring-2 focus:ring-alto/30"
                >
                  Rimuovi
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <CampoTesto
                  etichetta="Descrizione"
                  valore={immobile.descrizione}
                  onChange={(v) => aggiornaImmobile(indice, { descrizione: v })}
                  placeholder="Capannone produttivo — Adro (BS)"
                />
                <CampoNumero
                  etichetta="Superficie"
                  valore={immobile.superficieMq}
                  onChange={(v) => aggiornaImmobile(indice, { superficieMq: v })}
                  suffisso="mq"
                />
                <CampoSelezione
                  etichetta="Titolo di occupazione"
                  valore={immobile.titolo}
                  opzioni={TITOLI}
                  onChange={(v) => aggiornaImmobile(indice, { titolo: v ?? 'proprieta' })}
                />
                <CampoSelezione
                  etichetta="Tipologia costruttiva"
                  valore={immobile.tipologiaCostruttiva}
                  opzioni={TIPOLOGIE}
                  onChange={(v) => aggiornaImmobile(indice, { tipologiaCostruttiva: v })}
                  aiuto="Determina il costo di ricostruzione al metro quadro."
                />
                <CampoTriStato
                  etichetta="Impianto antincendio"
                  valore={immobile.presenzaImpiantoAntincendio}
                  onChange={(v) => aggiornaImmobile(indice, { presenzaImpiantoAntincendio: v })}
                />
                <CampoTriStato
                  etichetta="Allarme antifurto"
                  valore={immobile.presenzaAllarme}
                  onChange={(v) => aggiornaImmobile(indice, { presenzaAllarme: v })}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            aggiorna('immobili', [
              ...dati.immobili,
              {
                descrizione: '',
                superficieMq: null,
                titolo: 'proprieta',
                tipologiaCostruttiva: null,
                annoCostruzione: null,
                presenzaImpiantoAntincendio: null,
                presenzaAllarme: null,
              },
            ])
          }
          className="mt-3 rounded border border-dashed border-bordo-forte px-3 py-2 text-sm text-testo-tenue transition hover:border-marchio hover:text-marchio focus:outline-none focus:ring-2 focus:ring-marchio/25"
        >
          + Aggiungi immobile
        </button>
      </fieldset>

      {/* ── Attività e mercati ───────────────────────────────────────────── */}
      <GruppoCampi
        titolo="Attività e mercati"
        descrizione="L’export verso USA e Canada raddoppia il massimale RC Prodotti consigliato: è la domanda più redditizia dell’intera intervista."
      >
        <CampoNumero
          etichetta="Dipendenti"
          valore={dati.numeroDipendenti}
          onChange={(v) => aggiorna('numeroDipendenti', v)}
          aiuto="Attiva RCO e infortuni; concorre alla scadenza CAT NAT."
        />
        <CampoNumero
          etichetta="Veicoli aziendali"
          valore={dati.numeroVeicoli}
          onChange={(v) => aggiorna('numeroVeicoli', v)}
        />
        <CampoPercentuale
          etichetta="Quota di export"
          valore={dati.quotaExportPercentuale}
          onChange={(v) => aggiorna('quotaExportPercentuale', v)}
        />
        <CampoTriStato
          etichetta="Esporta verso USA o Canada"
          valore={dati.esportaVersoUsaCanada}
          onChange={(v) => aggiorna('esportaVersoUsaCanada', v)}
          aiuto="Regime risarcitorio con danni punitivi: richiede estensione territoriale espressa."
        />
        <CampoTriStato
          etichetta="Immette prodotti finiti sul mercato"
          valore={dati.produceBeniFinali}
          onChange={(v) => aggiorna('produceBeniFinali', v)}
        />
        <CampoTriStato
          etichetta="Lavora presso cantieri o sedi di terzi"
          valore={dati.lavoraInCantiere}
          onChange={(v) => aggiorna('lavoraInCantiere', v)}
        />
        <CampoTriStato
          etichetta="Trasporta merci proprie"
          valore={dati.trasportaMerciProprie}
          onChange={(v) => aggiorna('trasportaMerciProprie', v)}
        />
        <CampoPercentuale
          etichetta="Fatturato sul primo cliente"
          valore={dati.concentrazionePrimoCliente}
          onChange={(v) => aggiorna('concentrazionePrimoCliente', v)}
          aiuto="Sopra il 20% il rischio di concentrazione diventa rilevante."
        />
      </GruppoCampi>

      {/* ── Dati e sistemi ───────────────────────────────────────────────── */}
      <GruppoCampi
        titolo="Dati, sistemi e governance"
        descrizione="Dimensionano il massimale cyber e l’esposizione sanzionatoria."
      >
        <CampoTriStato
          etichetta="Tratta dati personali"
          valore={dati.trattaDatiPersonali}
          onChange={(v) => aggiorna('trattaDatiPersonali', v)}
        />
        <CampoTriStato
          etichetta="Tratta categorie particolari di dati"
          valore={dati.trattaDatiParticolari}
          onChange={(v) => aggiorna('trattaDatiParticolari', v)}
          aiuto="Dati sanitari, biometrici, giudiziari (art. 9 GDPR)."
        />
        <CampoTriStato
          etichetta="Canale e-commerce attivo"
          valore={dati.haSitoEcommerce}
          onChange={(v) => aggiorna('haSitoEcommerce', v)}
        />
        <CampoTriStato
          etichetta="Modello 231 adottato"
          valore={dati.haModello231}
          onChange={(v) => aggiorna('haModello231', v)}
          aiuto="Ha efficacia esimente se attuato e vigilato."
        />
        <CampoNumero
          etichetta="Periodo di indennizzo danni indiretti"
          valore={dati.periodoIndennizzoMesi}
          onChange={(v) => aggiorna('periodoIndennizzoMesi', v)}
          suffisso="mesi"
          min={3}
          aiuto="Sotto i 12 mesi si è quasi certamente sottodimensionati: ricostruire un capannone richiede più di un anno."
        />
      </GruppoCampi>

      {/* ── Certificazioni ───────────────────────────────────────────────── */}
      <fieldset className="rounded-lg border border-bordo bg-superficie p-4">
        <legend className="px-1.5 text-sm font-semibold">Certificazioni di sistema</legend>
        <p className="mb-3 text-xs leading-relaxed text-testo-tenue">
          Ogni certificazione è un controllo documentato: abbassa il rischio residuo e dà argomenti in
          trattativa con la compagnia sul premio.
        </p>
        <div className="flex flex-wrap gap-2">
          {CERTIFICAZIONI_NOTE.map((norma) => {
            const attiva = dati.certificazioni.some((c) => c.toUpperCase().includes(norma));
            return (
              <button
                key={norma}
                type="button"
                aria-pressed={attiva}
                onClick={() =>
                  aggiorna(
                    'certificazioni',
                    attiva
                      ? dati.certificazioni.filter((c) => !c.toUpperCase().includes(norma))
                      : [...dati.certificazioni, norma],
                  )
                }
                className={`rounded-full border px-3 py-1.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-marchio/25 ${
                  attiva
                    ? 'border-marchio bg-marchio text-white'
                    : 'border-bordo-forte bg-fondo hover:border-marchio/50'
                }`}
              >
                {norma}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ── Polizze ──────────────────────────────────────────────────────── */}
      <fieldset className="rounded-lg border border-bordo bg-superficie p-4">
        <legend className="px-1.5 text-sm font-semibold">Polizze in essere</legend>
        <p className="mb-3 text-xs leading-relaxed text-testo-tenue">
          Senza le polizze esistenti la gap analysis può solo dire cosa serve, non cosa manca. I capitali si
          inseriscono in euro.
        </p>

        <div className="space-y-4">
          {polizze.map((polizza, indice) => (
            <div key={polizza.id} className="rounded border border-bordo bg-fondo p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-testo-debole">
                  Polizza {indice + 1}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPolizze(polizze.filter((_, n) => n !== indice));
                    setEsito(null);
                  }}
                  className="rounded px-2 py-1 text-xs text-alto hover:bg-alto-fondo focus:outline-none focus:ring-2 focus:ring-alto/30"
                >
                  Rimuovi
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <CampoSelezione
                  etichetta="Copertura"
                  valore={polizza.coverage}
                  opzioni={COPERTURE}
                  onChange={(v) => aggiornaPolizza(indice, { coverage: v ?? 'incendio' })}
                />
                <CampoTesto
                  etichetta="Compagnia"
                  valore={polizza.compagnia}
                  onChange={(v) => aggiornaPolizza(indice, { compagnia: v })}
                />
                <CampoTesto
                  etichetta="Numero di polizza"
                  valore={polizza.numeroPolizza ?? ''}
                  onChange={(v) => aggiornaPolizza(indice, { numeroPolizza: v === '' ? null : v })}
                />
                <CampoSelezione
                  etichetta="Forma di garanzia"
                  valore={polizza.formaGaranzia}
                  opzioni={FORME_GARANZIA}
                  onChange={(v) => aggiornaPolizza(indice, { formaGaranzia: v })}
                  aiuto="Il primo rischio assoluto esclude la regola proporzionale."
                />
                <CampoNumero
                  etichetta="Somma assicurata"
                  valore={polizza.sommaAssicurataEuro}
                  onChange={(v) => aggiornaPolizza(indice, { sommaAssicurataEuro: v })}
                  suffisso="€"
                />
                <CampoNumero
                  etichetta="Massimale"
                  valore={polizza.massimaleEuro}
                  onChange={(v) => aggiornaPolizza(indice, { massimaleEuro: v })}
                  suffisso="€"
                />
                <CampoNumero
                  etichetta="Premio annuo"
                  valore={polizza.premioAnnuoEuro}
                  onChange={(v) => aggiornaPolizza(indice, { premioAnnuoEuro: v })}
                  suffisso="€"
                />
                <CampoNumero
                  etichetta="Franchigia"
                  valore={polizza.franchigiaEuro}
                  onChange={(v) => aggiornaPolizza(indice, { franchigiaEuro: v })}
                  suffisso="€"
                />
                <CampoData
                  etichetta="Data di effetto"
                  valore={polizza.dataEffetto}
                  onChange={(v) => aggiornaPolizza(indice, { dataEffetto: v })}
                />
                <CampoData
                  etichetta="Data di scadenza"
                  valore={polizza.dataScadenza}
                  onChange={(v) => aggiornaPolizza(indice, { dataScadenza: v })}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            const oggi = new Date().toISOString().slice(0, 10);
            const traUnAnno = new Date();
            traUnAnno.setFullYear(traUnAnno.getFullYear() + 1);
            setPolizze([
              ...polizze,
              {
                id: `pol-${Date.now()}`,
                coverage: 'incendio',
                compagnia: '',
                numeroPolizza: null,
                sommaAssicurataEuro: null,
                massimaleEuro: null,
                franchigiaEuro: null,
                premioAnnuoEuro: null,
                dataEffetto: oggi,
                dataScadenza: traUnAnno.toISOString().slice(0, 10),
                formaGaranzia: null,
              },
            ]);
            setEsito(null);
          }}
          className="mt-3 rounded border border-dashed border-bordo-forte px-3 py-2 text-sm text-testo-tenue transition hover:border-marchio hover:text-marchio focus:outline-none focus:ring-2 focus:ring-marchio/25"
        >
          + Aggiungi polizza
        </button>
      </fieldset>

      {/* ── Barra di salvataggio ─────────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 border-t border-bordo bg-superficie/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div aria-live="polite" className="min-h-5 text-sm">
            {esito !== null && (
              <span className={esito.ok ? 'text-basso' : 'text-critico'}>{esito.messaggio}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push(`/azienda/${identificativo}`)}
              className="rounded border border-bordo-forte px-4 py-2 text-sm transition hover:border-marchio focus:outline-none focus:ring-2 focus:ring-marchio/25"
            >
              Vedi l&apos;analisi
            </button>
            <button
              type="button"
              onClick={onSalva}
              disabled={inCorso}
              className="rounded bg-marchio px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-marchio/40"
            >
              {inCorso ? 'Salvataggio…' : 'Salva e ricalcola'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  function aggiornaPolizza(indice: number, patch: Partial<PolizzaForm>): void {
    setPolizze((precedenti) => precedenti.map((p, n) => (n === indice ? { ...p, ...patch } : p)));
    setEsito(null);
  }
}
