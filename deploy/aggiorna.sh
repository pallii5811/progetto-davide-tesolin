#!/usr/bin/env bash
#
# Aggiorna un'installazione già in funzione.
#
#   bash /opt/aegis/app/deploy/aggiorna.sh
#
# Presuppone che il codice arrivi da git. Se lo si copia con rsync, saltare il passo
# «Codice nuovo» e lanciare lo script dopo aver copiato.
#
set -euo pipefail

UTENTE=aegis
RADICE=/opt/aegis
APP="$RADICE/app"
ENV="$RADICE/.env"

echo "── Memoria ────────────────────────────────────────────────────────────"
# Il momento pericoloso di un aggiornamento è la compilazione dell'interfaccia: arriva a
# chiedere ~3 GB. Se la memoria finisce, il sistema sceglie un processo da terminare, e la
# scelta cade spesso su PostgreSQL — cioè si perde il database mentre si aggiorna il
# programma. Meglio non cominciare che cominciare e non finire.
disponibile="$(free -m | awk '/^Mem:/{print $7}')"
echo "  disponibile: ${disponibile} MB"
if (( disponibile < 2000 )); then
  echo "  ERRORE: sotto i 2 GB liberi la compilazione rischia di essere interrotta." >&2
  echo "  Fermare ciò che non serve, o aggiungere swap:" >&2
  echo "    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile" >&2
  exit 1
fi

if [[ -d "$APP/.git" ]]; then
  echo "── Codice nuovo ─────────────────────────────────────────────────────"
  precedente="$(sudo -u "$UTENTE" git -C "$APP" rev-parse --short HEAD)"
  sudo -u "$UTENTE" git -C "$APP" pull --ff-only
  attuale="$(sudo -u "$UTENTE" git -C "$APP" rev-parse --short HEAD)"
  if [[ "$precedente" == "$attuale" ]]; then
    echo "  già aggiornato ($attuale): niente da fare."
    exit 0
  fi
  echo "  $precedente → $attuale"
  echo "  per tornare indietro:  git -C $APP reset --hard $precedente  e rieseguire"
fi

echo "── Dipendenze e compilazione ──────────────────────────────────────────"
sudo -u "$UTENTE" bash -c "cd '$APP' && npm ci"
sudo -u "$UTENTE" bash -c "cd '$APP' && npm run build"
sudo -u "$UTENTE" bash -c "cd '$APP' && npm run build --workspace @aegis/web"

echo "── Migrazioni ─────────────────────────────────────────────────────────"
sudo -u "$UTENTE" bash -c "cd '$APP' && set -a && . '$ENV' && set +a && npm run migra"

echo "── Unità di servizio ──────────────────────────────────────────────────"
# Possono essere cambiate insieme al codice: si reinstallano sempre, costa nulla.
install -m 644 "$APP/deploy/aegis-api.service" /etc/systemd/system/aegis-api.service
install -m 644 "$APP/deploy/aegis-web.service" /etc/systemd/system/aegis-web.service
systemctl daemon-reload

echo "── Riavvio ────────────────────────────────────────────────────────────"
systemctl restart aegis-api
sleep 3
systemctl restart aegis-web
sleep 5

echo "── Verifica ───────────────────────────────────────────────────────────"
esito=0
for servizio in aegis-api aegis-web caddy; do
  if systemctl is-active --quiet "$servizio"; then
    echo "  $servizio  attivo"
  else
    echo "  $servizio  NON attivo" >&2
    esito=1
  fi
done

if salute="$(curl -fsS --max-time 10 http://127.0.0.1:3001/health 2>/dev/null)"; then
  echo "  API risponde"
  if echo "$salute" | grep -q '"datiReali":true'; then
    echo "  fonte dati: REALE"
  else
    # Un aggiornamento che ricade in modalità dimostrativa è il guasto peggiore possibile:
    # il prodotto continua a rispondere, e risponde con numeri inventati.
    echo "  ALLARME: fonte dati DIMOSTRATIVA — il token non viene più letto." >&2
    esito=1
  fi
else
  echo "  API non risponde" >&2
  esito=1
fi

if (( esito != 0 )); then
  echo
  echo "Aggiornamento concluso con problemi. Da guardare:" >&2
  echo "  journalctl -u aegis-api -n 50 --no-pager" >&2
  echo "  journalctl -u aegis-web -n 50 --no-pager" >&2
  exit 1
fi

echo
echo "Aggiornato."
