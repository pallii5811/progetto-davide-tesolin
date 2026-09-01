# Consegna e messa in esercizio

Questo documento serve a chi installa e manda avanti AEGIS, non a chi lo sviluppa. Copre
l'installazione, il primo accesso, la configurazione di produzione, i salvataggi e i guasti
più probabili. Per il **perché** delle scelte tecniche c'è
[ARCHITETTURA.md](ARCHITETTURA.md); per le regole assicurative codificate,
[DOMINIO.md](DOMINIO.md).

---

## 1. Cosa serve sulla macchina

| Componente     | Versione | Note                                                   |
| -------------- | -------- | ------------------------------------------------------ |
| **Node.js**    | 22 o più | Unico requisito obbligatorio.                          |
| **PostgreSQL** | 14 o più | Solo in produzione. In prova non serve: si usa PGlite. |

Non servono Docker, né un server web davanti, né servizi esterni oltre a OpenAPI.com per
i dati aziendali reali.

---

## 2. Prova su strada, senza configurare nulla

```bash
npm install
npm run dev:api    # in un terminale
npm run dev:web    # in un altro
```

L'interfaccia è su `http://localhost:3000`. Senza alcun file `.env` la piattaforma parte in
**modalità dimostrativa**: tre aziende fittizie, nessuna chiamata a pagamento, nessun costo.
Serve a vedere come lavora prima di collegarla ai dati veri.

I dati vivono comunque su un database vero — PGlite, PostgreSQL compilato in WebAssembly,
che scrive un cluster in `.dati/` — e **sopravvivono al riavvio**.

---

## 3. Primo accesso

Al primo avvio, se non esiste alcun utente, il servizio ne crea uno amministratore e ne
stampa la password **una sola volta** a terminale:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ PRIMO AVVIO — utente amministratore creato                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│  Indirizzo: admin@aegis.local                                                │
│  Password:  Xk4mR-pQ2vN-8sLdW-aB7yz                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│  Questa password non verrà mostrata di nuovo. Annotarla e cambiarla.         │
└──────────────────────────────────────────────────────────────────────────────┘
```

Non esiste alcun `admin/admin` predefinito, e la password non è recuperabile: è derivata con
scrypt, il database ne conserva solo l'impronta.

Da lì:

1. entrare e cambiare subito la password in **Impostazioni → Il tuo accesso**;
2. aggiungere i collaboratori in **Impostazioni → Utenti dello studio**;
3. consegnare a voce la password iniziale che il sistema genera per ciascuno — è mostrata
   una volta sola, non viene inviata per posta.

L'indirizzo del primo amministratore si cambia con `AEGIS_ADMIN_EMAIL`, la denominazione
dello studio con `AEGIS_TENANT`, prima del primo avvio.

### Se l'unico amministratore perde la password

Dall'interfaccia non c'è rimedio: chi potrebbe aiutarlo è lui stesso. **A servizio fermo**:

```bash
npx tsx scripts/reimposta-password.ts admin@aegis.local
```

Genera una password nuova, la stampa una volta e chiude tutte le sessioni aperte
dell'utente. Se l'indirizzo non esiste, elenca quelli registrati.

---

## 4. Ruoli

| Ruolo              | Cosa può fare                                           |
| ------------------ | ------------------------------------------------------- |
| **Amministratore** | Tutto, compresa la gestione degli utenti dello studio.  |
| **Broker**         | Analizza aziende, compila dossier, gestisce le polizze. |
| **Assistente**     | Compila i dati raccolti in intervista.                  |
| **Sola lettura**   | Consulta le analisi esistenti senza modificarle.        |

Tre vincoli non aggirabili, perché ciascuno corrisponde a un modo di restare chiusi fuori:
nessuno può disattivare o declassare sé stesso; deve restare almeno un amministratore
attivo; la sospensione di un utente **chiude subito** le sue sessioni aperte.

---

## 4-bis. Prendere in carico il portafoglio esistente

Un intermediario non comincia da zero: ha già i suoi clienti in un foglio di calcolo. In
**Portafoglio → Importa elenco clienti** si carica l'esportazione del gestionale così
com'è, senza riformattarla.

La piattaforma riconosce da sola separatore e intestazioni, rispetta le virgolette,
tralascia le righe vuote, tiene una sola volta i duplicati e — soprattutto — **reintegra
gli zeri iniziali** che i fogli di calcolo tolgono alle partite IVA trattandole come
numeri. `00743110157` esportata come `743110157` viene ricostruita e verificata sul
carattere di controllo; se il controllo non torna, la riga si scarta invece di tirare a
indovinare su un identificativo.

**Prima si legge, poi si spende.** La lettura non acquisisce nulla e non costa nulla:
dice quante aziende verrebbero prese in carico, quali sono già in portafoglio (non si
riacquistano) e quanto costerebbe il resto. Solo dopo la conferma partono le chiamate.

Le righe illeggibili non fanno fallire l'importazione: vengono elencate una per una con il
numero di riga del file originale e il motivo, e tutto il resto entra comunque. Il massimo
per singola importazione è **250 aziende**: non è un limite tecnico ma una difesa contro il
file sbagliato — caricare per errore l'anagrafica completa di un gestionale significherebbe
centinaia di euro di chiamate.

---

## 4-ter. Trovare clienti nuovi

La voce **Nuovi clienti** cerca imprese che non si hanno ancora: provincia, codice ATECO,
addetti e fatturato (minimo e massimo), denominazione parziale.

**Contare è gratuito.** Il pulsante «Conta quante sono» non scarica nulla e non addebita
nulla: risponde quante imprese corrispondono e quanto costerebbe l'elenco. I filtri si
compongono per tentativi senza spendere, ed è il modo in cui vanno usati.

**L'elenco si paga a record**: cinque centesimi ad azienda, verificato sul servizio reale.
Il lotto si sceglie prima (10, 25, 50 o 100) e il preventivo esatto compare accanto al
pulsante di scarico. Analizzare una delle aziende trovate costa a parte, come qualunque
altra analisi.

**Il codice ATECO va scritto senza punti** e il confronto è esatto: `2562` trova sessantuno
aziende in provincia di Brescia, `25.62.00` non ne trova nessuna, e `25` ne trova undici —
perché una divisione non comprende le proprie sottocategorie. È una stranezza del fornitore,
ed è dichiarata nel modulo; il contatore gratuito permette di scoprirla in due tentativi.

---

## 5. Dati reali

Il profilo aziendale arriva da [OpenAPI.com](https://openapi.com). In `.env`:

```
OPENAPI_TOKEN=…
OPENAPI_AMBIENTE=produzione
OPENAPI_BUDGET_CENTESIMI=200
```

`OPENAPI_BUDGET_CENTESIMI` è un tetto di spesa per sessione di lavoro: superato, il client
rifiuta nuove chiamate a pagamento. È la difesa contro il ciclo che va in errore e riprova —
senza, il credito si esaurisce prima che qualcuno se ne accorga.

**Costo per azienda analizzata.** I prezzi sono quelli dichiarati dal servizio in
`packages/providers/src/openapi/config.ts`, cioè gli stessi che compaiono sui pulsanti che
spendono: non è una tabella scritta a mano che possa divergere dal prodotto.

| Acquisto                                  | Costo       | Validità in archivio | Cosa aggiunge                                                                                                                                                   |
| ----------------------------------------- | ----------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Analisi** (`IT-advanced`)               | **0,10 €**  | 30 giorni            | Anagrafica, ATECO, PEC, REA, dieci anni di bilanci sintetici, soci.                                                                                             |
| **Analisi approfondita** (`IT-full`)      | **+0,30 €** | 30 giorni            | Aggregati di bilancio autorevoli, quarantotto indici, cariche sociali, unità locali, qualifiche d'impresa, mercati di esportazione, gare pubbliche.             |
| **Eventi negativi** (`IT-negativita`)     | **+0,45 €** | 7 giorni             | Protesti, pregiudizievoli e procedure concorsuali. Acquisto a parte, con il suo pulsante e il suo prezzo scritto sopra. Richiede l'apposito permesso sul token. |
| Bilancio dettagliato (`IT-balance-sheet`) | 5,00 €      | —                    | Voci CEE complete. **Il codice non lo chiama**: vedi sotto.                                                                                                     |

L'approfondimento **si somma** e non sostituisce: il profilo completo non porta i bilanci
sintetici decennali, quindi affianca l'anagrafica estesa invece di rimpiazzarla.

Un lead documentato per intero — anagrafica, profilo completo e verifica delle negatività —
costa **85 centesimi**. È il numero su cui si costruisce il prezzo del servizio al cliente
finale, e il registro costi in banca dati lo rende misurabile azienda per azienda.

> Fino al 01/09/2026 questa sezione diceva «circa 55 centesimi», che era la somma di
> anagrafica ed eventi negativi quando la verifica protesti veniva comprata **d'ufficio a
> ogni analisi**. Quel comportamento è stato corretto — chi premeva «Analizza» spendeva
> cinquantacinque centesimi credendo di spenderne dieci — ma il numero era rimasto qui, e
> con esso mancava del tutto il livello che l'analisi la rende difendibile.

Il **bilancio dettagliato non è acquistabile oggi**: il percorso non è confermato sul
contratto, il servizio è marcato `verificato: false` e il provider lo salta invece di
chiamarlo. Il prezzo è in tabella perché si sappia quanto costerebbe, non perché sia
disponibile. Finché resta così, la confidenza dello score si regge sui bilanci sintetici e
sugli aggregati del profilo completo — e la scheda lo dichiara.

Le risposte già comprate restano in archivio per la validità indicata: entro quel periodo
riaprire la stessa azienda **non addebita nulla**, e i pulsanti che spenderebbero lo dicono
al posto del prezzo.

Prima di collegare i dati veri, verificare cosa il token è autorizzato a fare — **non costa
nulla**:

```bash
npm run diagnostica
```

---

## 5-bis. Solidità delle compagnie

**Impostazioni → Solidità delle compagnie.** Una polizza è una promessa di pagamento
futura: vale quanto vale chi la sottoscrive. Il rischio di controparte è il punto cieco
della consulenza assicurativa italiana.

I dati si inseriscono **a mano dalla SFCR**, la relazione che la direttiva Solvency II
impone a ogni compagnia di pubblicare ogni anno, e dalle statistiche reclami IVASS. Non
sono stimati e non sono dedotti: chi consegna una proposta deve poter dire da quale
documento viene ogni numero.

Bastano **denominazione, esercizio e solvency ratio** per ottenere un punteggio; gli
altri campi lo affinano. Il solvency ratio si scrive come sta nella relazione — `260`,
non `2,6`.

Il punteggio si **ricalcola a ogni lettura**: non è conservato in tabella, perché un
numero congelato sopravvive alla regola che lo ha prodotto e nessuno si accorge che è
vecchio finché non deve difenderlo davanti a un cliente.

Soglie sul solvency ratio: sotto 100% **critica** — la compagnia non copre il proprio
requisito patrimoniale — - 150% debole · 200% adeguata · 250% solida · oltre, molto
solida. La media del mercato italiano si colloca stabilmente sopra il 250%.

---

## 5-ter. Tetto di spesa

`AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI` — predefinito **2000** (20 € al giorno per
intermediario). Zero disattiva il controllo.

Il tetto si verifica **prima** di ogni operazione a pagamento, non a consuntivo: un limite
controllato dopo è un rendiconto, non un limite. Raggiunto il tetto, analisi, importazioni
e scarichi di prospect rispondono `429` con l'importo già speso; il **conteggio dei
prospect resta disponibile**, perché è gratuito ed è l'unico strumento per pianificare la
spesa del giorno dopo.

Le chiamate servite dalla cache non contano: non sono state pagate.

Il tetto vale **per intermediario**: le spese di uno studio non fermano il lavoro di un
altro.

---

## 6. Produzione

### 6.1 Database

```bash
DATABASE_URL=postgresql://utente:password@host:5432/aegis npm run migra
```

Le migrazioni sono file SQL numerati in `packages/db/migrazioni/`, applicati in ordine.
Rieseguire il comando non ripete quelle già passate.

**Lo schema non si crea all'avvio**: creare tabelle a runtime su dati reali non lascia
traccia di cosa è cambiato e quando. Se si avvia il servizio su un database senza schema, si
ferma dicendo quale comando manca, invece di fallire alla prima richiesta.

### 6.2 Variabili

Tutte documentate in [`.env.example`](../.env.example). Le indispensabili:

```
DATABASE_URL=postgresql://…
NODE_ENV=production
OPENAPI_TOKEN=…
OPENAPI_AMBIENTE=produzione
```

`NODE_ENV=production` attiva il flag `secure` sul cookie di sessione: da quel momento
viaggia **solo** su HTTPS. Il servizio va quindi messo dietro un proxy con certificato
valido — senza, nessuno riesce più ad accedere, ed è il comportamento voluto.

#### Fonti territoriali

Sono **gratuite**, ma nessuna delle due è gratuita _per un prodotto venduto_ alle stesse
condizioni con cui lo è per una prova. Vanno lette prima di andare in esercizio.

```
CONTESTO_TERRITORIALE=auto      # auto (predefinito) · sempre · mai
OVERPASS_URL=https://…/api/interpreter
OVERPASS_USER_AGENT=NomeProdotto/1.0 (contatto: tecnico@studio.it)

METEO_STORICO=spento            # spento (predefinito) · attivo
METEO_URL=https://…/v1/archive
```

**Contesto territoriale** (caserme dei vigili del fuoco, attività confinanti, impronta a
terra dei fabbricati). Fonte: OpenStreetMap via Overpass. Tre cose da sapere:

- i dati sono **ODbL**: l'attribuzione «© contributori OpenStreetMap» compare già nel
  report e non va rimossa;
- l'istanza pubblica di Overpass è **volontaria**, concede **due slot per indirizzo IP** e
  rifiuta con 429 quando sono occupati. Per un prodotto venduto va sostituita con
  un'istanza propria o a pagamento: si imposta `OVERPASS_URL` e null'altro cambia;
- `OVERPASS_USER_AGENT` va personalizzato con un recapito vero. Chi gestisce il servizio
  deve poter contattare chi ne fa un uso eccessivo invece di doverlo bloccare.

`CONTESTO_TERRITORIALE=auto` raccoglie solo sui dati reali; in modalità dimostrativa le
coordinate sono inventate e il vicinato di un'azienda che non esiste è rumore. `sempre`
serve a guardare la resa del capitolo senza acquistare un'anagrafica, `mai` a spegnere
tutto — utile dietro una rete chiusa, o quando la fonte è ferma e si preferisce un report
senza quel capitolo a uno che attende invano.

**Storico degli eventi atmosferici** (giorni oltre soglia di pioggia e raffica negli ultimi
dieci anni). Fonte: Open-Meteo, archivio di rianalisi ERA5. **Spento di default**, e la
ragione è la licenza: l'uso è gratuito per scopi non commerciali, mentre un prodotto
venduto richiede un abbonamento. Accenderlo è una decisione con un costo, non
un'impostazione tecnica — e il codice non la prende al posto di chi installa.

⚠ La fonte **non copre grandine né fulmini**, e la grandine è il fenomeno che produce più
sinistri sui capannoni. Il report lo dichiara accanto ai dati: quella riga non va tolta,
perché senza chi legge conclude che su quel punto non ne siano mai caduti.

### 6.3 Avvio

```bash
npm run build
npm run build --workspace @aegis/web
npm run start --workspace @aegis/api  # API,      porta 3001
npm run start --workspace @aegis/web  # frontend, porta 3000
```

Il frontend parla con l'API tramite `AEGIS_API_URL`; l'unico processo che deve essere
raggiungibile dai browser è il frontend.

### 6.4 Row Level Security — non ancora, e conviene sapere perché

Le policy in `packages/db/src/rls.ts` sono scritte e **inerti**: nessuna migrazione le
applica. **Non applicarle.** Questa sezione dice cosa manca, così la decisione non poggia
su una data ma su un elenco che si può contare.

Il collegamento applicativo che serve — `SET LOCAL app.tenant_id` all'apertura di ogni
transazione — è stato fatto il 22/08/2026 **per il contesto di uno studio**: ogni metodo di
`creaContesto` passa da `conTenant` (`apps/api/src/persistenza.ts`), che apre una
transazione e vi dichiara l'identificativo. Non è però tutto il servizio.

Restano **diciannove punti** che raggiungono una tabella protetta senza dichiarare per
conto di quale studio. L'elenco non è stimato: lo misura
`packages/db/test/isolamento-rls.test.ts` leggendo il codice, e il collaudo fallisce sia se
se ne aggiunge uno sia se se ne risolve uno senza toglierlo dall'elenco — così il conto
resta vero. Il peggiore è `trovaUtentePerEmail`, la ricerca dell'utente per indirizzo, che
avviene _prima_ di sapere di quale studio si tratti: con le policy attive
`current_setting('app.tenant_id')` torna vuoto, quella query restituisce zero righe e **non
entra più nessuno** — senza un errore che lo spieghi.

Alcuni di quei diciannove attraversano gli studi **per disegno** — l'elenco degli studi, la
spesa complessiva della piattaforma, la creazione del primo amministratore di uno studio
nuovo — e non vanno avvolti in `conTenant`: con `FORCE ROW LEVEL SECURITY` nemmeno il
proprietario delle tabelle li vede. Serviranno un ruolo distinto e una decisione, non una
deroga sparsa.

**L'isolamento oggi in vigore è quello applicativo**, ed è reale: ogni repository filtra
per `tenant_id` e c'è un collaudo che verifica su due studi distinti che nessuno veda i
dati dell'altro. Manca il _secondo_ strato, quello che regge se un giorno qualcuno
dimentica un `where`. **Su un'installazione con un solo studio la differenza è teorica**;
diventa concreta il giorno in cui il secondo studio entra sulla stessa macchina, e quel
giorno il lavoro va fatto prima, non dopo.

Per accenderlo servono, in quest'ordine:

1. **svuotare l'elenco dei diciannove aggiramenti**: avvolgere in `conTenant`
   (`packages/db/src/tenant.ts`) ciò che appartiene a uno studio, e decidere separatamente
   cosa fare di ciò che attraversa gli studi per disegno. Finché l'elenco non è vuoto, i
   passi seguenti non vanno nemmeno tentati;
2. un **PostgreSQL vero** su cui verificarlo. PGlite gira come superuser e i superuser
   scavalcano la Row Level Security anche con `FORCE`: misurato il 20/08/2026 — due righe
   di due intermediari diversi, entrambe visibili a policy attiva. In sviluppo non si può
   provare, e una sicurezza non provata non è una sicurezza;
3. un **ruolo applicativo non superuser** con cui il servizio si collega, altrimenti le
   policy non mordono nemmeno in produzione;
4. `sqlAbilitaRls()` eseguito come **proprietario** delle tabelle, sotto forma di
   migrazione;
5. **collaudarlo**: aprire due studi, analizzare un'azienda col primo, verificare che il
   secondo non la veda — e che l'accesso funzioni ancora per entrambi.

`cache_risposte` resta **fuori** dalle policy, deliberatamente: contiene dati pubblici del
registro imprese comprati con un contratto unico, non dati di un cliente. Vedi il commento
nello schema.

---

## 7. Salvataggi

| Configurazione | Cosa salvare         | Come                                              |
| -------------- | -------------------- | ------------------------------------------------- |
| PostgreSQL     | Il database          | `pg_dump` regolare, con verifica del ripristino.  |
| PGlite         | La cartella `.dati/` | Copia **a servizio fermo**: è un cluster su file. |

Cosa si perde senza salvataggi: portafoglio, dati raccolti in intervista, polizze
registrate, analisi congelate e audit trail. I dati di provider si possono riacquistare, il
lavoro dei broker no.

Il registro costi è storico: cancellarlo non rompe nulla, ma toglie la misura del margine.

---

## 7-bis. Monitoraggio continuo

La voce **Monitoraggio** raccoglie ciò che è cambiato nelle aziende seguite e cosa comporta
per le loro coperture. Confronta le due analisi più recenti di ciascuna azienda e segnala
solo ciò che sposta una garanzia: attività variata, nuova ubicazione, salto dimensionale,
capitali non più capienti, polizze in scadenza, obblighi di legge non adempiuti,
peggioramento del merito creditizio, procedure concorsuali.

Il comando **Aggiorna monitoraggio** non interroga il provider e **non consuma credito**:
lavora sulle fotografie già salvate. Va comunque eseguito ogni giorno, perché scadenze e
obblighi dipendono dalla data odierna e non da una variazione dei dati. Su un server si
programma con un'attività pianificata:

```bash
curl -X POST -H "Cookie: aegis_sessione=<token>" http://127.0.0.1:3001/api/monitoraggio/esegui
```

Ogni voce resta in coda finché qualcuno non la segna **gestita**, e il sistema registra chi
l'ha presa in carico e quando: davanti a una contestazione, «l'avevamo segnalato» vale solo
se è dimostrabile. Una voce gestita torna a comparire dopo trenta giorni se la situazione
persiste — un obbligo di legge ancora aperto non deve sparire perché qualcuno ha spuntato
una casella.

---

## 8. Manutenzione ordinaria

Non c'è. Le sessioni scadute vengono rimosse dal servizio stesso una volta l'ora.

Quello che vale la pena guardare ogni tanto:

- il **registro costi** (`registro_costi_dati`), per tenere d'occhio la spesa sui dati;
- l'**audit trail** (`audit_log`), append-only, per ricostruire chi ha fatto cosa;
- gli utenti **bloccati per tentativi falliti**, segnalati nell'elenco: cinque tentativi
  sbagliati bloccano temporaneamente l'accesso, e un blocco ricorrente merita una domanda.

---

## 9. Guasti probabili

**«Servizio non raggiungibile» nell'interfaccia.** L'API non è avviata o `AEGIS_API_URL`
punta altrove. Verificare con `curl http://127.0.0.1:3001/health`.

**Il servizio non parte e chiede le migrazioni.** `DATABASE_URL` è impostata ma lo schema
non è mai stato applicato: eseguire `npm run migra`.

**L'archivio sembra vuoto dopo un aggiornamento.** Verificare `AEGIS_DATA_DIR`: il percorso
predefinito è ancorato alla radice del progetto, ma un valore diverso nell'ambiente punta a
un altro cluster. Il messaggio di avvio dice sempre quale archivio è in uso.

**Nessuno riesce ad accedere dopo essere passati a HTTPS.** Con `NODE_ENV=production` il
cookie è `secure`: se il proxy non termina in HTTPS, il browser non lo invia mai.

**Un'analisi costa più del previsto.** Il livello di acquisizione si sceglie per azienda.
Il registro costi mostra ogni chiamata, con l'indicazione di quali sono state servite dalla
cache — quelle non costano.

---

## 10. Verifica dopo ogni modifica

```bash
npm run verifica
```

Compila in TypeScript strict, passa il linter, esegue l'intera suite. Include un controllo
che il DDL di sviluppo e le migrazioni di produzione descrivano lo stesso database: se le
due strade divergono, il guasto si vedrebbe soltanto dal cliente.

### Collaudo su browser reale

```bash
npm run collaudo
```

Avvia API e frontend su porte dedicate, con un archivio proprio azzerato ogni volta, e usa
il software come lo userebbe un broker: accede, analizza, compila l'intervista, gestisce i
collaboratori, esce. Verifica che le cose abbiano **effetto sul mondo** — che un dato
salvato si ritrovi dopo un ricaricamento, che una sospensione chiuda davvero le sessioni
aperte, che dopo l'uscita una copia del token non funzioni più.

Esiste perché tre guasti che rompevano funzioni centrali erano rimasti invisibili: il
salvataggio dell'intervista, la pagina dei cataloghi e la revoca all'uscita. Nessuno di
essi produceva un errore visibile, e nessun test li vedeva.

Per esaminare l'interfaccia a occhio — schermo largo, schermo stretto e stampa:

```bash
npm run collaudo:schermate
```

Scrive le immagini in `schermate/`. Non asserisce nulla: serve a guardare.

Per il ciclo di vita delle sessioni contro un servizio già in esecuzione:

```bash
npm run verifica:sessione -- admin@aegis.local <password>
```

---

## 10-bis. Da fare prima della produzione: Row Level Security

L'isolamento fra intermediari è oggi **applicativo**: ogni lettura risolve l'azienda
attraverso il proprio intermediario, e nessun percorso lo salta — verificato riga per riga.
Ma è una garanzia che dipende dalla disciplina di chi scrive il codice, non dal database.

`packages/db/src/rls.ts` contiene le policy PostgreSQL che imporrebbero l'isolamento a
livello di motore: se il codice sbaglia, il database restituisce zero righe invece dei dati
di un altro studio. **Sono scritte e non sono mai state applicate — e oggi non vanno
applicate.**

Il motivo, l'elenco esatto di ciò che manca e l'ordine dei passi stanno nella sezione 6.4.
In breve: diciannove punti del servizio raggiungono ancora una tabella protetta senza
dichiarare per conto di quale studio, e il primo a cadere sarebbe l'accesso. È un
intervento sul livello di accesso ai dati, va fatto su un PostgreSQL vero e va collaudato:
non è materiale da ultima serata prima della consegna.

In un sistema che custodisce i portafogli clienti di broker concorrenti, questa è la prima
voce della lista di produzione.

---

## 11. Cosa non è costruito

Onestà, perché il committente possa pianificare:

- **parsing automatico dei testi di polizza**;
- **collegamenti societari oltre il proprio portafoglio**: due aziende si collegano se
  condividono un socio ed entrambe sono state analizzate. Non è una visura nazionale
  delle partecipazioni;
- **ingestione automatica dei dati SFCR**: oggi il censimento delle compagnie è manuale,
  un documento alla volta. Il motore e l'interfaccia sono completi; manca il caricamento
  massivo da una fonte, che nessuno pubblica in un formato interrogabile;
- **bilancio dettagliato** (`IT-balance-sheet`, 5,00 €): prodotto a sottoscrizione
  separata, il percorso non è confermato e finché non lo sarà il codice **non lo chiama**,
  per non pagare una chiamata a vuoto. È l'unico servizio del listino in questa condizione;
- **calibrazione su dati storici** della curva score → probabilità di default e dei
  benchmark di massimale: oggi sono tarati sull'esperienza di settore. Le funzioni sono
  isolate perché la ricalibrazione sia un intervento in un punto solo.
