import {
  IconaCampana,
  IconaCrm,
  IconaDocumento,
  IconaGrafico,
  IconaIngranaggio,
  IconaLente,
  IconaPalazzo,
  IconaPersone,
  IconaScudo,
} from './icone';
import { Anello, OMBRA_FINESTRA } from './pezzi';

/**
 * «Tutto il Registro Imprese, in una scheda»: la finestra del prodotto con i dati camerali e i
 * bilanci (richiesta di Simone del 18/09/2026, «con il mockup dove si vedono tutti i dati
 * finanziari»), nello stile della finestra di clay.com/signals — barra laterale, contenuto al
 * centro, pannello a destra, su un fondo azzurro che sfuma.
 *
 * Ogni voce esiste davvero nella scheda del prodotto (app/azienda/[id]/page.tsx): il record
 * camerale, il «Bilancio riclassificato» con conto economico a valore aggiunto e stato
 * patrimoniale, i 21 indici, i soci, i tre rischi. I numeri sono di esempio ma tornano fra loro
 * e con le altre illustrazioni, sulla stessa azienda inventata:
 *
 *   ricavi 19.800.000 € = fatturato dichiarato; /365 = 54.246,58 € (il pannello del fermo)
 *   EBITDA 2.350.000 / ricavi = 11,9 %          utile 842.000 / PN 6.150.000 = ROE 13,7 %
 *   PFN 3.920.000 / EBITDA = 1,67               PN / totale attivo 16.400.000 = 37,5 %
 *   Property 5,17 · Business Interruption 5,17 · Cyber 5,1 (divisione ATECO 52)
 *
 * Tutta la finestra è nascosta ai lettori di schermo: il testo della sezione dice già che cosa
 * contiene, e numeri finti letti ad alta voce sembrerebbero dati veri.
 */

const RECORD: readonly (readonly [string, string])[] = [
  ['Forma giuridica', 'Società per azioni'],
  ['Camera di commercio', 'Bergamo'],
  ['Costituita il', '12/03/1998'],
  ['Capitale versato', '1.200.000 €'],
  ['Addetti', '118'],
  ['Fatturato dichiarato', '19.800.000 €'],
  ['Unità locali', '3'],
  ['Attività iniziata il', '01/06/1998'],
];

/**
 * Il bilancio come lo riclassifica la scheda: conto economico a valore aggiunto e stato
 * patrimoniale finanziario. La barra è proporzionale ai ricavi, per leggere le grandezze a occhio.
 */
type RigaBilancio = { voce: string; valore: string; quota: number; forte?: boolean };

const CONTO_ECONOMICO: readonly RigaBilancio[] = [
  { voce: 'Ricavi', valore: '19.800.000 €', quota: 1, forte: true },
  { voce: 'Valore aggiunto', valore: '7.260.000 €', quota: 7.26 / 19.8 },
  { voce: 'EBITDA', valore: '2.350.000 €', quota: 2.35 / 19.8, forte: true },
  { voce: 'Utile netto', valore: '842.000 €', quota: 0.842 / 19.8 },
];

const STATO_PATRIMONIALE: readonly RigaBilancio[] = [
  { voce: 'Totale attivo', valore: '16.400.000 €', quota: 16.4 / 19.8, forte: true },
  { voce: 'Patrimonio netto', valore: '6.150.000 €', quota: 6.15 / 19.8 },
  { voce: 'Totale debiti', valore: '10.250.000 €', quota: 10.25 / 19.8 },
  { voce: 'Posizione finanziaria netta', valore: '3.920.000 €', quota: 3.92 / 19.8 },
];

function RigheBilancio({ titolo, righe }: { titolo: string; righe: readonly RigaBilancio[] }) {
  return (
    <div className="min-w-0">
      <p className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.06em] text-vetrina-grigio">
        {titolo}
      </p>
      <div className="divide-y divide-vetrina-linea">
        {righe.map((riga) => (
          <div key={riga.voce} className="px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span
                className={`min-w-0 truncate ${riga.forte === true ? 'font-medium' : 'text-vetrina-grigio'}`}
              >
                {riga.voce}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{riga.valore}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-vetrina-velo">
              <div
                className="h-full rounded-full bg-vetrina-blu/70"
                style={{ width: `${Math.round(riga.quota * 1000) / 10}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const INDICI: readonly (readonly [string, string])[] = [
  ['EBITDA margin', '11,9 %'],
  ['ROE', '13,7 %'],
  ['PFN / EBITDA', '1,67'],
  ['Equity ratio', '37,5 %'],
];

function VoceMenu({
  icona,
  testo,
  attiva = false,
  nota,
}: {
  icona: React.ReactNode;
  testo: string;
  attiva?: boolean;
  nota?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] ${
        attiva ? 'bg-vetrina-blu/10 font-medium text-vetrina-blu' : 'text-vetrina-inchiostro'
      }`}
    >
      <span className={attiva ? 'text-vetrina-blu' : 'text-vetrina-grigio'}>{icona}</span>
      <span className="truncate">{testo}</span>
      {nota !== undefined && (
        <span className="ml-auto rounded-full bg-vetrina-velo px-1.5 py-0.5 text-[10.5px] text-vetrina-grigio">
          {nota}
        </span>
      )}
    </div>
  );
}

function Scheda({
  titolo,
  icona,
  children,
}: {
  titolo: string;
  icona: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-vetrina-linea bg-white">
      <div className="flex items-center gap-2 border-b border-vetrina-linea px-4 py-3">
        <span className="text-vetrina-grigio">{icona}</span>
        <span className="text-[13.5px] font-semibold tracking-[-0.01em]">{titolo}</span>
      </div>
      {children}
    </div>
  );
}

export function SchedaRegistro() {
  return (
    <div aria-hidden="true" className="relative mx-auto mt-14 max-w-[1240px] px-4 sm:px-6">
      {/* Il fondo azzurro dietro la finestra, come su Clay: più largo in basso, e sfuma nella carta. */}
      <div className="relative overflow-hidden rounded-[36px] bg-[linear-gradient(180deg,oklch(0.9_0.05_245),oklch(0.83_0.08_248))] px-3 pt-8 sm:rounded-[44px] sm:px-8 sm:pt-12 lg:px-14 lg:pt-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(255,255,255,0.55),transparent_70%)]" />

        <div
          className={`relative mx-auto h-[640px] overflow-hidden rounded-t-[22px] border border-b-0 border-white/70 bg-white sm:h-[700px] ${OMBRA_FINESTRA}`}
        >
          <div className="flex h-full">
            {/* ── Barra laterale ── */}
            <aside className="hidden w-[212px] shrink-0 flex-col border-r border-vetrina-linea bg-vetrina-carta/60 p-3 md:flex">
              <div className="mb-4 flex items-center gap-2 px-1.5 pt-1">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-vetrina-inchiostro text-white">
                  <IconaScudo className="h-4 w-4" />
                </span>
                <span className="text-[14px] font-semibold tracking-[-0.02em]">AEGIS</span>
              </div>
              <div className="space-y-0.5">
                <VoceMenu icona={<IconaLente className="h-4 w-4" />} testo="Ricerca Clienti" />
                <VoceMenu icona={<IconaCrm className="h-4 w-4" />} testo="CRM" attiva />
                <VoceMenu
                  icona={<IconaCampana className="h-4 w-4" />}
                  testo="Monitoraggio"
                  nota="in arrivo"
                />
                <VoceMenu icona={<IconaIngranaggio className="h-4 w-4" />} testo="Impostazioni" />
              </div>
              <p className="mb-1.5 mt-6 px-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-vetrina-grigio">
                Elenchi
              </p>
              <div className="space-y-0.5">
                <VoceMenu
                  icona={<IconaDocumento className="h-4 w-4" />}
                  testo="Bergamo · ATECO 52"
                  attiva
                />
                <VoceMenu icona={<IconaDocumento className="h-4 w-4" />} testo="Brescia · 20–250 dip." />
                <VoceMenu icona={<IconaDocumento className="h-4 w-4" />} testo="Treviglio · manifattura" />
              </div>
            </aside>

            {/* ── Contenuto ── */}
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-vetrina-linea px-4 py-3.5 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-vetrina-blu/10 text-vetrina-blu">
                    <IconaPalazzo className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[15.5px] font-semibold tracking-[-0.02em]">
                      <span className="truncate">Logistica Orobia S.p.A.</span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[oklch(0.95_0.05_150)] px-2 py-0.5 text-[11px] font-medium text-[oklch(0.42_0.12_150)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.62_0.15_150)]" />
                        attiva
                      </span>
                    </p>
                    <p className="truncate text-[12.5px] text-vetrina-grigio">
                      Dalmine (BG) · ATECO 52.10 · Magazzinaggio e custodia
                    </p>
                  </div>
                </div>
                <span className="hidden items-center gap-1.5 rounded-full bg-vetrina-inchiostro px-3.5 py-1.5 text-[12.5px] font-medium text-white sm:inline-flex">
                  <IconaDocumento className="h-3.5 w-3.5" />
                  Report per il cliente
                </span>
              </div>

              <div className="flex gap-1.5 overflow-hidden border-b border-vetrina-linea px-4 py-2.5 text-[12.5px] sm:px-6">
                {['Profilo dell’impresa', 'Property Risk', 'Business Interruption', 'Cyber Risk'].map(
                  (t, i) => (
                    <span
                      key={t}
                      className={`shrink-0 rounded-full px-3 py-1 ${
                        i === 0
                          ? 'bg-vetrina-inchiostro font-medium text-white'
                          : 'border border-vetrina-linea text-vetrina-grigio'
                      }`}
                    >
                      {t}
                    </span>
                  ),
                )}
              </div>

              <div className="space-y-4 p-4 sm:p-6">
                <Scheda titolo="Record camerale" icona={<IconaPalazzo className="h-4 w-4" />}>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 lg:grid-cols-4">
                    {RECORD.map(([voce, valore]) => (
                      <div key={voce} className="min-w-0">
                        <dt className="truncate text-[11.5px] text-vetrina-grigio">{voce}</dt>
                        <dd className="mt-0.5 truncate text-[13px] font-medium tabular-nums">{valore}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="border-t border-vetrina-linea px-4 py-2.5 text-[11.5px] text-vetrina-grigio">
                    Registro Imprese · letto oggi
                  </p>
                </Scheda>

                <Scheda titolo="Bilancio riclassificato 2024" icona={<IconaGrafico className="h-4 w-4" />}>
                  <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-vetrina-linea">
                    <RigheBilancio titolo="Conto economico" righe={CONTO_ECONOMICO} />
                    <RigheBilancio titolo="Stato patrimoniale" righe={STATO_PATRIMONIALE} />
                  </div>
                </Scheda>
              </div>
            </div>

            {/* ── Pannello a destra ── */}
            <aside className="hidden w-[268px] shrink-0 flex-col gap-5 border-l border-vetrina-linea p-4 xl:flex">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-vetrina-grigio">
                  Indici di bilancio
                </p>
                <div className="mt-2 divide-y divide-vetrina-linea rounded-xl border border-vetrina-linea">
                  {INDICI.map(([voce, valore]) => (
                    <div key={voce} className="flex items-center justify-between px-3 py-2 text-[12.5px]">
                      <span className="text-vetrina-grigio">{voce}</span>
                      <span className="font-semibold tabular-nums">{valore}</span>
                    </div>
                  ))}
                  <div className="px-3 py-2 text-[12px] text-vetrina-blu">+ altri 17 indici</div>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-vetrina-grigio">
                  Soci e titolare effettivo
                </p>
                <div className="mt-2 space-y-2">
                  {[
                    ['Holding Orobia S.r.l.', 'società', '70 %'],
                    ['Persona fisica', 'socio', '30 %'],
                  ].map(([nome, tipo, quota]) => (
                    <div
                      key={nome}
                      className="flex items-center gap-2.5 rounded-xl border border-vetrina-linea px-3 py-2"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-vetrina-velo text-vetrina-grigio">
                        <IconaPersone className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium">{nome}</span>
                        <span className="block text-[11px] text-vetrina-grigio">{tipo}</span>
                      </span>
                      <span className="text-[12.5px] font-semibold tabular-nums">{quota}</span>
                    </div>
                  ))}
                  <p className="px-1 text-[11.5px] text-vetrina-grigio">Titolare effettivo individuato</p>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-vetrina-grigio">
                  Rischio
                </p>
                <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-vetrina-linea px-1 py-3">
                  {[
                    ['5,17', 5.17, 'Property'],
                    ['5,17', 5.17, 'Interruzione'],
                    ['5,1', 5.1, 'Cyber'],
                  ].map(([testo, valore, nome]) => (
                    <div key={String(nome)} className="flex flex-col items-center gap-1">
                      <Anello valore={Number(valore)} testo={String(testo)} dimensione={52} />
                      <span className="text-[11px] text-vetrina-grigio">{nome}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>

          {/* La finestra continua sotto: sfuma nel bianco invece di tagliarsi. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white to-transparent" />
        </div>
      </div>
    </div>
  );
}
