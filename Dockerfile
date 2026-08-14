# Multi-stage Dockerfile para Elitos Trading Terminal
# Build: docker build -t elitos-trading-terminal .
# Run: docker run -p 5000:5000 -e FLASK_ENV=production elitos-trading-terminal

# ============================================================
# Stage 1: Build Frontend (Node)
# ============================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copiar package files primero (cache de capas)
COPY package*.json ./
RUN npm ci

# Copiar resto del frontend y buildear
COPY src/ ./src/
COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig*.json ./
COPY tailwind.config.* ./
RUN npm run build

# ============================================================
# Stage 2: Python Runtime + Frontend estático
# ============================================================
FROM python:3.11-slim

# Variables de entorno
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    FLASK_ENV=production \
    PORT=5000

# Instalar dependencias del sistema (para pandas/numpy/yfinance)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar requirements e instalar deps Python
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copiar backend
COPY backend/ ./backend/

# Copiar build del frontend desde stage anterior
COPY --from=frontend-builder /app/dist ./dist

# Usuario no-root para seguridad
RUN useradd --create-home --shell /bin/bash app \
    && chown -R app:app /app
USER app

EXPOSE 5000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/api/market-status', timeout=3)" || exit 1

# Comando de inicio - Gunicorn para producción
CMD ["gunicorn", "backend.wsgi:app", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120"]