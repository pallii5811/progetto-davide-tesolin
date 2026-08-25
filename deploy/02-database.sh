#!/usr/bin/env bash
#
# Crea il database e il file di configurazione.
#
# La password non viene mai digitata né passata come argomento: si genera qui e si scrive
# direttamente nel file. Una password passata sulla riga di comando resta nella cronologia
# della shell e nell'elenco dei processi, dove la legge chiunque.
#
set -euo pipefail

UTENTE=aegis
RADICE=/opt/aegis
DB=aegis
ENV="$RADICE/.env"

if [[ -f "$ENV" ]] && grep -q '^DATABASE_URL=' "$ENV"; then
  echo "  $ENV contiene già DATABASE_URL: non tocco nulla."
  echo "  Per rifare da zero, rimuovere quella riga e il database, poi rieseguire."
  exit 0
fi

echo "── Ruolo e database ───────────────────────────────────────────────────"
PASSWORD="$(openssl rand -base64 30 | tr -d '/+=' | head -c 32)"

# Il ruolo è proprietario delle tabelle. Quando le policy di Row Level Security diventeranno
# applicabili servirà un secondo ruolo, non proprietario e senza BYPASSRLS, per
# l'applicazione: con `FORCE ROW LEVEL SECURITY` nemmeno il proprietario vede le righe
# altrui, e le operazioni che attraversano gli studi per disegno smetterebbero di funzionare.
# Vedi deploy/LEGGIMI.md § «Le policy di isolamento NON vanno applicate».
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$UTENTE') THEN
    CREATE ROLE $UTENTE LOGIN PASSWORD '$PASSWORD';
  ELSE
    ALTER ROLE $UTENTE WITH LOGIN PASSWORD '$PASSWORD';
  END IF;
END
\$\$;
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
  sudo -u postgres createdb -O "$UTENTE" "$DB"
fi

echo "── File di configurazione ─────────────────────────────────────────────"
umask 077
cat > "$ENV" <<CONF
# Configurazione di AEGIS in produzione.
# Generato da deploy/02-database.sh. Contiene segreti: permessi 600, mai in un repository.

NODE_ENV=production

# ── Archivio ────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://$UTENTE:$PASSWORD@127.0.0.1:5432/$DB

# ── Rete ────────────────────────────────────────────────────────────────────
# L'API ascolta solo su localhost: il frontend la raggiunge, internet no.
PORT=3001
HOST=127.0.0.1
AEGIS_API_URL=http://127.0.0.1:3001

# ── DA COMPILARE: fonte dati ────────────────────────────────────────────────
# Senza token la piattaforma parte in modalità dimostrativa, su dati inventati.
OPENAPI_TOKEN=
OPENAPI_AMBIENTE=produzione

# Tetto per sessione di lavoro, in centesimi. Difende dal ciclo che va in errore e riprova.
OPENAPI_BUDGET_CENTESIMI=500

# Tetto giornaliero per studio, in centesimi. 2000 = 20 euro.
AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI=2000

# Credito caricato sul contratto dati, in centesimi. Serve solo a mostrare il residuo.
# Va riallineato a ogni ricarica: è una dichiarazione, non un dato letto dal fornitore.
AEGIS_CREDITO_CARICATO_CENTESIMI=0

# ── DA COMPILARE: primo accesso ─────────────────────────────────────────────
# Denominazione dello studio, FRA VIRGOLETTE se contiene spazi.
#
# Le virgolette non sono decorative: systemd legge questo file col proprio formato e
# tollera i valori non quotati, ma gli script di installazione e di aggiornamento lo
# leggono con `. .env` prima di applicare le migrazioni — e lì un valore con spazi si
# spezza in comandi. Il sintomo è una riga come «da: command not found» in mezzo a
# un'operazione riuscita a metà.
#
# La denominazione comparirà sui documenti consegnati ai clienti. Di norma la imposta
# l'intermediario stesso dall'interfaccia, in Amministratore → Anagrafica studio: qui
# basta un segnaposto riconoscibile, così se finisce su un documento si nota.
AEGIS_TENANT="Studio da configurare"

# Indirizzo del primo amministratore. La password viene generata e mostrata UNA VOLTA
# SOLA all'avvio del servizio.
AEGIS_ADMIN_EMAIL=
CONF

chown "$UTENTE:$UTENTE" "$ENV"
chmod 600 "$ENV"

echo "── Prova di connessione ───────────────────────────────────────────────"
if sudo -u "$UTENTE" psql "postgresql://$UTENTE:$PASSWORD@127.0.0.1:5432/$DB" -tAc 'select 1' | grep -q 1; then
  echo "  database raggiungibile"
else
  echo "  ERRORE: il database non risponde con le credenziali appena create." >&2
  exit 1
fi

echo
echo "Configurazione in $ENV (permessi 600, proprietario $UTENTE)."
echo
echo "PRIMA del passo 3, compilare le voci contrassegnate DA COMPILARE:"
echo "  nano $ENV"
echo
echo "Senza OPENAPI_TOKEN la piattaforma parte su dati dimostrativi e non serve a niente"
echo "in produzione. Senza AEGIS_TENANT lo studio si chiama «Intermediario predefinito»,"
echo "e quel nome finisce sui documenti che il broker consegna ai suoi clienti."
