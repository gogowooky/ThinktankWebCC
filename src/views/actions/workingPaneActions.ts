/**
 * workingPaneActions.ts
 * WorkingPanel の Pane 移動・ファイル履歴・新規作成・表示モードのアクション。
 *
 * registerFocusedPanelActions（views/TTFocusedPanelActions.ts）から登録順どおりに呼ばれる。
 */

import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { TTUIStateManager } from '../TTUIStateManager';
import { showMonacoMenu } from '../../utils/monacoMenu';
import { collectAreaIds } from '../TTWorkingPanel';

/** FileHistory:AddNew で新規作成するファイルの仮タイトル（種別ごと） */
const NEW_FILE_TITLES: Partial<Record<string, string>> = {
  memo: '新規メモ',
  table: '新規テーブル',
  html: '新規HTML',
  links: '新規リンク',
  chat: '新しい相談',
  aiview: '新規AIまとめ',
};

export function registerWorkingPaneActions(app: TTApplication): void {
  TTActions.Register({
    ActionID: 'WorkingPanel.FocusedPane.PaneNumber:Next',
    Description: 'フォーカスペインを次のペインに移動する',
    Completion: (item) => {
      const wPanel = app.WorkingPanel;
      const layout = wPanel.Layout;
      if (!layout) { item.Result = '[レイアウトなし]'; return; }
      const order = collectAreaIds(layout);
      if (order.length <= 1) { item.Result = '[ペイン数不足]'; return; }

      const curIdx = wPanel.FocusedAreaId ? order.indexOf(wPanel.FocusedAreaId) : -1;
      const nextIdx = curIdx >= 0 ? (curIdx + 1) % order.length : 0;
      const nextAreaId = order[nextIdx];

      wPanel.FocusArea(nextAreaId);
      item.Result = `Pane ${nextIdx + 1}`;
    },
  });

  TTActions.Register({
    ActionID: 'WorkingPanel.FocusedPane.PaneNumber:Prev',
    Description: 'フォーカスペインを前のペインに移動する',
    Completion: (item) => {
      const wPanel = app.WorkingPanel;
      const layout = wPanel.Layout;
      if (!layout) { item.Result = '[レイアウトなし]'; return; }
      const order = collectAreaIds(layout);
      if (order.length <= 1) { item.Result = '[ペイン数不足]'; return; }

      const curIdx = wPanel.FocusedAreaId ? order.indexOf(wPanel.FocusedAreaId) : -1;
      const prevIdx = curIdx >= 0 ? (curIdx - 1 + order.length) % order.length : order.length - 1;
      const prevAreaId = order[prevIdx];

      wPanel.FocusArea(prevAreaId);
      item.Result = `Pane ${prevIdx + 1}`;
    },
  });

  /** Pane番号順（collectAreaIds）の index 番目のPaneへフォーカスを移す */
  const focusPaneAt = (item: { Result: string }, pick: (count: number) => number): void => {
    const wPanel = app.WorkingPanel;
    const layout = wPanel.Layout;
    if (!layout) { item.Result = '[レイアウトなし]'; return; }
    const order = collectAreaIds(layout);
    if (order.length === 0) { item.Result = '[ペインなし]'; return; }
    const idx = pick(order.length);
    wPanel.FocusArea(order[idx]);
    item.Result = `Pane ${idx + 1}`;
  };

  TTActions.Register({
    ActionID: 'WorkingPanel.FocusedPane.PaneNumber:First',
    Description: 'フォーカスペインを最初のペインに移動する',
    Completion: (item) => focusPaneAt(item, () => 0),
  });

  TTActions.Register({
    ActionID: 'WorkingPanel.FocusedPane.PaneNumber:Last',
    Description: 'フォーカスペインを最後のペインに移動する',
    Completion: (item) => focusPaneAt(item, count => count - 1),
  });

  TTActions.Register({
    ActionID: 'WorkingPanel.FocusedPane.PaneNumber:ReFocus',
    Description: 'WorkingPanelの現在フォーカス中のPaneに再度フォーカスする',
    Completion: (item) => {
      const wPanel = app.WorkingPanel;
      const areaId = wPanel.FocusedAreaId;
      if (!areaId) { item.Result = '[対象Paneなし]'; return; }

      // FocusArea() は同一ID指定時 no-op のため、WorkingArea側の
      // フォーカス適用エフェクト（isFocused: false→true の変化）を
      // 強制的に再発火させるため、一度 null にしてから次のマクロタスクで再設定する
      // （同一タスク内での再設定は React のバッチ処理により変化なしと扱われるため効かない）
      wPanel.FocusedAreaId = null;
      wPanel.NotifyUpdated();
      setTimeout(() => {
        wPanel.FocusArea(areaId);
      }, 0);
      item.Result = 'Paneに再フォーカスしました';
    },
  });

  // ── Pane毎のLoadファイル履歴 ───────────────────────────────────────────
  /** フォーカスされているPane（WorkingArea）を返す */
  const focusedArea = () => {
    const id = app.WorkingPanel.FocusedAreaId;
    return id ? (app.WorkingPanel.GetArea(id) ?? null) : null;
  };

  const notifyFileHistory = (): void => {
    TTUIStateManager.instance.notifyConstPropertyChanged('WorkingPanel.FocusedPane.FileHistory');
    TTUIStateManager.instance.notifyConstPropertyChanged('WorkingPanel.FocusedPane.FileHistoryPos');
    TTUIStateManager.instance.notifyConstPropertyChanged('WorkingPanel.FocusedPane.FileHistoryMax');
  };

  TTActions.Register({
    ActionID: 'WorkingPanel.FocusedPane.FileHistory:Next',
    Description: 'フォーカスペインのファイル履歴を1つ後の位置に進める',
    Completion: (item) => {
      const area = focusedArea();
      if (!area) { item.Result = '[対象Paneなし]'; return; }
      // 末尾位置には進む先のIDが無いため、HistoryMaxが上限(30)か否かに関わらずロードしない
      if (area.HistoryPos >= area.HistoryMax) { item.Result = '[履歴の末尾]'; return; }
      const entry = area.LoadHistoryAt(area.HistoryPos + 1);
      if (!entry) { item.Result = '[履歴なし]'; return; }
      notifyFileHistory();
      item.Result = `履歴 ${area.HistoryPos}/${area.HistoryMax}: ${entry.title || entry.id}`;
    },
  });

  TTActions.Register({
    ActionID: 'WorkingPanel.FocusedPane.FileHistory:Prev',
    Description: 'フォーカスペインのファイル履歴を1つ前の位置に戻す',
    Completion: (item) => {
      const area = focusedArea();
      if (!area) { item.Result = '[対象Paneなし]'; return; }
      if (area.HistoryPos <= 1) { item.Result = '[履歴の先頭]'; return; }
      const entry = area.LoadHistoryAt(area.HistoryPos - 1);
      if (!entry) { item.Result = '[履歴なし]'; return; }
      notifyFileHistory();
      item.Result = `履歴 ${area.HistoryPos}/${area.HistoryMax}: ${entry.title || entry.id}`;
    },
  });

  TTActions.Register({
    ActionID: 'WorkingPanel.FocusedPane.FileHistory:Menu',
    Description: 'フォーカスペインのファイル履歴をメニューで表示して選択する',
    Completion: (item) => {
      const area = focusedArea();
      if (!area) { item.Result = '[対象Paneなし]'; return; }
      if (area.HistoryMax === 0) { item.Result = '[履歴なし]'; return; }

      // 古いもの順（履歴の並び順そのまま）。1〜9番目はニーモニック（数字キー）で直接決定できる
      const nodes = area.FileHistory.map((entry, idx) => {
        const pos = idx + 1;
        return {
          key: String(pos),
          label: `${pos === area.HistoryPos ? '● ' : ''}${entry.title || entry.id}`,
          detail: entry.id,
          value: String(pos),
        };
      });

      const anchor = document.querySelector<HTMLElement>(`.working-area[data-area-id="${area.ID}"]`);
      return showMonacoMenu({ title: 'ファイル履歴', nodes, anchor }).then(value => {
        if (!value) { item.Result = 'メニューの選択をキャンセルしました'; return; }
        const entry = area.LoadHistoryAt(Number(value));
        if (!entry) { item.Result = '[履歴なし]'; return; }
        notifyFileHistory();
        item.Result = `履歴 ${area.HistoryPos}/${area.HistoryMax}: ${entry.title || entry.id}`;
      });
    },
  });

  TTActions.Register({
    ActionID: 'WorkingPanel.FocusedPane.FileHistory:AddNew',
    Description: 'フォーカスペインに表示中のファイルと同じ種別のファイルを新規作成して表示する（ファイル履歴に追加）',
    Completion: async (item) => {
      const area = focusedArea();
      if (!area) { item.Result = '[対象Paneなし]'; return; }
      const vault = app.Models.Vault;
      const current = area.ResourceID ? vault.GetThink(area.ResourceID) : undefined;
      const contentType = current?.ContentType ?? 'memo';
      const projectId = app.SeedsPanel?.ProjectID || undefined;
      try {
        const think = contentType === 'project'
          ? await vault.CreateProject(undefined, projectId)
          : await vault.CreateBlankThink(contentType, NEW_FILE_TITLES[contentType] ?? `新規${contentType}`, projectId);
        area.OpenThink(think.ID, area.MediaType, think.Name);
        notifyFileHistory();
        item.Result = `新規作成: ${think.Name}（${contentType}）`;
      } catch (err) {
        item.Result = `[エラー] ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });

  TTActions.Register({
    ActionID: 'WorkingPanel.FocusedPane.Mode:Next',
    Description: 'フォーカスペインの表示モードを次に切り替える',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('WorkingPanel.FocusedPane.Mode', 'next');
      item.Result = TTUIStateManager.instance.getProperty('WorkingPanel.FocusedPane.Mode');
    },
  });

  TTActions.Register({
    ActionID: 'WorkingPanel.FocusedPane.Mode:Prev',
    Description: 'フォーカスペインの表示モードを前に切り替える',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('WorkingPanel.FocusedPane.Mode', 'prev');
      item.Result = TTUIStateManager.instance.getProperty('WorkingPanel.FocusedPane.Mode');
    },
  });
}
