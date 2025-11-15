---
title: Music Separator
emoji: 🎵
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---
↑Hugging Faceにアップロードするための特有の記述

# バックエンド開発ガイド

楽器分離アプリのバックエンド（Python + FastAPI + Demucs）です。

## 起動方法

> **Docker Composeについて**  
> 本プロジェクトでは Essentia や Demucs など重いネイティブ依存を含むため、Docker Desktop 上ではビルド・起動・アップロード処理が著しく遅くなり、Essentia の解析結果も安定しない。  
> Docker Compose は完全下位互換（精度低下・ビルド遅延・アップロード遅延）であるため、使用は避け、ローカル仮想環境 + `uvicorn` で起動することとする。

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

### Docker Composeを非推奨とする理由
- Essentia の Linux/ARM 向け wheel が存在せず、Docker Desktop 上では毎回ソースビルド（5 分以上）となる。
- Demucs/Essentia の推論は macOS ネイティブ実行に比べ 2 倍以上遅く、アップロード後のトラック読込も常に遅延する。
- Essentia の解析結果がコンテナ環境では安定せず、キー/BPM が崩れるケースが確認された。
- 以上より Docker Compose はローカル開発における完全下位互換と判断し、使用を廃止した。

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
- **音響処理**: torch + torchaudio
- **キー/BPM推定**: Essentia KeyExtractor / RhythmExtractor（librosa fallback）

## API エンドポイント

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | `/health` | ヘルスチェック |
| POST | `/upload` | 音楽ファイルをアップロード |
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
└── README.md          # このファイル
```

## 本番環境へのデプロイ

### FFmpegのインストール（必須）

本アプリケーションは `pydub` を使用しており、MP3、FLAC、M4A、OGG、MP4などのフォーマットを処理するために **FFmpeg** が必要です。

本番環境で以下のエラーが発生した場合：
```
[Errno 2] No such file or directory: 'ffprobe'
```

これはFFmpegがインストールされていないことを意味します。**`backend/Dockerfile`を本番環境にアップロードするだけで解決します。**（DockerfileにはFFmpegのインストールが含まれています）

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

### `[Errno 2] No such file or directory: 'ffprobe'` エラー
- **原因**: FFmpegがインストールされていない
- **対処**: `backend/Dockerfile`を本番環境にアップロードしてください

### 進捗が 0% のまま動かない（`load() got an unexpected keyword argument 'backend'`）
- Torch 2.0 系では `torchaudio.load(..., backend='soundfile')` が使えず例外になり、ジョブが即 `error` に落ちます。
- 兆候: `uvicorn` の標準出力に `load() got an unexpected keyword argument 'backend'` が出る。UI はエラーを拾えず 0% で止まる。
- 対処: `app/main.py` の入出力を `soundfile` で行うよう修正済み。もし同様の変更が失われた場合は `torchaudio.load/save(..., backend='soundfile')` の代わりに `soundfile.read/write` を使うよう戻してください。