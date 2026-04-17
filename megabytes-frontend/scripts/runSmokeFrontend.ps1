$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$port = 19007
$url = "http://127.0.0.1:$port"

Write-Host "[smoke] Starting Expo web server on port $port..."
$expoProc = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/d /s /c npx expo start --web --port $port --non-interactive" `
  -WorkingDirectory $projectRoot `
  -PassThru `
  -WindowStyle Hidden

function Wait-ServerReady([string]$TargetUrl, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec 4 | Out-Null
      return $true
    } catch {
      Start-Sleep -Milliseconds 700
    }
  }
  return $false
}

try {
  if (-not (Wait-ServerReady -TargetUrl $url -TimeoutSeconds 300)) {
    throw "Timed out waiting for Expo web server at $url"
  }

  Write-Host "[smoke] Expo web is reachable. Running UI smoke..."
  & node "$scriptDir\smokeFrontend.js"
  $nodeExit = $LASTEXITCODE
} finally {
  if ($expoProc -and -not $expoProc.HasExited) {
    Write-Host "[smoke] Stopping Expo server..."
    cmd.exe /c "taskkill /PID $($expoProc.Id) /T /F" | Out-Null
  }
}

exit $nodeExit
