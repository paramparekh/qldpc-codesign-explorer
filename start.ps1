param([switch]$Install, [switch]$NoOpen)

$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$backendPath = Join-Path $projectPath 'backend'
$frontendPath = Join-Path $projectPath 'frontend'
$pythonPath = Join-Path $backendPath '.venv/Scripts/python.exe'
$logPath = Join-Path $projectPath 'tmp/run-logs'

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 or newer first.' }
if (-not (Test-Path -LiteralPath $pythonPath)) {
    Push-Location $backendPath
    try {
        python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python environment. Install Python 3.11 or newer.' }
    } finally { Pop-Location }
    $Install = $true
}

if ($Install) {
    Push-Location $backendPath
    try {
        & $pythonPath -m pip install -e '.[dev]'
        if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
    } finally { Pop-Location }
}
if ($Install -or -not (Test-Path -LiteralPath (Join-Path $frontendPath 'node_modules/.bin/vite.cmd'))) {
    Push-Location $frontendPath
    try {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    } finally { Pop-Location }
}

New-Item -ItemType Directory -Force -Path $logPath | Out-Null

function Get-LocalResponse([string]$Url) {
    try { return Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 } catch { return $null }
}

function Wait-ForService([string]$Url, $Process, [string]$ErrorLog) {
    $deadline = (Get-Date).AddSeconds(45)
    do {
        $Process.Refresh()
        if ($Process.HasExited) { throw "Service stopped. Check $ErrorLog" }
        $response = Get-LocalResponse $Url
        if ($response -and $response.StatusCode -eq 200) { return $response }
        Start-Sleep -Milliseconds 300
    } while ((Get-Date) -lt $deadline)
    throw "Service did not become ready. Check $ErrorLog"
}

$backendResponse = Get-LocalResponse 'http://127.0.0.1:8000/api/system/status'
if (-not $backendResponse) {
    $backendProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logPath 'backend.stdout.log') -RedirectStandardError (Join-Path $logPath 'backend.stderr.log')
    $backendResponse = Wait-ForService 'http://127.0.0.1:8000/api/system/status' $backendProcess (Join-Path $logPath 'backend.stderr.log')
}
$status = $backendResponse.Content | ConvertFrom-Json
if ($status.service -ne 'qldpc-codesign-explorer-api') { throw 'Port 8000 belongs to another application.' }
$decoderResponse = Get-LocalResponse 'http://127.0.0.1:8000/api/decoders'
if (-not $decoderResponse -or -not (($decoderResponse.Content | ConvertFrom-Json).id -contains 'bp-osd-css-v1')) {
    throw 'An older backend is running on port 8000. Stop that backend and run this script again.'
}

$frontendResponse = Get-LocalResponse 'http://127.0.0.1:5173'
if (-not $frontendResponse) {
    $frontendProcess = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1') -WorkingDirectory $frontendPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logPath 'frontend.stdout.log') -RedirectStandardError (Join-Path $logPath 'frontend.stderr.log')
    $frontendResponse = Wait-ForService 'http://127.0.0.1:5173' $frontendProcess (Join-Path $logPath 'frontend.stderr.log')
}
if ($frontendResponse.Content -notmatch 'qLDPC CoDesign Explorer') { throw 'Port 5173 belongs to another application.' }

Write-Output 'qLDPC CoDesign Explorer is ready at http://127.0.0.1:5173'
Write-Output "Service logs: $logPath"
if (-not $NoOpen) { Start-Process 'http://127.0.0.1:5173' }
