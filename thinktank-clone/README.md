# Thinktank Clone

`docs/260606_Thinktank仕様書` を元にゼロベースで再実装した Thinktank のクローンです。

## 起動方法

```bash
npm install
npm run dev        # Express(8081) + Vite(5173) を同時起動 → http://localhost:5173
```

Electron（Localモード）で起動する場合:

```bash
npm run electron:dev
```

## AI設定

`.env`（またはシェル環境変数）にプロバイダーとAPIキーを設定します。未設定時はモック応答で動作します。

```
AI_PROVIDER=anthropic   # anthropic | openai | gemini
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
# OPENAI_API_KEY / OPENAI_MODEL / OPENAI_BASE_URL
# GEMINI_API_KEY / GEMINI_MODEL
```

## パネル毎のAI活用方針（Thinkファイル）

各パネルのAIチャットは、対応する「Thinkファイル」（保管庫に保存されたmemo）の本文を
システムプロンプトとして使用します。各パネルの設定ビューから編集できます。

| パネル | ThinkファイルID | 方針 |
| :--- | :--- | :--- |
| Thinktank | `__tt_think_thinktank__` | Overviewに設定するThinkファイルリスト（=Thoughtファイル）を作成するための聞き取り |
| Overview | `__tt_think_overview__` | Thoughtファイルの中身の概要と過不足についての議論 |
| Workout | `__tt_think_workout__` | ThoughtファイルをコンテキストとしてAIと議論 |
| ReThink | `__tt_think_rethink__` | 本日のUpdate部分についての概要まとめ |

## キーボードショートカット

定義は システムThink `__tt_shortcuts__`（table形式）に保存され、編集可能です。

### グローバル
| キー | 動作 |
| :--- | :--- |
| Ctrl+Alt+1〜4 | 各パネルの開閉（Thinktank / Overview / Workout設定 / ReThink） |
| Ctrl+Alt+L | レイアウトモード切替（standard / compact） |
| Ctrl+Alt+E | Workoutペイン幅の均等化 |
| Ctrl+Alt+Z / Y | UI状態の Undo / Redo |

### TextEditor（Monaco。標準の編集キー・Monacoのキーはそのまま有効）
| キー | 動作 |
| :--- | :--- |
| Ctrl+S | 保存 |
| Ctrl+Alt+[ | 見出しの段階的折りたたみ（CloseEachLevel） |
| Ctrl+Alt+] | 見出しの段階的展開（OpenEachLevel） |
| Ctrl+Alt+↑ / ↓ | 前 / 次の表示見出しへ移動 |
| Ctrl+Alt+← | 親見出しへ移動 |

### DataGrid
| キー | 動作 |
| :--- | :--- |
| 矢印 / Tab | セル移動 |
| Enter / F2 | セルの編集 |
| Ctrl+Enter | 行を追加 |
| Ctrl+Shift+Enter | 列を追加 |
| Ctrl+Delete | 行を削除 |

## 構成

- `src/models/` — TTNotifyBase / TTObject / TTCollection / TTThink / TTVault（仕様書03）
- `src/views/` — TTApplication / TTUIStateManager / TTShortcutManager / TTActions / TTWorkoutPanel（仕様書04）
- `src/components/` — 4パネル＋レイアウト＋ステータスバー（仕様書02）
- `src/utils/` — thinkFormat / tableFormat / dateUtils / keyboardUtils
- `server/` — Express（ストレージAPI `/api/bq/*`＋SSEチャット `/api/chat/messages`、仕様書05・06）
  - クローン環境では BigQuery の代わりに `data/vault/*.json` のローカルストアで同一API形状を提供
- `electron/` — Localモード（IPC経由のローカルFS CRUD＋差分同期 syncFromServer）

## 本家との差分（意図的な簡略化）

- BigQuery / Google Drive 連携はローカルファイルストアで代替（API形状は仕様書準拠）
- セマンティック検索は仕様書06 §4 の通り廃止済みのため未実装
