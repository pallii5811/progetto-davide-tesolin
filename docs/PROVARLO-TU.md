# Provare la piattaforma di persona

Guida per chi la piattaforma la possiede, non per il broker che la userà: quella è
[PRIMA-SESSIONE.md](PRIMA-SESSIONE.md), e va data a lui senza spiegargli niente.

Qui invece c'è tutto quello che serve per aprire il prodotto e guardarlo con calma.

---

## Come si accende

Due comandi, in due finestre distinte. **Non serve alcun database installato.**

```
npm run dev:api:demo
```

```
npm run dev:web
```

Poi si apre **http://localhost:3000**.

|           |                     |
| --------- | ------------------- |
| Indirizzo | `admin@aegis.local` |
| Password  | `prova-locale-2026` |

### Dimostrativo o dati reali

`dev:api:demo` azzera il token **nell'ambiente** anche se `.env` ne contiene uno valido:
si può cliccare ovunque senza consumare credito. È la modalità giusta per esplorare.

Per lavorare sulle aziende vere si usa invece:

```
npm run dev:api
```

Da lì ogni analisi costa: **55 centesimi** quella normale, **1,03 €** quella approfondita.
La differenza fra i due comandi è denaro, ed è per questo che sono due comandi e non
un'opzione da ricordare. La piattaforma dichiara sempre in quale delle due sta lavorando,
con un riquadro in cima alla pagina di ricerca.

---

## Le tre aziende dimostrative

Sono finte ma coerenti fra loro: settori, territori e dimensioni diverse, scelti perché
facciano emergere comportamenti diversi del motore.

| Partita IVA   | Azienda                    | Dove          | Settore              | Cosa mostra                                                           |
| ------------- | -------------------------- | ------------- | -------------------- | --------------------------------------------------------------------- |
| `03158460174` | MECCANICA BRESCIANA S.R.L. | Adro (BS)     | Meccanica generale   | **La più completa**: ha l'intervista compilata e le polizze in essere |
| `02657870644` | COSTRUZIONI IRPINE S.R.L.  | Avellino (AV) | Edilizia             | Zona **sismica alta**: l'obbligo catastrofale cambia faccia           |
| `02413390390` | ADRIATICA LOGISTICA S.R.L. | Ravenna (RA)  | Magazzini e deposito | La più grande, e senza intervista: si vede cosa manca                 |

---

## Il giro che conviene fare

Nell'ordine. Ogni passo mostra qualcosa che il precedente non poteva mostrare.

### 1. Cerca e analizza

Nella pagina iniziale, incolla `03158460174` nel campo partita IVA e cerca. Poi apri
l'azienda e fai partire l'analisi.

Guarda: **profilo camerale, punteggio di credito, fido consigliato, registro dei rischi
ISO 31000, somme assicurande calcolate dal bilancio, obbligo catastrofale**.

> Prova a cliccare su un numero qualsiasi. Ognuno sa dire da dove viene e come è stato
> calcolato: è la proprietà su cui si regge tutto il resto, perché un'analisi che non si
> spiega non si può difendere davanti a un cliente.

### 2. Guarda le coperture e i vuoti

Sempre sulla scheda azienda, scorri fino alle coperture. Le polizze in essere sono
elencate con **la solidità della compagnia accanto** — `solidità 90/100 · Molto solida`.

È la cosa che né Creditsafe né iadv fanno: si analizza minuziosamente il rischio del
cliente e poi lo si trasferisce a un soggetto la cui solidità nessuno ha guardato.

### 3. Genera il report

Il pulsante per il report è in cima alla scheda. Si apre il documento che il broker
consegna al proprio cliente: **carta intestata dello studio, numero RUI**, l'elenco delle
coperture in essere, i vuoti e le somme.

> Provalo a stampare (Ctrl+P): è pensato per finire su carta.
> E controlla le fonti citate: dicono **Registro Imprese**, non il nome di chi ci rivende
> i dati. Nomineare un'API commerciale in un fascicolo di adeguatezza lo indebolirebbe.

### 4. Compila l'intervista

Dalla scheda azienda, apri i **dati di intervista** e compila qualche campo — superficie
del capannone, macchinari, fatturato verso il primo cliente.

Guarda la **percentuale di completezza** salire, e guarda le somme assicurande cambiare
di conseguenza. Le domande non sono un modulo: sono ordinate per quanto pesano sul
risultato.

### 5. Analizza le altre due e apri il portafoglio

Analizza `02657870644` (Avellino) e `02413390390` (Ravenna). Poi apri il **portafoglio**.

Non è un cruscotto: è **una lista di telefonate da fare**, ordinata per urgenza — prima
chi è fuori norma su un obbligo di legge, poi per patrimonio scoperto.

> Confronta l'obbligo catastrofale fra Avellino e Adro. Sono due aziende in due zone
> sismiche diverse, e l'analisi lo sa.

### 6. Cerca clienti nuovi

La pagina **nuovi clienti** trova aziende per provincia, settore, addetti e fatturato.

**Il conteggio è gratuito**: si vede quante aziende corrispondono ai criteri prima di
decidere se scaricarne anche una sola. Serve a non spendere per scoprire che il filtro
era sbagliato.

### 7. Le tue pagine, quelle che il broker non vede

In **Impostazioni** trovi due schede che esistono solo per chi gestisce la piattaforma:

- **Studi sulla piattaforma** — qui si aprono gli studi clienti, con la loro password
  iniziale mostrata una volta sola, e si sospendono quando serve. Uno studio sospeso
  smette di lavorare subito, anche se ha già il collegamento aperto, ma non perde niente.
- **Servizi dati** — quali servizi il contratto autorizza, il credito residuo e quanto si
  è consumato oggi su tutti gli studi insieme.

> **Prova la separazione.** Apri uno studio cliente, copia la password, esci e rientra con
> quelle credenziali: le due schede qui sopra non compaiono più, e digitandone l'indirizzo
> a mano si finisce fuori. Da nessuna parte, in quella sessione, compare il nome del
> fornitore dei dati.

---

## Se qualcosa non risponde

L'archivio locale è un PostgreSQL **dentro il processo**: appartiene a un processo solo.
Se un avvio dice che l'archivio è già occupato, c'è un altro servizio acceso — va chiuso
quello, non forzato questo. Due processi sullo stesso archivio lo corrompono.

Il primo caricamento di ogni pagina è lento: in sviluppo Next compila le rotte alla prima
richiesta. Dal secondo giro in poi è immediato. In esercizio questo non succede, perché il
codice è già compilato.
