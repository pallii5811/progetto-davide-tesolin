# AEGIS — regole di lavoro

## L'OBIETTIVO, che viene prima di tutto il resto

**Il prodotto va consegnato a un cliente pagante, e deve essere perfetto: 10/10 in tutto.**
Dati, analisi del rischio, esperienza d'uso, interfaccia. Nessun errore, niente dato per
scontato, e ogni cosa che si paga deve arrivare sullo schermo.

Il proprietario del prodotto lo ha dovuto ripetere sei volte perché non era scritto da
nessuna parte. Ora lo è. Non è un'aspirazione generica: è il metro con cui si giudica ogni
modifica, e le tre regole che ne discendono sono operative.

1. **Si misura, non si stima.** «Credo che vada bene» non è una risposta. Se una cosa si
   può contare, si conta: sui dati veri, con uno script che resti nel repository.
2. **Zero regressioni.** Ogni modifica passa da `npm test`, `npm run collaudo`,
   `npm run typecheck`, `npm run lint` — e dal confronto delle istantanee del motore quando
   tocca `packages/core`.
3. **Ciò che non si può correggere si DICHIARA.** Un limite scritto nero su bianco è
   professionalità; lo stesso limite taciuto è una bugia che il cliente scopre da solo.

### Standing: si deploya sempre in produzione

Ogni lavoro finito va messo in esercizio, non lasciato su GitHub:

```bash
ssh ubuntu@162.19.181.206 'sudo bash /opt/aegis/app/deploy/aggiorna.sh'
```

L'utente SSH è **`ubuntu`**, non `root` né `aegis` — provare gli altri due e concludere che
l'accesso è perso è già costato un giro intero. Il ramo è **`master`**, e il push richiede
`-c credential.https://github.com.username=pallii5811`.

---

## 1 · L'assenza resta assenza: `null`, mai `0`

Un dato che manca vale `null`. Mai zero, mai `false`, mai stringa vuota, mai un default
plausibile. **Zero è un dato**: viene sommato, ordinato, mediato, mostrato e usato per
decidere.

> Costato, nella sola sessione del 30-31/08/2026:
>
> | dove                                   | cosa diceva il prodotto                                        |
> | -------------------------------------- | -------------------------------------------------------------- |
> | punteggio di credito su 1 fattore su 7 | «4/100 · classe E · rischio molto alto»                        |
> | nessun fattore valutabile              | nota «dati insufficienti» e sotto **1/100**                    |
> | fido senza aggregati di bilancio       | «0 €», che è la raccomandazione più severa che esista          |
> | `scoreCredito` letto dal database      | `?? 0`, mentre la colonna era annullabile                      |
> | esportazione CSV                       | avrebbe scritto la parola `null` accanto al nome di un'impresa |

La distinzione è fra **assenza** e **valore**, non fra zero e non-zero: un ribasso dello 0%
è un dato, un fido azzerato da una procedura concorsuale aperta pure.

## 2 · Un punteggio basso che nasce da un FATTO vale; da una lacuna no

Procedura concorsuale aperta, impresa cessata, patrimonio netto negativo: con una di queste
il giudizio è fondato anche su due indici su sette, e negarlo toglierebbe all'intermediario
l'informazione per cui ha pagato. Sotto il pavimento di copertura e **senza** un fatto che
lo giustifichi, invece, non si attribuisce né punteggio né classe: `ND`.

## 3 · Il prezzo si dichiara solo dove c'è un addebito

Ogni pulsante che spende scrive quanto costa, preso dal listino e mai da una cifra a mano.
Ma la risposta di un servizio resta in archivio **trenta giorni**: in quel periodo il
secondo clic non addebita, e annunciare un prezzo è falso.

> Costato: «Analisi approfondita +0,30 €» su un dato comprato il giorno prima. Chi guardava
> ha smesso di cliccare per non ripagare ciò che possedeva già. Un prezzo dichiarato dove non
> c'è addebito costa lavoro non fatto, esattamente come un addebito taciuto costa fiducia.

Ogni rotta che spende passa da `oltreIlTetto` **prima** e da `registraSpese` **dopo**. Una
che non lo faceva è sopravvissuta a lungo proprio perché nessuna schermata la chiamava.

## 4 · Ciò che si compra si vede

Un dato pagato, mappato e serializzato che nessuna schermata rende è denaro buttato.

> Contati il 31/08/2026: **quindici campi su centoventicinque**. Fra questi i paesi di
> esportazione — che il questionario chiedeva all'intermediario mentre il registro li aveva
> già mandati — la percentuale di operai nel riquadro che si intitola «pesa su RC
> lavoratori», e il consenso al contatto commerciale.

Il presidio è `apps/web/test/nulla-di-comprato-resta-invisibile.test.ts`: aggiungere un campo
al modello senza mostrarlo rompe la suite.

## 5 · Un controllo che non può fallire non è un controllo

Prima di fidarsi di un presidio lo si fa diventare rosso di proposito, togliendo la
correzione che dovrebbe prendere. Vale anche per gli strumenti di misura scritti al momento.

> Costato tre volte in una sessione: il rilevatore di regressioni confrontava il compilato
> con sé stesso e rispondeva «nessuna differenza»; annunciava dieci scenari e ne misurava
> due; e un mio script contava come «letto» ogni campo perché includeva il catalogo dei nomi
> possibili fra i mappatori.

## 6 · Una misura giusta su un percorso che non gira è inutile

Prima di dire che qualcosa è un difetto: chi chiama quel codice, con quali argomenti, e
quante volte succede davvero. In questa sessione tre sospetti gravi sono caduti così —
`moneyOrZero` su 44 voci (legittimo: schema CEE, e quel bilancio non si compra mai),
`completezza.percentuale` (dichiarata 0-1), `incidenzaGestioneStraordinaria` (unità `%`).

## 7 · Le frasi si compongono, non si generano

Frammenti fissi più i valori. Mai un modello linguistico. Quando manca un pezzo si mette un
segnaposto visibile, non un default plausibile: il default viene letto ad alta voce al
telefono davanti a un cliente.

E **si scrivono per chi le legge**: lo stesso componente serve l'intermediario e il cliente,
e l'azienda assicurata leggeva «è la domanda più redditizia dell'intera intervista».

## 8 · Un errore della FONTE non è un guasto NOSTRO

|                 | esempio                                             | cosa fare                      |
| --------------- | --------------------------------------------------- | ------------------------------ |
| **transitorio** | 408, 425, 429, 5xx, timeout, `ECONNRESET`           | ritentare, e dirlo come attesa |
| **permanente**  | 404, 406 (che per questo fornitore è «non trovata») | non ritentare: si ripagherebbe |

Un'attesa raccontata come indisponibilità fa chiudere la scheda e rifare tutto più tardi.

## 9 · Un identificatore di cifre non è un numero

Partita IVA, codice fiscale, CAP, telefono: mai `Number()`. Si converte ciò su cui si fanno
**conti**, non ciò con cui si fanno **confronti di identità**.

## 10 · Due valori per lo stesso fatto: vince quello che sa dimostrarsi

Lo stesso fornitore, la stessa impresa, lo stesso esercizio, e due patrimoni netti diversi.
Non è un caso limite: è la forma normale con cui un archivio risponde da due servizi.

> Costato, su COMINOTTI S.R.L. e verificato uguale su una seconda impresa:
>
> | fonte             | campo                         | valore    |
> | ----------------- | ----------------------------- | --------- |
> | anagrafica estesa | `balanceSheets.last.netWorth` | 8.485 €   |
> | profilo completo  | `ecofin.netWorth`             | 719.768 € |
>
> Il secondo si prova da sé: diviso per il totale attivo riproduce `capitalizationDegree`,
> che l'archivio pubblica a parte, alla quarta cifra. Il primo no, e coincide con l'utile
> d'esercizio. Il prodotto usava il primo: limite patrimoniale 1.697 € invece di 143.954 €,
> equity ratio 0,2% invece di 13,7%, indebitamento 619× invece di 6,3×, e in fondo alla
> scheda **«Fido consigliato: 0 €»** su un'impresa attiva da trentaquattro anni.

Quando due campi dicono la stessa cosa, si sceglie quello che **una terza grandezza
conferma**, e la scelta si scrive nel codice con il conto che la regge. Nessuno dei numeri
era sbagliato preso da solo: il difetto si vedeva solo mettendo la pagina intera davanti.

## 11 · Visibile non è letto

La regola 4 chiede che il dato pagato arrivi allo schermo. Non basta: deve arrivare al
**motore**.

> Costato: «Paesi di esportazione: Unione Europea, Altri Paesi» stampato dall'archivio, e
> due sezioni sotto il dimensionamento della RC Prodotti che dichiarava «Export: da rilevare
> in intervista». Il dato era comprato, era a schermo, e nessuna regola poteva leggerlo:
> `CompanyFacts` non aveva un campo in cui atterrare. Non era una svista di scrittura, era
> un dato senza porta d'ingresso.

La domanda da fare su ogni campo nuovo non è «si vede?» ma «**chi lo legge?**». E quando
entra: l'intervista prevale sull'archivio, l'archivio non produce mai una negazione — «altri
paesi» comprende gli Stati Uniti senza nominarli, e leggerlo come un «no» toglierebbe due
gradini di massimale a chi là ci spedisce davvero.

**È ricapitato il giorno dopo**, sulla stessa scheda e in due punti nuovi. Non è un difetto
che si chiude correggendo un campo: si chiude solo rileggendo la pagina intera.

> | la scheda stampava                | il motore diceva                                        |
> | --------------------------------- | ------------------------------------------------------- |
> | «Margine EBITDA 7,94 %»           | Redditività · peso 14 % · **non valutabile**            |
> | «Copertura immobilizzazioni 3,05» | «Copertura immobilizzazioni: da rilevare in intervista» |
>
> Il primo costava un fattore intero su sette, su un punteggio che decide quanto credito
> l'intermediario consiglia di concedere. La copertura del modello è passata da cinque
> fattori su sette a sei.

## 13 · Un indice comprato ha un'unità, e non è quella che ti aspetti

Prima di far entrare un indice dell'archivio in un calcolo si guarda **come l'archivio
scrive il valore**, non come si chiama il campo.

> Stava per costare un fattore gonfiato in silenzio. `ebitdaMargin` dell'archivio vale
> `7.94` — sono punti percentuali — mentre `FinancialIndicators` tiene rapporti, perché il
> formattatore usa `style: 'percent'` e i punti di interpolazione dello score sono scritti
> `0,05 · 0,10 · 0,18`. Passato senza dividere per cento avrebbe portato la redditività a
> **100/100 su un'impresa che margina l'otto per cento**.
>
> E il `roe` era già così da prima: sarebbe uscito a schermo «118,0 %».

Come si distingue, senza indovinare: la scheda stampa `Margine EBITDA 7,94 %` **con** il
segno di percentuale e `Grado di capitalizzazione 0,14` **senza**. La differenza è già
visibile, basta guardarla. E la prova finale è l'aritmetica — 8.485 € di utile su 719.768 €
di patrimonio fa l'1,18 **per cento**, che è il numero che l'archivio scrive come `1.18`.

## 12 · Una frase detta due volte vale meno di una detta una volta

> Costato, e detto dal proprietario del prodotto leggendo la propria scheda:
> «A ME SEMBRANO FRASI GENERICHE TUTTE UGUALI».
>
> Aveva ragione. Ogni frase, presa da sola, era esatta e con la sua norma — ma la
> motivazione stampava la frase di catalogo **e poi** il frammento nato dopo per dirla
> meglio: «L'indennizzo INAIL non esaurisce il danno risarcibile» due volte in tre righe, i
> costi di bonifica esclusi dalla RCT ordinaria tre volte nella stessa scheda.

Un documento di adeguatezza vale per la distinzione fra ciò che è stato **accertato su
questa impresa** e ciò che vale per tutte. Ripetere la stessa affermazione riformulata
cancella quella distinzione, e il lettore conclude che il testo sia stato generato a
macchina. Il presidio è `packages/core/test/motivazione-non-si-ripete.test.ts`, che cerca
affermazioni ripetute su ogni copertura e ogni combinazione di fatti.

**E la didascalia è parte del numero.** «60% del valore, tenuto conto delle protezioni
accertate» era stampato dove nessuna protezione lo era, dieci righe sopra l'elenco delle
domande da fare proprio per quello. La stima era giusta e prudenziale; la didascalia la
faceva leggere come informata. È l'unica cosa con cui chi legge decide quanto fidarsi.

E dove non c'è uno spostamento non si stampa uno zero: «±0P ±0I» accanto a «Lavorazioni in
cantiere (da verificare)» mette un numero al posto di un motivo. Come «Analisi al 0% del suo
potenziale» detto a chi ha appena pagato il profilo completo: la misura era giusta, contava
i campi dell'**intervista**, e il titolo la attribuiva all'analisi.

## 14 · La riserva sta nella FORMA della frase, non in una parentesi in coda

Una regola che si accende su un dato non rilevato non lo afferma. Non si scrive il fatto
all'indicativo e poi si aggiunge «(da verificare)»: si scrive «Da accertare se…».

> Costato, sulla scheda di un fabbricante di serrature:
>
> > «Lavorazioni in cantiere: settore a più elevata incidenza infortunistica. (da verificare)»
> > «Canale e-commerce attivo: superficie di attacco esposta su internet. (da verificare)»
> > «Gli immobili sono di proprietà: il danno colpisce il patrimonio aziendale. (da verificare)»
>
> Nessuno di quei fatti era stato rilevato, e il motore lo sapeva: marcava `suDatoIgnoto` e
> azzerava i delta. Ma **32 regole su 68** si accendono così, e tutte e 32 lo affermavano.

La parentesi arriva dopo l'affermazione, e l'intermediario che legge la riga al telefono
l'ha già pronunciata: ha appena detto a un fabbricante di serrature che lavora in cantiere.
Da lì in poi vale meno anche tutto il resto del documento, comprese le righe esatte — che
sono la maggioranza.

La forma condizionale dice tre cose: che il dato manca, cosa cambierebbe se ci fosse, e
dove lo si va a prendere. La terza trasforma un avviso in un'istruzione: «voce C-I dello
stato patrimoniale» è una cosa che si può chiedere al cliente, «da verificare» no.

Il presidio è `packages/core/test/regole-non-affermano-lignoto.test.ts`; il conteggio si
rifà con `scripts/quali-affermano-sullignoto.ts`.

**Corollario sui due zeri.** «Il fatto non è stato rilevato» e «il fatto conta, ma la scala
era già al massimo» producono entrambi delta zero e sono l'opposto l'uno dell'altro. La
scheda li stampava con lo stesso «±0P ±0I».

## 15 · L'orizzonte di una variazione si verifica, non si legge dal titolo

Un numero in percentuale non dice rispetto a quando. Prima di scriverlo accanto a
«rispetto all'esercizio precedente» si chiude l'identità sui valori che si hanno.

> Costato: il riquadro «Andamento» dichiarava variazioni sull'anno precedente, e sono su
> **due** esercizi. Provato a quattro decimali, su due indici indipendenti e con i numeri
> che la stessa pagina stampa:
>
> | indice | conto                 | risultato  | a schermo |
> | ------ | --------------------- | ---------- | --------- |
> | EBIT   | 187.148 / 233.968 − 1 | −20,0113 % | −20,01 %  |
> | EBITDA | 343.989 / 360.857 − 1 | −4,6744 %  | −4,67 %   |
>
> I denominatori sono `ebitL2Y` e `ebitdaL2Y` — _last two years_. Perché fosse un caso,
> EBIT ed EBITDA dell'anno scorso dovrebbero coincidere **entrambi** con quelli di due anni
> fa.

«EBIT −20% sull'esercizio precedente» descrive un'impresa crollata in dodici mesi e apre
una conversazione sul credito che i numeri non giustificano. Su due esercizi è una discesa.

E lo stesso vale per farlo entrare in un calcolo: `sviluppo.mol` resta fuori dal fattore
redditività proprio per questo — una discesa biennale confrontata con una soglia annua non
è un'approssimazione, è un altro numero.

## 16 · Il documento è italiano fino all'ultimo carattere

`toFixed` scrive il punto decimale inglese. Su una pagina che stampa «1,37» e «13,7 %» il
fattore di score usciva **«0.30×»**, e lo Z'' con le sue soglie faceva lo stesso.

Vale anche per gli accordi: «Sulle restanti **1** il contesto non è stato osservato» esce
ogni volta che le ubicazioni sono due e una sola è stata guardata — cioè quasi sempre, non
in un caso limite.

Nessuna delle due cambia un numero, e sono le due che un cliente nota per prime: fanno
sembrare tradotto ciò che è stato scritto qui, e distratto ciò che è stato misurato.

## 17 · La scheda si MISURA, non si legge

È la regola 1 applicata al testo, e la sua assenza si pagava a ogni ricaricamento.

> Costato, e detto così: «OGNI VOLTA CHE RICARICO LA PAGINA TROVIAMO ERRORI, COM'È POSSIBILE
> CHE NON RIESCI A RENDERE PERFETTO QUESTO SOFTWARE?»
>
> La domanda era giusta e la risposta stava nel metodo. Ogni difetto di testo corretto fino
> a quel punto era stato trovato da un paio d'occhi che leggevano la scheda, e gli occhi
> trovano un'istanza per volta. Le due volte in cui invece si era misurato:
>
> | difetto                  | trovato leggendo | misurato             |
> | ------------------------ | ---------------- | -------------------- |
> | frasi ripetute           | 3                | 11 motivazioni su 24 |
> | affermazioni sull'ignoto | 3                | **32 regole su 68**  |
>
> Le altre ventinove sarebbero uscite una alla volta, a un ricaricamento di distanza l'una
> dall'altra. È esattamente ciò che stava succedendo.

`scripts/audit-testo-schermo.ts` monta la scheda vera di un'impresa vera dalle risposte già
pagate, percorre **ogni stringa** che il presentatore consegna alla pagina — sono circa
millecinquecento per impresa — e applica i controlli tutti insieme.

Due cose lo rendono credibile, e sono più importanti dei controlli:

1. **Si rifiuta di girare sul compilato vecchio.** Ha già risposto «venti rilievi» misurando
   `dist` prima della ricompilazione; i rilievi veri erano cinque.
2. **Prima di misurare fa fallire i propri rilevatori** sui difetti storici. In mezz'ora ha
   detto «nessun rilievo» tre volte per tre ragioni diverse — compilato vecchio, una
   versione scambiata per un decimale, affermazioni cercate dentro un elenco di nomi — e
   ogni volta quello zero era identico a quello buono.

E un rilievo falso costa più di uno mancato: insegna a ignorare l'elenco.

---

## Comandi

```bash
npm run verifica          # build + typecheck:web + lint + test
npm run collaudo          # 108 prove su browser reale
npm run collaudo:schermate
npx tsx scripts/istantanea-motore.ts prima.json    # e poi confronta-istantanee.ts
npx tsx scripts/indicatori-mai-mostrati.ts         # dati comprati e non resi
npx tsx scripts/quanto-del-comprato-si-vede.ts     # copertura dei campi del fornitore

# PRIMA DI CONSEGNARE — ogni parola che la scheda stampa, controllata a macchina.
npm run build && npx tsx scripts/audit-testo-schermo.ts
npx tsx scripts/audit-testo-schermo.ts --da-database <piva>   # sul server, sulla scheda vera
npx tsx scripts/quali-affermano-sullignoto.ts      # regole che parlano di ciò che non sanno
```

`audit-testo-schermo.ts` vuole il compilato fresco e si ferma se non lo è, perché ci è già
cascato: aveva risposto «venti rilievi» misurando `dist` prima della ricompilazione, e i
rilievi veri erano cinque. E prima di misurare fa fallire i propri rilevatori sui difetti
storici: uno strumento che dice «nessun rilievo» perché è cieco scrive sullo schermo la
stessa cosa di uno che dice «nessun rilievo» perché è pulito.

⚠ `npm run format:check` **non può passare su Windows**: git scrive CRLF nella copia di
lavoro e Prettier vuole LF. Segnala file mai toccati da nessuno. La CI, che estrae con LF,
è l'unico giudice — e `npm run verifica` non comprende quel passo.

## Dove stanno i limiti dichiarati

`docs/CONSEGNA.md` §11 dice cosa non è costruito; §6.4 perché la Row Level Security non è
attiva e i diciannove punti che restano; `docs/CONFRONTO-CREDITSAFE-IADV.md` confronta
funzione per funzione con i due concorrenti, comprese le righe dove perdiamo.
