FROM python:3.12-slim

WORKDIR /app
COPY sweep.py /app/sweep.py
ENV PYTHONUNBUFFERED=1
CMD ["python", "-u", "/app/sweep.py"]
