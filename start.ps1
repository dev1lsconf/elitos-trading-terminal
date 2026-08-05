<#
.SYNOPSIS
    Inicia el servidor backend Flask y el frontend Vite para Elitos Trading Terminal
#>

Write-Host "🚀 Iniciando Elitos Trading Terminal..." -ForegroundColor Green

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BackendDir = Join-Path $BaseDir "backend"

# 1. Verificar/crear venv de Python
if (-not (Test-Path (Join-Path $BackendDir "venv"))) {
    Write-Host "📦 Creando entorno virtual Python..." -ForegroundColor Yellow
    python -m venv (Join-Path $BackendDir "venv")
}

# 2. Activar venv e instalar dependencias
Write-Host "📦 Instalando dependencias Python..." -ForegroundColor Yellow
& (Join-Path $BackendDir "venv\Scripts\Activate.ps1")
& (Join-Path $BackendDir "venv\Scripts\python.exe") -m pip install -q -r (Join-Path $BackendDir "requirements.txt")

# 3. Instalar dependencias Node si no existen
if (-not (Test-Path (Join-Path $BaseDir "node_modules"))) {
    Write-Host "📦 Instalando dependencias Node..." -ForegroundColor Yellow
    Set-Location $BaseDir
    npm install
}

# 4. Iniciar backend Flask en background
Write-Host "🔧 Iniciando backend Flask en localhost:5000..." -ForegroundColor Yellow
Set-Location $BackendDir
$flaskProcess = Start-Process -FilePath (Join-Path $BackendDir "venv\Scripts\python.exe") -ArgumentList "app.py" -PassThru
Write-Host "   Flask PID: $($flaskProcess.Id)"

# 5. Esperar a que Flask esté listo
Write-Host "⏳ Esperando a que Flask esté listo..." -ForegroundColor Yellow
for ($i = 1; $i -le 30; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5000/api/market-status" -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Backend listo" -ForegroundColor Green
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}

# 6. Iniciar frontend Vite
Write-Host "🌐 Iniciando frontend Vite..." -ForegroundColor Yellow
Set-Location $BaseDir
$viteProcess = Start-Process -FilePath "npm" -ArgumentList "run dev -- --host" -PassThru
Write-Host "   Vite PID: $($viteProcess.Id)"

Write-Host ""
Write-Host "✨ Elitos Trading Terminal corriendo!" -ForegroundColor Green
Write-Host "   Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "   Backend:  http://localhost:5000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Presiona Ctrl+C para detener" -ForegroundColor Yellow

# Mantener script vivo y manejar cleanup
try {
    Wait-Process -Id $flaskProcess.Id, $viteProcess.Id -ErrorAction SilentlyContinue
} catch {
    Write-Host "`n🛑 Deteniendo servicios..." -ForegroundColor Red
    Stop-Process -Id $flaskProcess.Id, $viteProcess.Id -Force -ErrorAction SilentlyContinue
    Write-Host "✅ Servicios detenidos" -ForegroundColor Green
}