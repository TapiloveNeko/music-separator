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
- ヘルスチェック: `http://localhost:5000/health`
- API ベースURL: `http://localhost:5000`

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

# ポート変更（デフォルト: 5000、Hugging Face Spacesでは7860）
export PORT=5001
```

## 9. フロントエンドとの連携

- フロントエンドは `http://localhost:5000` にAPIリクエストを送信
- CORS設定により、`localhost:3000` からのアクセスを許可
- ファイルアップロード → 非同期処理 → 結果取得の流れ

## 10. Hugging Face Spacesへのデプロイ

### 10.1 Hugging Face Spacesとは

**Hugging Face Spaces**は、機械学習アプリを無料でホスティングできるプラットフォームです。このバックエンドをHugging Face Spacesにデプロイすることで、GitHub Pagesのフロントエンドから本番環境のバックエンドAPIを利用できます。

### 10.2 デプロイの流れ
```
GitHub Pages (フロントエンド)
https://username.github.io/music-separator
         ↓ APIリクエスト
Hugging Face Spaces (バックエンド)
https://username-music-separator.hf.space
```

### 10.3 デプロイ手順

#### ステップ1: Hugging Face アカウント作成
1. https://huggingface.co/ にアクセス
2. アカウントを作成（無料）

#### ステップ2: 新しいSpaceを作成
1. https://huggingface.co/spaces にアクセス
2. 「Create new Space」をクリック
3. 設定：
   - **Space名**: `music-separator`（任意）
   - **SDK**: `Docker`を選択
   - **Visibility**: `Public`（無料プラン）

#### ステップ3: backendフォルダの内容をアップロード

Hugging Face Spacesのリポジトリに以下のファイルをアップロード：
```
backend/
├── app.py
├── requirements.txt
├── Dockerfile
└── README.md（このファイル）
```

**重要**: `backend/README.md`のメタデータ（YAMLヘッダー）が正しく設定されていることを確認してください。

#### ステップ4: Hugging Face Spaces固有の設定

このバックエンドは、Hugging Face Spaces向けに以下の設定が施されています：

##### **app.py の設定**
```python
# Hugging Face Spaces: ポート7860を使用（HF Spacesのデフォルト）
port = int(os.environ.get("PORT", 7860))
# Hugging Face Spaces: 本番環境なのでdebug=Falseに設定
app.run(debug=False, host='0.0.0.0', port=port)

# Hugging Face Spaces: GitHub Pagesからのアクセスを許可するためCORSを有効化
CORS(app)
```

##### **Dockerfile の設定**
```dockerfile
# Hugging Face Spaces: ポート7860を公開（HF Spacesのデフォルトポート）
EXPOSE 7860

# Hugging Face Spaces: 環境変数でポート7860を指定
ENV PORT=7860
```

##### **README.md のメタデータ（YAMLヘッダー）**
```yaml
---
title: Music Separator Backend
emoji: 🎵
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---
```

#### ステップ5: デプロイ完了を待つ
- Hugging Face Spacesが自動的にDockerイメージをビルド
- 初回は10〜20分程度かかる場合があります
- ビルドログで進行状況を確認できます

#### ステップ6: デプロイ完了後のURL確認
デプロイが完了すると、以下のようなURLが発行されます：
```
https://your-username-music-separator.hf.space
```

このURLをフロントエンドの環境変数に設定します（次セクション参照）。

### 10.4 フロントエンドとの連携設定

デプロイ完了後、フロントエンド側の設定を更新します：

#### `frontend/.env.production` を編集
```bash
# Hugging Face SpacesのURLに置き換え
REACT_APP_API_URL=https://your-username-music-separator.hf.space
```

#### フロントエンドを再ビルド・デプロイ
```bash
cd frontend
npm run build
npm run deploy  # GitHub Pagesにデプロイ
```

### 10.5 動作確認

1. GitHub PagesのURL（`https://your-username.github.io/music-separator`）にアクセス
2. 音声ファイルをアップロード
3. Hugging Face Spacesが裏で処理を実行
4. 分離されたトラックが取得できれば成功！

### 10.6 Hugging Face Spacesの制約

#### 無料プランの制限
- **メモリ**: 16GB（Demucsは動作可能）
- **GPU**: ZeroGPU（無料枠あり、処理高速化）
- **ストレージ**: 一時ファイルのみ（永続化不可）
- **同時処理**: 制限あり（複数ユーザーが同時アクセスすると遅延）

#### 処理時間
- **CPU版**: 1曲あたり3〜5分
- **GPU版**: 1曲あたり30秒〜1分

#### スリープ機能
- 一定時間アクセスがないとスリープ状態になる
- 次回アクセス時に起動（30秒〜1分かかる）

### 10.7 トラブルシューティング

#### ビルドエラーが発生する場合
```bash
# requirements.txtの依存関係を確認
pip install -r requirements.txt

# ローカルでDockerビルドをテスト
docker build -t music-separator .
docker run -p 7860:7860 music-separator
```

#### CORSエラーが発生する場合
- `app.py`で`CORS(app)`が有効になっているか確認
- フロントエンドの`.env.production`のURLが正しいか確認

#### 処理がタイムアウトする場合
- Hugging Face Spacesの無料プランでは処理時間に制限がある
- より軽いモデル（htdemucs_6s）を使用
- 有料プランへのアップグレードを検討

### 10.8 参考リンク

- [Hugging Face Spaces公式ドキュメント](https://huggingface.co/docs/hub/spaces)
- [Docker SDK ドキュメント](https://huggingface.co/docs/hub/spaces-sdks-docker)
- [Demucs公式リポジトリ](https://github.com/facebookresearch/demucs)

---

何か不明点があれば、プロジェクトルートの `README.md` もご確認ください。バックエンド専用の手順は本ドキュメントに集約しています。