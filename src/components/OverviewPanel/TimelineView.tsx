/**
 * TimelineView.tsx
 * 第一の柱：思考のまとまりを時間軸で追体験するタイムライン表示コンポーネント。
 */

import { useEffect, useState, useCallback } from 'react';
import { TTThink } from '../../models/TTThink';
import { TTVault } from '../../models/TTVault';
import { TTApplication } from '../../views/TTApplication';
import type { HistoryMeta } from '../../services/storage/IStorageBackend';
import { Clock, Plus, ArrowRight, Eye, RefreshCw } from 'lucide-react';
import './TimelineView.css';

interface Props {
  think: TTThink;
  vault: TTVault;
  app: TTApplication;
}

export function TimelineView({ think, vault, app }: Props) {
  const [historyList, setHistoryList] = useState<HistoryMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedHistoryContent, setSelectedHistoryContent] = useState<string | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  const loadAllHistories = useCallback(async () => {
    if (!think || think.ContentType !== 'thought') return;
    setLoading(true);
    try {
      const thinkIds = [think.ID, ...think.getThinkIds()];
      const allMetas: HistoryMeta[] = [];
      for (const id of thinkIds) {
        const metas = await vault.LoadHistoryMeta(id);
        allMetas.push(...metas);
      }
      // 時系列の降順（新しいものが上）にソート
      allMetas.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setHistoryList(allMetas);
    } catch (e) {
      console.error('[TimelineView] load histories failed:', e);
    } finally {
      setLoading(false);
    }
  }, [think, vault]);

  useEffect(() => {
    loadAllHistories();
  }, [loadAllHistories]);

  const handleCreateSnapshot = async () => {
    const summary = window.prompt('このスナップショットの要約（任意）を入力してください:');
    if (summary === null) return;
    
    // Thought 自身のスナップショットを作成
    await think.CreateSnapshot(summary || '手動スナップショット');
    // 配下の modified な Think のスナップショットを一括作成
    const count = await vault.CreateSnapshotsForModifiedToday(summary || '手動スナップショット');
    
    // 画面再描画のために通知
    vault.NotifyUpdated();
    alert(`スナップショットを作成しました（Thought: 1件, 配下Think: ${count}件）`);
    loadAllHistories();
  };

  const handleViewHistoryContent = async (meta: HistoryMeta) => {
    if (activeHistoryId === meta.historyId) {
      setActiveHistoryId(null);
      setSelectedHistoryContent(null);
      return;
    }
    setActiveHistoryId(meta.historyId);
    setSelectedHistoryContent('ロード中...');
    const body = await vault.GetHistoryContent(meta.historyId);
    setSelectedHistoryContent(body || '本文がありません');
  };

  const handleRestoreToWorkout = async (meta: HistoryMeta) => {
    const body = await vault.GetHistoryContent(meta.historyId);
    if (!body) return;
    const restoreContent = `# [履歴復元] ${meta.title} (${new Date(meta.timestamp).toLocaleString()})\n\n${body}`;
    const newThink = await vault.CreateBlankThink('memo', restoreContent);
    app.OpenThinkInWorkout(newThink.ID);
  };

  return (
    <div className="timeline-view">
      <div className="timeline-view__header">
        <h3>
          <Clock size={16} className="timeline-view__clock-icon" />
          <span>「{think.Name}」 思考のタイムライン</span>
        </h3>
        <div className="timeline-view__header-actions">
          <button className="timeline-view__btn timeline-view__btn--refresh" onClick={loadAllHistories} title="更新">
            <RefreshCw size={14} />
          </button>
          <button className="timeline-view__btn timeline-view__btn--snapshot" onClick={handleCreateSnapshot}>
            <Plus size={14} />
            <span>スナップショットを生成</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="timeline-view__loading">
          <RefreshCw className="timeline-view__spinner" size={24} />
          <span>履歴を読み込み中...</span>
        </div>
      ) : historyList.length === 0 ? (
        <div className="timeline-view__empty">
          <span>履歴スナップショットがありません。<br />「スナップショットを生成」ボタンを押して、本日の思考の節目を記録しましょう。</span>
        </div>
      ) : (
        <div className="timeline-view__list">
          {historyList.map(meta => {
            const dateStr = new Date(meta.timestamp).toLocaleString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });
            const isThoughtHistory = meta.thinkId === think.ID;

            return (
              <div key={meta.historyId} className={`timeline-item ${isThoughtHistory ? 'timeline-item--thought' : ''}`}>
                <div className="timeline-item__badge" title={isThoughtHistory ? 'Thoughtグループ自体の変更履歴' : '個別Thinkの変更履歴'}>
                  {isThoughtHistory ? '群' : '単'}
                </div>
                <div className="timeline-item__connector"></div>
                <div className="timeline-item__content">
                  <div className="timeline-item__meta-row">
                    <span className="timeline-item__time">{dateStr}</span>
                    <span className="timeline-item__title" onClick={() => app.OpenThinkInWorkout(meta.thinkId)} title="Workoutで開く">
                      {meta.title}
                    </span>
                  </div>
                  {meta.summary && (
                    <div className="timeline-item__summary">
                      <span className="timeline-item__summary-label">要約:</span> {meta.summary}
                    </div>
                  )}
                  <div className="timeline-item__actions">
                    <button className="timeline-item__action-btn" onClick={() => handleViewHistoryContent(meta)}>
                      <Eye size={12} />
                      <span>{activeHistoryId === meta.historyId ? 'プレビューを閉じる' : '履歴を表示'}</span>
                    </button>
                    <button className="timeline-item__action-btn" onClick={() => handleRestoreToWorkout(meta)}>
                      <ArrowRight size={12} />
                      <span>復元（新規メモ）</span>
                    </button>
                  </div>

                  {activeHistoryId === meta.historyId && selectedHistoryContent && (
                    <div className="timeline-item__preview">
                      <pre>{selectedHistoryContent}</pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
