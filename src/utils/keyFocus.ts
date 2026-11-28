/** Names exposed to KeyBinding, independent of the legacy focus and mode Status IDs. */
export const keySubPanels = {
  filter: 'Filer', project: 'Project', settings: 'Config',
  aiview: 'AIView', aichat: 'AIChat', chat: 'AIChat',
  panes: 'PaneConfig', texteditor: 'TextEditorConfig', chatsetting: 'ChatConfig',
  markdown: 'MarkdownConfig', datagrid: 'DataGridConfig', card: 'CardConfig',
  graph: 'GraphConfig', html: 'HtmlConfig',
} as const;

const components = {
  Menu: '[role="menu"], .filter-history-pulldown, .menu-ribbon, .working-menu-ribbon',
  Dialog: 'dialog, [role="dialog"], .col-sort-dialog',
  TextEditor: '.text-editor-media',
  MarkdownViewer: '.markdown-media',
  AIChatTextBox: '.ai-chat__input, .bundle-conversation-composer textarea',
  ThinkFiler: '.thoughts-list, .unified-filter-panel, .tt-search-bar, .seeds-search-bar',
  DataGrid: '.datagrid-media, .table-grid',
  Graph: '.graph-media',
  Card: '.card-media',
  Html: '.html-media',
} as const;

const componentSelector = Object.values(components).join(', ');
export const keyComponentCandidates = '^(' + [...Object.keys(components), 'None'].join('|') + ')$';

export function readKeyFocus() {
  const active = document.hasFocus();
  const target = active ? document.activeElement : null;
  const panel = target?.closest<HTMLElement>('[data-key-panel]');
  const component = target?.closest(componentSelector);
  // The shared popup captures keyboard events while DOM focus stays on the invoking control.
  let uiComponent = 'None';
  if (active && document.getElementById('tt-menu-overlay')) {
    uiComponent = 'Menu';
  } else if (component) {
    uiComponent = Object.entries(components).find(([, selector]) => component.matches(selector))?.[0] ?? 'None';
  }
  return {
    Panel: panel?.dataset.keyPanel || 'None',
    SubPanel: panel?.dataset.keySubpanel || 'None',
    UIComponent: uiComponent,
  };
}

/** Notify Status listeners even when the selected tab or pane title changes without moving focus. */
export function observeKeyFocus(notify: (keys: string[]) => void): () => void {
  let previous = { Panel: 'None', SubPanel: 'None', UIComponent: 'None' };
  let observed: Element | null = null;
  let listening = true;
  const observer = new MutationObserver(refresh);
  function refresh() {
    const target = document.activeElement ?? document.body;
    if (target !== observed) {
      observed = target;
      observer.disconnect();
      // Watch only the focus path. This also catches removal of a focused subtree
      // and the popup inserted directly under body, without observing editor contents.
      for (let el: Element | null = target; el; el = el.parentElement) {
        observer.observe(el, { childList: true, attributeFilter: ['data-key-panel', 'data-key-subpanel'] });
      }
    }
    const next = readKeyFocus();
    const changed = (Object.keys(next) as (keyof typeof next)[])
      .filter(key => next[key] !== previous[key])
      .map(key => 'Thinktank.KeyFocused.' + key);
    previous = next;
    if (changed.length) notify(changed);
  }
  // focusout/window blur can fire before activeElement has settled (especially for iframes).
  const afterFocusTransfer = () => queueMicrotask(() => { if (listening) refresh(); });
  document.addEventListener('focusin', refresh, true);
  document.addEventListener('focusout', afterFocusTransfer, true);
  window.addEventListener('focus', refresh);
  window.addEventListener('blur', afterFocusTransfer);
  refresh();
  return () => {
    listening = false;
    document.removeEventListener('focusin', refresh, true);
    document.removeEventListener('focusout', afterFocusTransfer, true);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('blur', afterFocusTransfer);
    observer.disconnect();
  };
}
