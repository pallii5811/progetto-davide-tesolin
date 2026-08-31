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

---

## Comandi

```bash
npm run verifica          # build + typecheck:web + lint + test
npm run collaudo          # 108 prove su browser reale
npm run collaudo:schermate
npx tsx scripts/istantanea-motore.ts prima.json    # e poi confronta-istantanee.ts
npx tsx scripts/indicatori-mai-mostrati.ts         # dati comprati e non resi
npx tsx scripts/quanto-del-comprato-si-vede.ts     # copertura dei campi del fornitore
```

⚠ `npm run format:check` **non può passare su Windows**: git scrive CRLF nella copia di
lavoro e Prettier vuole LF. Segnala file mai toccati da nessuno. La CI, che estrae con LF,
è l'unico giudice — e `npm run verifica` non comprende quel passo.

## Dove stanno i limiti dichiarati

`docs/CONSEGNA.md` §11 dice cosa non è costruito; §6.4 perché la Row Level Security non è
attiva e i diciannove punti che restano; `docs/CONFRONTO-CREDITSAFE-IADV.md` confronta
funzione per funzione con i due concorrenti, comprese le righe dove perdiamo.
