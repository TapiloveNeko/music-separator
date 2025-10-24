# フロントエンド開発ガイド（React + TypeScript）

このディレクトリは、楽器分離アプリのフロントエンド（React + TypeScript）です。以下に、セットアップから起動、バックエンド連携、トラブルシューティングまでを日本語でまとめました。

## 1. 前提条件
- Node.js 18 以上
- Yarn 1.x（推奨）または npm（どちらか一方を使用してください）
- バックエンド（Flask）は別ディレクトリ `../backend` にあります

## 2. セットアップ
まず必ずプロジェクトのルートからフロントエンドのディレクトリに移動してください（環境に依存しない相対パスの例）。

```bash
# frontend へ移動
cd frontend
```

Windows（PowerShell）の例：
```powershell
cd path\to\your\project\music-separator
cd frontend
```

現在位置の確認：
```bash
pwd  # 末尾が /music-separator/frontend になっていればOK（Windowsは Get-Location）
```

その上で、依存関係をインストールします。

```bash
# 推奨: Yarn を使用
yarn install

# もし npm を使う場合（Yarn と混在させないでください）
# rm -f yarn.lock
# npm install
```

混在防止のポイント:
- npm を使う場合は `yarn.lock` を削除
- Yarn を使う場合は `package-lock.json` を削除

## 3. 開発サーバーの起動

```bash
# まず frontend ディレクトリにいることを確認してください
pwd  # .../music-separator/frontend が表示されていればOK

# Yarn（推奨）
yarn start

# npm の場合
# npm start
```

起動後、ブラウザで `http://localhost:3000` を開きます。

### よくある質問: 「Something is already running on port 3000」
- すでに別の開発サーバーがポート3000で動いています。
- 対処方法：
  - 既存サーバーを停止する（ターミナルで Ctrl+C）
  - またはポートを変えて起動（確認プロンプトに `Y` と入力）
  - 強制終了する場合：
    ```bash
    lsof -ti:3000 | xargs kill -9
    ```

## 4. スクリプト一覧

```bash
# 開発サーバー
yarn start

# 本番ビルド（/build に出力）
yarn build

# テスト
yarn test

# 依存ライブラリの追加例
yarn add axios
# 型定義の追加例
yarn add -D @types/xxx
```

npm の場合は `yarn` を `npm run` / `npm install` 系に読み替えてください。

## 5. バックエンド（Flask）との連携
- デフォルトの API ベースURL は `http://localhost:5000` を想定しています。
- 値は `src/config/api.ts` で変更できます。
- 起動手順（参考）：
  ```bash
  cd ../backend
  # 推奨: Python 3.10 〜 3.11 で仮想環境を作成
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt
  python app.py
  ```
- バックエンドが起動すると、フロントエンドからアップロード→処理状況のポーリング→分離トラックのダウンロードが可能になります。

## 6. ESLint 警告について
開発サーバー起動時に以下のような警告が表示されることがあります。

- `no-unused-vars` など：未使用の変数・import がある場合に表示されます。
  - 不要であれば削除してください。
  - 一時的に無視する場合は、該当行の直前に次を記述：
    ```ts
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ```

## 7. デザイン/構成のポイント
- UI は `styled-components` を使用
- グローバル状態は `src/contexts/AudioContext.tsx`（Context API）
- API 呼び出しは `src/services/api.ts`
- 型定義は `src/types` 配下
- メイン UI は `src/App.tsx`

## 8. 環境変数（任意）
CRA の仕様により、`.env` を利用する場合は `REACT_APP_` プレフィックスが必要です。

例：
```env
REACT_APP_API_URL=http://localhost:5000
```
コード側では `process.env.REACT_APP_API_URL` で参照できます。

## 9. トラブルシューティング
- 依存関係の不整合が起きた場合：
  ```bash
  rm -rf node_modules yarn.lock package-lock.json
  # どちらか一方だけで再インストール
  yarn install  # もしくは npm install
  ```
- 型定義が見つからない： `yarn add -D @types/xxx` を追加
- 画面が真っ白：ブラウザのDevTools（Console）でエラーを確認

---
何か不明点があれば、プロジェクトルートの `README.md` もご確認ください。フロントエンド専用の手順は本ドキュメントに集約しています。
