/**
 * Collaudo dell'intera catena su dati reali.
 *
 *   node --env-file=.env --import tsx scripts/verifica-reale.ts [partitaIva]
 *
 * Interroga l'API locale (che a sua volta interroga OpenAPI.com) e stampa ciò che serve
 * a giudicare la qualità del risultato: non solo i numeri, ma **quanto sono affidabili**
 * e che cosa li limita. Una sola analisi per esecuzione: una chiamata a pagamento.
 */

const API = process.env['AEGIS_API_URL'] ?? 'http://127.0.0.1:3001';
const PARTITA_IVA = process.argv[2] ?? '12485671007';

interface Fattore {
  etichetta: string;
  peso: number;
  punteggio: number | null;
  motivazione: string;
}

interface Analisi {
  azienda: {
    denominazione: string;
    formaGiuridica: string;
    ateco: string | null;
    atecoDescrizione: string | null;
    dimensioneEtichetta: string;
    addetti: number | null;
    anniDiAttivita: number | null;
    sedeLegale: { comune: string; provincia: string } | null;
  };
  livelloDatiEconomici: string;
  sintesi: {
    scoreCredito: number;
    classeCredito: string;
    fidoConsigliato: { formattato: string };
    rischiIdentificati: number;
    rischiCritici: number;
    coperturaAssente: number;
    patrimonioEsposto: { formattato: string } | null;
    esposizioneNonAssicurata: { formattato: string };
    azioniPrioritarie: string[];
  };
  credito: {
    confidenza: string;
    fattori: Fattore[];
    spiegazione: { note: string[] };
    fido: { vincoloAttivo: string; spiegazione: { note: string[] } };
  };
  catNat: { stato: string; termine: string | null; baseAssicurabile: { formattato: string } | null };
  completezza: { percentuale: number; livello: string };
  rischiMeta: { daVerificare: number };
  arricchimentiPossibili: { dato: string; sbloccherebbe: string[] }[];
}

const riga = (etichetta: string, valore: string): void => {
  console.log(`  ${etichetta.padEnd(30, '.')} ${valore}`);
};

async function main(): Promise<void> {
  const risposta = await fetch(`${API}/api/aziende/${PARTITA_IVA}/analisi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!risposta.ok) {
    console.error(`Errore ${risposta.status}: ${await risposta.text()}`);
    process.exit(1);
  }

  const a = (await risposta.json()) as Analisi;

  console.log('');
  console.log('═'.repeat(76));
  console.log(`  ${a.azienda.denominazione}`);
  console.log('═'.repeat(76));
  console.log('');

  riga('Forma giuridica', a.azienda.formaGiuridica);
  riga('ATECO', `${a.azienda.ateco ?? 'n.d.'} ${a.azienda.atecoDescrizione ?? ''}`);
  riga(
    'Sede',
    a.azienda.sedeLegale === null
      ? 'n.d.'
      : `${a.azienda.sedeLegale.comune} (${a.azienda.sedeLegale.provincia})`,
  );
  riga(
    'Dimensione',
    `${a.azienda.dimensioneEtichetta} · ${a.azienda.addetti ?? '?'} addetti · ${a.azienda.anniDiAttivita ?? '?'} anni`,
  );
  riga('Livello dati economici', a.livelloDatiEconomici);
  riga(
    'Completezza intervista',
    `${Math.round(a.completezza.percentuale * 100)}% (${a.completezza.livello})`,
  );

  console.log('');
  console.log('  MERITO CREDITIZIO');
  riga('Score', `${a.sintesi.scoreCredito}/100 — classe ${a.sintesi.classeCredito}`);
  riga('Confidenza', a.credito.confidenza.toUpperCase());
  riga(
    'Fido consigliato',
    `${a.sintesi.fidoConsigliato.formattato} (vincolo ${a.credito.fido.vincoloAttivo})`,
  );

  console.log('');
  console.log('  Fattori dello score');
  for (const f of a.credito.fattori) {
    const punteggio = f.punteggio === null ? 'NON VALUTABILE' : `${String(Math.round(f.punteggio))}/100`;
    console.log(
      `    ${f.etichetta.padEnd(30, ' ')} ${punteggio.padStart(14)}  peso ${Math.round(f.peso * 100)}%`,
    );
  }

  console.log('');
  console.log('  Limiti dichiarati');
  for (const nota of [...a.credito.spiegazione.note, ...a.credito.fido.spiegazione.note]) {
    console.log(`    · ${nota}`);
  }

  console.log('');
  console.log('  RISCHI E COPERTURE');
  riga(
    'Rischi identificati',
    `${a.sintesi.rischiIdentificati} (${a.sintesi.rischiCritici} alti o critici)`,
  );
  riga('Da confermare in intervista', String(a.rischiMeta.daVerificare));
  riga('Patrimonio esposto', a.sintesi.patrimonioEsposto?.formattato ?? 'non determinabile');
  riga('Esposizione non assicurata', a.sintesi.esposizioneNonAssicurata.formattato);
  riga('Coperture da attivare', String(a.sintesi.coperturaAssente));
  riga(
    'CAT NAT',
    `${a.catNat.stato} · termine ${a.catNat.termine?.slice(0, 10) ?? 'n.d.'} · base ${a.catNat.baseAssicurabile?.formattato ?? 'da quantificare'}`,
  );

  console.log('');
  console.log('  PIANO D’AZIONE');
  for (const azione of a.sintesi.azioniPrioritarie) {
    console.log(`    ${azione}`);
  }

  if (a.arricchimentiPossibili.length > 0) {
    console.log('');
    console.log('  COSA MIGLIOREREBBE ACQUISENDO ALTRI DATI');
    for (const arricchimento of a.arricchimentiPossibili) {
      console.log(`    ${arricchimento.dato}`);
      for (const beneficio of arricchimento.sbloccherebbe) {
        console.log(`      · ${beneficio}`);
      }
    }
  }

  const costi = (await (await fetch(`${API}/api/costi`)).json()) as {
    totaleEuro: number;
    chiamate: number;
    risparmioDaCacheEuro: number;
  };
  console.log('');
  console.log('═'.repeat(76));
  console.log(
    `  Costo dati: ${costi.totaleEuro.toFixed(2)} € su ${costi.chiamate} chiamate · ` +
      `risparmio da cache: ${costi.risparmioDaCacheEuro.toFixed(2)} €`,
  );
  console.log('═'.repeat(76));
  console.log('');
}

main().catch((errore: unknown) => {
  console.error(errore instanceof Error ? errore.message : errore);
  process.exit(1);
});
