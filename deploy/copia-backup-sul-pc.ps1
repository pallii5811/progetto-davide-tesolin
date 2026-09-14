# Copia sul PC di Simone i backup notturni del database AEGIS, fuori dal server.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\copia-backup-sul-pc.ps1
#
# Gira ogni ora da un'attivita' pianificata di Windows ("AEGIS - copia backup"), e a ogni
# accesso. Decisione di Simone del 14/09/2026: la copia fuori dalla macchina va sul suo PC.
#
# PERCHE'. Il server fa un pg_dump ogni notte alle 03:15 (deploy/backup-notturno.sh), ma lo
# tiene sullo stesso disco: se Hetzner blocca la macchina, come OVH ha fatto il 12/09/2026, i
# dati dei clienti e le loro copie se ne vanno insieme.
#
# COSA FA, e cosa garantisce:
#  - chiede al server l'elenco dei dump con la loro impronta SHA-256;
#  - scarica solo quelli che sul PC mancano, prima con un nome provvisorio;
#  - li rinomina SOLO se l'impronta del file scaricato e' uguale a quella del server: una
#    copia a meta' non deve mai avere il nome di un backup;
#  - tiene gli ultimi 90 (il server ne tiene 14);
#  - se l'ultimo dump sul PC ha piu' di 48 ore scrive ATTENZIONE-BACKUP-VECCHIO.txt nella
#    cartella: il PC spento per giorni, o il server che non risponde, si vedono li'.
#
# Il file resta leggibile solo dall'utente di Windows: contiene i dati dei clienti dello studio.
# Il ripristino si fa sul server, con la procedura in testa a deploy/backup-notturno.sh.
#
# Solo caratteri ASCII in questo file: PowerShell 5.1 legge senza BOM nella codifica di sistema.

$ErrorActionPreference = 'Continue'

$Server = 'root@178.105.18.211'
$Remota = '/opt/aegis/backups'
$Locale = Join-Path $env:USERPROFILE 'Backup-AEGIS'
$Conserva = 90
$OreMassime = 48
$Ssh = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
$Scp = Join-Path $env:WINDIR 'System32\OpenSSH\scp.exe'
$Opzioni = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20')
$Registro = Join-Path $Locale 'copia.log'
$Allarme = Join-Path $Locale 'ATTENZIONE-BACKUP-VECCHIO.txt'

function Scrivi([string] $testo) {
  $riga = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $testo
  Add-Content -Path $Registro -Value $riga -Encoding UTF8
  Write-Output $riga
}

if (-not (Test-Path $Locale)) {
  New-Item -ItemType Directory -Path $Locale | Out-Null
  # Solo l'utente corrente: niente permessi ereditati dalla cartella del profilo.
  # Per SID, non per nome: su questo PC il computer si chiama SIMONE come l'utente, e
  # "Simone:(OI)(CI)F" dava il permesso al computer, togliendolo all'utente (14/09/2026).
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $Locale /inheritance:r /grant:r "*${sid}:(OI)(CI)F" | Out-Null
}

$copiati = 0
$errore = $null

$elenco = & $Ssh @Opzioni $Server "cd $Remota && sha256sum aegis-*.dump"
if ($LASTEXITCODE -ne 0) {
  $errore = "il server non risponde (ssh uscito con $LASTEXITCODE)"
} else {
  foreach ($riga in $elenco) {
    if ($riga -notmatch '^([0-9a-f]{64})\s+\*?(aegis-\d{8}-\d{4}\.dump)$') { continue }
    $impronta = $Matches[1]
    $nome = $Matches[2]
    $destinazione = Join-Path $Locale $nome

    if (Test-Path $destinazione) {
      if ((Get-FileHash -Algorithm SHA256 $destinazione).Hash.ToLower() -eq $impronta) { continue }
      Scrivi "ATTENZIONE: $nome sul PC e' diverso da quello del server, lo riscarico"
    }

    $provvisorio = "$destinazione.parziale"
    & $Scp @Opzioni -q "${Server}:$Remota/$nome" $provvisorio
    if ($LASTEXITCODE -ne 0) {
      Remove-Item $provvisorio -Force -ErrorAction SilentlyContinue
      $errore = "scp di $nome uscito con $LASTEXITCODE"
      break
    }
    if ((Get-FileHash -Algorithm SHA256 $provvisorio).Hash.ToLower() -ne $impronta) {
      Remove-Item $provvisorio -Force
      $errore = "l'impronta di $nome scaricato non e' quella del server: copia scartata"
      break
    }
    Move-Item -Force $provvisorio $destinazione
    $copiati++
    Scrivi ("copiato {0}, {1} byte, impronta uguale al server" -f $nome, (Get-Item $destinazione).Length)
  }
}

# Rotazione: gli ultimi 90, per nome (che e' per data).
$tutti = @(Get-ChildItem $Locale -Filter 'aegis-*.dump' | Sort-Object Name)
if ($tutti.Count -gt $Conserva) {
  $tutti | Select-Object -First ($tutti.Count - $Conserva) | Remove-Item -Force
  $tutti = @(Get-ChildItem $Locale -Filter 'aegis-*.dump' | Sort-Object Name)
}

# L'eta' dell'ultima copia si legge dal nome: aegis-AAAAMMGG-HHMM.dump.
$ultimo = $tutti | Select-Object -Last 1
$vecchio = $true
if ($null -ne $ultimo -and $ultimo.Name -match '^aegis-(\d{8}-\d{4})\.dump$') {
  $quando = [datetime]::ParseExact($Matches[1], 'yyyyMMdd-HHmm', $null)
  $vecchio = ((Get-Date) - $quando).TotalHours -gt $OreMassime
}
if ($vecchio) {
  $nomeUltimo = if ($null -eq $ultimo) { 'nessuno' } else { $ultimo.Name }
  Set-Content -Path $Allarme -Encoding UTF8 -Value @(
    "L'ultimo backup AEGIS sul PC e' ${nomeUltimo}, piu' vecchio di $OreMassime ore.",
    "Controllare che il PC sia acceso e connesso, e il registro copia.log in questa cartella."
  )
} elseif (Test-Path $Allarme) {
  Remove-Item $Allarme -Force
}

if ($null -ne $errore) {
  Scrivi "ERRORE: $errore"
  exit 1
}
Scrivi ("fatto: {0} nuovi, {1} conservati, ultimo {2}" -f $copiati, $tutti.Count, $ultimo.Name)
exit 0
