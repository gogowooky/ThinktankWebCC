/**
 * actionMenu.ts
 * カーソル位置のコンテキストに応じたアクション選択ポップアップ（↑↓/Enter/Escで操作）を
 * DOM上に直接構築して表示するユーティリティ。
 *
 * 元は views/TTFocusedPanelActions.ts に同居していたが、DOM操作に閉じた独立部品のため分離した。
 */
import type { TTActionItem } from '../views/TTAction';

export interface ActionMenuEntry {
  ActionID: string;
  Description?: string;
  Completion: (item: TTActionItem) => void | Promise<void>;
}

export function showActionMenu(
  title: string,
  actions: ActionMenuEntry[],
  completionItem: TTActionItem
): Promise<void> {
  return new Promise((resolve) => {
    const existing = document.getElementById('action-menu-overlay');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'action-menu-overlay';
    overlay.className = 'action-menu-overlay';

    const container = document.createElement('div');
    container.className = 'action-menu-container';

    const header = document.createElement('div');
    header.className = 'action-menu-header';
    // title はカーソル位置のドキュメント本文（ユーザー入力）に由来しうるため、
    // innerHTML への文字列埋め込みは避け textContent で構築する（XSS対策）。
    const titleSpan = document.createElement('span');
    titleSpan.textContent = title;
    const hintSpan = document.createElement('span');
    hintSpan.style.fontSize = '10px';
    hintSpan.style.color = 'var(--text-muted)';
    hintSpan.style.fontWeight = 'normal';
    hintSpan.textContent = 'ESCで閉じる';
    header.appendChild(titleSpan);
    header.appendChild(hintSpan);
    container.appendChild(header);

    const list = document.createElement('ul');
    list.className = 'action-menu-list';

    let selectedIndex = 0;

    const renderItems = () => {
      list.innerHTML = '';
      actions.forEach((act, idx) => {
        const li = document.createElement('li');
        li.className = `action-menu-item${idx === selectedIndex ? ' selected' : ''}`;

        const actionParts = act.ActionID.split(':');
        const shortName = actionParts[actionParts.length - 1];

        const titleSpan = document.createElement('span');
        titleSpan.className = 'action-menu-item-title';
        titleSpan.textContent = shortName;

        const descSpan = document.createElement('span');
        descSpan.className = 'action-menu-item-desc';
        descSpan.textContent = act.Description || act.ActionID;

        li.appendChild(titleSpan);
        li.appendChild(descSpan);

        li.addEventListener('click', () => {
          executeIndex(idx);
        });

        list.appendChild(li);
      });
    };

    const executeIndex = (idx: number) => {
      cleanup();
      const act = actions[idx];
      if (act) {
        try {
          const res = act.Completion(completionItem);
          if (res instanceof Promise) {
            res.then(() => resolve()).catch(err => {
              completionItem.Result = `[エラー] ${err.message}`;
              resolve();
            });
          } else {
            resolve();
          }
        } catch (err: any) {
          completionItem.Result = `[エラー] ${err.message}`;
          resolve();
        }
      } else {
        resolve();
      }
    };

    const cleanup = () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      overlay.remove();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (e.key === 'ArrowDown') {
        selectedIndex = (selectedIndex + 1) % actions.length;
        renderItems();
        const selectedEl = list.children[selectedIndex] as HTMLElement;
        if (selectedEl) {
          selectedEl.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'ArrowUp') {
        selectedIndex = (selectedIndex - 1 + actions.length) % actions.length;
        renderItems();
        const selectedEl = list.children[selectedIndex] as HTMLElement;
        if (selectedEl) {
          selectedEl.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter') {
        executeIndex(selectedIndex);
      } else if (e.key === 'Escape') {
        cleanup();
        completionItem.Result = 'メニューの選択をキャンセルしました';
        resolve();
      }
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        completionItem.Result = 'メニューの選択をキャンセルしました';
        resolve();
      }
    });

    document.addEventListener('keydown', handleKeyDown, { capture: true });

    renderItems();
    container.appendChild(list);

    const footer = document.createElement('div');
    footer.className = 'action-menu-footer';
    footer.textContent = '↑↓: 選択 / Enter: 決定 / Esc: キャンセル';
    container.appendChild(footer);

    overlay.appendChild(container);
    document.body.appendChild(overlay);
  });
}
