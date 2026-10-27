/**
 * AbstractView.tsx
 * Thinktank / Seeds / Discuss / Harvest に共通の「プロジェクト」サブパネル。
 */

import { Target } from 'lucide-react';
import './AbstractView.css';

export function AbstractView() {
  return (
    <div className="abstract-view" tabIndex={-1}>
      <Target size={20} className="abstract-view__icon" />
      <span>プロジェクトの表示は今後追加予定です。</span>
    </div>
  );
}

export const ProjectView = AbstractView;
