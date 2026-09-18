import { headers } from 'next/headers';

/**
 * L'indirizzo del visitatore, da inoltrare all'API.
 *
 * Le chiamate all'API partono dal server delle pagine, e l'API vede l'indirizzo di questo
 * server — uguale per tutti. Il freno delle rotte pubbliche (registrazione, password
 * dimenticata) conterebbe allora ogni visitatore come uno solo, e cinque registrazioni in
 * un'ora da chiunque fermerebbero tutti.
 *
 * `x-forwarded-for` lo scrive chi sta davanti a queste pagine — Vercel, o Caddy sul server —
 * sostituendo quello che manda il browser; il primo valore è il visitatore. L'API gli crede
 * solo quando la richiesta porta anche la chiave del frontend (vedi `ipCliente` nell'API):
 * senza chiave l'intestazione non conta, perché chiunque potrebbe scriversela.
 */
export async function intestazioneIpCliente(): Promise<Record<string, string>> {
  let raccolta: Headers;
  try {
    raccolta = await headers();
  } catch {
    // Fuori da una richiesta (una prova, uno script) non c'è nessun visitatore da indicare.
    return {};
  }
  const primo =
    raccolta.get('x-forwarded-for')?.split(',')[0]?.trim() ?? raccolta.get('x-real-ip')?.trim() ?? '';
  return /^[0-9a-fA-F:.]{2,45}$/.test(primo) ? { 'x-aegis-ip-cliente': primo } : {};
}
