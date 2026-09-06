#!/usr/bin/env bash
#
# Backup notturno del database, sulla macchina.
#
#   sudo bash /opt/aegis/app/deploy/backup-notturno.sh          # una volta, a mano
#   /etc/cron.d/aegis-backup  → ogni notte alle 03:15           # installato da aggiorna.sh
#
# Produce /opt/aegis/backups/aegis-AAAAMMGG-HHMM.dump (pg_dump -Fc, ripristinabile con
# pg_restore), ne verifica la leggibilità, e tiene gli ultimi 14. Il file è dell'utente
# aegis, permessi 600: contiene i dati dei clienti dello studio.
#
# Cosa NON fa, e va detto: non copia il file fuori dalla macchina. Un disco che muore
# porta via anche i backup. La copia altrove — un secondo server, uno storage box, un
# bucket — richiede una destinazione e una credenziale che solo il proprietario può dare;
# deploy/LEGGIMI.md § limiti lo dichiara.
#
set -euo pipefail

UTENTE=aegis
CARTELLA=/opt/aegis/backups
ENV=/opt/aegis/.env
CONSERVA=14

[[ -f "$ENV" ]] || { echo "ERRORE: $ENV assente" >&2; exit 1; }
install -d -m 700 -o "$UTENTE" -g "$UTENTE" "$CARTELLA"

adesso="$(date +%Y%m%d-%H%M)"
file="$CARTELLA/aegis-$adesso.dump"

# pg_dump legge DATABASE_URL dal file di configurazione, come i servizi: nessuna password
# sulla riga di comando, nessuna copia in un altro posto.
sudo -u "$UTENTE" bash -c "set -a && . '$ENV' && set +a && pg_dump --format=custom --no-owner --file='$file' \"\$DATABASE_URL\""
chmod 600 "$file"

# Un backup che non si riapre non è un backup: si legge l'indice prima di dichiararlo fatto.
tabelle="$(sudo -u "$UTENTE" pg_restore --list "$file" | grep -c 'TABLE DATA' || true)"
if (( tabelle < 10 )); then
  echo "ERRORE: $file contiene solo $tabelle tabelle con dati: non è un backup completo" >&2
  exit 1
fi

# Rotazione: gli ultimi 14, per nome (che è per data).
ls -1 "$CARTELLA"/aegis-*.dump 2>/dev/null | sort | head -n -"$CONSERVA" | xargs -r rm -f

dimensione="$(stat -c %s "$file")"
echo "backup $file — $dimensione byte, $tabelle tabelle con dati, $(ls -1 "$CARTELLA"/aegis-*.dump | wc -l) conservati"
