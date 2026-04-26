/**
 * GraphMedia.tsx
 * react-force-graph による関係グラフ表示メディア。
 *
 * - 中心ノード: 現在の Think（赤橙）
 * - RelatedIDs に含まれる Think をエッジでつなぐ（青）
 * - ContentType='thought' の場合は参照 Think 群もエッジで表示（緑）
 * - コンテナサイズに追従（ResizeObserver）
 */

import { useRef, useState, useEffect, useMemo } from 'react';
import type { MediaProps } from './types';
import './GraphMedia.css';

// react-force-graph のデフォルトエクスポートは各形式のコンポーネント
// TypeScript 型がパッケージに含まれているが型ガードとして any を使用
/* eslint-disable @typescript-eslint/no-explicit-any */

let ForceGraph2D: any = null;

// 動的インポートで SSR/型問題を回避
async function loadForceGraph() {
  if (ForceGraph2D) return;
  try {
    const mod = await import('react-force-graph');
    ForceGraph2D = (mod as any).ForceGraph2D ?? (mod as any).default?.ForceGraph2D ?? (mod as any).default;
  } catch (e) {
    console.warn('[GraphMedia] react-force-graph のロードに失敗しました', e);
  }
}

interface GraphNode {
  id:       string;
  name:     string;
  type:     string;
  isFocus?: boolean;
  isRef?:   boolean;
}

interface GraphLink {
  source: string;
  target: string;
}

function nodeColor(node: GraphNode): string {
  if (node.isFocus) return '#ff6b6b';
  if (node.isRef)   return '#66bb6a';
  return '#7aa2f7';
}

function nodeLabel(node: GraphNode): string {
  return node.name.length > 18 ? node.name.slice(0, 18) + '…' : node.name;
}

export function GraphMedia({ think, vault }: MediaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize]         = useState({ w: 400, h: 300 });
  const [loaded, setLoaded]     = useState(false);
  const [, forceUpdate]         = useState(0);

  // コンテナサイズ追従
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(100, width), h: Math.max(100, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // react-force-graph 動的ロード
  useEffect(() => {
    loadForceGraph().then(() => {
      setLoaded(true);
      forceUpdate(n => n + 1);
    });
  }, []);

  // グラフデータ構築
  const graphData = useMemo(() => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    if (!think) return { nodes, links };

    // 中心ノード
    nodes.push({ id: think.ID, name: think.Name, type: think.ContentType, isFocus: true });

    // RelatedIDs によるエッジ
    const relatedIds = think.RelatedIDs
      ? think.RelatedIDs.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    relatedIds.forEach(rid => {
      const related = vault.GetThink(rid);
      if (!related) return;
      if (!nodes.find(n => n.id === related.ID)) {
        nodes.push({ id: related.ID, name: related.Name, type: related.ContentType });
      }
      links.push({ source: think.ID, target: related.ID });
    });

    // Thought の参照 Think
    if (think.ContentType === 'thought') {
      vault.GetThinksForThought(think.ID).forEach(rt => {
        if (!nodes.find(n => n.id === rt.ID)) {
          nodes.push({ id: rt.ID, name: rt.Name, type: rt.ContentType, isRef: true });
        }
        links.push({ source: think.ID, target: rt.ID });
      });
    }

    return { nodes, links };
  }, [think, vault]);

  if (!think) {
    return <div className="media-empty"><span>エリアが未設定です</span></div>;
  }

  return (
    <div ref={containerRef} className="graph-media">
      {loaded && ForceGraph2D ? (
        <ForceGraph2D
          graphData={graphData}
          width={size.w}
          height={size.h}
          backgroundColor="#f8f9fc"
          nodeLabel={(node: GraphNode) => nodeLabel(node)}
          nodeColor={(node: GraphNode) => nodeColor(node)}
          nodeRelSize={5}
          nodeVal={(node: GraphNode) => node.isFocus ? 3 : 1}
          linkColor={() => 'rgba(0,0,0,0.15)'}
          linkWidth={1}
          enableNodeDrag
          enableZoomInteraction
          onNodeClick={(node: GraphNode) => {
            console.log('[GraphMedia] node click:', node.id, node.name);
          }}
        />
      ) : (
        <div className="graph-media__loading">グラフ読み込み中…</div>
      )}

      {/* 凡例 */}
      <div className="graph-media__legend">
        <span className="graph-media__legend-item graph-media__legend-item--focus">現在</span>
        <span className="graph-media__legend-item graph-media__legend-item--related">関連</span>
        <span className="graph-media__legend-item graph-media__legend-item--ref">参照</span>
      </div>
    </div>
  );
}
