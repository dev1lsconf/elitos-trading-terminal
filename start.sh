#!/bin/bash
# start.sh - Inicia el servidor backend Flask y el frontend Vite

set -e

echo "🚀 Iniciando Elitos Trading Terminal..."

# Directorio base
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$BASE_DIR/backend"

# 1. Verificar/crear venv de Python
if [ ! -d "$BACKEND_DIR/venv" ]; then
    echo "📦 Creando entorno virtual Python..."
    python3 -m venv "$BACKEND_DIR/venv"
fi

# 2. Activar venv e instalar dependencias
echo "📦 Instalando dependencias Python..."
source "$BACKEND_DIR/venv/bin/activate"
pip install -q -r "$BACKEND_DIR/requirements.txt"

# 3. Instalar dependencias Node si no existen
if [ ! -d "$BASE_DIR/node_modules" ]; then
    echo "📦 Instalando dependencias Node..."
    cd "$BASE_DIR" && npm install
fi

# 4. Iniciar backend Flask en background
echo "🔧 Iniciando backend Flask en localhost:5000..."
cd "$BACKEND_DIR"
source venv/bin/activate
python app.py &
FLASK_PID=$!
echo "   Flask PID: $FLASK_PID"

# 5. Esperar a que Flask esté listo
echo "⏳ Esperando a que Flask esté listo..."
for i in {1..30}; do
    if curl -s http://localhost:5000/api/market-status > /dev/null 2>&1; then
        echo "✅ Backend listo"
        break
    fi
    sleep 1
done

# 6. Iniciar frontend Vite
echo "🌐 Iniciando frontend Vite..."
cd "$BASE_DIR"
npm run dev -- --host &
VITE_PID=$!
echo "   Vite PID: $VITE_PID"

# 7. Manejo de señales para cleanup
cleanup() {
    echo ""
    echo "🛑 Deteniendo servicios..."
    kill $FLASK_PID $VITE_PID 2>/dev/null || true
    wait $FLASK_PID $VITE_PID 2>/dev/null || true
    echo "✅ Servicios detenidos"
    exit 0
}
trap cleanup SIGINT SIGTERM

echo ""
echo "✨ Elitos Trading Terminal corriendo!"
echo "   Frontend: http://localhost:5001"
echo "   Backend:  http://localhost:5000"
echo ""
echo "Presiona Ctrl+C para detener"

# Mantener script vivo
wait $FLASK_PID $VITE_PID