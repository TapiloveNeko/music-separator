FROM python:3.10-slim

# FFmpegをインストール（pydubでMP3/FLAC/M4A/OGG/MP4を処理するために必要）
# ffmpegパッケージにはffprobeも含まれているため、これで両方インストールされます
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依存関係をインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションコードをコピー
COPY app/ ./app/

# ポート7860を公開
EXPOSE 7860

# アプリケーションを起動
CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "app.main:app", "--bind", "0.0.0.0:7860"]