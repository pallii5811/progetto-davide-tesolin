# Prima sessione con un intermediario vero

Questo documento serve a una cosa sola: far usare la piattaforma a un broker che non l'ha
mai vista, **senza spiegargliela**, e annotare dove si ferma.

È l'unica prova che né i test né io possiamo fare. Quattrocento test automatici verificano
che il software faccia ciò per cui è stato scritto; non verificano che sia ciò che serve.
La differenza si scopre guardando una persona che non sa dove cliccare.

---

## Prima di iniziare

**Non spiegare nulla.** La tentazione di dire «ah, quello lo trovi lì» è fortissima e
distrugge la prova: se devi spiegarlo, il prodotto ha già fallito quel passaggio.

Siediti accanto, con carta e penna, e scrivi **solo** due cose:

1. dove si ferma, e per quanti secondi;
2. che parole usa quando non capisce («ma questo cos'è?», «e adesso?»).

Le sue parole sono il dato più prezioso: sono le etichette che l'interfaccia dovrebbe
avere e non ha.

---

## Preparazione (5 minuti, prima che arrivi)

Avviare in **modalità dimostrativa**, così i suoi tentativi non consumano credito:

```bash
npm run dev:api:demo
```

e in un secondo terminale:

```bash
npm run dev:web
```

Creargli un'utenza propria da **Impostazioni → Utenti dello studio**: deve entrare con le
sue credenziali, non con le tue. Vedere una sessione già aperta gli toglie il primo
passaggio, che è quello dove si scopre se l'accesso funziona.

---

## Le sei consegne

Da leggere così come sono scritte, una alla volta. **Nessun'altra parola.**

### 1. «Entra nel programma»

*Cosa si osserva:* trova la pagina di accesso? Capisce che deve cambiare la password al
primo ingresso?

### 2. «Cerca l'azienda con partita IVA 03158460174 e analizzala»

*Cosa si osserva:* usa il campo giusto? Capisce che «Analizza» spende? Nota l'avviso sul
consumo di credito o gli passa sopra?

### 3. «Dimmi quanto è rischiosa questa azienda e perché»

*È la domanda centrale.* Guarda lo score? Apre «Come è stato calcolato»? Oppure scorre
cercando altro? Se non apre mai una spiegazione, l'esplicabilità — che è il nostro
principale vantaggio competitivo — non sta comunicando.

### 4. «Il cliente ha una polizza incendio da 500.000 €. Inseriscila e dimmi se basta»

*Cosa si osserva:* trova «Dati di intervista»? Capisce la differenza fra somma assicurata
e massimale? Legge la simulazione della regola proporzionale, e la capisce?

### 5. «Prepara qualcosa da lasciare al cliente»

*Cosa si osserva:* trova il report? Lo stamperebbe così com'è o si vergognerebbe di
consegnarlo? **Chiedi esattamente questo:** «lo daresti a un tuo cliente?».

### 6. «Trovami dieci aziende metalmeccaniche in provincia di Brescia sopra i venti addetti»

*Cosa si osserva:* trova «Nuovi clienti»? Capisce che contare è gratis e scaricare no?
Capisce il codice ATECO senza punti — o si ferma lì?

---

## Le tre domande finali

Da fare a voce, alla fine, senza suggerire risposte:

1. **«Cosa faresti domani con questo?»** — se non ha una risposta concreta, il prodotto non
   ha ancora trovato il suo posto nella sua giornata.
2. **«Cosa manca perché tu lo usi davvero?»** — la risposta vale più di tutta la mia lista
   di funzioni mancanti.
3. **«Quanto pagheresti al mese?»** — non per il prezzo, ma perché una cifra bassa dice che
   non ha visto il valore, e una cifra alta dice quale funzione l'ha convinto. Chiedi
   sempre **perché** quella cifra.

---

## Cosa aspettarsi

Un intermediario che non l'ha mai visto si fermerà almeno tre volte. È normale e **non è
un fallimento**: è l'unico modo per sapere dove intervenire. Le prime due sessioni servono
a scoprire le parole giuste, non a dimostrare che il software funziona — quello lo dicono
già i test.

Se invece arriva in fondo alle sei consegne senza aiuto, il prodotto è pronto per la
consegna vera.
