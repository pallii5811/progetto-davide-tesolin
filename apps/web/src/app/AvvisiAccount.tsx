import { BottoneReinvio } from './BottoneReinvio';

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
}: {
  acquistiAbilitati: boolean;
  /** Vero solo se l'indirizzo non è confermato **e** la posta può spedire il collegamento. */
  emailDaConfermare: boolean;
  email: string | undefined;
}) {
  if (acquistiAbilitati && !emailDaConfermare) return null;

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
