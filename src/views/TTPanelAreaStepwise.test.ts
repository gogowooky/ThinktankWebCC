// @vitest-environment jsdom
// jsdom を使う理由は TTPanelAreaWidth.test.ts と同じ（apiClient がモジュール評価時に window を参照する）。
//
// docs/Thinktank_Status-Action-Binding.md の
//   Action: FocusedPanel.Area.OpenStepwise / FocusedPanel.Area.CloseStepwise
// の受け入れ確認。設定エリアの見出し・<details> は実画面と同じクラス名の DOM を置いて代用する。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TTApplication } from './TTApplication';
import { TTUIStateManager } from './TTUIStateManager';
import { TTActions } from './TTActions';
import { registerFocusedPanelActions } from './TTFocusedPanelActions';

const app = TTApplication.Instance;
TTUIStateManager.instance.init(app);
registerFocusedPanelActions(app);

const result = (item: Awaited<ReturnType<typeof TTActions.Execute>>) => ('Result' in item ? item.Result : '');

/** Thinktank の設定エリアを模した DOM。open の数だけ見出しを開いた状態にする */
function mountThinktankArea(openHeaders: boolean[], openDetails = false): void {
  document.body.innerHTML = `
    <div class="thinktank-panel">
      <div class="vertical-tab-bar vertical-tab-bar--thinktank"><button id="tgl"></button></div>
      <div class="thinktank-area">
        ${openHeaders.map(o => `<div class="tt-settings-section__header"><svg class="lucide ${o ? 'lucide-chevron-down' : 'lucide-chevron-right'}"></svg></div>`).join('')}
        <details${openDetails ? ' open' : ''}><summary>s</summary></details>
      </div>
    </div>`;
}

beforeEach(() => {
  app.FocusedColumn = 'Thinktank';
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Action FocusedPanel.Area.OpenStepwise', () => {
  it('エリアが閉じていればエリアを開くだけ（下位項目は触らない）', async () => {
    mountThinktankArea([false]);
    app.ThinktankPanel.IsAreaOpen = false;
    const sections = vi.fn();
    window.addEventListener('tt-panel-sections-set-all', sections);
    const item = await TTActions.Execute('FocusedPanel.Area.OpenStepwise');
    window.removeEventListener('tt-panel-sections-set-all', sections);
    expect(app.ThinktankPanel.IsAreaOpen).toBe(true);
    expect(sections).not.toHaveBeenCalled();
    expect(result(item)).toBe('エリアを開いた');
  });

  it('エリアが開いていれば下位項目をすべて開く', async () => {
    mountThinktankArea([false, false]);
    app.ThinktankPanel.IsAreaOpen = true;
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('tt-panel-sections-set-all', listener);
    const item = await TTActions.Execute('FocusedPanel.Area.OpenStepwise');
    window.removeEventListener('tt-panel-sections-set-all', listener);
    expect(seen).toEqual([{ panelId: 'thinktank', open: true }]);
    expect(document.querySelector('details')?.open).toBe(true);
    expect(app.ThinktankPanel.IsAreaOpen).toBe(true);
    expect(result(item)).toBe('下位項目をすべて開いた');
  });
});

describe('Action FocusedPanel.Area.CloseStepwise', () => {
  it.each([
    ['見出しが1つ開いている', [true, false], false],
    ['<details> が開いている', [false, false], true],
  ])('%s ときは下位項目をすべて閉じるだけ', async (_label, headers, details) => {
    mountThinktankArea(headers, details);
    app.ThinktankPanel.IsAreaOpen = true;
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('tt-panel-sections-set-all', listener);
    const item = await TTActions.Execute('FocusedPanel.Area.CloseStepwise');
    window.removeEventListener('tt-panel-sections-set-all', listener);
    expect(seen).toEqual([{ panelId: 'thinktank', open: false }]);
    expect(document.querySelector('details')?.open).toBe(false);
    expect(app.ThinktankPanel.IsAreaOpen).toBe(true);
    expect(result(item)).toBe('下位項目をすべて閉じた');
  });

  it('下位項目がすべて閉じていればエリアを閉じる', async () => {
    mountThinktankArea([false, false]);
    app.ThinktankPanel.IsAreaOpen = true;
    const item = await TTActions.Execute('FocusedPanel.Area.CloseStepwise');
    expect(app.ThinktankPanel.IsAreaOpen).toBe(false);
    expect(result(item)).toBe('エリアを閉じた');
  });

  it('フォーカスのあるパネルを対象にする（FocusedColumn の更新が遅れていても）', async () => {
    document.body.innerHTML = `
      <div class="harvest-panel">
        <div class="vertical-tab-bar vertical-tab-bar--harvest"><button id="tgl"></button></div>
        <div class="harvest-area"></div>
      </div>`;
    (document.getElementById('tgl') as HTMLButtonElement).focus();
    app.FocusedColumn = 'Thinktank';
    app.ThinktankPanel.IsAreaOpen = true;
    app.HarvestPanel.IsAreaOpen = true;
    await TTActions.Execute('FocusedPanel.Area.CloseStepwise');
    expect(app.HarvestPanel.IsAreaOpen).toBe(false);
    expect(app.ThinktankPanel.IsAreaOpen).toBe(true);
  });
});
