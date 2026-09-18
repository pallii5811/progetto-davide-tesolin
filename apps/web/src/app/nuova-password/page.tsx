import { CollegamentoPubblico, CornicePubblica } from '@/components/accesso';
import { ModuloNuovaPassword } from './ModuloNuovaPassword';
import { scegliNuovaPassword } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Nuova password · AEGIS',
  // Il codice sta nell'indirizzo: la pagina non deve finire nei motori, né passarlo ad altri siti.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * La pagina del collegamento ricevuto per email.
 *
 * Aprirla non consuma niente: il codice si usa solo quando si salva la password. I filtri
 * antivirus che aprono i collegamenti prima della persona non lo bruciano, e chi chiude la
 * pagina per sbaglio può riaprirla dall'email finché non scade.
 */
export default async function PaginaNuovaPassword({
  searchParams,
}: {
  searchParams: Promise<{ codice?: string | string[] }>;
}) {
  const { codice } = await searchParams;
  const valido = typeof codice === 'string' && codice.length >= 20 && codice.length <= 200;

  const piede = (
    <p>
      <CollegamentoPubblico href="/accedi">Torna all’accesso</CollegamentoPubblico>
    </p>
  );

  if (!valido) {
    return (
      <CornicePubblica titolo="Collegamento incompleto" piede={piede}>
        <p className="text-sm leading-relaxed text-testo-tenue">
          Apri di nuovo il collegamento dall’email, oppure{' '}
          <CollegamentoPubblico href="/password-dimenticata">chiedine uno nuovo</CollegamentoPubblico>.
        </p>
      </CornicePubblica>
    );
  }

  return (
    <CornicePubblica
      titolo="Scegli una nuova password"
      sottotitolo="Dopo il salvataggio si chiudono tutte le sessioni aperte, e rientri con quella nuova."
      piede={piede}
    >
      <ModuloNuovaPassword azione={scegliNuovaPassword} codice={codice} />
    </CornicePubblica>
  );
}
