// データグリッドメディア：table はセル編集・行/列追加、thought は含有Think一覧

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TTThink } from '../../../models/TTThink';
import { app } from '../../../views/TTApplication';
import { useNotify } from '../../../hooks/useNotify';
import { parseTableContent, tableSectionToContent, type TableSection } from '../../../utils/tableFormat';
import './DataGridMedia.css';

export function DataGridMedia({ think, areaId }: { think: TTThink; areaId: string }) {
  if (think.ContentType === 'thought') {
    return <ThoughtGrid think={think} />;
  }
  return <TableGrid think={think} areaId={areaId} />;
}

// ── thought: 含有Think一覧グリッド ──────────────────────

function ThoughtGrid({ think }: { think: TTThink }) {
  useNotify(app.Vault, think);
  const thinks = useMemo(
    () => app.Vault.FilterByThought(think),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [think.Content, app.Vault.UpdateDate],
  );

  return (
    <div className="datagrid-media" data-focusable="Workout.DataGrid" tabIndex={0}>
      <table className="datagrid-media__table">
        <thead>
          <tr>
            <th>種類</th><th>タイトル</th><th>更新日</th><th>ID</th>
          </tr>
        </thead>
        <tbody>
          {thinks.map((t) => (
            <tr key={t.ID} onDoubleClick={() => void app.OpenThink(t.ID)}>
              <td>{t.ContentType}</td>
              <td>{t.Name}</td>
              <td>{t.UpdateDate.slice(0, 10)}</td>
              <td className="datagrid-media__id">{t.ID}</td>
            </tr>
          ))}
          {thinks.length === 0 && (
            <tr><td colSpan={4} className="datagrid-media__empty">含まれるThinkがありません</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── table: 編集可能グリッド ─────────────────────────────

function TableGrid({ think, areaId }: { think: TTThink; areaId: string }) {
  useNotify(think);
  const [section, setSection] = useState<TableSection>(() => parseTableContent(think.Content));
  const [cursor, setCursor] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [editing, setEditing] = useState<{ row: number; col: number; value: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 外部編集（テキストエディタ等）の反映
  useEffect(() => {
    setSection(parseTableContent(think.Content));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [think.Content]);

  const commit = (next: TableSection) => {
    setSection(next);
    think.Content = tableSectionToContent(next);
    think.NotifyUpdated(false);
  };

  const startEdit = (row: number, col: number) => {
    setEditing({ row, col, value: section.rows[row]?.[col] ?? '' });
  };

  const finishEdit = (save: boolean) => {
    if (!editing) return;
    if (save) {
      const rows = section.rows.map((r) => [...r]);
      while (rows.length <= editing.row) rows.push([]);
      while (rows[editing.row].length <= editing.col) rows[editing.row].push('');
      rows[editing.row][editing.col] = editing.value;
      commit({ ...section, rows });
    }
    setEditing(null);
    containerRef.current?.focus();
  };

  const addRow = () => {
    const rows = [...section.rows, section.columns.map(() => '')];
    commit({ ...section, rows });
    setCursor({ row: rows.length - 1, col: 0 });
  };

  const addColumn = () => {
    const name = `col${section.columns.length + 1}`;
    const columns = [...section.columns, name];
    const rows = section.rows.map((r) => [...r, '']);
    commit({ ...section, columns, rows });
  };

  const deleteRow = () => {
    if (section.rows.length === 0) return;
    const rows = section.rows.filter((_, i) => i !== cursor.row);
    // rawLines 上の該当データ行を除去し dataIndex を振り直す
    let di = 0;
    const rawLines = section.rawLines
      .filter((l) => !(l.type === 'data' && l.dataIndex === cursor.row))
      .map((l) => (l.type === 'data' ? { ...l, dataIndex: di++ } : l));
    commit({ ...section, rows, rawLines });
    setCursor((c) => ({ ...c, row: Math.max(0, Math.min(c.row, rows.length - 1)) }));
  };

  // フォーカス時にDataGridアクションを登録
  const registerHandlers = () => {
    app.Workout.SetFocusedArea(areaId);
    app.MediaActionHandlers.set('DataGrid.EditCell', () => startEdit(cursor.row, cursor.col));
    app.MediaActionHandlers.set('DataGrid.AddRow', addRow);
    app.MediaActionHandlers.set('DataGrid.AddColumn', addColumn);
    app.MediaActionHandlers.set('DataGrid.DeleteRow', deleteRow);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return;
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      setCursor((c) => ({
        row: Math.max(0, Math.min(section.rows.length - 1, c.row + dr)),
        col: Math.max(0, Math.min(section.columns.length - 1, c.col + dc)),
      }));
    };
    switch (e.key) {
      case 'ArrowUp': move(-1, 0); break;
      case 'ArrowDown': move(1, 0); break;
      case 'ArrowLeft': move(0, -1); break;
      case 'ArrowRight': move(0, 1); break;
      case 'Tab': move(0, e.shiftKey ? -1 : 1); break;
      default: break;
    }
  };

  return (
    <div
      ref={containerRef}
      className="datagrid-media"
      data-focusable="Workout.DataGrid"
      tabIndex={0}
      onFocus={registerHandlers}
      onKeyDown={onKeyDown}
    >
      <div className="datagrid-media__toolbar">
        <button onClick={addRow} data-tip="行を追加 (Ctrl+Enter)">+ 行</button>
        <button onClick={addColumn} data-tip="列を追加 (Ctrl+Shift+Enter)">+ 列</button>
        <button onClick={deleteRow} data-tip="行を削除 (Ctrl+Delete)">− 行</button>
        <span className="datagrid-media__hint">Enter/F2: 編集　矢印: 移動</span>
      </div>
      <div className="datagrid-media__scroll">
        <table className="datagrid-media__table">
          <thead>
            <tr>
              {section.columns.map((c, i) => <th key={i}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, ri) => (
              <tr key={ri}>
                {section.columns.map((_, ci) => {
                  const isCursor = cursor.row === ri && cursor.col === ci;
                  const isEditing = editing?.row === ri && editing?.col === ci;
                  return (
                    <td
                      key={ci}
                      className={isCursor ? 'datagrid-media__cell--cursor' : ''}
                      onClick={() => setCursor({ row: ri, col: ci })}
                      onDoubleClick={() => startEdit(ri, ci)}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          className="datagrid-media__cell-input"
                          value={editing.value}
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          onBlur={() => finishEdit(true)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') finishEdit(true);
                            else if (e.key === 'Escape') finishEdit(false);
                          }}
                        />
                      ) : (
                        row[ci] ?? ''
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {section.rows.length === 0 && (
              <tr><td colSpan={Math.max(1, section.columns.length)} className="datagrid-media__empty">データ行がありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
