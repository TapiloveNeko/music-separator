# バックエンド開発ガイド

楽器分離アプリのバックエンド（Python + FastAPI + Demucs）です。

## 起動方法

### Docker Composeで起動（推奨・汎用的）

プロジェクトルートから実行：

```bash
docker compose up
```

バックグラウンドで起動する場合：

```bash
docker compose up -d
```

バックエンドは `http://localhost:7860` で起動します。

### ローカル開発（Dockerなし）

仮想環境を使う場合：

```bash
cd backend

# 仮想環境作成
python3 -m venv venv
source venv/bin/activate  # macOS/Linux

# 依存関係インストール
pip install -r requirements.txt

# サーバー起動（開発用）
uvicorn app.main:app --host 0.0.0.0 --port 7860 --reload

# サーバー起動（本番用）
gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:7860
```

### コマンドの確認方法

#### uvicorn の確認
```bash
cd /Users/keisuke.ohta/music-separator/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 7860 --reload
```

#### gunicorn の確認
```bash
cd /Users/keisuke.ohta/music-separator/backend
source venv/bin/activate
gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:7860
```

## 使用技術

- **楽器分離**: Demucs（AI音源分離モデル）
- **Webサーバー**: FastAPI + Uvicorn/Gunicorn
- **音声処理**: torch + torchaudio

## API エンドポイント

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | `/health` | ヘルスチェック |
| POST | `/upload` | 音声ファイルをアップロード |
| GET | `/status/{job_id}` | 処理状況を取得 |
| GET | `/download/{job_id}/{track}` | 分離されたトラックをダウンロード |
| POST | `/mix/{job_id}` | トラックをミックスしてダウンロード |
| DELETE | `/clear/{job_id}` | ジョブを削除 |

## Demucsモデル

### htdemucs_6s（デフォルト）
- **分離トラック**: vocals, guitar, bass, drums, piano, other（6トラック）
- **特徴**: guitar/pianoを個別に抽出可能、標準速度

### htdemucs_ft（高品質）
- **分離トラック**: vocals, bass, drums, other（4トラック）
- **特徴**: より高品質だが処理時間が約4倍

モデル切り替えは `app/main.py` の `get_model()` を編集してください。

## ディレクトリ構造

```
backend/
├── app/
│   ├── __init__.py
│   └── main.py         # FastAPI アプリケーション
├── requirements.txt    # Python 依存関係
├── Dockerfile          # Docker設定
└── README.md          # このファイル
```

## トラブルシューティング

### メモリ不足
- Demucsは大きなメモリを消費します（最低8GB推奨）
- より軽いモデル（htdemucs_6s）を使用

### 処理が遅い
- GPU環境を使用すると大幅に高速化（約4〜10倍）
- CPU環境では1曲あたり3〜5分かかります

### CORSエラー
- `app/main.py` でCORSが有効になっているか確認
- フロントエンドのAPI URL設定を確認