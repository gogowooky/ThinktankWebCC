/**
 * AbstractView.tsx
 * Thinktank / Seeds / Discuss / Harvest に共通の「概要」サブパネル。
 * 作業の状態（未着手/進行中/待機 など）は chat から abstract ファイルへ移す予定で、
 * その表示が入るまでは枠だけを置く。
 */

import { BotMessageSquare } from 'lucide-react';
import './AbstractView.css';

export function AbstractView() {
  return (
    <div className="abstract-view" tabIndex={-1}>
      <BotMessageSquare size={20} className="abstract-view__icon" />
      <span>概要の表示は今後追加予定です。</span>
    </div>
  );
}
