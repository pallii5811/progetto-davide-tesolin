/**
 * Autenticazione.
 *
 * Tre scelte, ciascuna con la sua ragione:
 *
 *  - **scrypt** dalla libreria standard di Node, non una dipendenza esterna. È una funzione
 *    di derivazione deliberatamente lenta e ad alto consumo di memoria: rende l'attacco a
 *    dizionario su un archivio rubato costoso invece che immediato. Un `sha256(password)`
 *    si rompe con una scheda grafica in un pomeriggio.
 *
 *  - **sessioni in database**, non token autofirmati. Una sessione deve poter essere
 *    revocata: un JWT valido fino a scadenza resta valido anche dopo il licenziamento di
 *    un collaboratore. In uno strumento che custodisce i portafogli clienti di un
 *    intermediario, questo non è accettabile.
 *
 *  - **in tabella si conserva l'impronta del token, non il token**. Chi legge il database
 *    non ottiene sessioni utilizzabili.
 */

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * `promisify` non riesce a scegliere l'overload di `scrypt` con le opzioni: si dichiara
 * la firma che serve invece di rinunciare ai parametri di costo, che sono il punto.
 */
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Parametri di derivazione.
 * `N=2^15` è un compromesso fra resistenza e latenza accettabile su hardware modesto:
 * circa 100 ms per verifica. Vanno alzati quando l'hardware lo consente.
 */
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const LUNGHEZZA_CHIAVE = 64;

export const DURATA_SESSIONE_MS = 12 * 60 * 60 * 1_000;
export const SOGLIA_BLOCCO_TENTATIVI = 5;
export const DURATA_BLOCCO_MS = 15 * 60 * 1_000;
export const NOME_COOKIE_SESSIONE = 'aegis_sessione';

export async function derivaPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivata = await scrypt(password.normalize('NFKC'), salt, LUNGHEZZA_CHIAVE, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    // scrypt con N alto supera il limite di memoria predefinito di Node.
    maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
  });

  return [
    'scrypt',
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString('base64url'),
    derivata.toString('base64url'),
  ].join('$');
}

/**
 * Verifica la password.
 *
 * Il confronto è a **tempo costante**: un confronto con `===` si interrompe al primo byte
 * diverso, e la differenza di tempo misurabile consente di ricostruire l'impronta byte
 * per byte. È un attacco reale, non teorico.
 *
 * I parametri vengono letti dal record e non dalle costanti: irrobustirli in futuro non
 * deve invalidare le password già registrate.
 */
export async function verificaPassword(password: string, record: string): Promise<boolean> {
  const parti = record.split('$');
  if (parti.length !== 6 || parti[0] !== 'scrypt') return false;

  const n = Number.parseInt(parti[1] ?? '', 10);
  const r = Number.parseInt(parti[2] ?? '', 10);
  const p = Number.parseInt(parti[3] ?? '', 10);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(parti[4] ?? '', 'base64url');
  const attesa = Buffer.from(parti[5] ?? '', 'base64url');
  if (salt.length === 0 || attesa.length === 0) return false;

  try {
    const derivata = await scrypt(password.normalize('NFKC'), salt, attesa.length, {
      N: n,
      r,
      p,
      maxmem: 128 * n * r * 2,
    });

    return derivata.length === attesa.length && timingSafeEqual(derivata, attesa);
  } catch {
    return false;
  }
}

/** Token di sessione: 32 byte di casualità crittografica, non indovinabili. */
export function generaTokenSessione(): string {
  return randomBytes(32).toString('base64url');
}

export function improntaToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Password iniziale leggibile ma non indovinabile.
 * Usata solo per il primo amministratore, con obbligo implicito di sostituirla.
 */
export function generaPasswordIniziale(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const byte = randomBytes(20);
  let password = '';
  for (const b of byte) {
    password += alfabeto[b % alfabeto.length];
  }
  return `${password.slice(0, 5)}-${password.slice(5, 10)}-${password.slice(10, 15)}-${password.slice(15, 20)}`;
}

export interface RequisitiPassword {
  readonly valida: boolean;
  readonly problemi: readonly string[];
}

/**
 * Requisiti minimi.
 *
 * Lunghezza prima di tutto: una passphrase di 14 caratteri è più robusta di otto caratteri
 * con simboli obbligatori, e infinitamente più memorabile. Le regole di composizione
 * spingono gli utenti verso `Password1!`, che è la password più diffusa al mondo.
 */
export function verificaRequisitiPassword(password: string): RequisitiPassword {
  const problemi: string[] = [];

  if (password.length < 12) problemi.push('Deve contenere almeno 12 caratteri.');
  if (password.length > 200) problemi.push('Non può superare i 200 caratteri.');
  if (/^\s|\s$/.test(password)) problemi.push('Non può iniziare o terminare con uno spazio.');

  const banali = ['password', '123456', 'qwerty', 'aegis', 'assicurazioni', 'broker'];
  if (banali.some((b) => password.toLowerCase().includes(b))) {
    problemi.push('Non può contenere parole facilmente indovinabili.');
  }

  return { valida: problemi.length === 0, problemi };
}

export interface Sessione {
  readonly utenteId: string;
  readonly tenantId: string;
  readonly email: string;
  readonly nome: string;
  readonly ruolo: 'amministratore' | 'broker' | 'assistente' | 'sola-lettura';
  /**
   * Se lo studio di questo utente gestisce la piattaforma.
   *
   * Ortogonale al ruolo, e va tenuta tale: `amministratore` dice cosa si può fare dentro
   * il proprio studio, questa dice se lo studio possiede l'infrastruttura. Confonderle
   * darebbe a ogni intermediario che apre le impostazioni la vista sulla fornitura dati.
   */
  readonly gestorePiattaforma: boolean;
}

/** I ruoli in sola lettura non possono modificare nulla. */
export function puoScrivere(ruolo: Sessione['ruolo']): boolean {
  return ruolo !== 'sola-lettura';
}
