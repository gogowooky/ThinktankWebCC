# Gemini思考支援AI

## 実装

思考支援用のAIProvider境界へGemini RESTアダプターを追加した。`generateContent`へシステム方針、今回の質問、固定済みContext Snapshot、直近の会話を送り、JSON Schemaで回答・根拠不足・引用・課題概要の変更候補を受け取る。返却後はProvider共通の検証で、引用が送信資料の本文と一致すること、提案先が許可された項目であることを確認する。

APIキーはサーバーの`x-goog-api-key`ヘッダーだけに設定し、URL、本文、ブラウザへ渡さない。Geminiのツール、外部検索、File Searchはこの会話アダプターでは指定しない。Gemini File Search資料連携とは別の機能として扱う。

## Gemini 2.5互換

既存設定の`gemini-2.5-flash`は実APIから新規利用不可と返されたため、思考支援のモデルを`gemini-3.6-flash`へ更新した。また、2.5系のSchemaエンドポイントが受け付けない`additionalProperties`をGeminiへ送る直前に再帰的に除外する。アプリが応答を受け取った後の厳密なフィールド検証は省略しない。

## 有効化と検証

サーバー設定は`THINK_SUPPORT_AI_ENABLED=true`、Providerは`gemini`、モデルは`gemini-3.6-flash`とした。Chatを変更しない疎通試験で所定形式の日本語応答を取得し、サーバー再起動後の状態APIでも有効状態を確認した。

単体テストでは、サーバー側ヘッダーだけへのキー設定、Schema、ツール未指定、中断Signal、不完全・ブロック・不正JSONの拒否、Provider設定の選択を確認する。
