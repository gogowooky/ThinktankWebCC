// @vitest-environment jsdom
// jsdom を使う理由: TTUIStateManager / TTApplication が services/storage/apiClient を読み込み、
// apiClient がモジュール評価時に `window` を参照するため（TTWorkoutPanel.test.ts と同じ事情）。
//
// docs/Thinktank_Status-Action-Binding.md の
//   Status: <Panel>Panel.Area.OpenWidth （init|user|foredit）
//   Action: FocusedPanel.Area.OpenWidth:Initial / :User / :ForEdit / :Toggle
// の受け入れ確認。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TTApplication } from './TTApplication';
import { TTUIStateManager } from './TTUIStateManager';
import { TTActions } from './TTActions';
import { registerFocusedPanelActions } from './TTFocusedPanelActions';
import { forEditAreaWidth, INIT_AREA_WIDTH, PANEL_CHROME_WIDTH } from '../utils/panelAreaWidth';
import * as deviceInfo from '../utils/deviceInfo';

const app = TTApplication.Instance;
TTUIStateManager.instance.init(app);
registerFocusedPanelActions(app);

const WIDTH_KEYS = {
  Thinktank: 'ThinktankPanel.Area.OpenWidth',
  Overview:  'OverviewPanel.Area.OpenWidth',
  Workout:   'WorkoutPanel.Area.OpenWidth',
  ReThink:   'ReThinkPanel.Area.OpenWidth',
} as const;

const panelOf = {
  Thinktank: () => app.ThinktankPanel,
  Overview:  () => app.OverviewPanel,
  Workout:   () => app.WorkoutPanel,
  ReThink:   () => app.ReThinkPanel,
};

beforeEach(() => {
  for (const get of Object.values(panelOf)) get().AreaWidthMode = 'init';
  vi.restoreAllMocks();
});

describe('Status <Panel>Panel.Area.OpenWidth', () => {
  it('既定は init で、init/user/foredit を読み書きできる', () => {
    for (const [name, key] of Object.entries(WIDTH_KEYS)) {
      const panel = panelOf[name as keyof typeof panelOf]();
      expect(TTUIStateManager.instance.getProperty(key)).toBe('init');
      for (const v of ['user', 'foredit', 'init'] as const) {
        TTUIStateManager.instance.applyProperty(key, v);
        expect(panel.AreaWidthMode).toBe(v);
        expect(TTUIStateManager.instance.getProperty(key)).toBe(v);
      }
    }
  });

  it('candidates 外の値は書き込まれない', () => {
    TTUIStateManager.instance.applyProperty(WIDTH_KEYS.Thinktank, 'foredit');
    TTUIStateManager.instance.applyProperty(WIDTH_KEYS.Thinktank, 'bogus');
    expect(app.ThinktankPanel.AreaWidthMode).toBe('foredit');
  });

  it('起動時のユーザー幅は各パネルの init 幅', () => {
    expect(app.ThinktankPanel.AreaUserWidth).toBe(INIT_AREA_WIDTH.Thinktank);
    expect(app.OverviewPanel.AreaUserWidth).toBe(INIT_AREA_WIDTH.Overview);
    expect(app.WorkoutPanel.AreaUserWidth).toBe(INIT_AREA_WIDTH.Workout);
    expect(app.ReThinkPanel.AreaUserWidth).toBe(INIT_AREA_WIDTH.ReThink);
  });
});

describe('Action FocusedPanel.Area.OpenWidth:*', () => {
  it.each([
    ['Thinktank', 'Thinktank'],
    ['Overview', 'Overview'],
    ['WorkoutSetting', 'Workout'],
    ['Workout', 'Workout'],
    ['ReThink', 'ReThink'],
  ])('フォーカス列 %s では %s パネルの幅モードを変える', (column, target) => {
    app.FocusedColumn = column;
    const panel = panelOf[target as keyof typeof panelOf]();
    TTActions.Execute('FocusedPanel.Area.OpenWidth:ForEdit');
    expect(panel.AreaWidthMode).toBe('foredit');
    TTActions.Execute('FocusedPanel.Area.OpenWidth:User');
    expect(panel.AreaWidthMode).toBe('user');
    TTActions.Execute('FocusedPanel.Area.OpenWidth:Initial');
    expect(panel.AreaWidthMode).toBe('init');
  });

  it('Toggle は User と ForEdit を往復する', () => {
    app.FocusedColumn = 'Thinktank';
    const panel = app.ThinktankPanel;
    // init から押したときは、まず広げる側へ倒す
    TTActions.Execute('FocusedPanel.Area.OpenWidth:Toggle');
    expect(panel.AreaWidthMode).toBe('foredit');
    TTActions.Execute('FocusedPanel.Area.OpenWidth:Toggle');
    expect(panel.AreaWidthMode).toBe('user');
    TTActions.Execute('FocusedPanel.Area.OpenWidth:Toggle');
    expect(panel.AreaWidthMode).toBe('foredit');
  });

  it('幅モードを持たない列では何も変えない', () => {
    app.FocusedColumn = 'ToolBar';
    const item = TTActions.Execute('FocusedPanel.Area.OpenWidth:ForEdit');
    expect(('Result' in item ? item.Result : '')).toBe('[対象なし]');
    expect(app.ThinktankPanel.AreaWidthMode).toBe('init');
  });
});

describe('foredit の幅', () => {
  // 返すのは Area の幅。縦タブバー・Splitter を足した「パネル全体」が割合どおりになる。
  it('iPhone はパネル全体がアプリ幅の100%', () => {
    vi.spyOn(deviceInfo, 'isIPhone').mockReturnValue(true);
    expect(forEditAreaWidth(1024) + PANEL_CHROME_WIDTH).toBe(1024);
  });
  it('その他はパネル全体がアプリ幅の50%', () => {
    vi.spyOn(deviceInfo, 'isIPhone').mockReturnValue(false);
    expect(forEditAreaWidth(1024) + PANEL_CHROME_WIDTH).toBe(512);
    expect(forEditAreaWidth(1280) + PANEL_CHROME_WIDTH).toBe(640);
  });
  it('狭いウィンドウでも下限を下回らない', () => {
    vi.spyOn(deviceInfo, 'isIPhone').mockReturnValue(false);
    expect(forEditAreaWidth(200)).toBe(120);
  });
});
