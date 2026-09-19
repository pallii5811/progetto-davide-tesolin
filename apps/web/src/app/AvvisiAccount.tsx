import { BottoneReinvio } from './BottoneReinvio';

function euro(centesimi: number): string {
  return (centesimi / 100).toFixed(2).replace('.', ',');
}

/**
 * Il credito di un account di prova (19/09/2026: «in totale può usare massimo 5 euro»): quanto ne
 * ha usato, con una barra. Sempre visibile, perché scoprire il limite al momento del rifiuto è il
 * modo peggiore di scoprirlo; a credito finito cambia colore e dice cosa resta possibile.
 */
function CreditoProva({
  limiteCentesimi,
  spesoCentesimi,
}: {
  limiteCentesimi: number;
  spesoCentesimi: number;
}) {
  const finito = spesoCentesimi >= limiteCentesimi;
  const quota =
    limiteCentesimi === 0 ? 100 : Math.min(100, Math.round((spesoCentesimi / limiteCentesimi) * 100));
  return (
    <div
      role="status"
      className={`border-b ${finito ? 'border-attenzione/30 bg-attenzione-fondo' : 'border-bordo bg-superficie'}`}
    >
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-2.5 sm:px-8 lg:px-10">
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">
            {finito ? 'Credito di prova esaurito.' : 'Account di prova.'}
          </span>{' '}
          {finito
            ? `Hai usato ${euro(spesoCentesimi)} € dei ${euro(limiteCentesimi)} € per i dati: le aziende già analizzate restano consultabili, il conteggio resta gratuito.`
            : `Hai usato ${euro(spesoCentesimi)} € dei ${euro(limiteCentesimi)} € a disposizione per i dati.`}
        </p>
        <span aria-hidden="true" className="h-1.5 w-32 overflow-hidden rounded-full bg-bordo">
          <span
            className={`block h-full rounded-full ${finito ? 'bg-attenzione' : 'bg-marchio'}`}
            style={{ width: `${quota}%` }}
          />
        </span>
      </div>
    </div>
  );
}

/**
 * I due avvisi di un account appena registrato, sotto l'intestazione di ogni pagina.
 *
 * Restano finché la cosa non è fatta, e non oltre: l'attesa di attivazione sparisce quando il
 * gestore attiva lo studio, la conferma quando si apre il collegamento. Niente «chiudi»:
 * un avviso chiuso e dimenticato è un elenco che non si riesce a creare senza capire perché.
 */
export function AvvisiAccount({
  acquistiAbilitati,
  emailDaConfermare,
  email,
  creditoProva,
}: {
  acquistiAbilitati: boolean;
  /** Vero solo se l'indirizzo non è confermato **e** la posta può spedire il collegamento. */
  emailDaConfermare: boolean;
  email: string | undefined;
  /** Gli account di prova: il credito per i dati e quanto ne è stato usato, in centesimi. */
  creditoProva: { limiteCentesimi: number; spesoCentesimi: number } | null;
}) {
  if (acquistiAbilitati && !emailDaConfermare && creditoProva === null) return null;

  return (
    <div className="no-print">
      {!acquistiAbilitati && (
        <div role="status" className="border-b border-attenzione/30 bg-attenzione-fondo">
          <p className="mx-auto max-w-7xl px-6 py-2.5 text-sm leading-relaxed">
            <span className="font-semibold">Studio in attesa di attivazione.</span> Puoi usare AEGIS e
            contare le aziende gratis; creare elenchi e analisi si sblocca appena la piattaforma attiva lo
            studio.
          </p>
        </div>
      )}
      {creditoProva !== null && <CreditoProva {...creditoProva} />}
      {emailDaConfermare && (
        <div role="status" className="border-b border-marchio/20 bg-marchio-tenue">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-2.5">
            <p className="text-sm leading-relaxed">
              <span className="font-semibold">Conferma il tuo indirizzo.</span> Ti abbiamo mandato un
              collegamento
              {email === undefined ? '' : ` a ${email}`}.
            </p>
            <BottoneReinvio />
          </div>
        </div>
      )}
    </div>
  );
}
