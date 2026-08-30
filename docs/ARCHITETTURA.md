# AEGIS — Architettura

> **AEGIS** è il nome in codice della piattaforma. Sostituibile, ma **non con una sola
> modifica**: non esiste un `branding.ts` che lo raccolga in un punto solo. Il nome
> compare in chiaro in undici file fra `packages/core/src` e `apps/web/src` — schermata
> di accesso, intestazione, titolo del browser, riferimenti stampati accanto a score,
> fido e benchmark di massimale — oltre che nello scope npm `@aegis/*` e nelle variabili
> d'ambiente `AEGIS_API_URL` e `AEGIS_PREZZI_CENTESIMI`. Chi rinomina il prodotto li
> cambia uno per uno.

**Cosa è**: una piattaforma di _Credit & Insurance Risk Intelligence_ per intermediari assicurativi.
Unisce ciò che oggi il broker ottiene da due mondi separati:

| Mondo                    | Riferimento                 | Cosa dà oggi                                        | Cosa dà AEGIS                                                               |
| ------------------------ | --------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
| Informazioni commerciali | Creditsafe                  | Score, fido, bilanci, eventi negativi, monitoraggio | Lo stesso, ma **come input al motore assicurativo**, non come report finale |
| Analisi rischi           | Insurance Advisor (iadv.it) | Analisi ISO 31000 guidata da questionario           | Analisi ISO 31000 **pre-compilata dai dati reali** dell'azienda             |

La tesi del prodotto è una sola: **il questionario di analisi rischi e il report di credito descrivono la stessa azienda.**
Oggi il broker li compila due volte, a mano, senza che uno parli con l'altro. AEGIS li fonde in un unico grafo.

---

## 1. I cinque differenziali

Non replichiamo le due piattaforme: le superiamo su cinque punti precisi.

### 1.1 Somme assicurande calcolate dal bilancio (nessuno lo fa)

Il broker chiede al cliente «quanto vale il suo capannone? e le scorte? e il margine?».
Il cliente non lo sa, tira a indovinare, e nasce la **sottoassicurazione** — che all'atto del sinistro
attiva la regola proporzionale (art. 1907 c.c.) e distrugge l'indennizzo.

AEGIS calcola le somme assicurande **dal bilancio depositato**, con formula esposta e fonte tracciata:
fabbricati, contenuto/macchinari a valore di rimpiazzo, merci, **margine di contribuzione per il
Business Interruption**, monte salari per l'RCO, massimali RCT/D&O/Cyber su benchmark di settore.
→ `packages/core/src/coverage/sums-insured.ts`

### 1.2 Compliance CAT NAT come motore, non come banner

L'obbligo di polizza catastrofale (L. 213/2023 art. 1 cc. 101-111, DM 18/2025) riguarda tutte le
imprese iscritte al Registro delle Imprese, con scadenze scaglionate per dimensione e ulteriori
proroghe settoriali (Milleproroghe: 31/03/2026 per micro e piccole di alcuni comparti).
**Solo il 15% delle imprese italiane risulta coperto.**

AEGIS classifica automaticamente l'impresa (micro/piccola/media/grande, criteri UE), determina se
è soggetta, quale scadenza le si applica, quali beni ex art. 2424 c.c. B-II 1/2/3 vanno assicurati e
per quale importo. È l'innesco commerciale più forte del 2026 e diventa una _lista di lavoro_ per il broker.
→ `packages/core/src/coverage/catnat.ts`

### 1.3 Rating di solidità della compagnia (rischio di controparte)

Un broker che colloca una polizza espone il cliente al rischio che la compagnia non paghi.
AEGIS assegna un **Carrier Strength Score** basato su Solvency Ratio (SFCR, peso 40%), qualità dei fondi
propri (15%), dimensione (15%), statistiche reclami IVASS (20%) e rating di agenzia se disponibile (10%).
Il punteggio compare **accanto a ogni polizza in essere** nella gap analysis, dove la compagnia dichiarata
combacia con una di quelle censite. Non entra come fattore nel calcolo della raccomandazione: è
un'informazione mostrata a chi decide, non un peso del motore — e il censimento delle compagnie va
compilato a mano dall'amministratore dello studio, altrimenti la colonna resta vuota.
→ `packages/core/src/carrier/`

### 1.4 Scoring "a scatola di vetro"

Ogni numero prodotto dalla piattaforma porta con sé: la formula, gli input usati, la fonte di ogni
input, la data del dato e un livello di confidenza. Non esistono numeri non spiegabili.
È un requisito di prodotto, imposto dal tipo `Explained<T>` a livello di compilatore.
→ `packages/core/src/shared/explain.ts`

### 1.5 Il fascicolo di adeguatezza si genera da solo

Il Reg. IVASS 40/2018 impone all'intermediario di rilevare richieste ed esigenze e di motivare
l'adeguatezza (All. 4-ter). Oggi è carta. In AEGIS la catena `risk register → esigenze → coperture
proposte → massimale → motivazione` si genera dall'analisi e si stampa nel report, su un registro
di scritture inalterabili (nessun UPDATE, nessun DELETE). È il fossato competitivo a cui si punta:
nessuno abbandona il sistema che custodisce le sue prove.

**Tre pezzi del fascicolo però non ci sono ancora, e vanno detti qui perché è la sezione che li
promette**: gli Allegati 3 e 4 non vengono prodotti, dell'Allegato 4-ter esiste il contenuto e non
il modulo, la firma è quella su carta in calce al report e il rifiuto informato non si registra.
Sono decisioni di prodotto aperte, elencate una per una in `DOMINIO.md` §9.

---

## 2. Scelte tecniche (e dove ho deviato dalla proposta iniziale)

| Livello             | Scelta                                                                           | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo            | **npm workspaces** + TypeScript project references                               | `pnpm` non è installato sulla macchina; npm workspaces evita attrito zero-config. Migrazione a pnpm/turbo = 10 minuti quando serve.                                                                                                                                                                                                                                                                                                                                                                                                            |
| Linguaggio          | **TypeScript strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | Il dominio assicurativo è pieno di casi limite: il compilatore deve fare da revisore.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Dominio             | `packages/core` **puro, zero dipendenze**                                        | Il motore di rischio non conosce HTTP, DB, React. Testabile in millisecondi, riusabile in batch/CLI/API/edge.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Backend             | **Fastify + Zod**, non NestJS                                                    | _Deviazione consapevole_. I pacchetti di dominio sono ESM puro; NestJS oggi vive meglio in CommonJS con `emitDecoratorMetadata`, combinazione che avrebbe imposto o un doppio build (ESM+CJS) di tutti i pacchetti condivisi, o l'abbandono di `verbatimModuleSyntax`. Su una superficie di ~10 rotte il valore di moduli e DI non ripaga quel costo: la composizione avviene esplicitamente in `apps/api/src/server.ts`. Se il team crescerà al punto da richiedere NestJS, il confine da spostare è solo quel file.                          |
| DB                  | **PostgreSQL + Drizzle ORM**                                                     | Schema unico. In sviluppo gira su **PGlite** (Postgres compilato in WASM) → nessun Docker richiesto, stesso SQL della produzione.                                                                                                                                                                                                                                                                                                                                                                                                              |
| Job/orchestrazione  | **Nessuna coda: né BullMQ, né Temporal**                                         | Va detto per primo, perché è la prima cosa che si verifica aprendo il `package.json`: nel repo non esiste alcuna coda di lavori, né alcuna interfaccia `WorkflowRunner`. L'unico timer del servizio è un `setInterval` che purga le sessioni scadute (`apps/api/src/server.ts`). Il monitoraggio è **a richiesta**: confronta le due analisi più recenti già salvate quando qualcuno apre la pagina, non gira per conto proprio. Introdurre una coda resta una decisione aperta, con il costo di esercizio che comporta (Redis o equivalente). |
| Frontend            | **Next.js 15 (App Router) + Tailwind**                                           | Server Components per i report pesanti. Il PDF **non** si genera lato server: il report si stampa dalla finestra del browser («Salva come PDF»), scelta motivata per iscritto in `azienda/[id]/report/BottoneStampa.tsx` — la resa segue il CSS di stampa, che è già scritto e verificabile a schermo, e non serve un renderer headless. Il giorno in cui servirà l'invio automatico per email, il PDF lato server diventerà necessario.                                                                                                       |
| ML/scoring avanzato | Servizio Python separato, **non ora**                                            | Il confine **non è ancora tracciato**: nel repo non esiste alcuna interfaccia `ScoringModel`. Lo score vive in `credit/score.ts` come funzione pura sul profilo canonico, quindi il punto in cui sostituirlo si riconosce, ma l'interfaccia va disegnata quando servirà. Prima si costruisce il dataset, poi si addestra: un modello ML senza dati storici è teatro.                                                                                                                                                                           |

---

## 3. Struttura del repository

```
aegis/
├── docs/
│   ├── ARCHITETTURA.md          ← questo file
│   ├── DOMINIO.md               ← la conoscenza assicurativa codificata
│   ├── CONFRONTO-CREDITSAFE-IADV.md
│   └── CONSEGNA.md · PRIMA-SESSIONE.md · PROVARLO-TU.md
├── packages/
│   ├── core/                    ← IL CUORE. Dominio puro, zero dipendenze.
│   │   └── src/
│   │       ├── shared/          ← Money, tipi branded, Explained<T>, provenance
│   │       ├── company/         ← profilo canonico, bilancio riclassificato, indici, ATECO, dimensione UE
│   │       ├── credit/          ← Altman Z'', score esplicabile, fido consigliato
│   │       ├── risk/            ← tassonomia ISO 31000, motore a regole, matrice P×I, geo, ritenzione
│   │       ├── coverage/        ← coperture, somme assicurande, gap analysis, CAT NAT, danno massimo
│   │       ├── governance/      ← assetto proprietario, titolare effettivo, norme per forma giuridica
│   │       ├── monitoring/      ← stato sorvegliato, rilevazione degli eventi
│   │       ├── portfolio/       ← import/export del portafoglio
│   │       ├── carrier/         ← Carrier Strength Score
│   │       ├── fixtures/        ← azienda dimostrativa
│   │       └── assessment/      ← orchestratore: azienda → valutazione completa
│   ├── providers/               ← client OpenAPI.com + mapper verso il modello canonico
│   └── db/                      ← schema Drizzle, migrazioni, repository, RLS
├── collaudo/                    ← prove end-to-end (Playwright)
└── apps/
    ├── api/                     ← Fastify + Zod (non NestJS: vedi §2)
    └── web/                     ← Next.js
```

**Regola di dipendenza** (non negoziabile): `web → api → db/providers → core`. Il core non importa nulla verso l'alto.

---

## 4. Il flusso verticale implementato

```
  ┌──────────────┐
  │ P.IVA / nome │
  └──────┬───────┘
         ▼
  ┌─────────────────────────┐   OpenAPI.com: ricerca, company advanced,
  │ 1. Acquisizione dati    │   bilanci riclassificati, protesti,
  │    (providers)          │   pregiudizievoli, soci e cariche
  └──────┬──────────────────┘
         ▼
  ┌─────────────────────────┐   Ogni campo porta { valore, fonte, data, confidenza }
  │ 2. Modello canonico     │   Riclassificazione CEE → SP finanziario + CE a valore aggiunto
  │    CompanyProfile       │   Classificazione dimensionale UE
  └──────┬──────────────────┘
         │
         ├──────────────────────────────┬─────────────────────────────┐
         ▼                              ▼                             ▼
  ┌─────────────┐              ┌──────────────────┐          ┌─────────────────┐
  │ 3a. CREDITO │              │ 3b. RISCHI       │          │ 3c. PATRIMONIO  │
  │ Altman Z''  │              │ ISO 31000        │          │ ASSICURABILE    │
  │ indici      │              │ motore a regole  │          │ somme dal       │
  │ score 1-100 │              │ P × I → residuo  │          │ bilancio        │
  │ fido        │              │                  │          │                 │
  └──────┬──────┘              └────────┬─────────┘          └────────┬────────┘
         │                              │                             │
         └──────────────┬───────────────┴─────────────────────────────┘
                        ▼
              ┌───────────────────────┐
              │ 4. GAP ANALYSIS       │  coperture dovute vs. in essere
              │  + CAT NAT compliance │  sottoassicurazione (art. 1907 c.c.)
              │  + priorità           │  massimali insufficienti
              └──────────┬────────────┘
                         ▼
              ┌───────────────────────┐
              │ 5. REPORT & FASCICOLO │  proposta motivata + adeguatezza IVASS
              │    DI ADEGUATEZZA     │  audit trail
              └───────────────────────┘
```

---

## 5. Modello dati: i tre principi

1. **Immutabilità degli snapshot.** Un dato di provider non si aggiorna mai in place: si scrive un nuovo
   `company_snapshot`. Una valutazione fatta a marzo deve restare riproducibile a dicembre, con i dati
   di marzo. È un requisito legale, non un vezzo (contenzioso sull'adeguatezza).
2. **Provenance ovunque.** `Sourced<T> = { value, source, observedAt, confidence }`. Se un campo non ha
   fonte, non entra nel modello.
3. **Multi-tenant per intermediario.** Ogni riga porta `tenant_id`, isolato a livello di repository e di
   Row Level Security PostgreSQL. Il portafoglio di un broker non è mai visibile ad un altro.

---

## 6. Costi dati: il problema che affonda i progetti come questo

Ogni chiamata a OpenAPI.com costa. Un'analisi completa di un'azienda ne richiede 5-8.
Senza governo, il costo variabile mangia il margine.

Contromisure implementate in `packages/providers`:

- **cache a TTL differenziato per volatilità del dato** (anagrafica 30gg, bilancio 180gg, protesti 7gg);
- **acquisizione a livelli**: si parte dal servizio più economico, si sale solo se l'analisi lo richiede;
- **cost ledger**: ogni chiamata registra costo stimato e tenant → il margine per cliente è misurabile
  fin dal primo giorno;
- **budget guard** per tenant, con soglia bloccante.

---

## 7. Roadmap oltre il verticale

| Fase         | Contenuto                                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1 — ora** | Verticale completo: ricerca → profilo → credito → rischi → gap → CAT NAT → report                                                                                                              |
| **F2**       | Monitoraggio continuo: portafogli, event rules, trigger _assicurativi_ (nuova sede, nuovo ATECO, salto dimensionale, aumento addetti → coperture non più adeguate)                             |
| **F3**       | **Policy Intelligence**: parsing AI dei testi di polizza PDF → grafo strutturato di garanzie, massimali, franchigie, esclusioni. Confronto oggettivo tra offerte e contro benchmark di settore |
| **F4**       | Carrier Strength Score in produzione (ingestione SFCR + statistiche reclami IVASS)                                                                                                             |
| **F5**       | Portfolio Intelligence per il broker: esposizione per settore, scadenzario, propensione al cross-sell, ranking opportunità                                                                     |
| **F6**       | Modello ML di scoring addestrato sui dati storici accumulati                                                                                                                                   |
