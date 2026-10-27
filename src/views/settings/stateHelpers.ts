import type { TTApplication } from '../TTApplication';
import { TTWorkingArea } from '../TTWorkingArea';
import type { MediaType, ContentType } from '../../types';

export function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseBool(value: string, current: boolean): boolean {
  if (value === 'toggle') return !current;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return current;
}

export function focusSelector(selector: string, fallbackSelector?: string): void {
  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [contenteditable], [tabindex]:not([tabindex="-1"])';
  setTimeout(() => {
    let root = document.querySelector<HTMLElement>(selector);
    if (!root && fallbackSelector) {
      root = document.querySelector<HTMLElement>(fallbackSelector);
    }
    if (!root) return;

    if (root.matches(FOCUSABLE) && !root.closest('[inert]')) {
      root.focus({ preventScroll: true });
      return;
    }
    const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
      .find(el => !el.closest('[inert]'));
    if (focusable) {
      focusable.focus({ preventScroll: true });
    } else if (!root.closest('[inert]')) {
      root.focus({ preventScroll: true });
    }
  }, 50);
}

export function getFocusedArea(app: TTApplication): TTWorkingArea | null {
  const id = app.WorkingPanel.FocusedAreaId;
  return id ? (app.WorkingPanel.GetArea(id) ?? null) : null;
}

export function getFocusedPaneAllowedModes(app: TTApplication): string[] {
  const area = app.WorkingPanel.FocusedAreaId ? app.WorkingPanel.GetArea(app.WorkingPanel.FocusedAreaId) : null;
  if (!area || !area.ResourceID) {
    return ['Panes', 'Texteditor', 'Markdown', 'Datagrid', 'Card', 'Graph', 'Chat', 'Html'];
  }
  const think = app.Models.Vault.GetThink(area.ResourceID);
  if (!think) {
    return ['Panes', 'Texteditor', 'Markdown', 'Datagrid', 'Card', 'Graph', 'Chat', 'Html'];
  }
  const mapping: Record<ContentType, MediaType[]> = {
    memo: ['texteditor', 'markdown'],
    html: ['texteditor', 'html'],
    project: ['texteditor', 'datagrid', 'markdown', 'card', 'graph'],
    table: ['texteditor', 'datagrid', 'card'],
    chat: ['texteditor', 'chat'],
    links: ['texteditor', 'markdown'],
  };
  const allowed = mapping[think.ContentType] || ['texteditor', 'markdown'];
  return allowed.map(m => capitalize(m));
}
