---
title: Music Separator Backend
emoji: 🎵
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---
<!-- 上記はHugging Face Spaces固有の記述（HF Spacesは7860固定、ローカル開発は5000） -->

# バックエンド開発ガイド（Python + Flask + Demucs）

このディレクトリは、楽器分離アプリのバックエンド（Python + Flask + Demucs）です。以下に、セットアップから起動、API仕様、トラブルシューティングまでを日本語でまとめました。

## 1. 前提条件
- Python 3.9 以上（3.10〜3.11推奨）
- FFmpeg（音声処理用）
- フロントエンド（React）は別ディレクトリ `../frontend` にあります

## 2. 使用技術・ライブラリ

このバックエンドでは以下のライブラリを使用しています：

| 機能 | ライブラリ | 用途 |
|------|-----------|------|
| **楽器分離** | Demucs | AI音源分離モデル（vocals, guitar, bass, drums, piano, other） |
| **Tempo解析** | librosa | ビート検出アルゴリズムによるBPM推定 (`librosa.beat.beat_track`) |
| **Key解析** | librosa + numpy | クロマグラム解析と音階プロファイル相関による調性判定 (`librosa.feature.chroma_cqt`) |
| **Duration計算** | torchaudio | 波形のサンプル数とサンプルレートから楽曲の長さを計算 |
| **Webサーバー** | Flask + Flask-CORS | RESTful API提供とクロスオリジン対応 |
| **音声処理** | torch + torchaudio | GPU/CPU上での高速音声処理 |

### 楽曲解析のロジック

#### Tempo（テンポ）
```python
tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
```
- オンセット検出とテンポラル情報から周期的なビートパターンを分析してBPMを推定

#### Key（調性）
```python
chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
key_index = int(np.argmax(chroma.mean(axis=1)))
```
1. クロマグラム（12音階のエネルギー分布）を抽出
2. 最も強い音から主音（キー）を判定
3. 長調/短調の標準プロファイルとの相関係数で判定

#### Duration（長さ）
```python
duration = waveform.shape[1] / sr
```
- 総サンプル数 ÷ サンプルレート = 秒数

## 3. セットアップ（ローカル開発）
まず必ずプロジェクトのルートからバックエンドのディレクトリに移動してください。
```bash
# backend へ移動
cd backend
```

現在位置の確認：
```bash
pwd  # 末尾が /music-separator/backend になっていればOK
```

### 3.1 仮想環境の作成・有効化
```bash
# 仮想環境を作成
python3 -m venv venv

# 仮想環境を有効化
# macOS/Linux:
source venv/bin/activate
# Windows (PowerShell):
# venv\Scripts\Activate.ps1
# Windows (Command Prompt):
# venv\Scripts\activate.bat
```

### 3.2 依存関係のインストール
```bash
# pipを最新に更新
pip install --upgrade pip wheel setuptools

# 依存関係をインストール
pip install -r requirements.txt
```

## 4. サーバーの起動
```bash
# まず backend ディレクトリにいることを確認してください
pwd  # .../music-separator/backend が表示されていればOK

# サーバー起動
python app.py
```

起動後、以下のURLでアクセス可能：
- ヘルスチェック: `http://localhost:7860/health`
- API ベースURL: `http://localhost:7860`

## 5. API エンドポイント

| メソッド | エンドポイント | 説明 | パラメータ |
|---------|---------------|------|-----------|
| GET | `/health` | ヘルスチェック | - |
| POST | `/upload` | 音声ファイルをアップロード | `file` (multipart/form-data), `model` (optional) |
| GET | `/status/{job_id}` | 処理状況を取得 | `job_id` (URLパラメータ) |
| GET | `/download/{job_id}/{track}` | 分離されたトラックをダウンロード | `job_id`, `track` (URLパラメータ) |

## 6. Demucsによる音源分離

このバックエンドは、Meta（Facebook）が開発した高品質AI音源分離モデル **Demucs** を使用しています。

### 6.1 使用可能なモデル

2つのモデルから選択できます：

#### **htdemucs_6s**（デフォルト）
- **分離トラック**: vocals, guitar, bass, drums, piano, other の6トラック
- **特徴**: 
  - より細かい楽器分離が可能
  - guitarとpianoを個別に抽出できる
  - **注意**: pianoの分離精度は完成度が低い場合がある
- **処理速度**: 標準速度
- **推奨用途**: guitar/piano抽出が必要な場合、速度重視の場合

#### **htdemucs_ft**
- **分離トラック**: vocals, bass, drums, other の4トラック
  - **注意**: guitarやpianoは「other」に含まれる
- **特徴**:
  - 4つのトラックの分離品質がhtdemucs_6sより高品質
  - Fine-tunedバージョンで精度向上
  - 処理時間は約4倍かかる
- **推奨用途**: vocals/bass/drumsの高品質抽出が必要な場合

参考: [Demucs公式ドキュメント](https://pypi.org/project/demucs/)

### 6.2 モデルの切り替え方法

モデルを切り替えるには、バックエンドとフロントエンドの両方を変更する必要があります。

#### バックエンド（backend/app.py）

該当行を編集してモデルを切り替えます：
```python
# htdemucs_6s を使用する場合（デフォルト）
demucs_model = get_model('htdemucs_6s')

# htdemucs_ft を使用する場合（高品質モード）
# demucs_model = get_model('htdemucs_ft')
```

#### フロントエンド（frontend/src/contexts/AudioContext.tsx）

**htdemucs_6s の場合**（guitar/piano を有効化）：
```typescript
{ id: 'guitar', name: 'ギター', color: '#e74c3c', volume: 100, waveform: [] },
{ id: 'piano', name: 'ピアノ', color: '#ec4899', volume: 100, waveform: [] },
```

**htdemucs_ft の場合**（guitar/piano をコメントアウト）：
```typescript
// { id: 'guitar', name: 'ギター', color: '#e74c3c', volume: 100, waveform: [] },
// { id: 'piano', name: 'ピアノ', color: '#ec4899', volume: 100, waveform: [] },
```

#### 変更後の再起動
```bash
# バックエンドを再起動
cd backend
python app.py

# フロントエンドを再起動（別ターミナル）
cd frontend
npm start
```

### 6.3 出力形式

- **形式**: WAV（PCM 16-bit）

### 6.4 処理時間について

※GPU使用時は大幅に短縮されます

## 7. ディレクトリ構造
```
backend/
├── app.py              # Flask アプリケーション
├── requirements.txt    # Python 依存関係
├── Dockerfile          # Docker設定（Hugging Face Spaces用）
└── README.md          # このファイル
```

## 8. 環境変数（任意）
```bash
# 開発モード
export FLASK_ENV=development

# デバッグモード
export FLASK_DEBUG=1

# ポート変更（デフォルト: 5000）
export PORT=5001
```

## 9. フロントエンドとの連携

- フロントエンドは `http://localhost:7860` にAPIリクエストを送信
- CORS設定により、`localhost:3000` からのアクセスを許可
- ファイルアップロード → 非同期処理 → 結果取得の流れ

## 10. 本番環境へのデプロイ

このバックエンドは、様々なホスティングサービスにデプロイできます。

### 10.1 デプロイ構成の例
```
静的サイトホスティング (フロントエンド)
https://your-domain.com
         ↓ APIリクエスト
コンテナ/VPS (バックエンド)
https://api.your-domain.com
```

### 10.2 必要なファイル

デプロイには以下のファイルが必要です：
```
backend/
├── app.py
├── requirements.txt
└── Dockerfile
```

### 10.3 デプロイ先の選択肢

#### オプション1: Hugging Face Spaces（無料、AI/ML特化）

**特徴**: 無料枠あり、GPU対応、スリープ機能あり

1. https://huggingface.co/spaces でSpaceを作成
2. SDK: `Docker` を選択
3. 上記ファイルをアップロード
4. README.mdのYAMLヘッダーを設定：
```yaml
---
title: Music Separator Backend
emoji: 🎵
sdk: docker
app_port: 7860
---
```

#### オプション2: Render（簡単、無料枠あり）

**特徴**: Dockerサポート、自動デプロイ、無料枠あり

1. https://render.com/ でアカウント作成
2. 「New +」→「Web Service」を選択
3. GitHubリポジトリを連携
4. 設定：
   - Environment: `Docker`
   - Dockerfile Path: `backend/Dockerfile`
   - Environment Variables: 必要に応じて設定

#### オプション3: Railway（従量課金、簡単）

**特徴**: 自動デプロイ、スケーラブル

1. https://railway.app/ でアカウント作成
2. GitHubリポジトリを連携
3. `backend/` ディレクトリを指定
4. Dockerfileが自動検出される

#### オプション4: AWS（スケーラブル、本格運用向け）

**ECS + Fargate の例**:
1. ECRにDockerイメージをプッシュ
2. ECSタスク定義を作成
3. Fargateでサービスを起動
4. ALBで外部公開

**参考コマンド**:
```bash
# Dockerイメージをビルド
docker build -t music-separator backend/

# ECRにプッシュ
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-northeast-1.amazonaws.com
docker tag music-separator:latest <account-id>.dkr.ecr.ap-northeast-1.amazonaws.com/music-separator:latest
docker push <account-id>.dkr.ecr.ap-northeast-1.amazonaws.com/music-separator:latest
```

#### オプション5: VPS（Xserver VPS、さくらのVPS等）

**手順**:
1. VPSにSSH接続
2. Dockerをインストール
3. リポジトリをクローン
4. Dockerイメージをビルド＆起動

```bash
# VPSにSSH接続
ssh user@your-vps.example.com

# Dockerをインストール（Ubuntu/Debian）
sudo apt update
sudo apt install -y docker.io docker-compose

# リポジトリをクローン
git clone https://github.com/your-username/music-separator.git
cd music-separator/backend

# Dockerイメージをビルド
sudo docker build -t music-separator .

# コンテナを起動
sudo docker run -d -p 7860:7860 --name music-separator music-separator

# nginx等でリバースプロキシ設定（SSL対応推奨）
```

### 10.4 環境変数の設定

本番環境では、以下の環境変数を設定してください：

| 環境変数 | 説明 | デフォルト |
|---------|------|-----------|
| `PORT` | APIサーバーのポート | 7860 |
| `FLASK_ENV` | 実行環境 | production |
| `FLASK_DEBUG` | デバッグモード | False（本番はFalse推奨） |

### 10.5 CORSの設定

`app.py` でCORSが有効になっていることを確認：
```python
from flask_cors import CORS
CORS(app, expose_headers=['Content-Disposition'])
```

特定のオリジンのみ許可する場合：
```python
CORS(app, origins=["https://your-domain.com"], expose_headers=['Content-Disposition'])
```

### 10.6 フロントエンドとの連携

デプロイ完了後、フロントエンド側の設定を更新します：

`frontend/.env.production` を作成・編集：
```env
REACT_APP_API_URL=https://your-backend-url.example.com
```

フロントエンドを再ビルド・デプロイ：
```bash
cd frontend
yarn build
yarn deploy  # またはお好みのデプロイ方法
```

### 10.7 動作確認

1. ヘルスチェック：
```bash
curl https://your-backend-url.example.com/health
```

**期待される応答**:
```json
{
  "status": "healthy",
  "device": "cpu",
  "model_loaded": true
}
```

2. フロントエンドから音声ファイルをアップロードしてテスト

### 10.8 トラブルシューティング

#### ビルドエラーが発生する場合
```bash
# ローカルでDockerビルドをテスト
cd backend
docker build -t music-separator .
docker run -p 7860:7860 music-separator
```

#### CORSエラーが発生する場合
- `app.py` で `CORS(app, expose_headers=['Content-Disposition'])` が設定されているか確認
- フロントエンドの `.env.production` のURLが正しいか確認

#### メモリ不足エラー
- Demucsは大きなメモリを消費します（最低8GB推奨）
- より軽いモデル（htdemucs_6s）を使用
- サーバースペックのアップグレードを検討

#### 処理がタイムアウトする場合
- サーバーのタイムアウト設定を延長（nginx等）
- GPU環境を使用（処理が約4〜10倍高速化）
- より軽いモデル（htdemucs_6s）を使用

### 10.9 パフォーマンス最適化

#### GPU対応（推奨）
GPU環境でデプロイすると処理が大幅に高速化されます：
- **CPU**: 1曲あたり3〜5分
- **GPU**: 1曲あたり30秒〜1分

#### キャッシュ設定
処理済みのジョブは自動的にメモリに保持されますが、サーバー再起動時にクリアされます。永続化が必要な場合は、Redis等の外部キャッシュを検討してください。

### 10.10 参考リンク

- [Hugging Face Spaces公式ドキュメント](https://huggingface.co/docs/hub/spaces)
- [Render公式ドキュメント](https://render.com/docs)
- [Railway公式ドキュメント](https://docs.railway.app/)
- [Demucs公式リポジトリ](https://github.com/facebookresearch/demucs)

---

何か不明点があれば、プロジェクトルートの `README.md` もご確認ください。バックエンド専用の手順は本ドキュメントに集約しています。