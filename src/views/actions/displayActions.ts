/**
 * displayActions.ts
 * パネル表示モード、表示倍率、テーブルのセル表示、テキストエディタの表示トグルのアクション。
 *
 * registerFocusedPanelActions（views/TTFocusedPanelActions.ts）から登録順どおりに呼ばれる。
 */

import type { ActionID, TTActionItem } from '../TTAction';
import { TTActions } from '../TTActions';
import { TTUIStateManager, type ConfigKey } from '../TTUIStateManager';
import { ZOOM_DEFAULT, ZOOM_STEP } from '../../utils/appZoom';

export function registerDisplayActions(): void {
  // PanelDisplay Mode
  TTActions.Register({
    ActionID: 'Application.PanelDisplay.Mode:Think',
    Description: 'パネル表示モードをThinkにする',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.PanelDisplay.Mode', 'Think');
      item.Result = 'Think';
    },
  });
  TTActions.Register({
    ActionID: 'Application.PanelDisplay.Mode:Edit',
    Description: 'パネル表示モードをEditにする',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.PanelDisplay.Mode', 'Edit');
      item.Result = 'Edit';
    },
  });

  // Display Zoom（表示文字サイズの拡大表示 / 縮小表示）
  const stepAppZoom = (item: TTActionItem, deltaSign: 1 | -1): void => {
    const current = parseInt(TTUIStateManager.instance.getProperty('Application.Display.Zoom'), 10) || ZOOM_DEFAULT;
    const next = current + deltaSign * ZOOM_STEP;
    TTUIStateManager.instance.applyProperty('Application.Display.Zoom', String(next));
    item.Result = `${TTUIStateManager.instance.getProperty('Application.Display.Zoom')}%`;
  };
  TTActions.Register({
    ActionID: 'Application.Display.Zoom:ZoomIn',
    Description: '拡大表示',
    Completion: (item) => stepAppZoom(item, 1),
  });
  TTActions.Register({
    ActionID: 'Application.Display.Zoom:ZoomOut',
    Description: '縮小表示',
    Completion: (item) => stepAppZoom(item, -1),
  });

  // Table Display（DataGrid のセル表示）
  const applyTableStatus = (item: TTActionItem, key: ConfigKey, value: string): void => {
    TTUIStateManager.instance.applyProperty(key, value);
    item.Result = TTUIStateManager.instance.getProperty(key);
  };
  TTActions.Register({
    ActionID: 'Table.CellContent.Display:Toggle',
    Description: 'テーブルのセル表示方法をトグルする',
    Completion: (item) => applyTableStatus(item, 'Table.CellContent.Display', 'next'),
  });
  TTActions.Register({
    ActionID: 'Table.CellContent.Position:Toggle',
    Description: 'テーブルのセルの表示位置をトグルする',
    Completion: (item) => applyTableStatus(item, 'Table.CellContent.Position', 'next'),
  });
  const TABLE_POSITIONS: Array<[string, string]> = [
    ['Left', 'テーブルのセルの表示位置を左寄せにする'],
    ['Center', 'テーブルのセルの表示位置を中心寄せにする'],
    ['Right', 'テーブルのセルの表示位置を右寄せにする'],
  ];
  for (const [position, description] of TABLE_POSITIONS) {
    TTActions.Register({
      ActionID: `Table.CellContent.Position:${position}`,
      Description: description,
      Completion: (item) => applyTableStatus(item, 'Table.CellContent.Position', position),
    });
  }

  // IsVisible 系トグル（LineNumbers/WordWrap/Minimap は TTShortcutManager の DEFAULT_SHORTCUTS が
  // 小文字 `:toggle` で参照するため、大文字小文字どちらの ActionID でも同じハンドラに解決させる）
  const registerToggleAction = (actionId: ActionID, key: ConfigKey, description: string): void => {
    TTActions.Register({
      ActionID: actionId,
      Description: description,
      Completion: (item) => {
        TTUIStateManager.instance.applyProperty(key, 'toggle');
        item.Result = TTUIStateManager.instance.getProperty(key);
      },
    });
  };
  const IS_VISIBLE_TOGGLE_KEYS: Array<[ConfigKey, string]> = [
    ['TextEditor.LineNumbers.IsVisible', '行番号表示をトグルする'],
    ['TextEditor.WordWrap.IsVisible', '折り返し表示をトグルする'],
    ['TextEditor.Minimap.IsVisible', 'ミニマップ表示をトグルする'],
    ['TextEditor.FullWidthSpace.IsVisible', '全角スペース強調表示をトグルする'],
    ['TextEditor.UnicodeHighlight.IsVisible', 'Unicode文字強調表示をトグルする'],
    ['TextEditor.BracketPairColorization.IsVisible', '括弧の色分けをトグルする'],
  ];
  for (const [key, description] of IS_VISIBLE_TOGGLE_KEYS) {
    registerToggleAction(`${key}:Toggle`, key, description);
    registerToggleAction(`${key}:toggle`, key, description);
  }
}
