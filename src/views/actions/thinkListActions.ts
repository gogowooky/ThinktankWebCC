/**
 * thinkListActions.ts
 * Think一覧（Thinktank / Seeds）のカーソル・チェック、フォーカス中パネルへの委譲、
 * AI相談メモピッカーのカーソル、種別・メニューのアイコン操作のアクション。
 *
 * registerFocusedPanelActions（views/TTFocusedPanelActions.ts）から登録順どおりに呼ばれる。
 */

import type { TTApplication } from '../TTApplication';
import type { ActionID } from '../TTAction';
import type { TTThink } from '../../models/TTThink';
import { TTActions } from '../TTActions';
import { getFocusName } from '../../utils/getFocusName';
import { cursorRowIndex } from '../../utils/thinkTree';
import { TTUIStateManager } from '../TTUIStateManager';

/** Think一覧のカーソルアクションが必要とするパネルの最小インターフェース */
type FilterCursorPanel = {
  CurrentItemID: string;
  CurrentItemRow: number;
  FilteredThoughts: TTThink[];
  CheckedThoughtIDs: string[];
  ToggleCheck(id: string | string[], forceChecked?: boolean): void;
};

/** Think一覧を持つパネル（Thinktank / Seeds）ごとのアクション生成定義 */
type FilterPanelSpec = {
  prefix: 'ThinktankPanel' | 'SeedsPanel';
  panelOf: () => FilterCursorPanel;
  currentItemKey: string;
  open: (id: string) => void;
};

export function registerThinkListActions(app: TTApplication): void {
  // ── Think一覧 カーソル アクション ──────────────────────────────────────
  /** Think一覧を持つパネルごとの定義（Thinktank / Seeds で共通のアクションを生成する） */
  const FILTER_PANELS: FilterPanelSpec[] = [
    {
      prefix: 'ThinktankPanel',
      panelOf: () => app.ThinktankPanel,
      currentItemKey: 'ThinktankPanel.CurrentItem.ID',
      // Bundle はその場で Seeds へ、それ以外は Working へ（一覧ダブルクリックと同じ挙動）
      open: (id) => {
        if (app.Models.Vault.GetThink(id)?.ContentType === 'project') {
          app.OpenProject(id, 'datagrid');
        } else {
          app.OpenThinkInWorking(id);
        }
      },
    },
    {
      prefix: 'SeedsPanel',
      panelOf: () => app.SeedsPanel,
      currentItemKey: 'SeedsPanel.CurrentItem.ID',
      open: (id) => { app.OpenThinkInWorking(id); },
    },
  ];

  /** カーソル位置の変化を Status へ通知する */
  const notifyCursor = (spec: FilterPanelSpec): void => {
    TTUIStateManager.instance.notifyPropertyChanged(spec.currentItemKey);
    TTUIStateManager.instance.notifyConstPropertyChanged(`${spec.prefix}.Filter.CursorPos`);
    TTUIStateManager.instance.notifyConstPropertyChanged(`${spec.prefix}.Filter.CursorPosID`);
  };

  /** カーソル位置のThinkを返す（一覧が空 / カーソルなしの場合は null） */
  const cursorThink = (spec: FilterPanelSpec): TTThink | null => {
    const panel = spec.panelOf();
    if (!panel.CurrentItemID) return null;
    return panel.FilteredThoughts.find(t => t.ID === panel.CurrentItemID) ?? null;
  };

  for (const spec of FILTER_PANELS) {
    for (const [suffix, dir] of [['PrevLine', -1], ['NextLine', 1]] as const) {
      TTActions.Register({
        ActionID: `${spec.prefix}.Filter.CursorPos:${suffix}` as ActionID,
        Description: `${spec.prefix}>Think一覧のカーソルを${suffix === 'PrevLine' ? '1行前' : '1行後'}に移動する`,
        Completion: (item) => {
          const panel = spec.panelOf();
          const list = panel.FilteredThoughts;
          if (list.length === 0) { item.Result = '[一覧なし]'; return; }
          const curIdx = cursorRowIndex(list, panel.CurrentItemID, panel.CurrentItemRow);
          // カーソル未表示（0行）からの移動は方向によらず先頭行へ
          const nextIdx = curIdx < 0
            ? 0
            : Math.max(0, Math.min(curIdx + dir, list.length - 1));
          panel.CurrentItemID = list[nextIdx].ID;
          panel.CurrentItemRow = nextIdx;
          notifyCursor(spec);
          item.Result = `行${nextIdx + 1}: ${list[nextIdx].Name || list[nextIdx].ID}`;
        },
      });
    }

    TTActions.Register({
      ActionID: `${spec.prefix}.Filter.Cursor:Action` as ActionID,
      Description: `${spec.prefix}>Think一覧のカーソル位置のアイテムを開く`,
      Completion: (item) => {
        const think = cursorThink(spec);
        if (!think) { item.Result = '[カーソルなし]'; return; }
        spec.open(think.ID);
        item.Result = `開く: ${think.Name || think.ID}`;
      },
    });

    TTActions.Register({
      ActionID: `${spec.prefix}.Filter.Cursor:ToggleCheck` as ActionID,
      Description: `${spec.prefix}>Think一覧のカーソル位置のチェック状態をトグルする`,
      Completion: (item) => {
        const think = cursorThink(spec);
        if (!think) { item.Result = '[カーソルなし]'; return; }
        const panel = spec.panelOf();
        panel.ToggleCheck(think.ID);
        const checked = panel.CheckedThoughtIDs.includes(think.ID);
        item.Result = `${checked ? 'チェック' : 'チェック解除'}: ${think.Name || think.ID}`;
      },
    });
  }

  // ── FocusedPanel（フォーカス中パネル）向けの委譲アクション ────────────────
  // docs\DefaultShortcut.md の focus 列を Thinktank/Seeds で使い分けずに1定義で
  // 済ませるための、フォーカス中パネルへディスパッチする総称アクション。

  // キーボードフォーカスが実際に今ある位置からパネル名を解決する。
  // app.FocusedColumn は focusin→rAF 経由の遅延キャッシュで、rAF 未発火時や
  // パネルレベルの名前が取れないときに古い値が残る。ショートカットの focus 条件
  // (*Filter / *Chat) と同じ getFocusName を基準にして齟齬をなくす。
  const focusedColumnLive = (): string => {
    const col = getFocusName(document.activeElement).split('.')[0];
    return col && col !== 'None' ? col : app.FocusedColumn;
  };

  /** フォーカス中パネル配下の要素集合（Thinktank / Seeds 以外は空） */
  const focusedFilterPanelRoots = (): Element[] => {
    switch (focusedColumnLive()) {
      case 'Thinktank': return Array.from(document.querySelectorAll('.thinktank-panel, .thinktank-area'));
      case 'Seeds': return Array.from(document.querySelectorAll('.seeds-panel, .seeds-area'));
      default: return [];
    }
  };

  /** フォーカス中パネルが持つ Think一覧のアクションプレフィックス（持たなければ null） */
  const focusedFilterPrefix = (): 'ThinktankPanel' | 'SeedsPanel' | null => {
    switch (focusedColumnLive()) {
      case 'Thinktank': return 'ThinktankPanel';
      case 'Seeds': return 'SeedsPanel';
      default: return null;
    }
  };

  for (const [suffix, label] of [
    ['CursorPos:PrevLine', 'カーソルを1行前に移動する'],
    ['CursorPos:NextLine', 'カーソルを1行後に移動する'],
    ['Cursor:Action', 'カーソル位置のアイテムを開く'],
  ] as const) {
    TTActions.Register({
      ActionID: `FocusedPanel.Filter.${suffix}`,
      Description: `フォーカスパネルのThink一覧の${label}`,
      Completion: (item) => {
        const prefix = focusedFilterPrefix();
        if (!prefix) { item.Result = '[Think一覧なし]'; return; }
        const res = TTActions.Execute(`${prefix}.Filter.${suffix}`, item.Mods);
        if (res instanceof Promise) return res.then(r => { item.Result = r.Result; });
        item.Result = res.Result;
      },
    });
  }

  // ── AI相談メモピッカーのカーソル操作（軽量: フォーカス中パネルの DOM 経由）──
  // AI相談の chat ファイル一覧（ThinktankChatMemoPicker）は React ローカル state 駆動で
  // モデル層のカーソルを持たないため、その ThoughtsList（ArrowUp/Down/Enter 対応済み）へ
  // 直接キーイベントを送って操作する。

  /** フォーカス中パネル（Thinktank / Seeds）の AI相談メモピッカー内 ThoughtsList 要素 */
  const focusedChatMemoList = (): HTMLElement | null => {
    for (const root of focusedFilterPanelRoots()) {
      const list = root.querySelector<HTMLElement>('.tt-chat-picker .thoughts-list');
      if (list) return list;
    }
    return null;
  };

  for (const [suffix, key, label] of [
    ['CursorPos:PrevLine', 'ArrowUp', 'カーソルを1行前に移動する'],
    ['CursorPos:NextLine', 'ArrowDown', 'カーソルを1行後に移動する'],
  ] as const) {
    TTActions.Register({
      ActionID: `FocusedPanel.AIChat.${suffix}`,
      Description: `フォーカスパネルのAI相談の${label}`,
      Completion: (item) => {
        const list = focusedChatMemoList();
        if (!list) { item.Result = '[AI相談なし]'; return; }
        list.focus();
        list.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        item.Result = suffix === 'CursorPos:PrevLine' ? '1行前' : '1行後';
      },
    });
  }

  TTActions.Register({
    ActionID: 'FocusedPanel.AIChat.Cursor:Action',
    Description: 'フォーカスパネルのAI相談のカーソル位置を開く',
    Completion: (item) => {
      // メモピッカーはカーソル移動時に対象 chat を即ロードするため、
      // 「開く」= その対話へ入る（チャット入力欄へフォーカスを移す）
      const list = focusedChatMemoList();
      if (!list) { item.Result = '[AI相談なし]'; return; }
      const input = list
        .closest('.thinktank-area__chat-wrap, .seeds-area__chat-wrap')
        ?.querySelector<HTMLTextAreaElement>('.ai-chat-view__input');
      if (!input) { item.Result = '[入力欄なし]'; return; }
      input.focus();
      item.Result = '対話へ移動';
    },
  });

  // ── Think一覧 アイコンストリップのフォーカス移動・押下（軽量: DOM 経由）──
  // 種別アイコン群やメニューリボンのボタンは React ローカル state 駆動でモデル層の
  // カーソルを持たないため、実 DOM のボタン要素をキーボードフォーカスのカーソルとして
  // 扱う。押下は種別/メニュー共通の FocusedIcon:Action が click() で委譲する。

  /** アイコン要素の表示ラベル（aria-label → data-tip → 親 .tooltip-wrapper の data-tip） */
  const iconLabelOf = (el: HTMLElement): string =>
    el.getAttribute('aria-label')
    ?? el.getAttribute('data-tip')
    ?? el.closest('.tooltip-wrapper')?.getAttribute('data-tip')
    ?? 'アイコン';

  /** 1つのボタン群に対して :Next / :Prev（循環フォーカス移動）を登録する */
  const registerIconStripNav = (
    base: string,
    noun: string,
    getButtons: () => HTMLElement[],
    emptyMsg: string,
  ): void => {
    for (const [suffix, dir] of [['Prev', -1], ['Next', 1]] as const) {
      TTActions.Register({
        ActionID: `${base}:${suffix}`,
        Description: `フォーカスパネルのThink一覧の${noun}フォーカスを${suffix === 'Prev' ? '前' : '次'}に移動する`,
        Completion: (item) => {
          const btns = getButtons();
          if (btns.length === 0) { item.Result = emptyMsg; return; }
          const cur = btns.indexOf(document.activeElement as HTMLElement);
          // 未フォーカスからは Next=先頭 / Prev=末尾、以降は循環
          const next = cur < 0
            ? (dir > 0 ? 0 : btns.length - 1)
            : (cur + dir + btns.length) % btns.length;
          btns[next].focus();
          item.Result = `${iconLabelOf(btns[next])}（${next + 1}/${btns.length}）`;
        },
      });
    }
  };

  /** フォーカス中パネルの Think一覧 種別アイコン群（左→右順）。
   *  Thinktank は .tt-search-bar__*、Seeds は .seeds-search-bar__* と接頭辞が異なる。 */
  const focusedTypeFilterButtons = (): HTMLElement[] => {
    for (const root of focusedFilterPanelRoots()) {
      const group = root.querySelector('.tt-search-bar__types, .seeds-search-bar__types');
      if (group) {
        return Array.from(
          group.querySelectorAll<HTMLElement>(
            '.tt-search-bar__type-btn, .tt-search-bar__type-all, .seeds-search-bar__type-btn, .seeds-search-bar__type-all',
          ),
        );
      }
    }
    return [];
  };

  /** フォーカス中パネルの Think一覧 メニューリボンのボタン群（左→右順、無効ボタンは除く） */
  const focusedMenuRibbonButtons = (): HTMLElement[] => {
    for (const root of focusedFilterPanelRoots()) {
      const ribbon = root.querySelector('.thinktank-menu-ribbon, .seeds-menu-ribbon');
      if (ribbon) {
        return Array.from(ribbon.querySelectorAll<HTMLButtonElement>('.menu-ribbon__btn'))
          .filter(b => !b.disabled);
      }
    }
    return [];
  };

  registerIconStripNav('FocusedPanel.Filter.ContentType', '種別アイコン', focusedTypeFilterButtons, '[種別フィルタなし]');
  registerIconStripNav('FocusedPanel.Filter.Menu', 'メニューアイコン', focusedMenuRibbonButtons, '[メニューなし]');

  // 種別 / メニューを問わず、いまキーボードフォーカスがあるアイコンを押下する
  TTActions.Register({
    ActionID: 'FocusedPanel.Filter.FocusedIcon:Action',
    Description: 'フォーカスパネルのThink一覧でフォーカス中のアイコンを押下する',
    Completion: (item) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) { item.Result = '[アイコン未フォーカス]'; return; }
      const known = [...focusedTypeFilterButtons(), ...focusedMenuRibbonButtons()];
      if (!known.includes(active)) { item.Result = '[アイコン未フォーカス]'; return; }
      active.click();
      item.Result = iconLabelOf(active);
    },
  });
}
