# Messa in produzione

Procedura per Ubuntu 24.04 LTS su una macchina virtuale da 2 vCPU e 4 GB di RAM.
I comandi si eseguono nell'ordine in cui compaiono. Ogni passo dice **cosa verifica**
prima di dichiararsi riuscito: un passaggio che «sembra andato» e non lo è costa più del
passaggio che fallisce subito.

---

## Prima di cominciare: due cose senza le quali non si parte

### 1. Serve un nome di dominio

Non è un vezzo. In produzione il cookie di sessione è emesso con l'attributo `Secure`
(`apps/api/src/server.ts:511`), quindi il browser lo trasmette **solo su HTTPS**. Senza
certificato non si accede: si arriva alla schermata di ingresso, si inserisce la password
giusta, e si torna alla schermata di ingresso. Senza alcun messaggio d'errore.

Un certificato HTTPS richiede un dominio: non se ne emettono per un indirizzo IP.

Serve quindi un dominio (anche un sottodominio di uno già posseduto) con un record **A**
che punta all'indirizzo IP del server. Prima di procedere, verificare che risolva:

```
dig +short aegis.esempio.it
```

Deve rispondere con l'IP del server. Se non risponde, il passo 4 fallirà e il motivo sarà
questo.

### 2. Le policy di isolamento NON vanno applicate

Nel codice esiste `sqlAbilitaRls()`, che genera le policy di Row Level Security. **Non
applicarlo.** Diciannove punti del servizio interrogano ancora il database senza
dichiarare per conto di quale studio lo fanno; con le policy attive quelle query tornano
vuote, e la prima a cadere è la ricerca dell'utente per indirizzo email — cioè l'accesso,
per chiunque.

L'elenco esatto è misurato dal collaudo `packages/db/test/isolamento-rls.test.ts`, che
fallisce se se ne aggiunge uno. Quando sarà vuoto, le policy potranno diventare una
migrazione.

Fino ad allora l'isolamento fra intermediari poggia sui filtri applicativi, che oggi sono
corretti. **Su un'installazione con un solo studio la differenza è teorica.** Diventa
concreta il giorno in cui il secondo studio entra sulla stessa macchina: quel giorno il
lavoro va fatto prima, non dopo.

---

## I passi

### 1. La macchina

Dal proprio computer, collegandosi come `root` all'IP del server:

```
scp -r deploy root@IP:/tmp/deploy
ssh root@IP 'bash /tmp/deploy/01-macchina.sh'
```

Crea l'utente di servizio `aegis`, installa Node 22, PostgreSQL 16 e Caddy, e chiude il
firewall lasciando aperte solo le porte 22, 80 e 443.

**Verifica:** `node --version` risponde `v22.x`, `ufw status` elenca tre regole.

### 2. Il database

```
ssh root@IP 'bash /tmp/deploy/02-database.sh'
```

Crea il ruolo e il database, genera una password casuale e la scrive in
`/opt/aegis/.env` — la password non passa mai dalla riga di comando, dove finirebbe nella
cronologia della shell.

**Verifica:** lo script stampa `database raggiungibile`.

### 3. L'applicazione

Copiare il codice sul server. Se il repository è su un remoto raggiungibile:

```
ssh aegis@IP 'git clone URL /opt/aegis/app'
```

altrimenti dal proprio computer, escludendo ciò che non va copiato:

```
rsync -av --exclude node_modules --exclude .next --exclude .dati --exclude .git \
  ./ aegis@IP:/opt/aegis/app/
```

Poi completare `/opt/aegis/.env` con le voci contrassegnate `DA COMPILARE`
(token dati, denominazione dello studio, indirizzo del primo amministratore) ed eseguire:

```
ssh root@IP 'bash /tmp/deploy/03-applicazione.sh aegis.esempio.it'
```

Installa le dipendenze, compila, applica le migrazioni, avvia i due servizi e configura
Caddy con il dominio indicato.

**Verifica:** lo script stampa la password del primo amministratore. **Annotarla subito:
non viene mostrata una seconda volta.**

### 4. La prova

Prima del browser, una verifica che **nessun collaudo automatico può fare**: che il rinvio
alla schermata di accesso resti sul dominio pubblico.

```
curl -sS -o /dev/null -w '%{redirect_url}\n' https://aegis.esempio.it/
```

Deve stampare `https://aegis.esempio.it/accedi`. Se stampa `localhost` o un altro host, il
prodotto è irraggiungibile: il server risponde, ma dice al browser di andare altrove.

Perché va provato qui e non nei collaudi: in sviluppo l'host **è** davvero `localhost`,
quindi il difetto non esiste; e in un collaudo unitario un rinvio relativo — che in
esecuzione provoca un 500 — passa senza fare una piega. Solo un'istanza dietro il proxy
vero lo mostra.

Poi aprire `https://aegis.esempio.it` e accedere con le credenziali stampate.

Poi, subito, tre cose:

1. **Cambiare la password** dell'amministratore (Impostazioni → Password).
2. **Impostare la denominazione dello studio** (Amministratore → Anagrafica studio): è il
   nome che comparirà sui documenti consegnati ai clienti. Se resta
   «Intermediario predefinito», lo leggerà il cliente.
3. **Controllare il registro delle spese** (Impostazioni → Consumi dei dati): deve essere
   a zero. Se non lo è, qualcosa ha speso durante l'installazione e va capito prima di
   continuare.

---

## Aggiornare

```
ssh root@IP 'bash /opt/aegis/app/deploy/aggiorna.sh'
```

Scarica il codice nuovo, ricompila, riapplica le migrazioni e riavvia. Le migrazioni sono
idempotenti: rieseguirle non ripete nulla.

⚠ **La compilazione del frontend consuma fino a 3 GB.** Su una macchina da 4 GB conviene
farla quando nessuno sta lavorando: se la memoria finisce, il sistema operativo sceglie
cosa terminare, e la scelta ricade spesso su PostgreSQL.

---

## Se qualcosa non va

```
systemctl status aegis-api aegis-web caddy
journalctl -u aegis-api -n 50 --no-pager
journalctl -u aegis-web -n 50 --no-pager
```

| Sintomo | Causa quasi sempre |
|---|---|
| l'accesso rimanda alla schermata di ingresso senza errore | HTTPS non attivo, oppure si sta usando l'IP invece del dominio |
| pagina bianca, 502 | `aegis-web` non è partito: guardare il suo journal |
| «servizio di analisi non raggiungibile» | `aegis-api` non è partito, oppure `DATABASE_URL` è errata |
| la compilazione si interrompe senza messaggio | memoria esaurita: `free -h` durante il tentativo lo conferma |
| Caddy non parte, «permission denied» su `/var/log/caddy/aegis.log` | il file appartiene a root: `chown -R caddy:caddy /var/log/caddy` |
| il certificato risulta emesso da «Avast» o simili | è l'antivirus del **proprio** computer che ispeziona le connessioni, non un problema del server. Verificare dal server: `curl -v https://dominio/` |

---

## Cosa questa procedura NON fa

Detto qui perché non venga scoperto dopo.

- **Nessun backup.** I dati stanno su un solo disco. Un backup del database va aggiunto
  prima di caricarci il portafoglio di un cliente vero.
- **Nessuna Row Level Security**, per la ragione spiegata sopra.
- **Nessun monitoraggio esterno.** Se il servizio cade alle tre di notte, lo si scopre la
  mattina.
- **Le fonti territoriali restano spente**, come da configurazione predefinita: Overpass
  gira su un'istanza volontaria e Open-Meteo è gratuito solo per uso non commerciale.
  Accenderle su un prodotto venduto è una decisione con implicazioni di licenza, descritta
  in `docs/CONSEGNA.md`.
