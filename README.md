# Thinktank

Thinktank — Electron + React + TypeScript のデスクトップアプリ（Web 版は Firebase Hosting）。
アイデアをVaultに蓄積し、AIとの対話で思考を補完する。

## 開発時の起動

- `npm run dev:electron`: Electron版とViteを起動。同じPCではブラウザで `http://localhost:5173` を開いてWeb版も利用できる。
- `npm run dev:vite`: Web版のみ起動。Firebaseログイン後にThinkの閲覧・編集・保存が可能。

Web版からAI CLIを利用する場合は、提供側のElectron版でFirebaseへログインし、PC連携モードをONにする。
`electron:dev` は `dev:electron` へ改名し、`relay:start` と `dev:web-relay` は廃止した。
ローカル窓口（8080）を起動する必要はない。
設定画面の「再起動」ボタンは、`dev:electron` では Vite を止めずに Electron だけを起動し直す（`scripts/dev-electron.mjs`）。

## PC版（exe）の作成と導入

- `npm run electron:package`: `release/Thinktank Setup <version>.exe` を作る。版は package.json の version。
- 新しいPCには、このインストーラーだけを入れれば動く（Node.js などは不要）。
- 初回は Firestore で起動する。Firebase を使わない場合は、設定 > モード切替で「ローカルで使う」と ThinkファイルFolder を指定して再起動する（`docs/261103/ローカル運用モード.md`）。
- 設定（運用モードなど）は `%APPDATA%\thinktank` に残り、アンインストールしても消えない。

## 更新履歴

版ごとの変更内容は [CHANGELOG.md](CHANGELOG.md) にある（新しい順）。
