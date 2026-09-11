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
# Dai depositi della distribuzione quando bastano, da NodeSource quando non bastano - e
# quale dei due casi sia non si decide a memoria, si CHIEDE alla macchina.
#
# Questa riga ha gia' detto due cose opposte, e tutte e due erano vere per un giorno solo.
# La 24.04 si ferma a Node 18 e package.json chiede >=22: li' senza NodeSource
# l'installazione muore al primo passo. Dalla 26.04 Ubuntu pacchettizza Node 22 e
# NodeSource non serve. Una macchina nuova puo' essere l'una o l'altra, e la installa chi
# non sa quale sia: percio' la versione si MISURA con apt-cache policy, che risponde per la
# macchina su cui lo script sta girando invece che per quella su cui e' stato scritto.
#
# E NodeSource va chiesto nella forma giusta. L'indirizzo per nome di distribuzione -
# .../node_22.x/dists/noble - risponde 404: i depositi sono stati unificati sotto
# «nodistro». Un file di sorgenti scritto col nome della distribuzione fa fallire ogni
# successivo apt-get update su una macchina appena creata, e niente nel messaggio dice che
# il colpevole sia quello.
NODE_MINIMO=22

candidato_node="$(apt-cache policy nodejs 2>/dev/null | awk '/Candidate:/{print $2}')"
maggiore_node="${candidato_node%%.*}"
[[ "$maggiore_node" =~ ^[0-9]+$ ]] || maggiore_node=0

if (( maggiore_node >= NODE_MINIMO )); then
  echo "  la distribuzione offre Node $candidato_node: basta"
  # Qui npm e' un pacchetto a parte: nodejs lo indica solo fra i suggeriti, e senza di
  # esso l'errore arriva alla prima compilazione, non qui.
  apt-get install -y -qq nodejs npm
else
  echo "  la distribuzione si ferma a Node ${candidato_node:-nessuno}: si prende da NodeSource"
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
  chmod 0644 /usr/share/keyrings/nodesource.gpg
  echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MINIMO}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  # nodejs da solo, e non e' una svista: il pacchetto di NodeSource dichiara
  # «Provides: npm» e «Conflicts: npm». Chiedere anche npm fa scegliere ad apt quello di
  # Ubuntu, che dipende da nodejs 18 - cioe' disinstalla quello che si sta installando.
  apt-get install -y -qq nodejs
fi

versione="$(node --version)"
maggiore="${versione#v}"; maggiore="${maggiore%%.*}"
if (( maggiore < NODE_MINIMO )); then
  echo "ERRORE: node $versione, ma package.json richiede >=$NODE_MINIMO." >&2
  exit 1
fi
command -v npm >/dev/null 2>&1 || { echo "ERRORE: npm assente dopo l'installazione." >&2; exit 1; }

echo "── PostgreSQL ─────────────────────────────────────────────────────────"
# La versione della distribuzione basta per lo SCHEMA e non basta per il RIPRISTINO.
#
# Diceva «qualunque sia: lo schema usa SQL standard», ed era vero a meta'. Lo schema si'.
# Ma pg_restore legge gli archivi prodotti da una versione uguale o piu' vecchia della
# propria, mai da una piu' nuova - e una macchina nuova serve quasi sempre a RICEVERE un
# backup, perche' quello e' il motivo per cui la si crea: il fornitore di prima non c'e'
# piu'. Con un PostgreSQL piu' vecchio di quello che ha prodotto il dump, l'installazione
# riesce tutta e il ripristino si ferma con «unsupported version in file header», che a
# quel punto sembra un file rotto invece che una macchina impari.
#
# Misurato il 12/09/2026: Ubuntu 24.04 offre PostgreSQL 16, e l'archivio da ripristinare
# veniva da un 18. Senza questo passo il ripristino non parte.
#
# I moduli contrib NON sono un pacchetto a parte: da PostgreSQL 10 stanno dentro
# postgresql-NN, e postgresql-contrib-18 non esiste in nessun deposito.
PG_MINIMO=18

candidato_pg="$(apt-cache policy postgresql 2>/dev/null | awk '/Candidate:/{print $2}')"
maggiore_pg="${candidato_pg%%+*}"; maggiore_pg="${maggiore_pg%%.*}"
[[ "$maggiore_pg" =~ ^[0-9]+$ ]] || maggiore_pg=0

if (( maggiore_pg >= PG_MINIMO )); then
  echo "  la distribuzione offre PostgreSQL $candidato_pg: basta"
  apt-get install -y -qq postgresql postgresql-contrib
else
  echo "  la distribuzione si ferma a PostgreSQL ${candidato_pg:-nessuno}: si prende da PGDG"
  . /etc/os-release
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor --yes -o /usr/share/keyrings/postgresql.gpg
  chmod 0644 /usr/share/keyrings/postgresql.gpg
  echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt-get install -y -qq "postgresql-${PG_MINIMO}"
fi
systemctl enable --now postgresql

# Quale cluster e' partito davvero, e su quale porta. Con due versioni installate accanto
# la seconda prende la 5433, e 02-database.sh scriverebbe una DATABASE_URL che punta a un
# archivio vuoto - che risponde, il che e' la ragione per cui non se ne accorgerebbe
# nessuno fino a schermata aperta.
pg_lsclusters 2>/dev/null || true
porta_attiva="$(pg_lsclusters -h 2>/dev/null | awk '$4=="online"{print $3; exit}')"
if [[ -n "${porta_attiva:-}" && "$porta_attiva" != "5432" ]]; then
  echo "ERRORE: il cluster attivo ascolta sulla porta $porta_attiva, non la 5432." >&2
  echo "02-database.sh scriverebbe una DATABASE_URL che punta altrove." >&2
  exit 1
fi

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
