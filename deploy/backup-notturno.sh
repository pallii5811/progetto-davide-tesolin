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
# Il dump lo fa l'utente postgres, non aegis. Le policy di Row Level Security sono create
# con FORCE (migrazione 0010) e valgono anche per il proprietario delle tabelle: pg_dump
# come aegis si fermava su `analisi` con «query would be affected by row-level security
# policy», lasciando sul disco un file a metà che sembrava un backup. Il superutente non
# passa dalle policy, e non ha bisogno di una password: autenticazione peer, in locale.
#
# Il file si scrive con un nome provvisorio e prende quello definitivo SOLO dopo la
# verifica: un backup a metà non deve mai restare con il nome di un backup.
#
# Cosa NON fa, e va detto: non copia il file fuori dalla macchina. Un disco che muore
# porta via anche i backup. La copia altrove — un secondo server, uno storage box, un
# bucket — richiede una destinazione e una credenziale che solo il proprietario può dare;
# deploy/LEGGIMI.md § limiti lo dichiara.
#
set -euo pipefail

UTENTE=aegis
DB=aegis
CARTELLA=/opt/aegis/backups
CONSERVA=14
# Il dump del 02/09/2026 aveva 19 tabelle con dati: sotto questa soglia non è un backup.
TABELLE_MINIME=15

install -d -m 700 -o "$UTENTE" -g "$UTENTE" "$CARTELLA"

adesso="$(date +%Y%m%d-%H%M)"
file="$CARTELLA/aegis-$adesso.dump"
provvisorio="$(mktemp /var/tmp/aegis-backup.XXXXXX)"
chown postgres:postgres "$provvisorio"
trap 'rm -f "$provvisorio"' EXIT

sudo -u postgres pg_dump --format=custom --no-owner --dbname="$DB" --file="$provvisorio"

# Un backup che non si riapre non è un backup: si legge l'indice prima di dichiararlo fatto.
tabelle="$(sudo -u postgres pg_restore --list "$provvisorio" | grep -c 'TABLE DATA' || true)"
if (( tabelle < TABELLE_MINIME )); then
  echo "ERRORE: il dump contiene solo $tabelle tabelle con dati (minimo $TABELLE_MINIME): scartato" >&2
  exit 1
fi

install -m 600 -o "$UTENTE" -g "$UTENTE" "$provvisorio" "$file"

# Rotazione: gli ultimi 14, per nome (che è per data).
ls -1 "$CARTELLA"/aegis-*.dump 2>/dev/null | sort | head -n -"$CONSERVA" | xargs -r rm -f

dimensione="$(stat -c %s "$file")"
echo "backup $file — $dimensione byte, $tabelle tabelle con dati, $(ls -1 "$CARTELLA"/aegis-*.dump | wc -l) conservati"
