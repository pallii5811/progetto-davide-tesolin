#!/usr/bin/env bash
#
# Prepara una macchina Ubuntu appena creata (provato su 24.04 e 26.04 LTS).
#
# Si esegue una volta sola, come root. È idempotente: rieseguirlo non rompe nulla, il che
# conta quando la connessione cade a metà e non si sa fino a dove era arrivato.
#
set -euo pipefail

UTENTE=aegis
RADICE=/opt/aegis

echo "── Aggiornamento del sistema ──────────────────────────────────────────"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl ca-certificates gnupg rsync ufw ntpsec

echo "── Utente di servizio ─────────────────────────────────────────────────"
# L'applicazione non gira come root. Se un giorno una dipendenza avrà una falla, il danno
# si ferma a ciò che questo utente può toccare.
if ! id -u "$UTENTE" >/dev/null 2>&1; then
  adduser --system --group --home "$RADICE" --shell /bin/bash "$UTENTE"
fi
mkdir -p "$RADICE/app"
chown -R "$UTENTE:$UTENTE" "$RADICE"

echo "── Node ───────────────────────────────────────────────────────────────"
# Dai depositi di Ubuntu, non da NodeSource.
#
# Su 24.04 sarebbe servito NodeSource: la distribuzione si ferma a Node 18 e package.json
# ne chiede >=22. Dalla 26.04 in poi Ubuntu pacchettizza Node 22, e NodeSource *non* ha un
# deposito per «resolute» — l'indirizzo risponde 404. Prenderlo da lì avrebbe fatto
# fallire l'installazione al primo passo.
#
# `npm` è un pacchetto a parte: `nodejs` lo indica solo fra i suggeriti, e installare il
# secondo senza il primo produce un errore alla prima compilazione, non qui.
apt-get install -y -qq nodejs npm

versione="$(node --version)"
maggiore="${versione#v}"; maggiore="${maggiore%%.*}"
if (( maggiore < 22 )); then
  echo "ERRORE: node $versione, ma package.json richiede >=22." >&2
  echo "Questa distribuzione non pacchettizza una versione sufficiente." >&2
  exit 1
fi

echo "── PostgreSQL ─────────────────────────────────────────────────────────"
# Si prende la versione della distribuzione, qualunque sia: lo schema usa SQL standard e
# le migrazioni passano da drizzle, che non dipende da una versione precisa.
apt-get install -y -qq postgresql postgresql-contrib
systemctl enable --now postgresql

echo "── Caddy ──────────────────────────────────────────────────────────────"
# Caddy ottiene e rinnova da solo il certificato HTTPS. Senza HTTPS il cookie di sessione,
# emesso con `Secure` in produzione, non viene mai trasmesso e l'accesso è impossibile.
if ! command -v caddy >/dev/null 2>&1; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi

echo "── Firewall ───────────────────────────────────────────────────────────"
# Solo SSH e web. Le porte 3000 e 3001 restano chiuse dall'esterno: i due processi
# ascoltano già su 127.0.0.1, e il firewall è la seconda serratura sulla stessa porta.
#
# Non è ridondanza inutile. L'API accetta richieste con credenziali da qualunque origine
# (`origin: true`, `apps/api/src/server.ts:218`): finché è raggiungibile solo da localhost
# la cosa è innocua, ma esporla la trasformerebbe in un problema.
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP - solo per il rinnovo del certificato'
ufw allow 443/tcp  comment 'HTTPS'
ufw --force enable

echo "── Fuso orario ────────────────────────────────────────────────────────"
# Le date sono salvate con fuso, ma i log si leggono con l'orologio di chi indaga.
timedatectl set-timezone Europe/Rome

echo
echo "Fatto. Verifiche:"
echo "  node   $(node --version)"
echo "  psql   $(sudo -u postgres psql -tAc 'select version()' | cut -d, -f1)"
echo "  caddy  $(caddy version | head -1)"
echo
ufw status numbered
