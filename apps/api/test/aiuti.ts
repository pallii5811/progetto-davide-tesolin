import { creaUtente } from '@aegis/db';
import { MockCompanyProvider } from '@aegis/providers';
import type { FastifyInstance } from 'fastify';
import { derivaPassword, NOME_COOKIE_SESSIONE } from '../src/auth.js';
import { creaPersistenza } from '../src/persistenza.js';
import type { Persistenza } from '../src/persistenza.js';
import { buildServer } from '../src/server.js';

export const PASSWORD_DI_PROVA = 'passphrase-di-prova-lunga';

export async function persistenzaDiProva(nome = 'Broker di prova'): Promise<Persistenza> {
  return creaPersistenza({ denominazioneTenant: nome });
}

export async function creaUtenteDiProva(
  persistenza: Persistenza,
  email: string,
  tenantId?: string,
): Promise<string> {
  return creaUtente(persistenza.db, {
    tenantId: tenantId ?? persistenza.tenantPredefinito,
    email,
    nome: 'Utente di prova',
    passwordHash: await derivaPassword(PASSWORD_DI_PROVA),
    ruolo: 'broker',
  });
}

export function serverDiProva(persistenza: Persistenza): FastifyInstance {
  return buildServer({ provider: new MockCompanyProvider(), persistenza });
}

/** Esegue l'accesso e restituisce il cookie di sessione da riusare nelle richieste. */
export async function accedi(app: FastifyInstance, email: string): Promise<string> {
  const risposta = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: PASSWORD_DI_PROVA },
  });

  if (risposta.statusCode !== 200) {
    throw new Error(`Accesso non riuscito: ${risposta.statusCode} ${risposta.body}`);
  }

  const cookie = risposta.cookies.find((c) => c.name === NOME_COOKIE_SESSIONE);
  if (cookie === undefined) throw new Error('Cookie di sessione assente nella risposta');
  return `${NOME_COOKIE_SESSIONE}=${cookie.value}`;
}
