# 曲から楽器を切り離す - Sound Extraction App

AI搭載のアルゴリズムで音楽を分割して表示するWebアプリケーションです。

## 🎯 機能

- 🎵 **音楽ファイルのアップロード**: MP3、WAV、FLAC、M4A、OGG形式に対応
- 🤖 **AI楽器分離**: 現状はモック分離（軽量）。本番AI(Spleeter/Demucs)は後日差し替え可能
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
├── backend/                  # Python + Flask バックエンド（モック分離）
│   ├── app.py
│   └── requirements.txt
├── docker-compose.yml        # Compose (frontend/backend/nginx)
├── nginx.conf                # 逆プロキシ（ポート8080）
└── README.md
```

---

# 🚀 新しいPCへの持ち込みとセットアップ手順
別PCに `music-separator` フォルダをコピーした前提で、以下のどちらかを実施してください。

## 方法A（おすすめ）: Docker Compose で起動
前提: Docker Desktop がインストール済みで CLI が使えること（`docker --version`, `docker compose version` で確認）

1) ルートへ移動
```bash
cd path/to/your/project/music-separator
```

2) 起動
```bash
docker compose up --build -d
```

3) 起動確認
```bash
docker compose ps
```

4) アクセス
- フロント: http://localhost:3000
- バックエンド: http://localhost:5000/health （{"status":"healthy"}）
- 逆プロキシ: http://localhost:8080 （nginx経由。不要なら無視）

5) よくあるエラー
- ポート80衝突 → `nginx` は 8080 に公開済。`http://localhost:8080` を使用
- すべて作り直したい
```bash
docker compose down -v
docker compose up --build -d
```

6) 停止
```bash
docker compose down
```

## 方法B: ネイティブ（yarn + Python）で起動
前提: Node.js(18+), Yarn, Python(3.10〜3.11推奨), FFmpeg が利用可能

詳細な手順は各ディレクトリのREADMEを参照してください：

- **バックエンド**: `backend/README.md` を参照
- **フロントエンド**: `frontend/README.md` を参照

### 簡易起動手順

1) バックエンド起動
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py
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
2) 進捗表示 → 完了後、4トラック（音楽/ボーカル/ベース/ドラム）が表示
3) 「保存」で各トラックのwavをダウンロード可能

## トラブルシューティング（共通）

詳細なトラブルシューティングは各ディレクトリのREADMEを参照：
- **バックエンド**: `backend/README.md` の「トラブルシューティング」セクション
- **フロントエンド**: `frontend/README.md` の「トラブルシューティング」セクション

### よくある問題

- **アップロードで `Network Error`**
  - バックエンドが起動しているか確認: `http://localhost:5000/health`
  - コンテナ状態確認: `docker compose ps`
  - フロント設定 `BASE_URL` が `http://localhost:5000` か

- **ポート競合**
  - 3000/5000/8080 を占有している別プロセスを停止
  - Docker: `docker compose down` → `up -d`

- **完全にリセットしたい**
  - Docker: `docker compose down -v && docker compose up --build -d`
  - ネイティブ: 各ディレクトリのREADMEを参照

## 備考
- 現在は「モック分離」を採用しているためGPU/TensorFlow不要で軽量に動作します。
- 本格的なAI分離（Spleeter/Demucs）に切り替える際は、`backend/requirements.txt` と `backend/app.py` の分離ロジックを差し替えて再ビルドしてください。

---

## 🛠️ 技術スタック
フロント: React 18 / TypeScript / Styled Components / Axios

バックエンド: Python 3.9+ / Flask / Librosa / Pydub（モック分離）

インフラ: Docker / Docker Compose / Nginx

---

## 📡 API エンドポイント
| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| POST | `/upload` | 音声ファイルをアップロード（非同期処理開始） |
| GET | `/status/{job_id}` | 処理状況を取得 |
| GET | `/download/{job_id}/{track}` | 分離されたトラックをダウンロード |
| GET | `/health` | ヘルスチェック |

---

不明点があれば、このREADMEの手順番号と現在の状況（コマンド結果/ログ）を教えてください。起動完了まで並走します。