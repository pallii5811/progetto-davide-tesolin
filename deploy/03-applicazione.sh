#!/usr/bin/env bash
#
# Installa, compila e avvia l'applicazione.
#
#   bash 03-applicazione.sh aegis.esempio.it
#
# Presuppone che il codice sia già in /opt/aegis/app e che /opt/aegis/.env sia compilato.
#
set -euo pipefail

DOMINIO="${1:-}"
UTENTE=aegis
RADICE=/opt/aegis
APP="$RADICE/app"
ENV="$RADICE/.env"

if [[ -z "$DOMINIO" ]]; then
  echo "Uso: bash 03-applicazione.sh <dominio>" >&2
  echo "Serve un dominio vero: non si emettono certificati HTTPS per un indirizzo IP," >&2
  echo "e senza HTTPS il cookie di sessione non viaggia — nessuno riesce ad accedere." >&2
  exit 1
fi

echo "── Controlli preliminari ──────────────────────────────────────────────"

[[ -d "$APP/apps/web" ]] || { echo "ERRORE: codice assente in $APP" >&2; exit 1; }
[[ -f "$ENV" ]] || { echo "ERRORE: $ENV assente. Eseguire prima 02-database.sh" >&2; exit 1; }

# Le voci lasciate vuote producono guasti che si scoprono tardi e in modo confondente:
# senza token si lavora su dati inventati credendoli veri, senza denominazione lo studio
# consegna al cliente fogli intestati «Intermediario predefinito».
# `AEGIS_TENANT` non è fra queste: nasce con un segnaposto riconoscibile, e la
# denominazione vera la mette l'intermediario dall'interfaccia quando comincia a usare il
# prodotto. Non è una voce che chi installa possa conoscere.
mancanti=()
for chiave in OPENAPI_TOKEN AEGIS_ADMIN_EMAIL; do
  valore="$(grep -E "^${chiave}=" "$ENV" | cut -d= -f2- || true)"
  [[ -z "${valore// /}" ]] && mancanti+=("$chiave")
done
if (( ${#mancanti[@]} > 0 )); then
  echo "ERRORE: in $ENV mancano: ${mancanti[*]}" >&2
  echo "Compilarle con  nano $ENV  e rieseguire." >&2
  exit 1
fi

# Il dominio deve già puntare qui, altrimenti Caddy chiederà un certificato che
# Let's Encrypt rifiuterà, e ai tentativi falliti si applica un limite giornaliero.
mio_ip="$(curl -fsS --max-time 10 https://api.ipify.org || echo '')"
risolto="$(getent ahostsv4 "$DOMINIO" | awk 'NR==1{print $1}' || echo '')"
if [[ -n "$mio_ip" && -n "$risolto" && "$mio_ip" != "$risolto" ]]; then
  echo "ATTENZIONE: $DOMINIO risolve in $risolto ma questa macchina è $mio_ip." >&2
  echo "Il certificato fallirà. Correggere il record A e attendere la propagazione." >&2
  read -r -p "Proseguire lo stesso? [s/N] " risposta
  [[ "$risposta" == "s" ]] || exit 1
elif [[ -z "$risolto" ]]; then
  echo "ATTENZIONE: $DOMINIO non risolve. Il certificato fallirà." >&2
  read -r -p "Proseguire lo stesso? [s/N] " risposta
  [[ "$risposta" == "s" ]] || exit 1
fi

chown -R "$UTENTE:$UTENTE" "$APP"

echo "── Dipendenze ─────────────────────────────────────────────────────────"
sudo -u "$UTENTE" bash -c "cd '$APP' && npm ci"

echo "── Compilazione ───────────────────────────────────────────────────────"
# Due passaggi distinti: `tsc --build` produce il servizio e le librerie, `next build`
# produce l'interfaccia. Il secondo arriva a chiedere ~3 GB: su una macchina da 4 GB è il
# momento in cui la memoria può finire, e chi ci rimette è PostgreSQL.
disponibile="$(free -m | awk '/^Mem:/{print $7}')"
echo "  memoria disponibile: ${disponibile} MB"
if (( disponibile < 2500 )); then
  echo "  ATTENZIONE: sotto i 2,5 GB la compilazione dell'interfaccia può essere interrotta"
  echo "  dal sistema. Fermare ciò che non serve, oppure aggiungere spazio di swap."
fi

sudo -u "$UTENTE" bash -c "cd '$APP' && npm run build"
sudo -u "$UTENTE" bash -c "cd '$APP' && npm run build --workspace @aegis/web"

[[ -x "$APP/node_modules/.bin/next" ]] || {
  echo "ERRORE: $APP/node_modules/.bin/next assente: l'unità systemd non partirebbe." >&2
  exit 1
}

echo "── Migrazioni ─────────────────────────────────────────────────────────"
# Idempotenti: drizzle tiene traccia di quali sono già passate.
# NB: NON si applicano le policy di Row Level Security. Vedi LEGGIMI.md.
sudo -u "$UTENTE" bash -c "cd '$APP' && set -a && . '$ENV' && set +a && npm run migra"

echo "── Servizi ────────────────────────────────────────────────────────────"
install -m 644 "$APP/deploy/aegis-api.service" /etc/systemd/system/aegis-api.service
install -m 644 "$APP/deploy/aegis-web.service" /etc/systemd/system/aegis-web.service
systemctl daemon-reload
systemctl enable aegis-api aegis-web
systemctl restart aegis-api
sleep 3
systemctl restart aegis-web

echo "── Caddy ──────────────────────────────────────────────────────────────"
mkdir -p /var/log/caddy
sed "s/DOMINIO/$DOMINIO/" "$APP/deploy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# La proprietà si sistema DOPO la validazione, e ricorsivamente.
#
# `caddy validate` gira come root e, trovando nella configurazione un log su file, quel
# file lo **crea** — di proprietà di root, permessi 600. Poi il servizio, che gira come
# utente `caddy`, non riesce ad aprirlo: si ferma con «permission denied» su un file che
# sta nella cartella giusta, con l'utente proprietario giusto, in un percorso dove quello
# stesso utente scrive senza problemi da riga di comando. La causa è a due passi di
# distanza dal sintomo, ed è costata mezz'ora la prima volta.
chown -R caddy:caddy /var/log/caddy

systemctl reload caddy || systemctl restart caddy

echo "── Verifica ───────────────────────────────────────────────────────────"
sleep 5
for servizio in aegis-api aegis-web caddy; do
  if systemctl is-active --quiet "$servizio"; then
    echo "  $servizio  attivo"
  else
    echo "  $servizio  NON attivo — journalctl -u $servizio -n 50 --no-pager" >&2
  fi
done

# `/health` è una delle tre rotte che non richiedono sessione (server.ts:379).
if salute="$(curl -fsS --max-time 10 http://127.0.0.1:3001/health 2>/dev/null)"; then
  echo "  API risponde"
  # Dichiara se sta lavorando su dati veri o inventati: è la differenza fra un prodotto
  # e una dimostrazione, e va vista adesso, non alla prima analisi consegnata a un cliente.
  if echo "$salute" | grep -q '"datiReali":true'; then
    echo "  fonte dati: REALE"
  else
    echo "  fonte dati: DIMOSTRATIVA — il token non è stato letto, le analisi sarebbero inventate" >&2
  fi
  echo "$salute" | grep -o '"persistenza":"[^"]*"' || true
else
  echo "  API non risponde su 127.0.0.1:3001" >&2
fi

echo
echo "── Password del primo amministratore ──────────────────────────────────"
# Viene generata al primo avvio e stampata una volta sola: si recupera dal journal, ma
# solo finché il journal la conserva.
journalctl -u aegis-api --no-pager | grep -A6 -i "credenziali\|password" | tail -20 || true
echo
echo "Se sopra non compare nulla, l'amministratore esisteva già."
echo "In tal caso:  cd $APP && sudo -u $UTENTE npm run reimposta-password"
echo
echo "Aprire ora  https://$DOMINIO"
echo
echo "Subito dopo il primo accesso:"
echo "  1. cambiare la password"
echo "  2. Amministratore → Anagrafica studio: la denominazione finisce sui documenti"
echo "  3. Impostazioni → Consumi dei dati: deve essere a zero"
