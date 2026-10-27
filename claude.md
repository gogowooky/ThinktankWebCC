# 行動指針

## プロジェクト概要
Thinktank — Electron + React + TypeScript のデスクトップアプリ（Web 版は Firebase Hosting）。
アイデアをVaultに蓄積し、AIとの対話で思考を補完する。
Thinkの正本はFirestore、外部資料はGoogle Drive、ローカル`.md`は復旧用バックアップ。AIはローカルのAI CLI。構成は `docs/261019/v2.6_Firestore正本とPC連携.md` を参照。

## 要件・仕様
詳細は `docs/requirements.md` を参照。概念・差別化の軸は `docs/concept.md` を参照。

## 開発環境の起動

```bash
# Electron 版（Vite と Electron を起動。Think正本はFirestore、AI CLIはIPC）
npm run dev:electron

# Vite が起動済みの場合（Electronのみ）
NODE_ENV=development npx electron electron/main.cjs

# ブラウザ版のみ（ThinkデータはFirestoreへ直接接続）
npm run dev:vite
```

`shared/*.ts` を変更したら `node scripts/build-electron-shared.mjs` で `electron/shared-dist/` を作り直す
（electron/ はこの CJS 版を require する）。

Web版へAI CLIを提供する場合はElectron版のPC連携モードをONにする。
`dev:electron` はViteも起動するため、同じPCでWeb版も使う場合はブラウザで
`http://localhost:5173` を開く。ローカル窓口（8080）と常駐エージェントの起動コマンドは廃止済み。

## コーディング規約
- TypeScript strict モード。`any` は使わない
- コンポーネントは `src/components/<FeatureName>/` に配置
- 画面と electron/ の両方で使う型・検証は `shared/`（記録の契約は `shared/contracts/`）に置く
- コメントは WHY のみ。WHAT は書かない
- `Working`/`working` はパネル名（WorkingPanel・WorkingSettingPanel、旧 Discuss）専用。処理中・作業ディレクトリ等の意味では使わず `isBusy`・`isRunning`・`cwd` などにする（grep でパネル関連を一意に拾うため）
- 旧パネル名（Workout/Develop/Discuss 等）の読み替えは `src/utils/panelNames.ts` などの互換レイヤーに集約し、ユーザーの指示があるまで削除しない

## 重要な注意事項
- Express サーバー（`server/`・`dist-server/`）と Cloud Run は廃止済み。HTTP の API サーバーを新設しない
- Electronメインプロセスは `electron/main.cjs`。パッケージ版の画面は `app://thinktank/` から配信する
- 画面から OS・ファイルに触れる処理は preload（`electron/preload.cjs`）経由の IPC にする
- Web版（Firebase Hosting）はFirestore正本を直接利用する。PC連携ON時だけFirestore経由のE2EE中継を使い、Drive APIは外部資料に限定する。デプロイは `npm run firebase:deploy`
- GPU キャッシュエラー（Windows）は無視してよい

## 変更を加える前に
- `src/components/WorkingPanel/` など既存コンポーネントの構造を Read で確認する
- `electron/*.cjs` や `shared/` を変更したら Electron を再起動する（HMR は効かない）

## パネル構成
- **ThinktankPanel** — Vaultの閲覧・検索・フィルタ（一覧表示）
- **WorkingPanel** — 選択したThinkファイルの編集・AI対話・メディア表示
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
- Think本文・メタデータは `users/{uid}/vaults/{vaultId}/thinks/{thinkid}` のFirestore文書を正本とする
- 共通の正本読み書きは `src/platform/web/FirestoreStorageBackend.ts`。`electron/vaultEngine.cjs` はMarkdownバックアップ・ローカル索引・AI CLI用のローカル参照を担当する
- PC連携は既定OFF。ElectronはAI CLI提供側、Webは接続側。依頼・応答はFirestoreリアルタイムリスナーで監視する
- 旧 BigQuery（`thinktank.vault_ver2`）は廃止済み。移行用スクリプトだけが `scripts/` に残る

## やってはいけないこと
- `electron/main.cjs` を ES Module 形式に書き換える（CJS固定）
- `npm run dev:electron` を多重起動（単一インスタンスロックで後発が終了し、Vite もポート競合する）
