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
