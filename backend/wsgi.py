"""WSGI entrypoint para Gunicorn en producción (Render, Railway, Fly.io)."""
import os
import sys
from pathlib import Path

# Asegurar que backend/ esté en sys.path para imports
sys.path.insert(0, str(Path(__file__).parent))

from app import app

if __name__ == "__main__":
    # Permitir override del puerto via env (Render inyecta PORT)
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
