/**
 * ToolBar はモードが変わると入力欄へフォーカスする。表示だけ切り替えたいアクション
 * （ToolBar.HighlighterMode.Text:AddSelected など）のために、直後の1回だけそれを止める。
 * モード切替が実際には起きなかった場合に後の切替まで止めてしまわないよう、短時間で失効させる。
 */
const SUPPRESS_WINDOW_MS = 500;

let suppressUntil = 0;

export function suppressNextToolBarModeFocus(): void {
  suppressUntil = Date.now() + SUPPRESS_WINDOW_MS;
}

export function consumeToolBarModeFocusSuppression(): boolean {
  const suppressed = Date.now() < suppressUntil;
  suppressUntil = 0;
  return suppressed;
}
