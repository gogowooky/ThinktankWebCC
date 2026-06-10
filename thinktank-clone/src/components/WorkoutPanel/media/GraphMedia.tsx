// 関係グラフメディア（thought 中心の放射状グラフ）

import { useMemo } from 'react';
import type { TTThink } from '../../../models/TTThink';
import { app } from '../../../views/TTApplication';
import { useNotify } from '../../../hooks/useNotify';
import './GraphMedia.css';

export function GraphMedia({ think }: { think: TTThink }) {
  useNotify(think, app.Vault);
  const thinks = useMemo(
    () => (think.ContentType === 'thought' ? app.Vault.FilterByThought(think) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [think.Content, app.Vault.UpdateDate],
  );

  const W = 600;
  const H = 440;
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) / 2 - 70;

  return (
    <div className="graph-media">
      <svg viewBox={`0 0 ${W} ${H}`} className="graph-media__svg">
        {thinks.map((t, i) => {
          const angle = (2 * Math.PI * i) / Math.max(1, thinks.length) - Math.PI / 2;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          return (
            <g key={t.ID} onClick={() => void app.OpenThink(t.ID)} className="graph-media__node-group">
              <line x1={cx} y1={cy} x2={x} y2={y} className="graph-media__edge" />
              <circle cx={x} cy={y} r={16} className="graph-media__node" />
              <text x={x} y={y + 30} textAnchor="middle" className="graph-media__label">
                {(t.Name || t.ID).slice(0, 10)}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={26} className="graph-media__center" />
        <text x={cx} y={cy + 44} textAnchor="middle" className="graph-media__center-label">
          {(think.Name || '').slice(0, 16)}
        </text>
      </svg>
    </div>
  );
}
