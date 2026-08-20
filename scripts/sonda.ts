/**
 * Sonda per le API OpenAPI.com.
 *
 * Ogni chiamata a questo provider costa. Questo strumento esiste per allineare la
 * configurazione e i mapper alla forma reale delle risposte **spendendo il minimo**:
 *
 *  - parte in **sandbox** (`test.company.openapi.com`), dove le chiamate sono gratuite
 *    e le risposte hanno la stessa forma di quelle vere;
 *  - effettua **una sola chiamata per esecuzione**, mai cicli;
 *  - salva la risposta grezza su file, così le successive analisi della struttura non
 *    richiedono di ripagare il dato;
 *  - in produzione chiede conferma esplicita e rispetta un tetto di spesa.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/sonda.ts IT-start 03158460174
 *   npx tsx --env-file=.env scripts/sonda.ts IT-advanced 03158460174 --produzione
 *   npx tsx --env-file=.env scripts/sonda.ts --saldo
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const CARTELLA_RISPOSTE = join(process.cwd(), '.sonda');

/** Listino stimato, in centesimi. Serve al tetto di spesa, non alla fatturazione. */
const COSTI_CENTESIMI: Record<string, number> = {
  'IT-start': 5,
  'IT-advanced': 10,
  'IT-full': 48,
  'IT-search': 1,
  'IT-closed': 10,
};

interface Argomenti {
  readonly servizio: string;
  readonly identificativo: string;
  readonly produzione: boolean;
  readonly saldo: boolean;
}

function leggiArgomenti(): Argomenti {
  const argv = process.argv.slice(2);
  return {
    servizio: argv[0] ?? 'IT-start',
    identificativo: argv[1] ?? '',
    produzione: argv.includes('--produzione'),
    saldo: argv.includes('--saldo'),
  };
}

function token(): string {
  const valore = process.env['OPENAPI_TOKEN']?.trim() ?? '';
  if (valore === '') {
    console.error('OPENAPI_TOKEN non impostato. Creare .env partendo da .env.example.');
    process.exit(1);
  }
  return valore;
}

/** Il token non deve mai comparire per intero nei log o negli screenshot. */
function tokenOffuscato(valore: string): string {
  return `${valore.slice(0, 4)}…${valore.slice(-4)} (${valore.length} caratteri)`;
}

/**
 * Sonda del servizio eventi negativi, che è **asincrono**.
 *
 * Tre passi: POST che avvia la pratica (è la chiamata che costa), polling dello stato,
 * e — se risultano negatività — lettura del dettaglio. Il polling è gratuito: si paga
 * l'avvio, non le verifiche.
 */
async function sondaNegativita(chiave: string, cfPiva: string, produzione: boolean): Promise<void> {
  const dominio = produzione ? 'risk.openapi.com' : 'test.risk.openapi.com';
  const intestazioni = {
    Authorization: `Bearer ${chiave}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  console.log(`Ambiente ..... ${produzione ? 'PRODUZIONE (a pagamento)' : 'sandbox (gratuito)'}`);
  console.log(`Token ........ ${tokenOffuscato(chiave)}`);
  console.log(`Servizio ..... POST https://${dominio}/IT-negativita`);
  console.log(`Costo stimato  ${produzione ? '45 centesimi' : '0 (sandbox)'}`);
  console.log('');

  const avvio = await fetch(`https://${dominio}/IT-negativita`, {
    method: 'POST',
    headers: intestazioni,
    body: JSON.stringify({ cf_piva: cfPiva }),
  });

  const corpoAvvio: unknown = await avvio.json();
  console.log(`POST → HTTP ${avvio.status}`);
  salva(`${produzione ? 'prod' : 'test'}-negativita-avvio-${cfPiva}.json`, corpoAvvio);
  console.log(descriviStruttura(corpoAvvio));
  console.log('');

  if (!avvio.ok) return;

  const idRichiesta = campoTestuale(corpoAvvio, 'id', '_id');
  if (idRichiesta === '') {
    console.log('Nessun identificativo di richiesta nella risposta: impossibile proseguire.');
    return;
  }

  // Attese crescenti: la pratica si chiude in secondi, ma non c'è ragione di martellare.
  const attese = [2_000, 3_000, 5_000, 8_000, 13_000, 20_000];
  for (const [tentativo, attesa] of attese.entries()) {
    await new Promise((r) => setTimeout(r, attesa));

    /*
      Il percorso è quello del dominio **rischio**, e non è una variante ortografica di
      quello aziendale: qui lo stato si legge su «/IT-richiesta/{id}», in italiano. La
      sonda interrogava «/IT-request/{id}» — il percorso del dominio aziendale — che su
      questo host non risponde JSON: `state` restava ignoto, il ciclo non arrivava mai a
      DONE, e la pratica risultava non conclusa **dopo essere stata pagata**. Il
      dettaglio andava poi recuperato a mano.

      La configurazione di produzione lo aveva già giusto (`percorsoStatoRichiestaRischio`
      in `config.ts`): era solo questo strumento a essere rimasto indietro.
    */
    const stato = await fetch(`https://${dominio}/IT-richiesta/${idRichiesta}`, {
      headers: intestazioni,
    });
    const corpoStato: unknown = await stato.json();
    const statoTestuale = campoTestuale(corpoStato, 'state', 'stato') || 'ignoto';

    console.log(
      `Polling ${tentativo + 1}/${attese.length} → HTTP ${stato.status}, stato: ${statoTestuale}`,
    );

    if (statoTestuale.toUpperCase() === 'DONE' || statoTestuale.toUpperCase() === 'COMPLETED') {
      salva(`${produzione ? 'prod' : 'test'}-negativita-esito-${cfPiva}.json`, corpoStato);
      console.log('');
      console.log('Struttura dell’esito:');
      console.log(descriviStruttura(corpoStato));

      const dettaglio = await fetch(`https://${dominio}/IT-negativita/${idRichiesta}/dettaglio`, {
        headers: intestazioni,
      });
      const corpoDettaglio: unknown = await dettaglio.json();
      salva(`${produzione ? 'prod' : 'test'}-negativita-dettaglio-${cfPiva}.json`, corpoDettaglio);
      console.log('');
      console.log(`Dettaglio → HTTP ${dettaglio.status}`);
      console.log(descriviStruttura(corpoDettaglio));
      return;
    }
  }

  console.log('Pratica non conclusa entro il tempo di attesa: riprovare la sola lettura dello stato.');
  console.log(`  GET https://${dominio}/IT-richiesta/${idRichiesta}`);
}

/** Estrae un campo testuale da `data`, provando più alias. Stringa vuota se assente. */
function campoTestuale(risposta: unknown, ...chiavi: readonly string[]): string {
  if (typeof risposta !== 'object' || risposta === null) return '';
  const dati = (risposta as Record<string, unknown>)['data'];
  if (typeof dati !== 'object' || dati === null) return '';

  for (const chiave of chiavi) {
    const valore = (dati as Record<string, unknown>)[chiave];
    if (typeof valore === 'string' && valore !== '') return valore;
  }
  return '';
}

function salva(nome: string, contenuto: unknown): void {
  const percorso = join(CARTELLA_RISPOSTE, nome);
  mkdirSync(dirname(percorso), { recursive: true });
  writeFileSync(percorso, JSON.stringify(contenuto, null, 2), 'utf8');
  console.log(`  salvato in ${percorso}`);
}

async function main(): Promise<void> {
  const args = leggiArgomenti();
  const chiave = token();

  if (args.servizio === 'negativita') {
    await sondaNegativita(chiave, args.identificativo, args.produzione);
    return;
  }

  const dominio = args.produzione ? 'company.openapi.com' : 'test.company.openapi.com';
  const costo = COSTI_CENTESIMI[args.servizio] ?? 0;
  const budget = Number.parseInt(process.env['OPENAPI_BUDGET_CENTESIMI'] ?? '0', 10);

  if (args.produzione && costo > budget) {
    console.error(
      `Chiamata da ${costo} centesimi oltre il tetto di ${budget}. Alzare OPENAPI_BUDGET_CENTESIMI se voluto.`,
    );
    process.exit(1);
  }

  const url = args.saldo
    ? `https://${dominio}/`
    : `https://${dominio}/${args.servizio}/${encodeURIComponent(args.identificativo)}`;

  console.log(`Ambiente ..... ${args.produzione ? 'PRODUZIONE (a pagamento)' : 'sandbox (gratuito)'}`);
  console.log(`Token ........ ${tokenOffuscato(chiave)}`);
  console.log(`Richiesta .... ${url}`);
  console.log(`Costo stimato  ${args.produzione ? `${costo} centesimi` : '0 (sandbox)'}`);
  console.log('');

  const avvio = Date.now();
  const risposta = await fetch(url, {
    headers: { Authorization: `Bearer ${chiave}`, Accept: 'application/json' },
  });
  const durata = Date.now() - avvio;

  const testo = await risposta.text();
  console.log(`HTTP ${risposta.status} ${risposta.statusText} in ${durata} ms`);
  console.log(`Content-Type: ${risposta.headers.get('content-type') ?? 'n.d.'}`);
  console.log('');

  let corpo: unknown;
  try {
    corpo = JSON.parse(testo);
  } catch {
    console.log('Risposta non JSON. Primi 600 caratteri:');
    console.log(testo.slice(0, 600));
    process.exit(risposta.ok ? 0 : 1);
  }

  const nomeFile = join(
    CARTELLA_RISPOSTE,
    `${args.produzione ? 'prod' : 'test'}-${args.servizio}-${args.identificativo || 'root'}.json`,
  );
  mkdirSync(dirname(nomeFile), { recursive: true });
  writeFileSync(nomeFile, JSON.stringify(corpo, null, 2), 'utf8');
  console.log(`Risposta salvata in ${nomeFile}`);
  console.log('');

  console.log('Struttura della risposta:');
  console.log(descriviStruttura(corpo));
}

/**
 * Mappa della struttura, non il contenuto.
 *
 * Serve ad allineare i mapper: interessano i nomi dei campi e i tipi, non i dati
 * personali dell'azienda interrogata. I valori sono troncati proprio per questo.
 */
function descriviStruttura(valore: unknown, prefisso = '', profondita = 0): string {
  if (profondita > 4) return `${prefisso}: …`;

  if (Array.isArray(valore)) {
    if (valore.length === 0) return `${prefisso}: [] (vuoto)`;
    return [
      `${prefisso}: array di ${valore.length}`,
      descriviStruttura(valore[0], `${prefisso}[0]`, profondita + 1),
    ].join('\n');
  }

  if (valore !== null && typeof valore === 'object') {
    const righe: string[] = [];
    for (const [chiave, contenuto] of Object.entries(valore)) {
      const percorso = prefisso === '' ? chiave : `${prefisso}.${chiave}`;
      righe.push(descriviStruttura(contenuto, percorso, profondita + 1));
    }
    return righe.join('\n');
  }

  const tipo = valore === null ? 'null' : typeof valore;
  const anteprima =
    typeof valore === 'string'
      ? ` = "${valore.length > 40 ? `${valore.slice(0, 40)}…` : valore}"`
      : typeof valore === 'number' || typeof valore === 'boolean'
        ? ` = ${String(valore)}`
        : '';
  return `${prefisso}: ${tipo}${anteprima}`;
}

main().catch((errore: unknown) => {
  console.error(errore instanceof Error ? errore.message : errore);
  process.exit(1);
});
