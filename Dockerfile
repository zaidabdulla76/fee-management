# Hugging Face Spaces / any host that expects a repo-root Dockerfile.
# Same image as backend/Dockerfile. Listens on PORT (HF default 7860).
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/entrypoint.py .

ENV PYTHONUNBUFFERED=1
ENV PORT=7860
ENV WEB_CONCURRENCY=1
EXPOSE 7860
CMD ["python", "entrypoint.py"]
