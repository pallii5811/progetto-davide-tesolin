/**
 * La riga da cui dipende il fatto che l'utente resti collegato.
 *
 * Se questa funzione sbaglia, il sintomo non è un errore: è un utente che cambia la
 * password e si ritrova scollegato, o — peggio — un cookie omonimo scambiato per quello
 * di sessione.
 */

import { describe, expect, it } from 'vitest';
import { estraiTokenSessione } from '../src/lib/cookie-sessione';

describe('Estrazione del cookie di sessione', () => {
  it('legge il token da una intestazione Set-Cookie completa', () => {
    const token = estraiTokenSessione([
      'aegis_sessione=abc123; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200',
    ]);
    expect(token).toBe('abc123');
  });

  it('lo trova anche in mezzo ad altri cookie', () => {
    const token = estraiTokenSessione([
      'preferenze=scuro; Path=/',
      'aegis_sessione=xyz789; Path=/; HttpOnly',
      'traccia=1; Path=/',
    ]);
    expect(token).toBe('xyz789');
  });

  it('lo trova anche quando non è il primo della stessa intestazione', () => {
    // Un'àncora scritta male passa comunque i casi in cui il cookie è all'inizio:
    // è questo il caso che la distingue.
    const token = estraiTokenSessione(['preferenze=scuro; aegis_sessione=dentro; Path=/']);
    expect(token).toBe('dentro');
  });

  it('non si fa ingannare da un cookie con nome simile', () => {
    // La versione ingenua — una regex senza àncora — accettava questo come token valido.
    const token = estraiTokenSessione(['altro_aegis_sessione=falso; Path=/']);
    expect(token).toBeNull();
  });

  it('ignora un cookie svuotato, che è una revoca e non un token', () => {
    const token = estraiTokenSessione([
      'aegis_sessione=; Path=/; Max-Age=0',
      'aegis_sessione=buono; Path=/',
    ]);
    expect(token).toBe('buono');
  });

  it('restituisce null quando il cookie non c’è', () => {
    expect(estraiTokenSessione([])).toBeNull();
    expect(estraiTokenSessione(['preferenze=chiaro; Path=/'])).toBeNull();
  });
});
