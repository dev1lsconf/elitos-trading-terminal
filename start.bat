@echo off
REM start.bat - Inicia el servidor backend Flask y el frontend Vite (Windows)

echo 🚀 Iniciando Elitos Trading Terminal...

set BASE_DIR=%~dp0
set BACKEND_DIR=%BASE_DIR%backend

REM 1. Verificar/crear venv de Python
if not exist "%BACKEND_DIR%\venv" (
    echo 📦 Creando entorno virtual Python...
    python -m venv "%BACKEND_DIR%\venv"
)

REM 2. Activar venv e instalar dependencias
echo 📦 Instalando dependencias Python...
call "%BACKEND_DIR%\venv\Scripts\activate.bat"
"%BACKEND_DIR%\venv\Scripts\python.exe" -m pip install -q -r "%BACKEND_DIR%\requirements.txt"

REM 3. Instalar dependencias Node si no existen
if not exist "%BASE_DIR%\node_modules" (
    echo 📦 Instalando dependencias Node...
    cd /d "%BASE_DIR%"
    npm install
)

REM 4. Iniciar backend Flask en background
echo 🔧 Iniciando backend Flask en localhost:5000...
cd /d "%BACKEND_DIR%"
start /b "%BACKEND_DIR%\venv\Scripts\python.exe" app.py

REM 5. Esperar a que Flask esté listo
echo ⏳ Esperando a que Flask esté listo...
for /l %%i in (1,1,30) do (
    curl -s http://localhost:5000/api/market-status >nul 2>&1
    if not errorlevel 1 (
        echo ✅ Backend listo
        goto :backend_ready
    )
    timeout /t 1 /nobreak >nul
)
:backend_ready

REM 6. Iniciar frontend Vite
echo 🌐 Iniciando frontend Vite...
cd /d "%BASE_DIR%"
start /b npm run dev -- --host

echo.
echo ✨ Elitos Trading Terminal corriendo!
echo    Frontend: http://localhost:5001
echo    Backend:  http://localhost:5000
echo.
echo Presiona Ctrl+C para detener (cierras esta ventana para detener todo)

REM Mantener ventana abierta
pause