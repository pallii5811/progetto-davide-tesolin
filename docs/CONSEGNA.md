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

**Costo per azienda analizzata** (verificato su chiamate reali, agosto 2026):

| Livello                | Costo   | Cosa aggiunge                                                       |
| ---------------------- | ------- | ------------------------------------------------------------------- |
| Base (`IT-advanced`)   | ~0,10 € | Anagrafica, ATECO, PEC, REA, 10 anni di bilanci sintetici, soci.    |
| + eventi negativi      | ~0,45 € | Protesti e pregiudizievoli. Richiede l'apposito permesso sul token. |
| + bilancio dettagliato | ~5,00 € | Voci CEE complete: alza la confidenza dello score.                  |

Un merito creditizio difendibile costa circa **55 centesimi**. Il registro costi in banca
dati rende misurabile il margine per cliente.

Prima di collegare i dati veri, verificare cosa il token è autorizzato a fare — **non costa
nulla**:

```bash
npm run diagnostica
```

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

### 6.3 Avvio

```bash
npm run build
npm run build --workspace @aegis/web
npm run start --workspace @aegis/api  # API,      porta 3001
npm run start --workspace @aegis/web  # frontend, porta 3000
```

Il frontend parla con l'API tramite `AEGIS_API_URL`; l'unico processo che deve essere
raggiungibile dai browser è il frontend.

### 6.4 Row Level Security

Le policy in `packages/db/src/rls.ts` vanno applicate come **secondo strato** dietro
l'isolamento già garantito dai repository. Su PGlite non mordono, perché l'utente è
superuser; su PostgreSQL vero sì. Sono la rete che protegge da un errore applicativo futuro.

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

## 11. Cosa non è costruito

Onestà, perché il committente possa pianificare:

- **parsing automatico dei testi di polizza**;
- **cariche sociali** (amministratori, rappresentante legale): non sono comprese
  nell'anagrafica acquistata da OpenAPI a questo livello. La piattaforma lo dichiara e
  produce le domande da porre, invece di dedurle;
- **collegamenti societari oltre il proprio portafoglio**: due aziende si collegano se
  condividono un socio ed entrambe sono state analizzate. Non è una visura nazionale
  delle partecipazioni;
- **dati SFCR e reclami IVASS reali** per il rating di solidità delle compagnie: il motore
  di calcolo c'è, i dati vanno ingeriti;
- **bilancio dettagliato, protesti e pregiudizievoli** su OpenAPI: sono prodotti a
  sottoscrizione separata, i percorsi non sono confermati e finché non lo saranno il codice
  **non li chiama**, per non pagare chiamate a vuoto;
- **calibrazione su dati storici** della curva score → probabilità di default e dei
  benchmark di massimale: oggi sono tarati sull'esperienza di settore. Le funzioni sono
  isolate perché la ricalibrazione sia un intervento in un punto solo.
