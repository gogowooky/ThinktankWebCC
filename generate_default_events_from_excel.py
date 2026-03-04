#!/usr/bin/env python3
"""
generate_default_events_from_excel.py
ThinktankWebCC_KeyBindings.xlsx の②③④シートから DefaultEvents.ts を生成するスクリプト

使い方:
    python generate_default_events_from_excel.py
    python generate_default_events_from_excel.py --xlsx ThinktankWebCC_KeyBindings.xlsx --out src/Controllers/DefaultEvents.ts
    python generate_default_events_from_excel.py --dry-run   # 標準出力のみ（ファイル書き込みなし）

シート列レイアウト（②Editor詳細 / ③Table詳細 / ④WebView詳細 共通）:
    A: カテゴリ
    B: 修飾キー  （例: "Control", "Alt+Shift", "(なし)" など）
    C: キー      （例: "ENTER", "S", "UP" など）
    D: アクション（例: "Editor.Editing.Save"）
    E: 説明      （日本語コメント）
    F: ExMode    （例: "ExApp", "ExPanel", 空なら通常モード）
    G: コンテキスト（例: "*-Editor-Main-*"）

生成ロジック:
    1. G列のコンテキストが存在する場合 → そのまま使用
    2. コンテキストが空の場合 → シート名からモード推測 + F列のExModeで補完
    3. B列が "(なし)" → ""（空文字）に正規化
    4. 先頭が "▶" のセクション行はコメントとして出力
    5. 空白行・Noneはスキップ
    6. 重複行（同一 context|mods|key|action の組み合わせ）は警告を出して一度だけ出力
"""

import argparse
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("エラー: openpyxl が見つかりません。'pip install openpyxl' でインストールしてください。")
    sys.exit(1)

# ============================================================
# 定数
# ============================================================

# 対象シート名のプレフィックス（先頭の丸数字で識別）
TARGET_SHEET_PREFIXES = ('②', '③', '④')

# シート名→モード名のマッピング
SHEET_TO_MODE = {
    '②': 'Editor',
    '③': 'Table',
    '④': 'WebView',
}

# デフォルトのツール名
DEFAULT_TOOL = {
    'Editor': 'Main',
    'Table':  '*',
    'WebView': '*',
}

# ============================================================
# ユーティリティ
# ============================================================

def normalize_mods(raw: str) -> str:
    """修飾キーを正規化: "(なし)" → "" など"""
    if raw is None:
        return ''
    s = str(raw).strip()
    if s == '(なし)' or s == '-' or s == '':
        return ''
    return s

def normalize_key(raw: str) -> str:
    """キーを正規化: 空白除去"""
    if raw is None:
        return ''
    return str(raw).strip()

def normalize_action(raw: str) -> str:
    """アクションIDを正規化"""
    if raw is None:
        return ''
    return str(raw).strip()

def normalize_exmode(raw: str) -> str:
    """ExModeを正規化: 空なら '*'"""
    if raw is None:
        return '*'
    s = str(raw).strip()
    return s if s else '*'

def build_context(ctx_raw: str, mode: str, exmode: str) -> str:
    """
    コンテキスト文字列を構築する。
    G列にコンテキストがある場合はそれを優先。
    空の場合はシートのモードとExModeから推測して生成する。
    """
    if ctx_raw:
        s = str(ctx_raw).strip()
        if s:
            return s
    # コンテキストが空 → 自動構築
    tool = DEFAULT_TOOL.get(mode, '*')
    exmode_part = exmode if exmode != '*' else '*'
    return f'*-{mode}-{tool}-{exmode_part}'

def ts_escape(s: str) -> str:
    """TypeScript文字列リテラル用にエスケープ（バックスラッシュのみ注意）"""
    return s.replace('\\', '\\\\')

def format_add_event(context: str, mods: str, key: str, action: str, comment: str) -> str:
    """AddEvent 呼び出し1行を生成（コメント付き）"""
    c = ts_escape(context)
    m = ts_escape(mods)
    k = ts_escape(key)
    a = ts_escape(action)

    line = f"    AddEvent('{c}', '{m}', '{k}', '{a}');"
    if comment:
        # コメントが長い場合は切り詰める
        truncated = comment[:40]
        line = f"{line:<80}  // {truncated}"
    return line

# ============================================================
# Excelからイベントデータを読み込む
# ============================================================

def load_events_from_sheet(ws, mode: str) -> list:
    """
    1シートからイベント行を読み込み、
    (context, mods, key, action, description, section) のリストを返す。
    section は直前の '▶' セクション行の文字列。
    """
    events = []
    current_section = ''

    # 2行目がヘッダー → 3行目からデータ
    for row in ws.iter_rows(min_row=3, values_only=True):
        # 全列がNoneなら空行としてスキップ
        if all(v is None for v in row):
            events.append(None)  # 空行マーカー
            continue

        cat_raw  = row[0]  # A: カテゴリ
        mods_raw = row[1]  # B: 修飾キー
        key_raw  = row[2]  # C: キー
        act_raw  = row[3]  # D: アクション
        desc_raw = row[4]  # E: 説明
        exm_raw  = row[5]  # F: ExMode
        ctx_raw  = row[6]  # G: コンテキスト

        # セクション行判定 (A列が "▶..." でB列以降がNone)
        cat_str = str(cat_raw).strip() if cat_raw else ''
        if cat_str.startswith('▶'):
            current_section = cat_str.lstrip('▶').strip()
            events.append(('__section__', current_section))
            continue

        # アクションが空ならスキップ
        action = normalize_action(act_raw)
        if not action:
            continue

        mods   = normalize_mods(mods_raw)
        key    = normalize_key(key_raw)
        exmode = normalize_exmode(exm_raw)
        ctx    = build_context(ctx_raw, mode, exmode)
        desc   = str(desc_raw).strip() if desc_raw else ''

        if not key:
            continue

        events.append((ctx, mods, key, action, desc, current_section))

    return events

# ============================================================
# TypeScript コード生成
# ============================================================

def generate_ts(all_events: list) -> str:
    """
    全シートのイベントリストから DefaultEvents.ts の内容文字列を生成する。
    all_events: [(sheet_title, events_list), ...]
    """
    lines = []

    lines.append("import type { TTModels } from '../models/TTModels';")
    lines.append("import { TTEvent } from '../models/TTEvent';")
    lines.append("")
    lines.append("// このファイルは generate_default_events_from_excel.py によって自動生成されました。")
    lines.append("// 手動編集の場合は generate_keybindings_excel.py → Excel → このスクリプトの流れで再生成してください。")
    lines.append("")
    lines.append("export function InitializeDefaultEvents(models: TTModels) {")
    lines.append("    const events = models.Events;")
    lines.append("")
    lines.append("    function AddEvent(context: string, mods: string, key: string, actionId: string) {")
    lines.append("        // カンマ区切りキーの展開")
    lines.append("        if (key.includes(',')) {")
    lines.append("            key.split(',').forEach(k => AddEvent(context, mods, k.trim(), actionId));")
    lines.append("            return;")
    lines.append("        }")
    lines.append("        const ev = new TTEvent();")
    lines.append("        ev.Context = context;")
    lines.append("        ev.Mods = mods;")
    lines.append("        ev.Key = key;")
    lines.append("        ev.Name = actionId;")
    lines.append("        ev.ID = `${context}|${mods}|${key}`;")
    lines.append("        events.AddItem(ev);")
    lines.append("    }")
    lines.append("")

    seen = set()  # 重複チェック用: (context, mods, key, action)
    warning_count = 0

    for sheet_title, events in all_events:
        lines.append(f"    // {'=' * 60}")
        lines.append(f"    // {sheet_title}")
        lines.append(f"    // {'=' * 60}")
        lines.append("")

        last_section = None

        for item in events:
            if item is None:
                # 空行
                lines.append("")
                continue

            if item[0] == '__section__':
                sec = item[1]
                if sec != last_section:
                    lines.append(f"    // #region {sec}")
                    last_section = sec
                continue

            ctx, mods, key, action, desc, section = item

            # セクションが変わったら region を開閉
            if section != last_section:
                if last_section is not None:
                    lines.append("    // #endregion")
                    lines.append("")
                lines.append(f"    // #region {section}")
                last_section = section

            # 重複チェック
            dedup_key = (ctx, mods, key, action)
            if dedup_key in seen:
                warning_count += 1
                print(f"  [警告] 重複行をスキップ: context={ctx}, mods={mods}, key={key}, action={action}", file=sys.stderr)
                continue
            seen.add(dedup_key)

            lines.append(format_add_event(ctx, mods, key, action, desc))

        if last_section is not None:
            lines.append("    // #endregion")
        lines.append("")

    lines.append("}")
    lines.append("")

    if warning_count > 0:
        print(f"  [情報] 重複行を合計 {warning_count} 件スキップしました。", file=sys.stderr)

    return '\n'.join(lines)

# ============================================================
# メイン
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description='ThinktankWebCC_KeyBindings.xlsx の②③④シートから DefaultEvents.ts を生成します。'
    )
    parser.add_argument(
        '--xlsx',
        default='ThinktankWebCC_KeyBindings.xlsx',
        help='入力Excelファイルのパス (デフォルト: ThinktankWebCC_KeyBindings.xlsx)'
    )
    parser.add_argument(
        '--out',
        default='src/Controllers/DefaultEvents.ts',
        help='出力TypeScriptファイルのパス (デフォルト: src/Controllers/DefaultEvents.ts)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='標準出力のみ。ファイルへの書き込みを行いません。'
    )
    args = parser.parse_args()

    xlsx_path = Path(args.xlsx)
    out_path  = Path(args.out)

    # Excelファイル読み込み
    if not xlsx_path.exists():
        print(f"エラー: Excelファイルが見つかりません: {xlsx_path}", file=sys.stderr)
        sys.exit(1)

    print(f"読み込み中: {xlsx_path}")
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)

    all_events = []

    for sheet_name in wb.sheetnames:
        prefix = sheet_name[:1]  # 先頭の丸数字
        if sheet_name[:1] not in [p[:1] for p in TARGET_SHEET_PREFIXES]:
            # 先頭1文字で絞り込めないので丸数字比較
            pass
        found_prefix = None
        for p in TARGET_SHEET_PREFIXES:
            if sheet_name.startswith(p):
                found_prefix = p
                break
        if found_prefix is None:
            continue

        mode = SHEET_TO_MODE.get(found_prefix, '*')
        ws = wb[sheet_name]
        print(f"  シート '{sheet_name}' を処理中 (モード: {mode})...")
        events = load_events_from_sheet(ws, mode)

        # 集計
        event_count = sum(1 for e in events if e is not None and e[0] != '__section__')
        print(f"    → {event_count} 件のイベントを読み込みました。")

        all_events.append((sheet_name, events))

    if not all_events:
        print("エラー: 対象シート（②③④）が見つかりませんでした。", file=sys.stderr)
        sys.exit(1)

    # TypeScript生成
    print("TypeScriptコードを生成中...")
    ts_code = generate_ts(all_events)

    if args.dry_run:
        print("\n--- 生成結果 (dry-run) ---")
        print(ts_code)
    else:
        # 出力ディレクトリが存在しない場合は作成
        out_path.parent.mkdir(parents=True, exist_ok=True)

        # バックアップ
        if out_path.exists():
            backup_path = out_path.with_suffix('.ts.bak')
            out_path.rename(backup_path)
            print(f"バックアップを作成しました: {backup_path}")

        out_path.write_text(ts_code, encoding='utf-8')
        print(f"生成完了: {out_path}")
        print(f"  行数: {len(ts_code.splitlines())}")

    print("完了。")


if __name__ == '__main__':
    main()
