# Open Notebook - From Zero Startup Script
# Run this on any Windows machine to start Open Notebook via Docker
#
# Prerequisites: Docker Desktop installed and running
# Usage: .\scripts\start-open-notebook.ps1
#        .\scripts\start-open-notebook.ps1 -BuildFromSource   # Build image from local code
#        .\scripts\start-open-notebook.ps1 -OpenBrowser      # Also open browser when ready

param(
    [switch]$BuildFromSource,  # Build from local source instead of pulling pre-built image
    [switch]$OpenBrowser      # Open http://localhost:8502 in default browser when ready
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
Set-Location $projectRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Open Notebook - From Zero Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Docker
Write-Host "[1/5] Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Docker not running" }
    Write-Host "  OK: Docker is installed and running" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Docker is required but not found or not running." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Install Docker Desktop: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    Write-Host "  After installing, start Docker Desktop and run this script again." -ForegroundColor Yellow
    exit 1
}

# Step 2: Ensure encryption key
Write-Host ""
Write-Host "[2/5] Checking encryption key..." -ForegroundColor Yellow
$envFile = Join-Path $projectRoot ".env"
$needKey = $false
if (-not (Test-Path $envFile)) {
    $needKey = $true
} else {
    $envContent = Get-Content $envFile -Raw -ErrorAction SilentlyContinue
    if ($envContent -notmatch "OPEN_NOTEBOOK_ENCRYPTION_KEY=.+" -or $envContent -match "change-me-to-a-secret-string") {
        $needKey = $true
    }
}
if ($needKey) {
    $secret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
    if (-not (Test-Path $envFile)) {
        @("OPEN_NOTEBOOK_ENCRYPTION_KEY=$secret") | Set-Content $envFile -Encoding UTF8
    } else {
        $lines = Get-Content $envFile
        $updated = $lines | ForEach-Object {
            if ($_ -match "^OPEN_NOTEBOOK_ENCRYPTION_KEY=") { "OPEN_NOTEBOOK_ENCRYPTION_KEY=$secret" }
            else { $_ }
        }
        if ($updated -notmatch "OPEN_NOTEBOOK_ENCRYPTION_KEY") {
            $updated += "OPEN_NOTEBOOK_ENCRYPTION_KEY=$secret"
        }
        $updated | Set-Content $envFile -Encoding UTF8
    }
    Write-Host "  OK: Generated and saved encryption key to .env" -ForegroundColor Green
} else {
    Write-Host "  OK: Encryption key already configured" -ForegroundColor Green
}

# Step 3: Create data directories
Write-Host ""
Write-Host "[3/5] Creating data directories..." -ForegroundColor Yellow
$dirs = @("surreal_data", "notebook_data")
foreach ($d in $dirs) {
    $path = Join-Path $projectRoot $d
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Write-Host "  Created: $d" -ForegroundColor Gray
    }
}
Write-Host "  OK: Directories ready" -ForegroundColor Green

# Step 4: Start Docker
Write-Host ""
Write-Host "[4/5] Starting Open Notebook..." -ForegroundColor Yellow
if ($BuildFromSource) {
    Write-Host "  Building from source (this may take 2-5 minutes)..." -ForegroundColor Gray
    docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build 2>&1
} else {
    Write-Host "  Using pre-built image from Docker Hub..." -ForegroundColor Gray
    docker compose -f docker-compose.standalone.yml up -d 2>&1
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Docker compose failed" -ForegroundColor Red
    exit 1
}
Write-Host "  OK: Containers started" -ForegroundColor Green

# Step 5: Wait for readiness
Write-Host ""
Write-Host "[5/5] Waiting for services (about 20 seconds)..." -ForegroundColor Yellow
$maxWait = 60
$waited = 0
$ready = $false
while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 3
    $waited += 3
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:5055/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($r.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {}
    Write-Host "  ... $waited s" -ForegroundColor Gray
}
if (-not $ready) {
    Write-Host "  WARN: API not ready yet. Try opening http://localhost:8502 in a minute." -ForegroundColor Yellow
} else {
    Write-Host "  OK: Open Notebook is ready!" -ForegroundColor Green
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Open Notebook is running" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Web UI:   http://localhost:8502" -ForegroundColor Cyan
Write-Host "  API:      http://localhost:5055" -ForegroundColor Cyan
Write-Host "  API Docs: http://localhost:5055/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Configure AI: Settings -> API Keys -> Add Credential" -ForegroundColor Gray
Write-Host "  Stop: docker compose -f docker-compose.standalone.yml down" -ForegroundColor Gray
if ($BuildFromSource) {
    Write-Host "  Stop: docker compose -f docker-compose.yml -f docker-compose.build.yml down" -ForegroundColor Gray
}
Write-Host ""

if ($OpenBrowser -and $ready) {
    Start-Process "http://localhost:8502"
    Write-Host "  Opened browser." -ForegroundColor Green
}
