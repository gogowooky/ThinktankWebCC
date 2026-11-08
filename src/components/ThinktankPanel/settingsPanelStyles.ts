/**
 * settingsPanelStyles.ts
 * Thinktank の設定パネル（Firebase / Google Drive）で共通の配色と入力欄の見た目。
 */

import type { CSSProperties } from 'react';

export const TEXT_MAIN = 'color-mix(in srgb, var(--thinktank-base, #1d618f) 30%, #16161f)';
export const TEXT_MUTED = 'var(--text-muted, #565f89)';
export const CARD_BG = 'var(--thinktank-content-bg, #ffffff)';
export const SUB_CARD_BG = 'var(--thinktank-tint-weak, #f2f7fa)';
export const BORDER_COLOR = 'var(--thinktank-border, rgba(29, 97, 143, 0.28))';

export const inputStyle: CSSProperties = {
  width: '100%',
  marginTop: '3px',
  padding: '5px 8px',
  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
  borderRadius: '4px',
  border: `1px solid ${BORDER_COLOR}`,
  backgroundColor: CARD_BG,
  color: TEXT_MAIN,
  boxSizing: 'border-box',
};
