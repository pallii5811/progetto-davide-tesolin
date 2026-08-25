#!/usr/bin/env bash
#
# Rassegna dell'istanza in produzione: ogni pagina, ogni rotta, con una sessione vera.
#
#   bash deploy/rassegna.sh <dominio> <email> <password>
#   bash deploy/rassegna.sh <dominio> <email> <password> --a-pagamento <partitaIva>
#
# Perché esiste: i difetti più cari di questo prodotto non si vedono in sviluppo. Il
# servizio si rifiutava di partire su un database appena migrato, l'accesso rimandava il
# browser su `localhost`, entrare con la password giusta riportava alla schermata di
# ingresso. Tre guasti che rendevano il prodotto inutilizzabile, tutti e tre invisibili a
# cinquecento collaudi verdi: in sviluppo si gira su PGlite, senza proxy inverso e con
# l'host che **è** davvero localhost.
#
# Questa rassegna gira contro l'istanza avviata, che è l'unico posto dove quei difetti
# esistono. Va eseguita dopo ogni messa in produzione, prima di dire che funziona.
#
# Senza `--a-pagamento` non spende un centesimo: si ferma prima di comprare dati. Con
# quell'opzione compra un'analisi (circa 10 centesimi) sulla partita IVA indicata e
# percorre anche il tratto che conta — analisi, dati d'intervista, report, portafoglio,
# esportazione.
#
set +e

# I messaggi di questi controlli non contengono apostrofi: dentro `${var:?messaggio}`
# un apostrofo apre una virgoletta che non si chiude, e lo script non parte affatto.
DOMINIO="${1:?serve il dominio}"
EMAIL="${2:?serve un indirizzo di posta}"
PASSWORD="${3:?serve la password}"
A_PAGAMENTO=""
[ "${4:-}" = "--a-pagamento" ] && A_PAGAMENTO="${5:?serve una partita IVA dopo --a-pagamento}"

SITO="https://$DOMINIO"
API="http://127.0.0.1:3001"
guasti=0

# Marcatori che tradiscono un errore anche dentro una risposta 200: una pagina può
# rispondere «riuscito» e mostrare il riquadro rosso di Next.
SPIE='Application error|client-side exception|Internal Server Error|Errore interno|andato storto'

TOK="$(curl -sS -D - -o /dev/null -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | grep -i '^set-cookie:' | sed -E 's/.*aegis_sessione=([^;]*).*/\1/' | tr -d '\r')"

[ -z "$TOK" ] && { echo "ACCESSO FALLITO — rassegna interrotta"; exit 1; }
echo "sessione ottenuta"

prova() {
  local base="$1" metodo="$2" percorso="$3" attesa="${4:-2xx}"
  local corpo=/tmp/rassegna-corpo cod
  cod="$(curl -sS -X "$metodo" -o "$corpo" -w '%{http_code}' --max-time 180 \
    -H "Cookie: aegis_sessione=$TOK" "$base$percorso" 2>/dev/null)"

  local ko=0 perche=
  case "$attesa" in
    2xx) [ "$cod" -ge 400 ] 2>/dev/null && { ko=1; perche="$(head -c 180 "$corpo" | tr -d '\n')"; } ;;
    4xx) [ "$cod" -lt 400 ] 2>/dev/null && { ko=1; perche="doveva essere rifiutata, ha risposto $cod"; } ;;
  esac
  [ "$ko" = 0 ] && grep -qiE "$SPIE" "$corpo" && { ko=1; perche="errore dentro una risposta $cod"; }

  if [ "$ko" = 0 ]; then printf '  %-4s %-52s %s\n' "$metodo" "$percorso" "$cod"
  else printf '  %-4s %-52s %s  <<< %s\n' "$metodo" "$percorso" "$cod" "$perche"; guasti=$((guasti+1)); fi
  rm -f "$corpo"
}
pagina() { prova "$SITO" GET "$1" "${2:-2xx}"; }
api()    { prova "$API" "${2:-GET}" "$1" "${3:-2xx}"; }

echo
echo "── Il rinvio resta sul dominio pubblico ───────────────────────────────"
# Il difetto che rendeva il prodotto irraggiungibile: un 307 verso `localhost:3000`.
# Nessun collaudo unitario può prenderlo — in sviluppo l'host è davvero localhost.
dove="$(curl -sS -o /dev/null -w '%{redirect_url}' "$SITO/")"
if printf %s "$dove" | grep -q "^https://$DOMINIO/accedi"; then
  echo "  / -> $dove"
else
  echo "  / -> ${dove:-(nessun rinvio)}  <<< deve puntare a https://$DOMINIO/accedi"
  guasti=$((guasti+1))
fi

echo
echo "── Pagine ─────────────────────────────────────────────────────────────"
for p in / /catalogo /portafoglio /portafoglio/importa /prospect /monitoraggio \
         /impostazioni /impostazioni/costi /impostazioni/compagnie \
         /impostazioni/servizi /impostazioni/studi /impostazioni/studio \
         /impostazioni/utenti; do pagina "$p"; done
pagina "/non-esiste" 4xx
pagina "/azienda/NONVALIDO"

echo
echo "── Filtri dei prospect: conteggio gratuito, nomi veri dei campi ───────"
api "/api/prospect?soloConteggio=1&provincia=BS&formaGiuridicaCodice=SR"
api "/api/prospect?soloConteggio=1&provincia=BS&formaGiuridicaCodice=SR&fatturatoMinEuro=5000000"
api "/api/prospect?soloConteggio=1&provincia=BS&formaGiuridicaCodice=SR&addettiMin=100"

echo
echo "── Input malformato: dev'essere RIFIUTATO, non ignorato ───────────────"
# Un filtro scartato in silenzio è peggio di un errore: il numero mostrato non
# corrisponde ai criteri, e su quel numero si decide se spendere.
api "/api/prospect?soloConteggio=1&provincia=BS&fatturatoMinEuro=abc" GET 4xx
api "/api/prospect?soloConteggio=1&provincia=XYZ" GET 4xx
api "/api/prospect?soloConteggio=1" GET 4xx

echo
echo "── API ────────────────────────────────────────────────────────────────"
for p in /health /api/auth/me /api/auth/stato /api/studio /api/servizi /api/utenti \
         /api/compagnie /api/costi /api/fornitura /api/studi /api/portafoglio \
         /api/catalogo/rischi /api/catalogo/coperture; do api "$p"; done

echo
echo "── La fonte dati è quella vera? ───────────────────────────────────────"
if curl -sS "$API/health" | grep -q '"datiReali":true'; then
  echo "  datiReali: true"
else
  echo "  <<< datiReali: false — le analisi sarebbero inventate"
  guasti=$((guasti+1))
fi

echo
echo "── Il monitoraggio dichiara di non consumare credito ──────────────────"
prima="$(curl -sS -H "Cookie: aegis_sessione=$TOK" "$API/api/costi" | grep -oE '"totaleEuro":[0-9.]+')"
api "/api/monitoraggio/esegui" POST
dopo="$(curl -sS -H "Cookie: aegis_sessione=$TOK" "$API/api/costi" | grep -oE '"totaleEuro":[0-9.]+')"
if [ "$prima" = "$dopo" ]; then echo "  registro invariato: $prima"
else echo "  <<< HA SPESO: $prima -> $dopo, e dichiara di non farlo"; guasti=$((guasti+1)); fi

if [ -n "$A_PAGAMENTO" ]; then
  echo
  echo "── Tratto a pagamento (circa 10 centesimi) ────────────────────────────"
  pagina "/azienda/$A_PAGAMENTO"
  pagina "/azienda/$A_PAGAMENTO/dati"
  pagina "/azienda/$A_PAGAMENTO/report"
  pagina "/portafoglio/esporta"

  echo
  echo "── Frasi che affermano accertamenti mai fatti ─────────────────────────"
  # È la specie di difetto ricomparsa sette volte in questo prodotto, e i due posti in cui
  # costa di più sono il report firmato dallo studio e il file che si rilegge fuori contesto.
  for dove in "/azienda/$A_PAGAMENTO/report" "/portafoglio/esporta"; do
    testo="$(curl -sS -H "Cookie: aegis_sessione=$TOK" "$SITO$dove")"
    for frase in "non risulta averlo adempiuto" "da sanare" "Copertura assente" "Non conformi CAT NAT"; do
      if printf %s "$testo" | grep -qiF "$frase"; then
        echo "  <<< «$frase» in $dove"; guasti=$((guasti+1))
      fi
    done
  done
  echo "  controllate 4 frasi su 2 documenti"

  echo
  echo "── Rileggere non deve ricomprare ──────────────────────────────────────"
  a="$(curl -sS -H "Cookie: aegis_sessione=$TOK" "$API/api/costi" | grep -oE '"totaleEuro":[0-9.]+')"
  curl -sS -o /dev/null -H "Cookie: aegis_sessione=$TOK" "$SITO/azienda/$A_PAGAMENTO"
  b="$(curl -sS -H "Cookie: aegis_sessione=$TOK" "$API/api/costi" | grep -oE '"totaleEuro":[0-9.]+')"
  if [ "$a" = "$b" ]; then echo "  seconda lettura gratuita: $a"
  else echo "  <<< la rilettura ha ricomprato: $a -> $b"; guasti=$((guasti+1)); fi
fi

echo
echo "── Speso durante la rassegna ──────────────────────────────────────────"
curl -sS -H "Cookie: aegis_sessione=$TOK" "$API/api/costi" \
  | grep -oE '"totaleEuro":[0-9.]+|"risparmioDaCacheEuro":[0-9.]+' | sed 's/^/  /'

echo
echo "───────────────────────────────────────────────────────────────────────"
[ "$guasti" -eq 0 ] && echo "  Nessun guasto." || echo "  GUASTI: $guasti"
exit "$guasti"
