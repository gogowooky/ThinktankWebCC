import { useEffect, useState, useCallback, useRef } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { TTColumnView } from '../Column/TTColumnView';
import { Splitter } from './Splitter';
import './AppLayout.css';

/**
 * AppLayout - 3列グリッドレイアウト
 *
 * アプリケーション全幅・全高を使用。
 * 最大3つのTTColumnViewを横並びに配置し、列間Splitterで幅変更可能。
 * レスポンシブ: ウィンドウ幅に応じて1/2/3列に切替。
 */

const MIN_COL_RATIO = 0;
const STATUSBAR_HEIGHT = 22;
const LS_COL_RATIOS_KEY = 'thinktank-col-ratios';

function loadColRatios(app: TTApplication): [number, number, number] {
  try {
    const saved = localStorage.getItem(LS_COL_RATIOS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as number[];
      if (Array.isArray(parsed) && parsed.length === 3 && parsed.every(v => typeof v === 'number' && v >= 0)) {
        app.ColumnRatios.column0 = parsed[0];
        app.ColumnRatios.column1 = parsed[1];
        app.ColumnRatios.column2 = parsed[2];
        return [parsed[0], parsed[1], parsed[2]];
      }
    }
  } catch { /* ignore */ }
  return [app.ColumnRatios.column0, app.ColumnRatios.column1, app.ColumnRatios.column2];
}

export function AppLayout() {
  const app = TTApplication.Instance;

  // ウィンドウサイズ
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  // 列幅比率 (3列分) - localStorage から復元
  const [colRatios, setColRatios] = useState<[number, number, number]>(
    () => loadColRatios(app)
  );
  const colRatiosRef = useRef(colRatios);
  colRatiosRef.current = colRatios;

  // 列幅比率が変わるたびに localStorage へ保存
  useEffect(() => {
    try {
      localStorage.setItem(LS_COL_RATIOS_KEY, JSON.stringify(colRatios));
    } catch { /* ignore */ }
  }, [colRatios]);

  // TTApplication + 全TTColumn + TTModels（Status変化含む）の Observer を購読
  const [, setTick] = useState(0);
  useEffect(() => {
    const rerender = () => setTick(t => t + 1);
    app.AddOnUpdate('AppLayout', rerender);
    app.Columns.forEach((col, i) => col.AddOnUpdate(`AppLayout-col${i}`, rerender));
    app.Models.AddOnUpdate('AppLayout-models', rerender);
    return () => {
      app.RemoveOnUpdate('AppLayout');
      app.Columns.forEach((col, i) => col.RemoveOnUpdate(`AppLayout-col${i}`));
      app.Models.RemoveOnUpdate('AppLayout-models');
    };
  }, [app]);

  // ウィンドウリサイズ監視
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setSize({ width: w, height: h });
      app.UpdateLayout(w);
    };
    window.addEventListener('resize', handleResize);
    // 初期レイアウト
    app.UpdateLayout(window.innerWidth);
    return () => window.removeEventListener('resize', handleResize);
  }, [app]);

  // 列間Splitterドラッグ
  // splitterIndex: 0 = Column0↔Column1境界, 1 = Column1↔Column2境界
  const handleColumnResize = useCallback((splitterIndex: 0 | 1, deltaPx: number) => {
    const visibleCount = app.VisibleColumnCount;
    const splitterCount = visibleCount - 1;
    const totalWidth = size.width - splitterCount * 4; // splitter幅4px × 本数
    if (totalWidth <= 0) return;

    const deltaRatio = deltaPx / totalWidth;
    const r = [...colRatiosRef.current] as [number, number, number];

    const left = splitterIndex;
    const right = splitterIndex + 1;

    let newLeft = r[left] + deltaRatio;
    let newRight = r[right] - deltaRatio;

    if (newLeft < MIN_COL_RATIO) {
      newRight += newLeft;
      newLeft = MIN_COL_RATIO;
    }
    if (newRight < MIN_COL_RATIO) {
      newLeft += newRight;
      newRight = MIN_COL_RATIO;
    }
    if (newLeft < MIN_COL_RATIO || newRight < MIN_COL_RATIO) return;

    r[left] = newLeft;
    r[right] = newRight;

    // TTApplication にも反映
    app.ColumnRatios.column0 = r[0];
    app.ColumnRatios.column1 = r[1];
    app.ColumnRatios.column2 = r[2];

    setColRatios(r);
  }, [app, size.width]);

  // 表示列数とスプリッタ計算
  const visibleCount = app.VisibleColumnCount;
  const splitterCount = visibleCount - 1;
  const totalSplitterWidth = splitterCount * 4;
  const availableWidth = size.width - totalSplitterWidth;

  // 表示列の比率合計で正規化して幅を計算
  const visibleRatios = colRatios.slice(0, visibleCount);
  const ratioSum = visibleRatios.reduce((a, b) => a + b, 0);

  const columnWidths: number[] = [];
  for (let i = 0; i < visibleCount; i++) {
    columnWidths.push(Math.round(availableWidth * (colRatios[i] / ratioSum)));
  }
  // 丸め誤差補正
  const widthSum = columnWidths.reduce((a, b) => a + b, 0);
  if (columnWidths.length > 0) {
    columnWidths[columnWidths.length - 1] += (availableWidth - widthSum);
  }

  // レイアウト要素を構築
  const elements: React.ReactNode[] = [];
  for (let i = 0; i < visibleCount; i++) {
    if (i > 0) {
      elements.push(
        <Splitter
          key={`splitter-col-${i}`}
          direction="horizontal"
          onResize={(delta) => handleColumnResize((i - 1) as 0 | 1, delta)}
        />
      );
    }
    elements.push(
      <TTColumnView
        key={`column-${i}`}
        column={app.Columns[i]}
        width={columnWidths[i]}
        height={size.height - STATUSBAR_HEIGHT}
      />
    );
  }

  const activeCol = app.ActiveColumn;
  const statusText = `Column ${activeCol.Index + 1} | ${activeCol.FocusedPanel}`;

  return (
    <div className="app-root">
      <div className="app-layout">
        {elements}
      </div>
      <div className="app-statusbar">
        <span>{statusText}</span>
      </div>
    </div>
  );
}
