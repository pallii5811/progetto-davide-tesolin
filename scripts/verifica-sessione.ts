/**
 * Collaudo del ciclo di vita di una sessione, su servizio reale.
 *
 *   npx tsx scripts/verifica-sessione.ts admin@aegis.local <password>
 *
 * Verifica le tre proprietà che rendono una sessione difendibile:
 *  1. senza credenziali non si entra;
 *  2. con le credenziali si entra e si lavora;
 *  3. **dopo la disconnessione una copia del token non funziona più**.
 *
 * La terza è ciò che un token autofirmato non può garantire, ed è la ragione per cui le
 * sessioni stanno su database.
 */

const API = process.env['AEGIS_API_URL'] ?? 'http://127.0.0.1:3001';
const NOME_COOKIE = 'aegis_sessione';

const email = process.argv[2];
const password = process.argv[3];

if (email === undefined || password === undefined) {
  console.error('Uso: npx tsx scripts/verifica-sessione.ts <email> <password>');
  process.exit(1);
}

const esito = (etichetta: string, atteso: number, ottenuto: number): void => {
  const segno = atteso === ottenuto ? '✔' : '✖';
  console.log(`${segno} ${etichetta.padEnd(52, '.')} HTTP ${ottenuto} (atteso ${atteso})`);
};

async function main(): Promise<void> {
  console.log('');

  // 1. Senza credenziali
  const anonima = await fetch(`${API}/api/portafoglio`);
  esito('senza sessione', 401, anonima.status);

  // 2. Accesso
  const accesso = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  esito('accesso con credenziali corrette', 200, accesso.status);

  if (!accesso.ok) {
    console.error(`\nAccesso non riuscito: ${await accesso.text()}`);
    process.exit(1);
  }

  const token = estraiToken(accesso.headers.getSetCookie());
  if (token === null) {
    console.error('\nNessun cookie di sessione nella risposta.');
    process.exit(1);
  }
  const cookie = `${NOME_COOKIE}=${token}`;

  // 3. Con la sessione
  const conSessione = await fetch(`${API}/api/portafoglio`, { headers: { cookie } });
  esito('portafoglio con sessione', 200, conSessione.status);

  const chiSono = await fetch(`${API}/api/auth/me`, { headers: { cookie } });
  const identita = (await chiSono.json()) as { email?: string; ruolo?: string };
  console.log(`  identità: ${identita.email ?? '?'} · ruolo ${identita.ruolo ?? '?'}`);

  // 4. Disconnessione senza corpo né Content-Type: il caso che rompeva la rotta.
  const uscita = await fetch(`${API}/api/auth/logout`, { method: 'POST', headers: { cookie } });
  esito('disconnessione senza corpo', 200, uscita.status);

  // 5. Riuso del token dopo la revoca
  const dopo = await fetch(`${API}/api/portafoglio`, { headers: { cookie } });
  esito('riuso della copia del token revocato', 401, dopo.status);

  console.log('');
}

function estraiToken(intestazioni: readonly string[]): string | null {
  for (const intestazione of intestazioni) {
    const trovato = new RegExp(`${NOME_COOKIE}=([^;]+)`).exec(intestazione);
    const valore = trovato?.[1];
    if (valore !== undefined && valore !== '') return valore;
  }
  return null;
}

main().catch((errore: unknown) => {
  console.error(errore instanceof Error ? errore.message : errore);
  process.exit(1);
});
