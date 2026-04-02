import { useEffect, useState, useCallback, useRef } from 'react';
import { TTColumn } from '../../views/TTColumn';
import { Splitter } from '../Layout/Splitter';
import './TTColumnView.css';

/**
 * TTColumnView - 1列分のUIコンポーネント
 *
 * 縦にDataGridPanel / WebViewPanel / TextEditorPanelを配置。
 * パネル間にSplitterを設置し、ドラッグで高さ比率を変更可能。
 * 列全高を3パネルで分割し、スクロールは使用しない。
 */

interface TTColumnViewProps {
  column: TTColumn;
  /** 列の幅(px) - 親(AppLayout)が管理 */
  width: number;
  /** 列の高さ(px) - 親(AppLayout)が管理 */
  height: number;
}

/** パネル高さ比率の最小値 */
const MIN_RATIO = 0.05;

export function TTColumnView({ column, width, height }: TTColumnViewProps) {
  const [ratios, setRatios] = useState<[number, number, number]>(
    () => [...column.VerticalRatios] as [number, number, number]
  );
  const ratiosRef = useRef(ratios);
  ratiosRef.current = ratios;

  // Column の Observer を購読してリレンダー
  const [, setTick] = useState(0);
  useEffect(() => {
    const key = `TTColumnView-${column.Index}`;
    column.AddOnUpdate(key, () => setTick(t => t + 1));
    return () => column.RemoveOnUpdate(key);
  }, [column]);

  // Splitter間ドラッグ: 上下パネル比率を変更
  // splitterIndex: 0 = DataGrid↔WebView境界, 1 = WebView↔TextEditor境界
  const handleVerticalResize = useCallback((splitterIndex: 0 | 1, deltaPx: number) => {
    const totalHeight = height - 8; // 2つのsplitter(各4px)
    if (totalHeight <= 0) return;

    const deltaRatio = deltaPx / totalHeight;
    const r = [...ratiosRef.current] as [number, number, number];

    const upper = splitterIndex;
    const lower = splitterIndex + 1;

    let newUpper = r[upper] + deltaRatio;
    let newLower = r[lower] - deltaRatio;

    // 最小比率の制約
    if (newUpper < MIN_RATIO) {
      newLower -= (MIN_RATIO - newUpper);
      newUpper = MIN_RATIO;
    }
    if (newLower < MIN_RATIO) {
      newUpper -= (MIN_RATIO - newLower);
      newLower = MIN_RATIO;
    }

    // まだ制約外なら諦める
    if (newUpper < MIN_RATIO || newLower < MIN_RATIO) return;

    r[upper] = newUpper;
    r[lower] = newLower;

    // TTColumn にも反映
    column.VerticalRatios = r;
    setRatios(r);
  }, [column, height]);

  // Splitter 分を引いた有効高さ
  const splitterTotal = 8; // 4px × 2
  const availableHeight = Math.max(0, height - splitterTotal);

  const panelHeights = [
    Math.round(availableHeight * ratios[0]),
    Math.round(availableHeight * ratios[1]),
    Math.round(availableHeight * ratios[2]),
  ];

  // 丸め誤差補正: 最後のパネルに吸収
  const sum = panelHeights[0] + panelHeights[1] + panelHeights[2];
  panelHeights[2] += (availableHeight - sum);

  if (!column.IsVisible) return null;

  return (
    <div
      className="column-view"
      style={{ width, height, flexShrink: 0 }}
      data-column-index={column.Index}
    >
      {/* DataGrid Panel */}
      <div
        className="panel-placeholder panel-datagrid"
        style={{ height: panelHeights[0] }}
      >
        DataGrid [{column.Index}]
        {column.DataGridFilter && ` | Filter: ${column.DataGridFilter}`}
      </div>

      {/* Splitter: DataGrid ↔ WebView */}
      <Splitter
        direction="vertical"
        onResize={(delta) => handleVerticalResize(0, delta)}
      />

      {/* WebView Panel */}
      <div
        className="panel-placeholder panel-webview"
        style={{ height: panelHeights[1] }}
      >
        WebView [{column.Index}]
        {column.WebViewUrl && ` | ${column.WebViewUrl}`}
      </div>

      {/* Splitter: WebView ↔ TextEditor */}
      <Splitter
        direction="vertical"
        onResize={(delta) => handleVerticalResize(1, delta)}
      />

      {/* TextEditor Panel */}
      <div
        className="panel-placeholder panel-texteditor"
        style={{ height: panelHeights[2] }}
      >
        TextEditor [{column.Index}]
        {column.EditorResource && ` | ${column.EditorResource}`}
      </div>
    </div>
  );
}
