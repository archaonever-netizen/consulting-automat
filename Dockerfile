FROM python:3.12-slim

WORKDIR /app

# Зависимости бэкенда (FastAPI + LangChain/LangGraph + uvicorn)
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Код бэкенда и собранный фронтенд (frontend/dist закоммичен в репо)
COPY backend backend
COPY frontend/dist frontend/dist

# Персистентная БД на томе Amvera (/data). 4 слэша = абсолютный путь.
RUN mkdir -p /data
ENV DATABASE_URL=sqlite+aiosqlite:////data/app.db
ENV PORT=80
EXPOSE 80

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-80}"]
