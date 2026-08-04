# --------------------------------------------------------------------------
# Ajay AI Assistant — backend container
# Works on Render, Railway, Fly.io, Google Cloud Run, or any Docker host.
#
#   docker build -t ajay-api ./backend
#   docker run -p 8000:8000 -e JWT_SECRET=change-me ajay-api
# --------------------------------------------------------------------------
FROM python:3.12-slim

# Don't buffer stdout (so logs show up live) and don't write .pyc files.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first so Docker caches this layer between code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code.
COPY app ./app

# SQLite lives here. Mount a volume/disk at /app/data to make it survive
# restarts — most free tiers use an ephemeral filesystem otherwise.
RUN mkdir -p /app/data
ENV DB_PATH=/app/data/ajay.db

# Most PaaS providers inject $PORT; default to 8000 for plain `docker run`.
ENV PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",8000)}/api/health').read()" || exit 1

# Shell form so ${PORT} is expanded at runtime.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
