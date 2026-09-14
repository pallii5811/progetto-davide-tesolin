/**
 * UNA ricerca per città su `/IT-search`, in solo conteggio (`dryRun`, gratuito).
 *
 *   set -a; . /opt/aegis/.env; set +a; npx tsx scripts/sonda-citta.ts <codice-catastale>
 *
 * Perché esiste. «Nuovi clienti» filtra per comune con `townCode`, il codice catastale, e il
 * 13/09/2026 quel parametro era stato letto solo sulla specifica pubblica del fornitore, mai
 * provato: la prima ricerca vera di un cliente sarebbe stata anche la prima prova.
 *
 * Una chiamata basta a distinguere i due casi, se il comune è piccolo: un filtro accettato dà
 * decine o centinaia di imprese, un filtro ignorato dà il totale nazionale, centinaia di migliaia.
 *
 * Non importa niente dell'applicazione: il registro dei costi e la cache scrivono sul database di
 * produzione, e una sonda non deve farlo. Il token lo legge dall'ambiente e non lo stampa mai.
 */

const codice = (process.argv[2] ?? '').trim().toUpperCase();
if (!/^[A-Z]\d{3}$/.test(codice)) {
  console.error('Serve un codice catastale, per esempio H501 (Roma).');
  process.exit(1);
}

const token = process.env['OPENAPI_TOKEN'] ?? '';
if (token.trim() === '') {
  console.error('OPENAPI_TOKEN assente: la sonda non parte.');
  process.exit(1);
}

// Gli stessi parametri del conteggio dell'applicazione (provider.ts, #contaProspect).
const parametri = new URLSearchParams({ townCode: codice, activityStatus: 'ATTIVA', dryRun: '1' });
console.log(`Una chiamata: GET /IT-search?${parametri.toString()} — solo conteggio, costo atteso 0 €.`);

const risposta = await fetch(`https://company.openapi.com/IT-search?${parametri.toString()}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const testo = await risposta.text();

let corpo: Record<string, unknown> | null = null;
try {
  const letto: unknown = JSON.parse(testo);
  corpo = typeof letto === 'object' && letto !== null ? (letto as Record<string, unknown>) : null;
} catch {
  corpo = null;
}

const campo = (nome: string): string => {
  const valore = corpo?.[nome];
  if (valore === undefined || valore === null) return '—';
  return typeof valore === 'string' || typeof valore === 'number' || typeof valore === 'boolean'
    ? String(valore)
    : JSON.stringify(valore);
};

console.log(`HTTP ${risposta.status}`);
if (corpo === null) {
  console.log(`risposta non JSON: ${testo.slice(0, 300)}`);
} else {
  console.log(
    `count=${campo('count')}  cost=${campo('cost')}  success=${campo('success')}  message=${campo('message')}`,
  );
  console.log(`campi della risposta: ${Object.keys(corpo).join(', ')}`);
}
