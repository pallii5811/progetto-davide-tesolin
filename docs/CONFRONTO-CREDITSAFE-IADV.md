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
con i loro *documenti*, non con le loro schermate.

---

## Creditsafe — sezioni del report aziendale

| Sezione | Noi | Nota |
|---|---|---|
| Dati identificativi, sede, codici attività, recapiti | **sì** | più completo: REA, CCIAA, PEC, SDI, codice catastale, frazione |
| Punteggio di merito creditizio 1–100 | **sì** | e ogni fattore è spiegato: peso, punteggio, motivazione |
| Fido consigliato | **sì** | con il vincolo che lo determina, non solo il numero |
| Bilanci storici | **sì** | fino a 10 esercizi, più la riclassificazione CEE |
| Protesti, pregiudizievoli, procedure concorsuali | **sì** | e dichiara quando il registro afferma senza dettagliare |
| Amministratori, soci, titolare effettivo | **parziale** | amministratori e soci sì; **titolare effettivo no** |
| Struttura del gruppo, controllanti e controllate | **sì** | con controllanti/controllate estere |
| **Comportamento di pagamento (DBT, giorni di ritardo)** | **no** | non acquistabile in Italia da alcun fornitore |
| Violazioni di conformità (ambiente, lavoro, fisco) | **no** | non offerto dalla fonte dati attuale |
| Monitoraggio con avvisi sui cambiamenti | **sì** | dieci tipi di evento, fra cui obblighi normativi |
| Vista di portafoglio con segnalazione delle criticità | **sì** | ordinata per urgenza di intervento, non per punteggio |
| Report internazionali (48 paesi) | **no** | solo Italia |
| Esportazione di elenchi | **sì** | CSV per Excel italiano, con il filtro attivo e l'azione prioritaria in colonna |

### Il vuoto che non si chiude

Il **comportamento di pagamento** è il vantaggio strutturale di Creditsafe: vent'anni di
fatture raccolte dai propri clienti. Non è comprabile da nessun fornitore di dati, da
nessuno. Va detto al broker per primo, prima che lo scopra lui.

---

## Insurance Advisor — modulo PMI

| Funzione | Noi | Nota |
|---|---|---|
| Analisi dei rischi ISO 31000:2018 | **sì** | con catalogo versionato e motivazioni per ogni modulazione |
| Analisi su **ogni sede** aziendale | **sì** | rischio sismico e idraulico per ubicazione |
| Indicatori CAT/NAT e vulnerabilità | **sì** | più la verifica dell'obbligo di legge (L. 213/2023) |
| Valutazione economica dell'impatto dei rischi | **sì** | somme assicurande dal bilancio, danno massimo, EML/PML |
| Estrazione automatica delle esigenze, conforme IDD | **sì** | motivazione di adeguatezza per ogni copertura |
| Report personalizzato con il proprio marchio | **sì** | logo, denominazione e numero RUI in testata |
| Mappatura per aree con scelta delle priorità | **sì** | registro rischi con priorità e piano d'azione |
| **Tre livelli di profondità per area di rischio** | **sì** | sintetico, motivato, approfondito — e i numeri non cambiano fra i livelli: cambia quanto del ragionamento si stampa |
| **Condivisione del questionario con il cliente** | **sì** | collegamento con scadenza e revoca, con il marchio dello studio; resta a verbale che ha compilato il cliente |
| **Selezione di quali rischi portare nel report** | **sì** | e ogni esclusione è dichiarata nel documento: loro non lo fanno |
| Scala di impatto economico a quattro fasce, con giorni di fermo | **sì** | e le soglie sono motivate: la più grave è l'art. 2446 c.c. Loro non le motivano |
| Analisi economica pluriennale e schema del margine di contribuzione | **sì** | lo schema quadra col totale per costruzione, non per riimplementazione |
| **Analisi del contesto per ubicazione** (soccorso, attività confinanti) | **sì** | vigili del fuoco con tempo stimato e attività entro 300 m, da OpenStreetMap |
| **Valori di ricostruzione degli edifici** | **sì** | già calcolati per tipologia costruttiva; ora la superficie arriva dalla cartografia quando l'intervista non l'ha misurata |
| **Serie storica georiferita a 10 anni** (pioggia, grandine, vento, fulmini) con probabilità di superamento soglia | **no** | Open-Meteo copre pioggia e vento, **non** grandine e fulmini; uso commerciale a pagamento |
| **Immagini per ubicazione** | **sì** | caricamento per ubicazione, con didascalia; capitolo dedicato nel report |
| Linea Condomini | **no** | fuori perimetro: il prodotto è sulle imprese |
| Linea Famiglia | **no** | fuori perimetro |

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

**48 indicatori dell'archivio camerale**, distinti dal punteggio della piattaforma: due
letture indipendenti dello stesso bilancio sono una controprova. Con gare pubbliche
(cauzioni), certificazione SOA, import/export e composizione del personale — fatti che
dicono **quali** coperture servono, non solo quanto regge l'impresa.

---

## Cosa fare prima di consegnare

In ordine di valore.

1. ~~Scaricare il fac-simile PMI di Insurance Advisor~~ — **fatto il 19/08/2026**. Ne sono
   usciti quattro capitoli nuovi nel report e le tre voci ancora aperte qui sotto.
2. **Titolare effettivo**: il servizio esiste (1,10 € a chiamata, 0,88 € a volume). È
   parità con Creditsafe ed è un obbligo antiriciclaggio per l'intermediario.
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
