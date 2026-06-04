# 行動指針

## プロジェクト概要
Thinktank — Electron + React + TypeScript + Express のデスクトップアプリ。
アイデアをVaultに蓄積し、AIとの対話で思考を補完する。

## 要件・仕様
詳細は `docs/requirements.md` を参照。概念・差別化の軸は `docs/concept.md` を参照。

## 開発環境の起動

```bash
# サーバー・Vite が未起動の場合
npm run electron:dev

# サーバー・Vite が起動済みの場合（Electronのみ）
NODE_ENV=development npx electron electron/main.cjs
```

## コーディング規約
- TypeScript strict モード。`any` は使わない
- コンポーネントは `src/components/<FeatureName>/` に配置
- サーバーコードは `server/` に記述し `dist-server/` にビルド
- コメントは WHY のみ。WHAT は書かない

## 重要な注意事項
- `dist-server/` は `server/` のビルド成果物。直接編集しない
- Electronメインプロセスは `electron/main.cjs`
- BigQuery/Drive の認証は `server/.env` の `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` で管理
- GPU キャッシュエラー（Windows）は無視してよい

## 変更を加える前に
- `src/components/WorkoutPanel/` など既存コンポーネントの構造を Read で確認する
- サーバー側変更後は `npm run build:server` でビルドし直す

## パネル構成
- **ThinktankPanel** — Vaultの閲覧・検索・フィルタ（一覧表示）
- **WorkoutPanel** — 選択したThoughtの編集・AI対話・メディア表示
- **ReThinkPanel** — AI主導の再思考・チャット
- **OverviewPanel** — 設定・統計・全体ビュー

## コンポーネント構成パターン
各パネルは以下のファイルセットで構成される：
- `<Panel>Panel.tsx` — ルートコンポーネント
- `<Panel>Area.tsx` — メインコンテンツ領域
- `<Panel>Ribbon.tsx` — ツールバー
- `<Panel>MenuRibbon.tsx` — メニュー付きツールバー
- 各 `.tsx` と同名の `.css` をセットで置く

## サーバー変更時のビルド手順
`server/*.ts` を変更したら必ずビルドし直すこと：
```bash
npm run build:server
```
ビルドせずに `electron:dev` を起動すると古いコードが動く。

## データモデル
- メインテーブル: `thinktank.vault`（Thoughtの保存先）
- 埋め込みテーブル: `thinktank.tt_embeddings`（ベクトル検索用、現在削除済み）
- スキーマ変更は `server/services/BigQueryService.ts` の `initialize()` を確認すること

## やってはいけないこと
- `dist-server/` を手動編集（ビルドで上書きされる）
- `electron/main.cjs` を ES Module 形式に書き換える（CJS固定）
- `npm run electron:dev` を多重起動（ポート競合でサーバーが即終了する）
