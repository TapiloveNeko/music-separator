#!/bin/bash

echo "🎵 Sound Extraction App を起動中..."

# バックエンドの起動
echo "AIバックエンドサーバーを起動中..."
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py &
BACKEND_PID=$!
cd ..

# 少し待つ
sleep 3

# フロントエンドの起動
echo "Reactフロントエンドサーバーを起動中..."
cd frontend
npm install
npm start &
FRONTEND_PID=$!
cd ..

echo "✅ アプリケーションが起動しました！"
echo "🌐 フロントエンド: http://localhost:3000"
echo "🔧 バックエンドAPI: http://localhost:7860"
echo ""
echo "終了するには Ctrl+C を押してください"

# 終了時のクリーンアップ
cleanup() {
    echo "アプリケーションを終了中..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM

# プロセスを待機
wait