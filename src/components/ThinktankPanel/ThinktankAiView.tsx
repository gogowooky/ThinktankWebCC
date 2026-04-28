/**
 * ThinktankAiView.tsx
 * AI相談でThinkを選定する表示モード（Phase 14 で接続）
 */

import { Sparkles } from 'lucide-react';
import './ThinktankAiView.css';

export function ThinktankAiView() {
  return (
    <div className="tt-ai-view">
      <Sparkles size={28} className="tt-ai-view__icon" />
      <p className="tt-ai-view__title">AI相談</p>
      <p className="tt-ai-view__desc">
        VaultのThinkをAIと相談しながら選定します。
        <br />
        Phase 14（AIチャットAPI）実装後に接続予定。
      </p>
    </div>
  );
}
