/**
 * usePanelSectionsSetAll.ts
 * エリア開閉ボタンの Shift+クリックで、パネル内の開閉セクションを一括で開閉する。
 * セクションの開閉状態は各設定ビューのローカル state にあるため、
 * VerticalTabBar から panelId 付きのイベントで通知して各ビュー側で反映させる。
 */

import { useEffect, useRef } from 'react';

export type SectionsPanelId = 'thinktank' | 'seeds' | 'discuss' | 'harvest';

const EVENT_NAME = 'tt-panel-sections-set-all';

interface SetAllDetail {
  panelId: SectionsPanelId;
  open:    boolean;
}

export function broadcastPanelSectionsSetAll(panelId: SectionsPanelId, open: boolean): void {
  window.dispatchEvent(new CustomEvent<SetAllDetail>(EVENT_NAME, { detail: { panelId, open } }));
}

/** パネル内の開閉セクションと <details> をまとめて開く／閉じる */
export function setPanelSectionsAll(panelId: SectionsPanelId, open: boolean): void {
  broadcastPanelSectionsSetAll(panelId, open);
  document.querySelector(`.vertical-tab-bar--${panelId}`)?.parentElement
    ?.querySelectorAll('details')
    .forEach(d => { d.open = open; });
}

// 開閉状態は各ビューのローカル state にあり、表示中でないセクションの state も残っているため、
// 「いま開いて見えているか」は描画結果（見出しの下向き矢印・開いた <details>）から判定する。
// Discuss は Pane 側のMarkdownにも <details> があるので、設定エリアだけを見る。
const SECTIONS_AREA: Record<SectionsPanelId, string> = {
  thinktank: '.thinktank-area',
  seeds:     '.seeds-area',
  discuss:   '.discuss-setting-area',
  harvest:   '.harvest-area',
};
const SECTION_HEADER = '.tt-settings-section__header, .seeds-settings-section__header, .discuss-setting-area__section-header';

/** パネル内で開いて見えているセクション（または <details>）が1つでもあるか */
export function isAnyPanelSectionOpen(panelId: SectionsPanelId): boolean {
  const area = document.querySelector(SECTIONS_AREA[panelId]);
  if (!area) return false;
  if (area.querySelector('details[open]')) return true;
  return Array.from(area.querySelectorAll(SECTION_HEADER))
    .some(h => h.querySelector(':scope > svg.lucide-chevron-down'));
}

export function usePanelSectionsSetAll(
  panelId: SectionsPanelId,
  setters: ReadonlyArray<(open: boolean) => void>,
): void {
  // 呼び出し側が毎レンダー新しい配列を渡しても購読し直さないよう ref で最新を保持する
  const settersRef = useRef(setters);
  settersRef.current = setters;

  useEffect(() => {
    const handler = (e: Event) => {
      const { detail } = e as CustomEvent<SetAllDetail>;
      if (detail.panelId !== panelId) return;
      settersRef.current.forEach(set => set(detail.open));
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, [panelId]);
}
