/**
 * L'ordine dei risultati di `/IT-search` è stabile? Due chiamate a pagamento, pochi centesimi.
 *
 *   set -a; . /opt/aegis/.env; set +a; npx tsx scripts/sonda-ordine-elenco.ts <codice-catastale> --conferma
 *
 * Perché esiste. Dal 18/09/2026 ricomprare un elenco con gli stessi filtri chiede al fornitore le
 * aziende successive a quelle già comprate (`skip`). Funziona solo se, a filtri uguali, il
 * fornitore restituisce le aziende sempre nello stesso ordine: altrimenti saltare le prime N
 * potrebbe saltare aziende mai viste. Non è scritto da nessuna parte, quindi si misura.
 *
 * Come. Si chiedono le prime quattro aziende, poi due partendo dalla terza: se l'ordine è
 * stabile, le due della seconda chiamata sono la terza e la quarta della prima. Senza dettaglio
 * (`dataEnrichment` assente): arrivano solo gli identificativi, che bastano al confronto e
 * costano il minimo. La stima si stampa prima, e senza `--conferma` non parte niente.
 *
 * Non importa niente dell'applicazione: il registro dei costi e la cache scrivono sul database di
 * produzione, e una sonda non deve farlo. Il token lo legge dall'ambiente e non lo stampa mai.
 */

const codice = (process.argv[2] ?? '').trim().toUpperCase();
if (!/^[A-Z]\d{3}$/.test(codice)) {
  console.error('Serve un codice catastale, per esempio A794 (Bergamo).');
  process.exit(1);
}

const token = process.env['OPENAPI_TOKEN'] ?? '';
if (token.trim() === '') {
  console.error('OPENAPI_TOKEN assente: la sonda non parte.');
  process.exit(1);
}

// Gli stessi filtri che l'applicazione manda di norma: il comune, solo attive, solo S.r.l.
const filtri = { townCode: codice, activityStatus: 'ATTIVA', legalFormCode: 'SR' };

console.log('Due chiamate a pagamento su /IT-search, senza dettaglio (solo identificativi):');
console.log('  1. le prime 4 aziende          limit=4 skip=0');
console.log('  2. 2 aziende dalla terza         limit=2 skip=2');
console.log('Stima: al massimo 0,06 € in tutto (sei identificativi a un centesimo).');

if (!process.argv.includes('--conferma')) {
  console.log('\nNon parte niente senza --conferma.');
  process.exit(0);
}

async function identificativi(limit: number, skip: number): Promise<string[]> {
  const parametri = new URLSearchParams({ ...filtri, limit: String(limit), skip: String(skip) });
  const risposta = await fetch(`https://company.openapi.com/IT-search?${parametri.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const testo = await risposta.text();
  if (!risposta.ok) throw new Error(`HTTP ${risposta.status}: ${testo.slice(0, 200)}`);

  const corpo: unknown = JSON.parse(testo);
  const dati =
    typeof corpo === 'object' && corpo !== null ? (corpo as Record<string, unknown>)['data'] : null;
  const costo =
    typeof corpo === 'object' && corpo !== null ? (corpo as Record<string, unknown>)['cost'] : null;
  console.log(
    `  limit=${limit} skip=${skip}: HTTP ${risposta.status}, costo dichiarato ${
      typeof costo === 'number' || typeof costo === 'string' ? String(costo) : '—'
    }`,
  );
  if (!Array.isArray(dati)) return [];
  return dati.map((voce: unknown) => {
    if (typeof voce === 'string') return voce;
    if (typeof voce === 'object' && voce !== null) {
      const id = (voce as Record<string, unknown>)['id'];
      return typeof id === 'string' ? id : JSON.stringify(voce);
    }
    return String(voce);
  });
}

const prime = await identificativi(4, 0);
const dallaTerza = await identificativi(2, 2);

console.log(`\nprime quattro:   ${prime.join(' · ')}`);
console.log(`dalla terza:     ${dallaTerza.join(' · ')}`);

const attese = prime.slice(2, 4);
if (prime.length < 4) {
  console.log(
    '\nCOMUNE TROPPO PICCOLO: meno di quattro S.r.l. attive, il confronto non dice niente. Riprovare con un comune più grande.',
  );
} else if (JSON.stringify(attese) === JSON.stringify(dallaTerza)) {
  console.log('\nORDINE STABILE: le due della seconda chiamata sono la terza e la quarta della prima.');
} else {
  console.log(
    '\nORDINE NON STABILE: saltare le prime N non è affidabile. Non usare la ripartenza degli elenchi.',
  );
}
