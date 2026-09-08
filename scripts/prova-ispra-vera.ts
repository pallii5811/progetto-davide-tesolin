/**
 * Prova l'integrazione ISPRA sul servizio VERO, non su risposte finte.
 *
 * L'unica misura che dice se l'ordine degli assi del bbox è giusto: WFS 2.0 con
 * EPSG:4326 vuole lat,lon, e sbagliarlo non dà errore — dà «nessun poligono», cioè
 * `null`, cioè un prodotto che dichiara «non determinata» ovunque e sembra funzionare.
 *
 * Punti scelti perché la risposta è nota per altra via: la golena del Po e il delta
 * sono in classe P3 sulla cartografia PAI; una vetta appenninica non è in nessuna
 * classe; il centro di Milano è fuori dalle aree mappate del Lambro.
 */
import { leggiPericolositaIdraulica } from '../packages/providers/src/territorio/idraulica.js';

const PUNTI: readonly { nome: string; lat: number; lon: number; atteso: string }[] = [
  { nome: 'Delta del Po (Porto Tolle)', lat: 44.9508, lon: 12.3227, atteso: 'alta o media' },
  { nome: 'Golena del Po (Ficarolo RO)', lat: 44.9686, lon: 11.4315, atteso: 'alta o media' },
  { nome: 'Ravenna, zona portuale', lat: 44.4762, lon: 12.2503, atteso: 'qualcosa' },
  { nome: 'Gran Sasso, Campo Imperatore', lat: 42.4419, lon: 13.5646, atteso: 'null' },
  { nome: 'Milano, piazza Duomo', lat: 45.4641, lon: 9.1919, atteso: 'null o bassa' },
  { nome: 'Agnosine (BS), sede COMINOTTI', lat: 45.6403, lon: 10.3456, atteso: '?' },
];

for (const p of PUNTI) {
  const inizio = Date.now();
  const livello = await leggiPericolositaIdraulica(p.lat, p.lon, { timeoutMs: 20_000 });
  const ms = Date.now() - inizio;
  process.stdout.write(
    `  ${p.nome.padEnd(34)} ${String(livello ?? 'null').padEnd(7)} (atteso ${p.atteso})  ${ms} ms\n`,
  );
}
