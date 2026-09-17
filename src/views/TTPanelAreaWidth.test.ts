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
  Workout:   'WorkoutSettingPanel.Area.OpenWidth',
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

describe('Action FocusedPanel.Area.IsOpen:Toggle / :ToggleForEdit', () => {
  // 開くときの幅は、そのとき押したアクションが決める（Toggle=user / ToggleForEdit=foredit）。
  // 閉じるときは幅モードを触らない。
  beforeEach(() => { app.FocusedColumn = 'Thinktank'; app.ThinktankPanel.IsAreaOpen = true; });

  it('Toggle は閉じてから開くと User 位置になる', () => {
    const panel = app.ThinktankPanel;
    panel.AreaWidthMode = 'foredit';
    TTActions.Execute('FocusedPanel.Area.IsOpen:Toggle');            // 閉じる
    expect(panel.IsAreaOpen).toBe(false);
    expect(panel.AreaWidthMode).toBe('foredit');                     // 閉じるときは触らない
    TTActions.Execute('FocusedPanel.Area.IsOpen:Toggle');            // 開く
    expect(panel.IsAreaOpen).toBe(true);
    expect(panel.AreaWidthMode).toBe('user');
  });

  it('ToggleForEdit は閉じてから開くと ForEdit 位置になる', () => {
    const panel = app.ThinktankPanel;
    panel.AreaWidthMode = 'user';
    TTActions.Execute('FocusedPanel.Area.IsOpen:ToggleForEdit');     // 閉じる
    expect(panel.IsAreaOpen).toBe(false);
    expect(panel.AreaWidthMode).toBe('user');
    TTActions.Execute('FocusedPanel.Area.IsOpen:ToggleForEdit');     // 開く
    expect(panel.IsAreaOpen).toBe(true);
    expect(panel.AreaWidthMode).toBe('foredit');
  });

  it('開いた幅の変更は Status のリスナーへ届く', () => {
    const panel = app.ThinktankPanel;
    panel.AreaWidthMode = 'init';
    const seen: string[] = [];
    const listener = (_k: string, v: string) => seen.push(v);
    TTUIStateManager.instance.addListener('ThinktankPanel.Area.OpenWidth', listener);
    try {
      TTActions.Execute('FocusedPanel.Area.IsOpen:ToggleForEdit');   // 閉じる（通知なし）
      TTActions.Execute('FocusedPanel.Area.IsOpen:ToggleForEdit');   // 開く（foredit）
    } finally {
      TTUIStateManager.instance.removeListener('ThinktankPanel.Area.OpenWidth', listener);
    }
    expect(seen).toEqual(['foredit']);
  });

  it('ForEditで開くとき、他の ForEdit パネルは User に戻る', () => {
    // foredit はアプリ幅の割合を占めるので、同時に複数が foredit だと画面が破綻する
    app.OverviewPanel.AreaWidthMode = 'foredit';
    app.ReThinkPanel.AreaWidthMode  = 'foredit';
    app.WorkoutPanel.AreaWidthMode  = 'init';
    app.FocusedColumn = 'Thinktank';
    app.ThinktankPanel.IsAreaOpen = true;
    TTActions.Execute('FocusedPanel.Area.IsOpen:ToggleForEdit');   // 閉じる
    TTActions.Execute('FocusedPanel.Area.IsOpen:ToggleForEdit');   // 開く（foredit）
    expect(app.ThinktankPanel.AreaWidthMode).toBe('foredit');
    expect(app.OverviewPanel.AreaWidthMode).toBe('user');
    expect(app.ReThinkPanel.AreaWidthMode).toBe('user');
    expect(app.WorkoutPanel.AreaWidthMode).toBe('init');           // foredit 以外は触らない
  });

  it('User で開くときは他パネルの幅モードを触らない', () => {
    app.OverviewPanel.AreaWidthMode = 'foredit';
    app.FocusedColumn = 'Thinktank';
    app.ThinktankPanel.IsAreaOpen = true;
    TTActions.Execute('FocusedPanel.Area.IsOpen:Toggle');          // 閉じる
    TTActions.Execute('FocusedPanel.Area.IsOpen:Toggle');          // 開く（user）
    expect(app.ThinktankPanel.AreaWidthMode).toBe('user');
    expect(app.OverviewPanel.AreaWidthMode).toBe('foredit');
  });

  it('閉じるときは他パネルの幅モードを触らない', () => {
    app.OverviewPanel.AreaWidthMode = 'foredit';
    app.FocusedColumn = 'Thinktank';
    app.ThinktankPanel.IsAreaOpen = true;
    TTActions.Execute('FocusedPanel.Area.IsOpen:ToggleForEdit');   // 閉じるだけ
    expect(app.ThinktankPanel.IsAreaOpen).toBe(false);
    expect(app.OverviewPanel.AreaWidthMode).toBe('foredit');
  });

  it('幅モードを持たない列でも開閉自体は行う', () => {
    app.FocusedColumn = 'ToolBar';
    const item = TTActions.Execute('FocusedPanel.Area.IsOpen:Toggle');
    expect(('Result' in item ? item.Result : '')).toBe('[対象なし]');
  });
});

describe('Status 変更の通知', () => {
  // 退行防止: applyProperty は app.NotifyUpdated(false) しか呼ばず、TTNotifyBase の通知は
  // 親方向にしか伝播しない。パネルに登録した購読では発火しないので、幅を描画する側は
  // Status のリスナーで再レンダリングする必要がある（useResolvedAreaWidth が購読している）。
  it('Action 経由の変更が Status のリスナーへ届く', () => {
    app.FocusedColumn = 'Thinktank';
    const seen: string[] = [];
    const listener = (_k: string, v: string) => seen.push(v);
    TTUIStateManager.instance.addListener('ThinktankPanel.Area.OpenWidth', listener);
    try {
      TTActions.Execute('FocusedPanel.Area.OpenWidth:Toggle');
      TTActions.Execute('FocusedPanel.Area.OpenWidth:Toggle');
      TTActions.Execute('FocusedPanel.Area.OpenWidth:Initial');
    } finally {
      TTUIStateManager.instance.removeListener('ThinktankPanel.Area.OpenWidth', listener);
    }
    expect(seen).toEqual(['foredit', 'user', 'init']);
  });

  it('パネルへの通知だけでは他パネルの Status リスナーを起こさない', () => {
    const seen: string[] = [];
    const listener = (_k: string, v: string) => seen.push(v);
    TTUIStateManager.instance.addListener('OverviewPanel.Area.OpenWidth', listener);
    try {
      app.FocusedColumn = 'Thinktank';
      TTActions.Execute('FocusedPanel.Area.OpenWidth:ForEdit');
    } finally {
      TTUIStateManager.instance.removeListener('OverviewPanel.Area.OpenWidth', listener);
    }
    expect(seen).toEqual([]);
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
