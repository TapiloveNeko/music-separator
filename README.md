# 曲から楽器を切り離す - Music Separator App

AI搭載のアルゴリズムで音楽を分割して表示するWebアプリケーションです。

## 🎯 機能

- 🎵 **音楽ファイルのアップロード**: MP3、WAV、FLAC、M4A、OGG形式に対応
- 🤖 **AI楽器分離**: Demucsを使用した高品質な楽器分離
- 📊 **リアルタイム波形表示**: 各トラックの波形をリアルタイム表示
- 🔊 **ボリューム制御**: 各トラックの個別ボリューム調整
- ▶️ **再生制御**: 再生・停止・シーク機能
- 📤 **エクスポート**: 分離されたトラックの個別ダウンロード
- 🎨 **美しいUI**: React + TypeScript + Styled Components
- 📱 **レスポンシブデザイン**: モバイル対応

## 🏗️ アーキテクチャ
```
music-separator/
├── frontend/                 # React + TypeScript フロントエンド
│   ├── src/
│   └── package.json
├── backend/                  # Python + FastAPI バックエンド
│   ├── app/
│   └── requirements.txt
└── README.md
```

---

# 🚀 ローカル開発環境のセットアップ

## ローカル起動（ネイティブ）
前提: Node.js(18+), Yarn, Python(3.10〜3.11推奨), FFmpeg が利用可能

詳細な手順は各ディレクトリのREADMEを参照してください：

- **バックエンド**: [`backend/README.md`](backend/README.md) を参照
- **フロントエンド**: [`frontend/README.md`](frontend/README.md) を参照

### 簡易起動手順

1) バックエンド起動
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 7860 --reload
```

2) フロントエンド起動（別ターミナル）
```bash
cd frontend
yarn install
yarn start
```

アクセス: http://localhost:3000

## 動作確認フロー
1) フロントにアクセス → mp3をアップロード
2) 進捗表示 → 完了後、6トラック（vocals, drums, bass, guitar, piano, other）が表示
3) 「保存」で各トラックのwavをダウンロード可能

## トラブルシューティング（共通）

詳細なトラブルシューティングは各ディレクトリのREADMEを参照：
- **バックエンド**: [`backend/README.md`](backend/README.md) の「トラブルシューティング」セクション
- **フロントエンド**: [`frontend/README.md`](frontend/README.md) の「トラブルシューティング」セクション

### よくある問題

- **アップロードで `Network Error`**
  - バックエンドが起動しているか確認: `http://localhost:7860/health`
  - フロント設定 `BASE_URL` が `http://localhost:7860` か

- **ポート競合**
  - 3000/7860 を占有している別プロセスを停止

- **完全にリセットしたい**
  - バックエンド/フロントエンドともに依存を再インストールし、各 README の手順に従う

---

# 🌐 本番環境へのデプロイ

このアプリケーションは、フロントエンドとバックエンドを別々にデプロイする構成です。

## デプロイ構成
```
静的サイトホスティング（フロントエンド）
例: GitHub Pages, Netlify, Vercel, Xserver等
         ↓ APIリクエスト
コンテナ/VPSホスティング（バックエンド）
例: Hugging Face Spaces, Render, Railway, AWS, Xserver VPS等
```

## デプロイ手順

### 1. バックエンドのデプロイ

バックエンドをお好みのサービスにデプロイします。

詳細は **[`backend/README.md`](backend/README.md)** を参照してください。

### 2. フロントエンドのデプロイ

フロントエンドをお好みの静的サイトホスティングにデプロイします。

詳細は **[`frontend/README.md`](frontend/README.md)** を参照してください。

---

## 🛠️ 技術スタック

**フロントエンド**: React 18 / TypeScript / Styled Components / Axios

**バックエンド**: Python 3.9+ / Flask / Demucs / Librosa / PyTorch

**インフラ**: 任意（ローカル開発はネイティブ実行前提）

---

## 📡 API エンドポイント

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| POST | `/upload` | 音声ファイルをアップロード（非同期処理開始） |
| GET | `/status/{job_id}` | 処理状況を取得 |
| GET | `/download/{job_id}/{track}` | 分離されたトラックをダウンロード |
| GET | `/health` | ヘルスチェック |

---

不明点があれば、このREADMEの手順番号と現在の状況（コマンド結果/ログ）を教えてください。