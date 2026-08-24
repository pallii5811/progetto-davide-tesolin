#!/usr/bin/env bash
#
# Prepara una macchina Ubuntu 24.04 appena creata.
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

echo "── Node 22 ────────────────────────────────────────────────────────────"
# La versione dei repository Ubuntu è più vecchia di quella richiesta da package.json
# (>=22): si prende dalla fonte ufficiale.
if ! command -v node >/dev/null 2>&1 || [[ "$(node --version)" != v22.* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

echo "── PostgreSQL ─────────────────────────────────────────────────────────"
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
