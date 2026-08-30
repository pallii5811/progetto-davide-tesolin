# Confronto con Creditsafe e Insurance Advisor

Documento di lavoro, non di vendita. Serve a sapere **con precisione** cosa il prodotto fa,
cosa non fa, e cosa fa meglio — perché il broker a cui va consegnato usa entrambe le
piattaforme tutti i giorni e se ne accorgerebbe comunque.

## Come è stato costruito

Dalle fonti pubbliche: pagine di prodotto, materiale commerciale, descrizioni tecniche dei
servizi. **Non da un accesso alle due piattaforme**, che non è disponibile.

Questo è un limite che va dichiarato: il confronto è con ciò che le due dichiarano di fare,
non con ciò che si vede a schermo usandole. La sola persona che può chiudere quel divario è
un utente che le usa — ed è la ragione per cui la sessione con il broker vale più di
qualunque altra verifica.

**Il confronto sul fac-simile è stato fatto** (20 pagine, lette il 19/08/2026). Le voci
qui sotto che riguardano il modulo PMI non vengono più da una brochure ma dal loro
documento, capitolo per capitolo. Resta vero il limite sulla piattaforma: il confronto è
con i loro _documenti_, non con le loro schermate.

### Sette righe corrette il 30/08/2026, dopo il confronto con il codice

Le colonne «Noi» erano state compilate sulle intenzioni, non su ciò che il prodotto fa. Un
riesame riga per riga contro il codice ne ha trovate sette da correggere: **monitoraggio**
(non c'è schedulatore né invio), **visura IT-ubo** (si consiglia, non si compra),
**rischio sismico e idraulico per ubicazione** (è per provincia), **bilanci storici**
(dieci solo nella scheda di ricerca), **48 indicatori** (sono 57), **codice SDI** (letto e
mai mostrato), **marchio nel report** (solo se l'anagrafica dello studio è compilata).

Sono scritte qui e non tolte, perché il broker a cui questo documento va consegnato usa
entrambe le piattaforme tutti i giorni: una riga sopravvalutata che scopre da solo gli fa
mettere in dubbio anche le venti che sono vere.

---

## Creditsafe — sezioni del report aziendale

| Sezione                                                 | Noi                                                | Nota                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dati identificativi, sede, codici attività, recapiti    | **sì**                                             | più completo: REA, camera di commercio, PEC, codice catastale del comune, frazione. Il **codice SDI** viene letto dal profilo completo e **non arriva a schermo**: esiste nel modello (`lib/api.ts`) e nessun componente lo stampa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Punteggio di merito creditizio 1–100                    | **sì**                                             | e ogni fattore è spiegato: peso, punteggio, motivazione                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Fido consigliato                                        | **sì**                                             | con il vincolo che lo determina, non solo il numero                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Bilanci storici                                         | **in parte**                                       | l'anagrafica estesa porta fino a 10 esercizi sintetici e la scheda di ricerca li elenca tutti. Da lì in poi il numero scende: il report ne rende **5** nell'andamento pluriennale (`assessment/analyze.ts`, `slice(0, 5)`), la scheda dell'azienda mostra **un solo** esercizio riclassificato, e un'azienda ritrovata nel proprio archivio torna con **zero** bilanci sintetici (`apps/api/src/server.ts`). Chi si aspetta dieci esercizi confrontabili come da Creditsafe non li trova                                                                                                                                                                                                                                   |
| Protesti, pregiudizievoli, procedure concorsuali        | **sì**                                             | sezione propria con date, importi, tribunale ed esito; distingue una procedura **chiusa** da una **revocata**, e dichiara quando il registro afferma senza dettagliare                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Amministratori, soci, titolare effettivo                | **sì**                                             | amministratori con codice fiscale, ruolo, data di nomina, rappresentanza legale ed età, dal profilo completo (0,30 €). Il titolare effettivo è **ricavato dai soci già acquistati** (art. 20 D.Lgs. 231/2007), senza spendere. Quando la catena non si chiude il prodotto **dice** che serve la visura `IT-ubo` (1,10 €) e ne mette accanto il prezzo, ma **non sa comprarla**: i servizi definiti in `providers/src/openapi/config.ts` sono sette e non la comprendono. La visura va richiesta a mano sul portale del fornitore                                                                                                                                                                                           |
| Struttura del gruppo, controllanti e controllate        | **sì**                                             | appartenenza, denominazione, vertice dichiarato e numero di controllate; le controllanti estere aprono il tema del programma internazionale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Comportamento di pagamento (DBT, giorni di ritardo)** | **no**                                             | non acquistabile in Italia da alcun fornitore                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Violazioni di conformità (ambiente, lavoro, fisco)      | **no**                                             | non offerto dalla fonte dati attuale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Verifica antiriciclaggio (D.Lgs. 231/2007)              | **no**                                             | ⚠ il servizio esiste ed è economico: `IT-aml`, 0,20 € (0,095 € con abbonamento)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Monitoraggio con avvisi sui cambiamenti                 | **no, non nel senso in cui lo intende Creditsafe** | il rilevatore c'è ed è buono: dieci tipi di evento, tutti e dieci prodotti, ciascuno con fatto, conseguenza assicurativa e azione. Manca tutto il resto. **Nessuno schedulatore** (l'unico `setInterval` del servizio purga le sessioni scadute), **nessun invio** (niente email, niente notifiche: nel repo non c'è `nodemailer` né alcun client SMTP), e il confronto avviene fra le **due analisi già salvate** (`packages/db/src/monitoraggio.ts`), non su dati freschi. Conseguenza pratica: un protesto iscritto oggi non produce alcun evento finché il broker non riapre e **ripaga** l'analisi. È monitoraggio a richiesta, non monitoraggio continuo — e per il concorrente è la funzione che si usa ogni giorno |
| Vista di portafoglio con segnalazione delle criticità   | **sì**                                             | ordinata per urgenza di intervento, non per punteggio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Report internazionali (48 paesi)                        | **no**                                             | solo Italia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Esportazione di elenchi                                 | **sì**                                             | CSV per Excel italiano, con il filtro attivo e l'azione prioritaria in colonna                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### La ricerca: due modelli diversi

Da Creditsafe **cercare è gratis e illimitato** — hanno vent'anni di dati in casa — e a
consumare è l'apertura del report, che scala dal pacchetto acquistato. Hanno una ricerca
semplice (P.IVA, denominazione, REA) e una avanzata con oltre venti filtri, compresa la
selezione di un'area sulla mappa.

Da noi il database non è nostro: ogni ricerca compra un'anagrafica da 0,10 €. Due
correzioni riducono il divario a quasi nulla:

- **si guarda prima nel proprio archivio**, gratis. Chi cerca un'azienda già analizzata la
  trova senza spendere, e la pagina lo dichiara. Restano a pagamento solo le ricerche su
  aziende mai viste;
- **una volta comprato, un dato non si ripaga**: la cache delle risposte vive su database e
  sopravvive ai riavvii, condivisa fra gli studi perché il contratto con l'archivio è unico.

Resta indietro la **ricerca su mappa**: la fonte non espone alcun filtro geografico più
fine della provincia, quindi una selezione per area sarebbe finta. Va risolta con un
archivio di comuni e coordinate, non con un filtro del fornitore.

### Il vuoto che non si chiude

Il **comportamento di pagamento** è il vantaggio strutturale di Creditsafe: vent'anni di
fatture raccolte dai propri clienti. Non è comprabile da nessun fornitore di dati, da
nessuno. Va detto al broker per primo, prima che lo scopra lui.

---

## Insurance Advisor — modulo PMI

| Funzione                                                                    | Noi                  | Nota                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analisi dei rischi ISO 31000:2018                                           | **sì**               | con catalogo versionato e motivazioni per ogni modulazione                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Analisi su **ogni sede** aziendale                                          | **in parte**         | il contesto (soccorso, attività confinanti, superficie) è rilevato per ogni ubicazione. Il rischio sismico e idraulico **no**: è risolto per **provincia** (`risk/geo.ts`, che riceve la sola sigla), quindi due sedi nella stessa provincia danno per costruzione due righe identiche, anche a cinquanta chilometri di distanza. La classificazione ufficiale è comunale (OPCM 3519/2003) e la pericolosità idraulica è cartografica: l'approssimazione è dichiarata nel codice |
| Indicatori CAT/NAT e vulnerabilità                                          | **sì**               | più la verifica dell'obbligo di legge (L. 213/2023)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Valutazione economica dell'impatto dei rischi                               | **sì**               | somme assicurande dal bilancio, danno massimo, EML/PML                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Estrazione automatica delle esigenze, conforme IDD                          | **sì**               | motivazione di adeguatezza per ogni copertura                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Report personalizzato con il proprio marchio                                | **sì, se compilato** | logo, denominazione e numero RUI in testata — **a condizione che l'anagrafica dello studio sia stata compilata**. Se manca, il report esce senza intestazione e senza numero RUI, e non lo segnala: si intitola comunque documentazione ai sensi dell'art. 58 Reg. IVASS 40/2018                                                                                                                                                                                                 |
| Mappatura per aree con scelta delle priorità                                | **sì**               | registro rischi con priorità e piano d'azione                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Tre livelli di profondità per area di rischio**                           | **sì**               | sintetico, motivato, approfondito — e i numeri non cambiano fra i livelli: cambia quanto del ragionamento si stampa                                                                                                                                                                                                                                                                                                                                                              |
| **Condivisione del questionario con il cliente**                            | **sì**               | collegamento con scadenza e revoca, con il marchio dello studio; resta a verbale che ha compilato il cliente                                                                                                                                                                                                                                                                                                                                                                     |
| **Selezione di quali rischi portare nel report**                            | **sì**               | e ogni esclusione è dichiarata nel documento: loro non lo fanno                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Scala di impatto economico a quattro fasce, con giorni di fermo             | **sì**               | e le soglie sono motivate: la più grave è l'art. 2446 c.c. Loro non le motivano                                                                                                                                                                                                                                                                                                                                                                                                  |
| Analisi economica pluriennale e schema del margine di contribuzione         | **sì**               | lo schema quadra col totale per costruzione, non per riimplementazione                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Analisi del contesto per ubicazione** (soccorso, attività confinanti)     | **sì**               | vigili del fuoco con tempo stimato e attività entro 300 m, da OpenStreetMap                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Valori di ricostruzione degli edifici**                                   | **sì**               | già calcolati per tipologia costruttiva; ora la superficie arriva dalla cartografia quando l'intervista non l'ha misurata                                                                                                                                                                                                                                                                                                                                                        |
| **Serie storica georiferita a 10 anni** (pioggia, grandine, vento, fulmini) | **parziale**         | pioggia e raffiche sì, con giorni e anni oltre soglia; grandine e fulmini **no**, e il report lo dichiara. Spento di default: uso commerciale a pagamento                                                                                                                                                                                                                                                                                                                        |
| **Immagini per ubicazione**                                                 | **sì**               | caricamento per ubicazione, con didascalia; capitolo dedicato nel report                                                                                                                                                                                                                                                                                                                                                                                                         |
| Linea Condomini                                                             | **no**               | fuori perimetro: il prodotto è sulle imprese                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Linea Famiglia                                                              | **no**               | fuori perimetro                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

---

## Dove siamo avanti

Non sono aggiunte estetiche: sono cose che nessuna delle due fa, e che un assicuratore usa.

**Solidità della compagnia accanto a ogni polizza.** Si analizza il rischio del cliente nei
minimi dettagli e poi lo si trasferisce a un soggetto la cui solidità nessuno ha guardato.
Il punteggio nasce dalla SFCR — solvency ratio, qualità dei fondi propri, reclami — e
compare dove si decide, accanto alla polizza.

**Ogni numero sa spiegarsi.** Formula, dati in ingresso con la loro fonte, note e
riferimenti normativi. Un'analisi che non si spiega non si può difendere davanti a un
cliente, e nemmeno davanti a IVASS in ispezione.

**Distinzione fra «zero» e «ignoto».** Un'esposizione non quantificabile non vale zero: le
due cose portano a decisioni opposte, e confonderle fa saltare proprio le posizioni da
lavorare per prime.

**Simulazione della sottoassicurazione.** Regola proporzionale dell'art. 1907 c.c.: dato un
sinistro, quanto indennizza la compagnia e quanto resta a carico. È il numero che convince,
e non lo mostra nessuno.

**Collegamenti societari nel portafoglio.** Due aziende diverse che fanno capo allo stesso
socio: un'esposizione di gruppo che il broker non vedeva.

**Contabilità del costo dei dati.** Ogni centesimo speso è imputato allo studio che l'ha
causato, con tetto giornaliero per studio e complessivo. Nessuna delle due lo fa, perché
nessuna delle due rivende dati a consumo.

**57 indicatori dell'archivio camerale** portati a schermo, distinti dal punteggio della
piattaforma: due letture indipendenti dello stesso bilancio sono una controprova. Con gare
pubbliche (cauzioni), certificazione SOA, import/export e composizione del personale —
fatti che dicono **quali** coperture servono, non solo quanto regge l'impresa.

Il numero è **contato sulla schermata**, gruppo per gruppo, il 30/08/2026: 5 di
redditività, 6 di risultati operativi, 7 di solidità, 12 di indebitamento e leva, 10 di
liquidità e copertura degli oneri, 8 di ciclo finanziario, 9 di andamento e marginalità —
`azienda/[id]/IndicatoriArchivio.tsx`. Il modello del fornitore ne dichiara 70 in tipo:
quelli portati a video sono i 57 che un assicuratore usa.

Due avvertenze, perché questa cifra è già stata sbagliata una volta. La prima: **si
ricontano**, non si copiano da qui — è in corso il recupero dei campi che il profilo
completo porta e che non venivano letti (paesi di export, quota di operai, codice LEI,
profili social), e ognuno che arriva a schermo alza il totale. La seconda: la cifra «48»
che questo documento riportava veniva dalla descrizione commerciale del servizio e non
corrispondeva a niente di misurabile nel prodotto. Lo stesso «quarantotto» sopravvive
nell'intestazione di `providers/src/openapi/indicatori.ts`, che al presente dice «sono
compresi nei quarantotto centesimi del servizio»: il listino pubblico dichiara 0,30 €, ed
è il valore che `config.ts` usa davvero (`costoCentesimi: 30`). Il commento va allineato
al codice, non il contrario.

---

## Cosa fare prima di consegnare

In ordine di valore.

1. ~~Scaricare il fac-simile PMI di Insurance Advisor~~ — **fatto il 19/08/2026**. Ne sono
   usciti quattro capitoli nuovi nel report e le tre voci ancora aperte qui sotto.
2. ~~Titolare effettivo~~ — **fatto il 20/08/2026, senza spendere.** Si ricava dai soci che
   l'anagrafica estesa già porta: quando sono persone fisiche sopra il 25%, il titolare
   effettivo è quello, e il prodotto dichiara che la visura **non serve**.

   La visura `IT-ubo` resta giustificata in due casi: catena che si interrompe su società
   non risalibili, e fascicolo antiriciclaggio che richiede il documento del registro.
   Costa **1,10 € (0,88 € con abbonamento)** — verificato sul listino pubblico il
   20/08/2026, `console.openapi.com/apis/company/pricing`, dove compare come «€1.100 /
   €0.880». Dieci volte l'anagrafica estesa perché non è un dato camerale: è una visura sul
   registro dei titolari effettivi, che ha un costo per accesso proprio.

   Quando la catena si interrompe su una società, prima della visura conviene **risalirla
   con un'altra anagrafica estesa a 0,10 €**: un decimo del prezzo per gradino.
   2-bis. **Antiriciclaggio** (endpoint `IT-aml`, **0,20 €** a chiamata, 0,095 € con
   abbonamento) e **cariche collegate** (`IT-stakeholders`, stesso prezzo). Entrambi erano
   segnati come lacune «non offerte dalla fonte dati»: non era vero, e costano meno di un
   quarto di un'analisi. L'antiriciclaggio è un **obbligo di legge** per
   l'intermediario, non una funzione in più.

3. **Sessione con il broker**, con il prodotto in mano e nessuna spiegazione preventiva.
4. ~~Esportazione elenchi~~, ~~selezione dei contenuti del report~~, ~~condivisione del
   questionario~~ e ~~tre livelli di profondità~~: **fatte il 20/08/2026**.

### Le due voci del loro report ancora aperte

Entrambe sono **decisioni di prodotto** prima che compiti di sviluppo, perché ognuna porta
con sé un costo o un limite da accettare consapevolmente. La terza — le immagini per
ubicazione — è stata fatta il 20/08/2026.

- **Storico meteo georiferito.** Open-Meteo dà dieci anni di precipitazioni e raffiche di
  vento, gratis per uso non commerciale (~29 €/mese per l'uso commerciale). **Grandine e
  fulmini non li ha**: si può fare una versione a due fenomeni su quattro che dichiara
  quali mancano, oppure cercare una fonte a pagamento che li copra tutti.
- **Valori di ricostruzione.** La superficie coperta si ricava da OpenStreetMap; i
  parametri di costo CRESME sono commerciali. Senza, serve un costo al metro cubo
  configurabile dall'intermediario — che è difendibile, purché sia dichiarato come sua
  assunzione e non come un dato di mercato.
- ~~Immagini per ubicazione~~ — **fatto il 20/08/2026.** Caricamento per ubicazione con
  didascalia, tetto di 1 MB per scatto e 6 per ubicazione, capitolo dedicato nel report.
  Il tetto è misurato: nel documento ogni fotografia costa circa 2,7 volte la propria
  dimensione, perché base64 aggiunge un terzo e Next scrive il data URI due volte. Per
  alzarlo servirebbe servire le immagini da una rotta dedicata invece che inline.
