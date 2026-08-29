/**
 * Il questionario deve chiedere tutto ciò che il motore usa.
 *
 * Quattro campi esistevano nel dominio, erano accettati dall'API con la loro validazione,
 * erano usati dal motore — e il modulo di intervista non li chiedeva. Nessun utente reale
 * poteva valorizzarli, quindi il calcolo girava sempre sul ramo «non noto».
 *
 * Non era un difetto estetico. `compartimentazioneRei` e `impiantoSprinkler` moltiplicano
 * la quota di danno probabile per 0,55 e 0,70: misurato sull'azienda dimostrativa, il
 * capitale incendio raccomandato passava da 2,2 a 4,3 milioni e la forma consigliata si
 * ribaltava da primo rischio assoluto a valore intero — cioè da fuori a dentro la regola
 * proporzionale. E il prodotto **poneva le domande** nel report senza offrire modo di
 * rispondere: la completezza dell'intervista si fermava all'87% qualunque cosa si facesse.
 *
 * Peggio ancora, `unisciDati` ricostruisce il dossier da un elenco chiuso di chiavi: un
 * valore arrivato per altra via veniva cancellato al primo salvataggio dal modulo.
 *
 * Questa prova legge i **sorgenti**, come fa il presidio sull'isolamento fra studi: è
 * l'unico modo di accorgersi che una chiave è stata aggiunta all'API e dimenticata nel
 * modulo, che è esattamente come il difetto è nato.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RADICE = fileURLToPath(new URL('../../..', import.meta.url));
const leggi = (relativo: string): string => readFileSync(resolve(RADICE, relativo), 'utf8');

const MODULO = 'apps/web/src/app/azienda/[id]/dati/modulo.ts';
const EDITOR = 'apps/web/src/app/azienda/[id]/dati/EditorDossier.tsx';

/**
 * Campi che l'API accetta e che il modulo **non** deve chiedere, con il motivo.
 *
 * Senza motivo scritto, un'esclusione è indistinguibile da una dimenticanza — ed è
 * esattamente così che i quattro campi sono rimasti fuori per mesi.
 */
const FUORI_DAL_MODULO: Readonly<Record<string, string>> = {
  indirizzo:
    'l’indirizzo dell’immobile si eredita dalle ubicazioni già acquistate: richiederlo a mano sarebbe una seconda digitazione dello stesso dato',
  numeroClientiPrincipaliSuFatturato:
    'nessun motore lo legge: resta accettato per compatibilità con i dossier già salvati, ma chiederlo occuperebbe l’intervista con una domanda che non cambia nulla',
};

/**
 * Le chiavi si leggono dal **sorgente**, non dagli interni di zod.
 *
 * Gli interni cambiano da una versione all'altra della libreria, e una prova che si
 * rompe all'aggiornamento di una dipendenza smette di essere letta. Il sorgente invece è
 * la cosa che si vuole davvero sorvegliare: qualcuno che aggiunge una riga allo schema.
 */
function chiaviDiBlocco(nome: string): readonly string[] {
  const testo = leggi('apps/api/src/schemas.ts');
  const blocco = new RegExp(`${nome} = z\\n?\\s*\\.?object\\(\\{([\\s\\S]*?)\\n\\s*\\}\\)`).exec(testo);
  return [...(blocco?.[1] ?? '').matchAll(/^\s{2,4}(\w+):/gm)].map((m) => m[1]!);
}

const chiaviDelloSchema = (): readonly string[] => chiaviDiBlocco('datiDichiaratiSchema');
const chiaviDegliImmobili = (): readonly string[] => chiaviDiBlocco('const immobileSchema');
const chiaviDelBilancio = (): readonly string[] => chiaviDiBlocco('const bilancioDichiaratoSchema');

describe('Nessun campo che il motore usa resta senza una domanda', () => {
  const modulo = leggi(MODULO);
  const editor = leggi(EDITOR);
  const nelModulo = (campo: string): boolean =>
    new RegExp(`\\b${campo}\\b`).test(modulo) && new RegExp(`\\b${campo}\\b`).test(editor);

  /*
    Prima di tutto: la lettura funziona.

    Un controllo che estrae zero chiavi passa sempre, e passa in silenzio. È il modo in
    cui un presidio smette di presidiare senza che nessuno se ne accorga — la stessa
    forma del difetto che questa prova esiste per impedire.
  */
  it('la lettura dello schema trova davvero i campi, altrimenti non sta controllando nulla', () => {
    expect(chiaviDelloSchema().length).toBeGreaterThan(10);
    expect(chiaviDegliImmobili().length).toBeGreaterThan(5);
    expect(chiaviDelloSchema()).toContain('propensioneAlRischio');
    expect(chiaviDegliImmobili()).toContain('compartimentazioneRei');
  });

  it('ogni campo del dossier accettato dall’API è chiesto dal modulo, o escluso con una ragione', () => {
    const scoperti = chiaviDelloSchema().filter(
      (campo) => !nelModulo(campo) && !(campo in FUORI_DAL_MODULO),
    );

    expect(
      scoperti,
      `campi che l’API accetta e nessuno può compilare: ${scoperti.join(', ')}.\n` +
        'Aggiungerli a EditorDossier.tsx e a modulo.ts, oppure a FUORI_DAL_MODULO spiegando perché.',
    ).toEqual([]);
  });

  it('lo stesso per le voci del bilancio depositato', () => {
    /*
      Sono i sei campi che trasformano quattro «non determinabile» in altrettanti
      capitali: se uno di essi entra nell'API e non nel modulo, nessuno può compilarlo e
      il capitale resta vuoto — esattamente come è successo per compartimentazione e
      sprinkler.

      Il modulo usa nomi in euro (`rimanenzeEuro`), l'API in centesimi (`rimanenze`):
      si accetta l'una o l'altra forma.

      Attenzione alla scrittura del confine di parola: `\\b` dentro un template literal
      è il **byte BACKSPACE**, non un confine. Scritto così la regex non aggancia niente
      e la prova passa sempre, in silenzio — è la stessa trappola che il progetto ha già
      pagato con trentuno espressioni morte.
    */
    const nelModuloComeEuro = (campo: string): boolean =>
      nelModulo(campo) || new RegExp(`\\b${campo}Euro\\b`).test(modulo + editor);

    const scoperti = chiaviDelBilancio().filter(
      (campo) => !nelModuloComeEuro(campo) && !(campo in FUORI_DAL_MODULO),
    );
    expect(scoperti, `voci di bilancio senza domanda: ${scoperti.join(', ')}`).toEqual([]);
  });

  it('la lettura del blocco bilancio trova davvero i campi', () => {
    expect(chiaviDelBilancio().length).toBeGreaterThan(4);
    expect(chiaviDelBilancio()).toContain('rimanenze');
    expect(chiaviDelBilancio()).toContain('costiServizi');
  });

  it('lo stesso per i campi di ciascun immobile', () => {
    const scoperti = chiaviDegliImmobili().filter(
      (campo) => !nelModulo(campo) && !(campo in FUORI_DAL_MODULO),
    );
    expect(scoperti, `campi dell’immobile senza domanda: ${scoperti.join(', ')}`).toEqual([]);
  });

  it('nessuna esclusione riguarda un campo che l’API non accetta più', () => {
    const esistenti = new Set([...chiaviDelloSchema(), ...chiaviDegliImmobili()]);
    const fantasmi = Object.keys(FUORI_DAL_MODULO).filter((c) => !esistenti.has(c));
    expect(fantasmi, `esclusioni su campi inesistenti: ${fantasmi.join(', ')}`).toEqual([]);
  });

  /*
    La perdita silenziosa.

    `unisciDati` ricostruisce il dossier partendo da `DATI_VUOTI` e leggendo un elenco
    chiuso di chiavi. Un campo assente da quell'elenco non è solo «non chiesto»: viene
    **cancellato** ogni volta che qualcuno riapre e salva il modulo, anche se il valore
    era stato scritto correttamente per altra via.
  */
  it('il modulo rilegge ogni campo che l’API accetta, altrimenti salvando lo cancella', () => {
    const letturaUnisci = /export function unisciDati[\s\S]*?\n}/.exec(modulo)?.[0] ?? '';
    const persi = chiaviDelloSchema().filter(
      (campo) => !(campo in FUORI_DAL_MODULO) && !new RegExp(`\\b${campo}\\b`).test(letturaUnisci),
    );
    expect(persi, `campi che un salvataggio dal modulo cancellerebbe: ${persi.join(', ')}`).toEqual([]);
  });
});
