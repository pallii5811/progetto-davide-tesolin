# Il dominio, codificato

Questo documento è la fonte di verità per le regole di business implementate in `packages/core`.
Ogni sezione ha un riferimento al file che la implementa. Se il codice e questo documento divergono,
è un bug.

---

## 1. Classificazione dimensionale dell'impresa (Racc. UE 2003/361)

Serve per: obbligo CAT NAT, benchmark di massimali, priorità commerciale.

| Categoria | Addetti | E   | Fatturato **oppure** Totale attivo |
| --------- | ------- | --- | ---------------------------------- |
| Micro     | < 10    | e   | ≤ 2 M€ oppure ≤ 2 M€               |
| Piccola   | < 50    | e   | ≤ 10 M€ oppure ≤ 10 M€             |
| Media     | < 250   | e   | ≤ 50 M€ oppure ≤ 43 M€             |
| Grande    | ≥ 250   | o   | > 50 M€ e > 43 M€                  |

Il criterio addetti è **vincolante**; quello finanziario è alternativo (basta soddisfarne uno).
→ `company/size.ts`

---

## 2. Riclassificazione del bilancio

Dal bilancio CEE (art. 2424/2425 c.c.) a due schemi gestionali.

**Stato patrimoniale finanziario**

```
ATTIVO                                PASSIVO
  Attivo corrente                       Passività correnti
    Liquidità immediate                   Debiti finanziari a breve
    Liquidità differite (crediti)         Debiti commerciali
    Rimanenze                             Altri debiti a breve
  Attivo immobilizzato                  Passività consolidate
    Immobilizzazioni immateriali          Debiti finanziari a m/l
    Immobilizzazioni materiali            TFR e fondi
    Immobilizzazioni finanziarie        Patrimonio netto
```

**Conto economico a valore aggiunto**

```
  Ricavi delle vendite
+ Variazione rimanenze prodotti
= Valore della produzione
− Costi esterni (materie prime, servizi, godimento beni terzi)
= VALORE AGGIUNTO
− Costo del personale
= EBITDA (Margine Operativo Lordo)
− Ammortamenti e svalutazioni
= EBIT (Reddito Operativo)
± Gestione finanziaria
= EBT
− Imposte
= UTILE NETTO
```

**Posizione Finanziaria Netta** = Debiti finanziari (breve + m/l) − Liquidità.
→ `company/financials.ts`

---

## 3. Indici e Altman Z''-score

Indici calcolati: ROE, ROI, ROS, EBITDA margin, current ratio, quick ratio, indice di indebitamento
(Debiti/PN), PFN/EBITDA, copertura oneri finanziari (EBIT/OF), DSO, DPO, DIO, ciclo del circolante.

**Altman Z''-score** — variante per imprese non quotate e non manifatturiere, la più adatta alle PMI
italiane di servizi e commercio:

```
Z'' = 6.56·X1 + 3.26·X2 + 6.72·X3 + 1.05·X4

X1 = Capitale Circolante Netto / Totale Attivo
X2 = Utili portati a nuovo (riserve di utili) / Totale Attivo
X3 = EBIT / Totale Attivo
X4 = Patrimonio Netto / Totale Debiti
```

| Z''         | Zona                   |
| ----------- | ---------------------- |
| > 2.60      | Sicurezza              |
| 1.10 – 2.60 | Incertezza (grey area) |
| < 1.10      | Rischio di insolvenza  |

È una formula pubblicata e verificabile: il cliente può contestarla, ed è esattamente il punto —
uno score contestabile è uno score difendibile. → `credit/altman.ts`

---

## 4. Score di credito AEGIS (1–100)

Modello additivo a fattori pesati. 100 = rischio minimo. Ogni fattore restituisce punteggio,
peso e motivazione testuale.

| Fattore                  | Peso           | Cosa misura                                      |
| ------------------------ | -------------- | ------------------------------------------------ |
| Solidità patrimoniale    | 20%            | PN/Attivo, indice di indebitamento               |
| Redditività              | 15%            | ROI, EBITDA margin, trend                        |
| Liquidità                | 15%            | current ratio, quick ratio                       |
| Sostenibilità del debito | 15%            | PFN/EBITDA, copertura oneri finanziari           |
| Altman Z''               | 15%            | probabilità sintetica di default                 |
| Eventi negativi          | 20% (penalità) | protesti, pregiudizievoli, procedure concorsuali |
| Anzianità e continuità   | 5%             | anni di attività, continuità dei depositi        |

Modificatori: procedura concorsuale aperta → score forzato a ≤ 10.
Bilancio più vecchio di 24 mesi → confidenza ridotta e penalità.
→ `credit/score.ts`

**Fido consigliato**: `min(20% del PN tangibile, 10% del fatturato, 3× EBITDA)` modulato dal fattore
di score (da 0.10 a 1.25) e arrotondato per difetto a taglio commerciale.
→ `credit/credit-limit.ts`

---

## 5. Analisi dei rischi ISO 31000:2018

Processo: **definizione del contesto → identificazione → analisi → ponderazione → trattamento → riesame**.

### Definizione del contesto: capacità e propensione

È il passo che l'ISO 31000 mette per primo, e l'unico che trasforma il trattamento da
calcolo a **decisione dell'imprenditore**. Senza, un motore che vede un rischio residuo alto
scrive «trasferire» per tutti — la critica che si fa ai questionari standardizzati.

Due grandezze da tenere distinte:

```
Capacità di ritenzione = min( 3% patrimonio netto,
                              10% EBITDA,
                              15% liquidità immediata )   ← il vincolo più stringente
                       × propensione dichiarata            ← 0,5 · 1 · 2
```

La **capacità** è oggettiva e si legge nel bilancio; la **propensione** è del titolare, si
chiede e non si deduce — un imprenditore prudente con mezzi solidi ha ogni diritto di
assicurare tutto. Se non è stata chiesta si adotta l'ipotesi prudente e la confidenza scende:
una franchigia proposta su una propensione presunta non è documentazione di adeguatezza.

Il **vincolo più stringente** e non la media, come per il fido: un'impresa redditizia ma
senza cassa non paga un sinistro con l'EBITDA. La franchigia si arrotonda **per difetto** —
arrotondarla per eccesso farebbe trattenere più di quanto l'impresa regge, che è l'errore
opposto alla sottoassicurazione ma con la stessa vittima.

Il valore per chi consiglia: alzare le franchigie fino a quella soglia riduce il premio
**senza spostare rischio reale** — ciò che si trattiene è ciò che l'impresa avrebbe comunque
assorbito — e la scelta risulta documentata, che è ciò che l'All. 4-ter del Reg. IVASS
40/2018 chiede e che quasi nessun documento di adeguatezza contiene davvero.

→ `risk/ritenzione.ts`

- **Rischio inerente** = Probabilità × Impatto (matrice 5×5, scala 1–25).
- **Controlli** presenti riducono la probabilità e/o l'impatto.
- **Rischio residuo** = quanto resta dopo i controlli. È il residuo che si assicura.
- **Trattamento**: `evitare` | `ridurre` | `trasferire` (→ assicurazione) | `ritenere`.

Categorie della tassonomia (`risk/taxonomy.ts`):

| Categoria             | Esempi di rischio                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Patrimoniale          | incendio, furto/rapina, eventi atmosferici, catastrofali, guasti macchine, danni elettronici |
| Interruzione attività | fermo produzione, perdita fornitore critico, indisponibilità sede                            |
| Responsabilità civile | RCT verso terzi, RCO verso dipendenti, RC prodotti, RC inquinamento                          |
| Persone chiave        | infortunio/morte titolare, malattia key man, perdita competenze                              |
| Cyber e dati          | ransomware, data breach GDPR, interruzione IT, frode informatica                             |
| Legale e governance   | responsabilità amministratori (D&O), 231/2001, contenzioso, sanzioni                         |
| Credito commerciale   | insolvenza clienti, concentrazione del fatturato                                             |
| Trasporti e merci     | danni a merci in viaggio, furto durante trasporto                                            |
| Contrattuale          | cauzioni e fideiussioni, penali, garanzie post-vendita                                       |
| Normativo             | obbligo CAT NAT, sicurezza sul lavoro, ambientale                                            |

I rischi non si scelgono a mano: sono **dedotti da regole** sui fatti aziendali (ATECO, addetti,
fatturato, presenza di immobili, export, dipendenti, veicoli, trattamento dati personali, ecc.).
→ `risk/rules.ts`, `risk/engine.ts`

---

## 6. Somme assicurande: come si calcolano davvero

Il punto in cui la piattaforma crea più valore. Fonte: bilancio + visura + dichiarazioni.

| Copertura                                   | Base di calcolo                                                                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fabbricati**                              | Valore di ricostruzione a nuovo = mq × costo di ricostruzione/mq. In assenza del dato metrico: immobilizzazioni materiali "terreni e fabbricati" al **costo storico lordo** × coefficiente di rivalutazione (il valore netto contabile è ammortizzato e sottostima gravemente). |
| **Contenuto: macchinari e attrezzature**    | Valore di rimpiazzo a nuovo = costo storico lordo di "impianti e macchinari" + "attrezzature industriali e commerciali" × coefficiente di rivalutazione                                                                                                                         |
| **Merci e scorte**                          | Rimanenze di bilancio × coefficiente di picco stagionale (default 1.30: il bilancio fotografa il 31/12, tipicamente il minimo dell'anno)                                                                                                                                        |
| **Danni indiretti / Business Interruption** | **Margine di contribuzione** = Ricavi − Costi variabili (materie prime + servizi variabili). Moltiplicato per il periodo di indennizzo scelto (6/12/18/24 mesi). È l'errore più frequente del mercato: si assicura il fatturato, non il margine.                                |
| **RCO** (resp. civile verso prestatori)     | Monte salari annuo, con massimali per sinistro e per persona                                                                                                                                                                                                                    |
| **RCT** massimale                           | Benchmark per classe di fatturato e pericolosità del settore (1 / 2.5 / 5 / 10 M€)                                                                                                                                                                                              |
| **D&O**                                     | Benchmark su totale attivo e fatturato                                                                                                                                                                                                                                          |
| **Cyber**                                   | Benchmark su fatturato × intensità di trattamento dati (ATECO)                                                                                                                                                                                                                  |
| **Credito**                                 | Fido complessivo concesso ai clienti = crediti verso clienti a bilancio                                                                                                                                                                                                         |

→ `coverage/sums-insured.ts`

### Come si somma l'esposizione non assicurata

Il numero di copertina — «esposizione non assicurata» — non è la somma dei capitali
mancanti garanzia per garanzia. Se lo fosse, sarebbe un multiplo del patrimonio realmente
posseduto: un titolo da giornale, privo di significato, e la prima cosa che un imprenditore
smonterebbe.

I capitali si raggruppano per **base economica**, cioè per la ricchezza che proteggono:

| Base                  | Garanzie                                                   | Perché insieme                                                                         |
| --------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Patrimonio fisico** | Incendio, CAT NAT, guasti macchine, elettronica, **furto** | Sono gli stessi beni, colpiti da cause diverse. Un evento li distrugge una volta sola. |
| **Margine**           | Danni indiretti                                            | Non distrugge beni: misura il guadagno perduto mentre l'attività è ferma.              |

Dentro ciascuna base si prende il **maggiore** dei capitali mancanti, non la somma. Le due
basi si sommano fra loro, perché la distruzione dei beni e il fermo che ne consegue
avvengono insieme — ed è di norma esattamente ciò che accade.

Il furto sta nel patrimonio fisico e non in una base propria: la somma assicurata incendio
comprende già le scorte (fabbricati + contenuto + scorte). Trattare le merci a parte le
conterebbe due volte, gonfiando l'esposizione del loro intero valore. Sono un sottoinsieme
dei beni, non un patrimonio aggiuntivo.

Le garanzie di responsabilità civile (RCT, RCO, D&O, cyber, tutela legale) **non entrano**
in questo totale: non proteggono un patrimonio esistente, ma coprono un debito potenziale
verso terzi, che non ha un tetto nei beni posseduti. Sommarle produrrebbe un numero
incomparabile con il patrimonio, e l'incidenza percentuale perderebbe senso.

→ `coverage/gap.ts`, funzioni `baseEconomica` e `calcolaEsposizioneNonAssicurata`

### Danno massimo possibile e danno massimo probabile

Il capitale non si determina solo sul valore dei beni: si determina su **quanto se ne può
ragionevolmente perdere in un solo sinistro**. È il ragionamento con cui un assicuratore
dimensiona davvero l'incendio.

- **Danno massimo possibile (MPL)**: perdita totale, nessuna protezione regge. Coincide con
  il valore dei beni.
- **Danno massimo probabile (EML)**: ciò che accade in un sinistro grave realistico. Le
  protezioni **passive** — muri e porte REI — si assumono efficaci, perché sono strutture;
  di quelle **attive** si dà credito prudente, perché devono entrare in funzione.

```
Danno probabile = Valore dei beni
                × quota di combustibilità del settore   (ATECO, 0,60 – 1,00)
                × 0,55  se compartimentazione REI dichiarata
                × 0,70  se estinzione automatica dichiarata
                × 1,15  se i valori sono in un'unica ubicazione
con pavimento al 35%
```

Il **pavimento al 35%** non è prudenza formale: le porte tagliafuoco si trovano bloccate
aperte, gli sprinkler non partono, i muri hanno passaggi impiantistici non sigillati. Un
modello che arrivasse al 10% produrrebbe capitali che al sinistro non bastano, e la
responsabilità di quel numero sarebbe dell'intermediario che l'ha proposto.

Il valore superiore dell'intervallo è **1,00** e non 0,95: quando l'ATECO non è noto si
assume la perdita totale, perché non sapere che attività si assicura non è una ragione per
essere ottimisti.

Una protezione **non dichiarata non vale come protezione presente**: la quota resta alta e
la confidenza scende, con l'indicazione di quale domanda l'abbasserebbe. Le due domande —
compartimentazione ed estinzione automatica — sono nel questionario: per un periodo il
motore le poneva nel report senza che il modulo offrisse modo di rispondere, e il capitale
usciva quasi doppio su ogni impresa reale.

**La conseguenza operativa.** Quando il danno probabile scende sotto il 65% del valore, si
propone il **primo rischio assoluto** su quel capitale. Protegge in pratica quanto una
polizza a valore intero, costa meno, e soprattutto **non è soggetto alla regola
proporzionale**: per una PMI che stima i beni a occhio — e lo fa quasi sempre — è la
differenza fra essere indennizzati e subire la riduzione dell'art. 1907 c.c. In cambio, la
perdita eccedente quel capitale resta scoperta. Entrambi i lati vengono esposti: la scelta
è del contraente.

### Quale capitale entra nel piano d'azione

Due domande diverse, che per un periodo hanno condiviso un numero solo.

**Quanto proporre.** Il capitale raccomandato per l'incendio è il patrimonio esposto —
fabbricati, contenuto e scorte — perché è la somma da assicurare sotto la forma a valore
intero, quella che il mercato scrive per difetto.

**Quanto vale il contratto che c'è già.** Qui si guarda la forma **dichiarata in polizza**,
non quella raccomandata. Una garanzia a valore intero si giudica sul valore dei beni: sotto,
opera la proporzionale, e il prodotto ne quantifica l'effetto in euro. Una a primo rischio
assoluto si giudica invece sul **danno massimo probabile**: un limite inferiore al valore
dei beni è il punto di quella forma, non un difetto, e chiamarla sottoassicurata era
l'esatto contrario di ciò che serve al cliente — succedeva su quasi ogni polizza furto del
mercato.

Quando la forma **non è dichiarata** si applica il ramo del valore intero, che è il più
prudente: dedurre la forma più favorevole da un campo vuoto dichiarerebbe adeguata una
polizza che al sinistro subisce la riduzione.

Il metro del primo rischio è il danno massimo probabile, e vale per il **solo incendio**: il
modello è fisicamente specifico di quel rischio — compartimentazione e sprinkler non fanno
nulla contro un sisma o un'alluvione, che raggiungono tutto ciò che sta alla stessa quota.
Sulle altre garanzie a valore, se la polizza è a primo rischio e non esiste un metro, il
limite si dichiara **non giudicabile** invece di essere confrontato con il valore intero.

| Garanzia            | Perché il danno probabile non si applica                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Catastrofali**    | Obbligo di legge definito sui beni ex art. 2424 B-II 1-2-3: ridurne il capitale è una decisione di conformità, non un calcolo. E il modello resta specifico dell'incendio. |
| **Furto**           | Un ladro non ragiona per carico d'incendio. Servirebbe un modello di limite proprio — accessibilità, asportabilità, valore unitario — che oggi non esiste.                 |
| **Guasti macchine** | Il danno probabile è la macchina singola più costosa, non una quota del parco; e non si raccolgono dati per macchina.                                                      |

→ `coverage/danno-massimo.ts`, `coverage/underinsurance.ts`, `coverage/gap.ts`

### Regola proporzionale (art. 1907 c.c.)

Se al momento del sinistro la somma assicurata è inferiore al valore reale del bene,
l'assicuratore risponde in proporzione:

```
Indennizzo = Danno × (Somma assicurata / Valore reale)
```

Esempio: capannone da 2 M€ assicurato per 1.2 M€, danno di 500 k€ → indennizzo 300 k€.
**200 k€ a carico dell'imprenditore per un errore di dichiarazione.**
La quantificazione di questa esposizione è ciò che AEGIS mette nero su bianco.
→ `coverage/underinsurance.ts`

---

## 7. Obbligo polizze catastrofali (CAT NAT)

**Norma**: L. 213/2023 (Bilancio 2024) art. 1 cc. 101-111 · DM MEF-MIMIT n. 18 del 30/01/2025 ·
DL Milleproroghe successivi.

**Chi è obbligato**: tutte le imprese con sede legale in Italia o con stabile organizzazione in Italia
iscritte al Registro delle Imprese.
**Escluse**: imprese agricole ex art. 2135 c.c. (coperte dal Fondo AGRICAT) e imprese con immobili
abusivi o privi di titoli edilizi.

**Beni da assicurare** (art. 2424 c.c., attivo, B-II):

1. terreni e fabbricati
2. impianti e macchinari
3. attrezzature industriali e commerciali

**Eventi**: sismi, alluvioni, frane, inondazioni, esondazioni.

**Scadenze** (`coverage/catnat.ts` mantiene la tabella aggiornabile):

| Dimensione                                                                                       | Termine                                              |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Grandi imprese                                                                                   | 31/03/2025                                           |
| Medie imprese                                                                                    | 01/10/2025                                           |
| Piccole e micro imprese                                                                          | 01/01/2026                                           |
| Micro/piccole di comparti prorogati (pesca, acquacoltura, somministrazione, turistico-ricettivo) | 31/03/2026 — pesca e acquacoltura fino al 31/12/2026 |

**Conseguenze dell'inadempimento**: non è prevista una sanzione pecuniaria diretta, ma
l'inadempimento è considerato nell'assegnazione di contributi, sovvenzioni e agevolazioni pubbliche —
e in caso di evento, nessun accesso ai sostegni statali straordinari.

**Vincoli di prodotto**: scoperto/franchigia massimo 15% del danno indennizzabile per somme assicurate
fino a 30 M€; limiti di indennizzo differenziati per fascia dimensionale.

> Copertura effettiva del mercato: **~15%**. Questo significa che, su un portafoglio di 500 aziende,
> ~425 sono fuori norma. È la lista di lavoro più redditizia che un broker possa avere nel 2026.

---

## 8. Rating di solidità della compagnia (Carrier Strength Score)

| Componente                                           | Peso | Fonte                                                         |
| ---------------------------------------------------- | ---- | ------------------------------------------------------------- |
| Solvency Ratio (SCR coverage)                        | 40%  | SFCR annuale della compagnia, comunicazioni statistiche IVASS |
| Qualità dei fondi propri (quota Tier 1 unrestricted) | 15%  | SFCR                                                          |
| Dimensione e diversificazione                        | 15%  | SFCR / bilancio                                               |
| Reclami normalizzati sui premi                       | 20%  | Statistiche reclami IVASS                                     |
| Rating agenzie esterne (se disponibile)              | 10%  | AM Best / S&P / Fitch / Moody's                               |

Soglie di riferimento sul Solvency Ratio: < 100% critico · 100-150% debole · 150-200% adeguato ·
200-250% solido · > 250% molto solido (la media di mercato italiana è intorno al 260-274%).

---

## 8-bis. Assetto proprietario, gruppo e persona chiave

L'anagrafica camerale non dichiara quasi mai una capogruppo, ma **elenca i soci**: il gruppo
si deduce da lì. Un socio persona giuridica che supera la maggioranza esercita il controllo di
diritto (art. 2359, c. 1, n. 1 c.c.); un unico socio societario controlla anche quando la quota
non è dichiarata — ed è proprio nelle partecipazioni totalitarie che la percentuale manca più
spesso.

| Situazione rilevata                    | Conseguenza assicurativa                                                    | Riferimento                  |
| -------------------------------------- | --------------------------------------------------------------------------- | ---------------------------- |
| Socio societario oltre la maggioranza  | Presunzione di direzione e coordinamento: responsabilità della capogruppo   | Artt. 2497, 2497-sexies c.c. |
| Società di capitali                    | Responsabilità personale degli amministratori, anche per assetti inadeguati | Artt. 2392 ss., 2086 c.c.    |
| Socio persona fisica oltre i due terzi | Persona chiave: la sua uscita blocca le decisioni sociali                   | —                            |
| Primi due soci con quote pari          | Stallo decisionale, anche nella gestione di un sinistro                     | —                            |

**Soglie.** Controllo: quota _superiore_ al 50% — metà esatta non è maggioranza, e due soci al
50% non hanno né l'uno né l'altro il controllo. Persona chiave: 66%.

**Quote in frazione.** Il fornitore restituisce sia `100` sia `1`. La scelta della convenzione
si fa sull'intera compagine, mai sul singolo valore: un `1` isolato è ambiguo, ma una compagine
che somma a `1` è fatta di frazioni. Letto male, un socio all'1% diventa un controllante.

**Cariche.** L'anagrafica estesa **non le contiene**; le porta il profilo completo
(`IT-full`, 0,30 €). Quando non sono state acquistate si dichiara che mancano e si generano
le domande da porre in intervista: non si deducono mai, perché dalla carica dipende chi è
assicurato dalla D&O e un amministratore ipotizzato finirebbe su un documento contrattuale.

Quando invece ci sono, arrivano a schermo per intero — nominativo, codice fiscale, ruolo,
data di nomina, rappresentanza legale ed età. L'età si **ricalcola dalla data di nascita al
momento in cui si guarda**, mai dal campo che il fornitore congela all'osservazione: il
profilo viene conservato, e una scheda riletta fra due anni mostrerebbe altrimenti un'età
vecchia di due anni senza dirlo.

**Persona chiave.** Non è solo il socio. Sono persone chiave i soci persona fisica sopra il
66% **e** chi ha la rappresentanza legale, uniti e deduplicati: il confronto è sul codice
fiscale quando c'è su entrambi i lati, altrimenti sul nominativo normalizzato — «ROSSI
MARIO» fra i soci e «Mario Rossi» fra le cariche sono la stessa persona, mentre due omonimi
con codici fiscali diversi restano due persone. La ragione dell'unione è che la definizione
per sole quote lasciava fuori l'amministratore non socio, cioè il caso più comune nelle
imprese che hanno separato proprietà e gestione — e con esso rendeva **irraggiungibile** il
criterio residuale del titolare effettivo (art. 20 c. 5), che cercava proprio chi ha poteri
di amministrazione.

**Gruppo.** Il profilo completo dichiara anche il perimetro: appartenenza, denominazione,
vertice e numero di controllate. Il vertice dichiarato si mostra come **testo e mai come
collegamento**, perché può essere una persona fisica: un link verso di essa produrrebbe una
ricerca a vuoto, per giunta a pagamento. È cosa diversa dalla _capogruppo_ dell'assetto
proprietario, che è la società socia di controllo e porta la partita IVA con cui la catena
si risale con un clic.

**Collegamenti di portafoglio.** Le compagini analizzate vengono conservate: due aziende dello
stesso intermediario che condividono un socio sono collegate. Il confronto è sul **codice
fiscale**, non sulla denominazione — «MARIO ROSSI» e «Rossi Mario» sono la stessa persona per un
lettore e due persone per un database. Il collegamento non attraversa mai due intermediari
diversi, e vale solo fra le aziende già in portafoglio: non è una visura nazionale delle
partecipazioni.

---

## 9. Adeguatezza e conformità (Reg. IVASS 40/2018)

L'intermediario deve rilevare **richieste ed esigenze** del contraente e, in caso di consulenza,
dichiarare perché il prodotto è adeguato (Allegato 4-ter).

Mappatura in AEGIS:

| Obbligo normativo                              | Artefatto generato                                                |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| Rilevazione richieste ed esigenze              | Risk register ISO 31000 con rischi residui ponderati              |
| Motivazione dell'adeguatezza                   | Catena `rischio → esigenza → copertura → massimale → motivazione` |
| Informativa precontrattuale                    | Allegati 3, 4, 4-ter precompilati                                 |
| Conservazione della documentazione             | Snapshot immutabili + audit trail append-only                     |
| Eventuale inadeguatezza dichiarata dal cliente | Registrazione esplicita del rifiuto informato, con firma          |
