# 行動指針

## プロジェクト概要
Thinktank — Electron + React + TypeScript のデスクトップアプリ（Web 版は Firebase Hosting）。
アイデアをVaultに蓄積し、AIとの対話で思考を補完する。
データの正本は Google Drive 上の `.md`、AI はローカルの AI CLI。構成は `docs/ARCHITECTURE_DRIVE_FIREBASE.md` を参照。

## 要件・仕様
詳細は `docs/requirements.md` を参照。概念・差別化の軸は `docs/concept.md` を参照。

## 開発環境の起動

```bash
# Electron 版（Vite と Electron を起動。データと AI は IPC で electron/ 側が扱う）
npm run electron:dev

# Vite が起動済みの場合（Electronのみ）
NODE_ENV=development npx electron electron/main.cjs

# ブラウザ版をローカル中継で動かす（scripts/run-relay-agent.mjs が 127.0.0.1:8080 で待ち受け、Vite が /api を転送）
npm run dev:web-relay
```

`shared/*.ts` を変更したら `node scripts/build-electron-shared.mjs` で `electron/shared-dist/` を作り直す
（electron/ と run-relay-agent はこの CJS 版を require する）。

## コーディング規約
- TypeScript strict モード。`any` は使わない
- コンポーネントは `src/components/<FeatureName>/` に配置
- 画面と electron/ の両方で使う型・検証は `shared/`（記録の契約は `shared/contracts/`）に置く
- コメントは WHY のみ。WHAT は書かない

## 重要な注意事項
- Express サーバー（`server/`・`dist-server/`）と Cloud Run は廃止済み。HTTP の API サーバーを新設しない
- Electronメインプロセスは `electron/main.cjs`。パッケージ版の画面は `app://thinktank/` から配信する
- 画面から OS・ファイルに触れる処理は preload（`electron/preload.cjs`）経由の IPC にする
- Web 版（Firebase Hosting）は Drive API と Firestore 経由の E2EE 中継で動く。デプロイは `npm run firebase:deploy`
- GPU キャッシュエラー（Windows）は無視してよい

## 変更を加える前に
- `src/components/DiscussPanel/` など既存コンポーネントの構造を Read で確認する
- `electron/*.cjs` や `shared/` を変更したら Electron を再起動する（HMR は効かない）

## パネル構成
- **ThinktankPanel** — Vaultの閲覧・検索・フィルタ（一覧表示）
- **DiscussPanel** — 選択したThoughtの編集・AI対話・メディア表示
- **HarvestPanel** — AI主導の再思考・チャット
- **SeedsPanel** — 設定・統計・全体ビュー

## コンポーネント構成パターン
各パネルは以下のファイルセットで構成される：
- `<Panel>Panel.tsx` — ルートコンポーネント
- `<Panel>Area.tsx` — メインコンテンツ領域
- `<Panel>Ribbon.tsx` — ツールバー
- `<Panel>MenuRibbon.tsx` — メニュー付きツールバー
- 各 `.tsx` と同名の `.css` をセットで置く

## データモデル
- Thought は Vault フォルダ（既定は Google Drive の `Thinktank/vault_ver2`）の `<thinkid>.md`。思考支援などのメタデータは `<thinkid>.support.json`
- 読み書きの実装は `electron/vaultEngine.cjs`（Electron・ローカル中継）と `src/platform/web/DriveApiStorageBackend.ts`（Web 版）
- 旧 BigQuery（`thinktank.vault_ver2`）は廃止済み。移行用スクリプトだけが `scripts/` に残る

## やってはいけないこと
- `electron/main.cjs` を ES Module 形式に書き換える（CJS固定）
- `npm run electron:dev` を多重起動（単一インスタンスロックで後発が終了し、Vite もポート競合する）
