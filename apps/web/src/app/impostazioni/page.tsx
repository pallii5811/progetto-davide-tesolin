import { Scheda } from '@/components/ui';
import { ModuloPassword } from './ModuloPassword';

export const dynamic = 'force-dynamic';

export default function PaginaAccesso() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Cambia password</h2>
        <p className="mb-4 text-sm leading-relaxed text-testo-tenue">
          Serve la password attuale: senza, chiunque trovasse la postazione incustodita potrebbe chiuderti
          fuori dal tuo studio.
        </p>
        <ModuloPassword />
      </section>

      <Scheda className="h-fit text-sm leading-relaxed text-testo-tenue">
        <p className="font-medium text-testo">Come scegliere una password</p>
        <ul className="mt-2 space-y-1.5">
          <li>
            Almeno 12 caratteri. Una frase di quattro parole non collegate fra loro è più robusta e più
            facile da ricordare di otto caratteri con simboli.
          </li>
          <li>Diversa da quelle usate altrove: le violazioni di altri servizi si propagano.</li>
          <li>
            Al cambio, tutti gli altri dispositivi collegati vengono scollegati. È voluto: è la ragione
            principale per cui si cambia una password.
          </li>
        </ul>
      </Scheda>
    </div>
  );
}
