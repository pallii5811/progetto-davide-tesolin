# AEGIS

**Credit & Insurance Risk Intelligence** per intermediari assicurativi.

Unisce in un unico grafo ciò che oggi il broker ottiene da due strumenti separati: le
informazioni commerciali sull'azienda (tipo Creditsafe) e l'analisi dei rischi ISO 31000
(tipo Insurance Advisor). La tesi è semplice: **il report di credito e il questionario di
analisi rischi descrivono la stessa azienda**, e oggi vengono compilati due volte senza
che uno parli con l'altro.

---

## Avvio in due comandi

Nessun database, nessun Docker, nessuna credenziale richiesta per la prima esecuzione.

```bash
npm install
```

```bash
npm run build
```

Poi, in due terminali:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

L'interfaccia è su <http://localhost:3000>, l'API su <http://localhost:3001>.

Senza la variabile `OPENAPI_TOKEN` la piattaforma parte in **modalità dimostrativa**, con
tre aziende di esempio coerenti e complete. Partite IVA da provare:

| P.IVA         | Azienda                    | Settore               |
| ------------- | -------------------------- | --------------------- |
| `03158460174` | Meccanica Bresciana S.r.l. | Manifattura, Brescia  |
| `02657870644` | Costruzioni Irpine S.r.l.  | Costruzioni, Avellino |
| `02413390390` | Adriatica Logistica S.r.l. | Logistica, Ravenna    |

### Dati reali

Copiare `.env.example` in `.env`, inserire il token OpenAPI.com e avviare così:

```bash
node --env-file=.env apps/api/dist/main.js
```

**Costo di un'analisi completa: 10 centesimi.** Un solo servizio, `IT-advanced`, restituisce
in una chiamata anagrafica, ATECO, forma giuridica, PEC, REA, **dieci esercizi di bilancio
sintetico** e l'elenco dei soci. È l'osservazione che ha ridisegnato l'economia del prodotto:
l'ipotesi iniziale prevedeva sei servizi distinti per oltre 9 € a pratica.

Con quei dati la piattaforma determina classificazione dimensionale UE, scadenza CAT NAT,
benchmark di massimale, base RCO e una parte dello score. Ciò che resta escluso — margine di
contribuzione, indici di liquidità, Altman, valore delle immobilizzazioni — viene **dichiarato
apertamente**, insieme a cosa lo sbloccherebbe.

### Quali servizi è autorizzato a usare il mio token

```bash
npm run diagnostica
```

**Costo zero.** I token OpenAPI.com sono **per scope**, non per account: avere credito non
basta, il token va autorizzato al singolo servizio dalla console. Un `401` su un servizio e
un `200` su un altro, con lo stesso token, è la norma — non un guasto. La diagnostica dice
_quale_ autorizzazione manca e cosa sblocca.

### Livelli di analisi e costo

| Livello                                    | Costo       | Cosa aggiunge                                                                                                                                       |
| ------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anagrafica + bilanci sintetici + soci      | **0,10 €**  | Dimensione UE, scadenza CAT NAT, benchmark massimali, base RCO, parte dello score                                                                   |
| + Eventi negativi (`risk / IT-negativita`) | **+0,45 €** | Protesti, pregiudizievoli, procedure concorsuali: il fattore che pesa il 20% dello score. Senza, ogni valutazione resta dichiaratamente provvisoria |
| + Bilancio riclassificato                  | **+5,00 €** | Margine di contribuzione (capitale per i danni indiretti), indici di liquidità, Altman Z'', valore delle immobilizzazioni                           |

Un merito creditizio **difendibile** costa 55 centesimi. L'analisi assicurativa completa,
5,55 €. La piattaforma non acquisisce mai un livello superiore senza che sia richiesto, e
dichiara sempre cosa comprerebbe il prossimo euro di spesa.

### Collaudare l'integrazione senza spendere

```bash
npx tsx --env-file=.env scripts/sonda.ts IT-start 12485671007
```

La sonda parte in sandbox (gratuito), effettua **una sola chiamata per esecuzione**, salva la
risposta grezza su file e ne stampa la struttura. ⚠ Il sandbox richiede un token proprio,
emesso separatamente dalla console: quello di produzione vi restituisce `401 Wrong Token`.

Per il collaudo dell'intera catena su un'azienda reale:

```bash
npx tsx scripts/verifica-reale.ts 12485671007
```

### Vedere il motore senza avviare nulla

```bash
npm run demo
```

Stampa a terminale l'analisi completa di un'azienda: bilancio riclassificato, score,
registro dei rischi, somme assicurande, verifica CAT NAT e piano d'azione.

### Verifica completa

```bash
npm run verifica
```

Compilazione in TypeScript strict, lint con informazioni di tipo, 259 test.

E il collaudo su browser reale — accesso, analisi, intervista, monitoraggio, gestione
collaboratori — che usa la piattaforma come la userebbe un broker:

```bash
npm run collaudo
```

---

## Il flusso di lavoro

```
  Ricerca azienda                    ricerca per denominazione o P.IVA, con verifica
        │                            del carattere di controllo prima di spendere
        ▼                            una chiamata a pagamento
  Analisi automatica                 profilo camerale, bilanci, score, registro rischi,
        │                            somme assicurande, CAT NAT, gap analysis
        ▼
  Dati di intervista                 ciò che il bilancio non può dire. La piattaforma
        │                            dice quale domanda conviene fare per prima e perché
        ▼
  Analisi ricalcolata                confidenza «alta» al posto di «bassa», rischi
        │                            confermati al posto di «da verificare»
        ▼
  Report per il cliente              documento impaginato per la stampa, con la
        │                            motivazione di adeguatezza per ogni copertura
        ▼
  Portafoglio                        lista di lavoro ordinata per urgenza:
        │                            prima le posizioni fuori norma
        ▼
  Monitoraggio continuo              cosa è cambiato e cosa comporta per le coperture:
                                     è ciò che rende il rapporto un servizio, non
                                     una consulenza una tantum
```

Le tre aziende dimostrative riproducono situazioni diverse: **Meccanica Bresciana** è un
cliente già lavorato (questionario completo, polizze in portafoglio, sottoassicurazione da
mostrare); le altre due sono prospetti freschi, con il questionario da compilare.

---

## Struttura

```
packages/core/        Dominio puro. Zero dipendenze. È il cuore del prodotto.
packages/providers/   Acquisizione dati (OpenAPI.com) e mappatura sul modello canonico.
packages/db/          Schema PostgreSQL: snapshot immutabili, analisi congelate, audit trail.
apps/api/             API REST (Fastify + Zod).
apps/web/             Interfaccia broker (Next.js 15).
docs/ARCHITETTURA.md  Perché il sistema è fatto così.
docs/DOMINIO.md       Le regole assicurative e normative codificate, con le fonti.
docs/CONSEGNA.md      Installazione, primo accesso, produzione, salvataggi, guasti.
```

**Regola di dipendenza**: `web → api → db/providers → core`. Il core non importa nulla
verso l'alto e non conosce né HTTP, né database, né React.

---

## Cosa fa che gli altri non fanno

**Calcola le somme assicurande dal bilancio.** Il broker oggi chiede al cliente quanto vale
il suo capannone; il cliente non lo sa e tira a indovinare. Da lì nasce la sottoassicurazione
e con essa la regola proporzionale dell'art. 1907 c.c., che al sinistro taglia l'indennizzo.
AEGIS calcola fabbricati, contenuto, scorte e — soprattutto — il **margine di contribuzione**
per i danni indiretti, partendo dai dati depositati. Con formula esposta e fonte tracciata.

**Tratta l'obbligo CAT NAT come un motore, non come un banner.** Classifica l'impresa
secondo i criteri UE, determina se è soggetta, quale scadenza le si applica (comprese le
proroghe settoriali), quali beni vanno assicurati e per quale importo. Solo il ~15% delle
imprese italiane risulta coperto: su un portafoglio di 500 aziende sono oltre 400 posizioni
non conformi.

**Quantifica la sottoassicurazione in euro.** Non «sei sottoassicurato», ma: «su un danno di
1.860.000 € l'indennizzo sarebbe 600.000 €; 1.260.000 € resterebbero a suo carico».

**Non produce numeri che non sappia spiegare.** Ogni valore porta con sé formula, input,
fonte di ogni input e livello di confidenza. È imposto dal tipo `Explained<T>` a livello di
compilatore, non lasciato alla buona volontà.

**Prende in carico il portafoglio esistente in un colpo solo.** Un broker ha già
quattrocento clienti in un foglio di calcolo: si carica l'esportazione del gestionale così
com'è. Separatore e intestazioni si riconoscono da soli, e gli zeri iniziali che Excel
toglie alle partite IVA vengono reintegrati e verificati sul carattere di controllo. La
lettura è gratuita e dice quanto costerebbe l'acquisizione **prima** di acquisire.

**Sorveglia ciò che rende inoperante una garanzia.** Il monitoraggio non dice «l'azienda ha
cambiato ATECO»: dice che l'attività dichiarata in polizza non è più quella esercitata, e che
in caso di sinistro la compagnia può eccepire l'inoperatività della garanzia. Una nuova unità
locale non è una notizia anagrafica, è un'ubicazione scoperta. Un bilancio nuovo che porta le
somme assicurande oltre i capitali in polizza è **sottoassicurazione sopravvenuta**: la polizza
non è cambiata, il premio è pagato, e l'indennizzo verrebbe ridotto in proporzione. Ogni evento
porta il fatto, la conseguenza sulla copertura e l'azione da proporre — ordinati per quanto
costa non intervenire.

**Distingue «no» da «non lo so».** Un rischio identificato su un dato mancante non sparisce
dal report: compare marcato _da verificare in intervista_. Sono esattamente i rischi su cui
il cliente è più scoperto.

---

## Stato, senza abbellimenti

**Funziona oggi**: ricerca, analisi completa, questionario di intervista con priorità di
compilazione, gestione polizze, gap analysis, verifica CAT NAT, report stampabile con le
motivazioni di adeguatezza, portafoglio con lista di lavoro.

**Persistenza: collegata e verificata.** I dati vivono su PostgreSQL. In sviluppo il motore
è **PGlite** — PostgreSQL compilato in WebAssembly, che gira nel processo Node senza Docker
e scrive un vero cluster su `.dati/`. In produzione si imposta `DATABASE_URL` e si passa a
PostgreSQL server senza toccare una riga: stesso schema, stesso dialetto, stessi repository.

In produzione lo schema **non** si crea all'avvio: si applicano le migrazioni versionate,
perché creare tabelle a runtime su dati reali non lascia traccia di cosa è cambiato e quando.

```bash
DATABASE_URL=postgresql://utente:password@host:5432/aegis npm run migra
```

Il servizio si rifiuta di partire su un database privo di schema, dicendo quale comando
manca, invece di avviarsi e fallire alla prima richiesta con un errore illeggibile. Un test
applica DDL di sviluppo e migrazioni di produzione a due database vuoti e confronta il
risultato colonna per colonna: se le due strade divergono, il guasto si vedrebbe soltanto
dal cliente.

Ciò che il database garantisce e che una memoria volatile non può dare:

- **snapshot immutabili** dei dati di provider — un'analisi di marzo resta riproducibile a
  dicembre con i dati di marzo, non con quelli corretti nel frattempo;
- **analisi congelate** insieme alle versioni di catalogo rischi e regole che le hanno
  prodotte: un numero non riproducibile è indifendibile davanti a una contestazione;
- **audit trail append-only**;
- **registro costi storico**, che rende misurabile il margine per cliente;
- **righe di gap estratte** dal JSON, perché «tutte le posizioni non conformi per priorità»
  dev'essere una query, non una scansione di documenti.

Verificato con arresto forzato del processo e riavvio: portafoglio, dati di intervista,
polizze e registro costi recuperati integri.

**Autenticazione e isolamento: costruiti e verificati.** Password derivate con **scrypt**
(sale casuale, parametri di costo nel record, confronto a tempo costante), **sessioni su
database** — quindi revocabili, cosa che un token autofirmato non consente — cookie
`httpOnly` `SameSite=Lax`, blocco temporaneo dopo cinque tentativi falliti, e messaggio
identico fra utente inesistente e password errata per non lasciar enumerare gli indirizzi.

Al primo avvio il servizio crea un utente amministratore e ne stampa la password una sola
volta a terminale: nessun `admin/admin` predefinito.

**Gestione utenti dall'interfaccia.** In `/impostazioni` ognuno cambia la propria password
— con obbligo di indicare quella attuale, e con disconnessione di tutti gli altri
dispositivi. In `/impostazioni/utenti`, riservata agli amministratori, si aggiungono
collaboratori (il sistema genera la password iniziale e la mostra **una volta sola**), si
cambia ruolo, si sospende e si chiudono le sessioni aperte di qualcuno.

Tre vincoli che l'interfaccia non lascia aggirare, perché ciascuno corrisponde a un modo
di restare chiusi fuori dal proprio studio:

- nessuno può disattivare o declassare sé stesso;
- deve restare almeno un amministratore attivo;
- la sospensione chiude le sessioni **subito**: sospendere qualcuno lasciandolo dentro
  fino a scadenza non è sospendere.

Se l'unico amministratore perde la password non c'è rimedio dall'interfaccia — chi
potrebbe aiutarlo è lui stesso. Per quel caso, **a servizio fermo**:

```bash
npx tsx scripts/reimposta-password.ts admin@aegis.local
```

Ogni accesso ai dati passa da un contesto legato a un intermediario: non esiste modo di
leggere o scrivere senza dichiarare per conto di chi. L'isolamento è verificato da test che
tentano deliberatamente l'attraversamento fra due studi sullo stesso database.

```bash
npm run verifica:sessione -- admin@aegis.local <password>
```

**Non ancora costruito**: parsing AI dei testi di polizza · ingestione reale dei dati SFCR
e reclami IVASS per il Carrier Strength Score (il motore di calcolo c'è, i dati no) ·
Row Level Security attiva anche in sviluppo (le policy sono scritte in
`packages/db/src/rls.ts` ma su PGlite l'utente è superuser e le aggira: in produzione vanno
applicate come secondo strato dietro l'isolamento dei repository).

**Integrazione OpenAPI.com — verificata su chiamate reali** (agosto 2026): `IT-start` e
`IT-advanced` sono confermati, con mapper allineati alla risposta effettiva e un test di
regressione che la riproduce ([risposta-reale.test.ts](packages/providers/test/risposta-reale.test.ts)).
Restano **da confermare** i percorsi di bilancio dettagliato, protesti e pregiudizievoli:
sono prodotti a sottoscrizione separata, marcati `verificato: false` in configurazione e
**non chiamati** finché non lo saranno — un percorso sbagliato produrrebbe una chiamata a
vuoto, pagata comunque.

**Calibrazioni che il tempo migliorerà**: i benchmark di massimale e la curva score →
probabilità di default sono tarati sull'esperienza di settore, non su dati storici della
piattaforma. Vanno ricalibrati appena il campione lo consente; le funzioni sono isolate
per rendere la ricalibrazione un intervento a un solo punto.

Dettaglio in [docs/ARCHITETTURA.md](docs/ARCHITETTURA.md) §7.

---

## Avvertenza

Le valutazioni sono elaborazioni statistiche a supporto della consulenza. Non costituiscono
consulenza finanziaria né garanzia di solvibilità. Ogni proposta assicurativa resta soggetta
alla valutazione dell'intermediario ai sensi del Reg. IVASS 40/2018.
