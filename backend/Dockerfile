FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Flaskのデフォルトポート5000を公開
EXPOSE 5000

# 環境変数でポート5000を指定
ENV PORT=5000

# Run the application
CMD ["python", "app.py"]