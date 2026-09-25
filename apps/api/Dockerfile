FROM python:3.11-slim
WORKDIR /app
COPY requirements.lock.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY . .
RUN useradd --system fleet && mkdir -p /app/staticfiles && chown -R fleet /app
USER fleet
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2"]
