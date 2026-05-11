/**
 * WorkoutAreaRibbon.tsx
 * WorkoutArea のリボンバー。
 *
 * 左から: [ドラッグハンドル] [タイトル] [MediaTypeボタン群] [閉じるボタン]
 * isFocused=true のとき青みがかった背景で強調表示。
 */

import { useState, useCallback } from 'react';
import { FileText, Library, Table, Link, MessageCircle, Globe, NotebookPen, BookOpenText, IdCard, Share2, X, type LucideIcon } from 'lucide-react';

const CONTENT_TYPE_ICONS: Record<string, LucideIcon> = {
  memo:    FileText,
  thought: Library,
  table:   Table,
  links:   Link,
  chat:    MessageCircle,
  nettext: Globe,
};
import type { TTWorkoutArea } from '../../views/TTWorkoutArea';
import type { MediaType } from '../../types';
import './WorkoutAreaRibbon.css';

const MEMO_BUTTONS: Array<{ type: MediaType; Icon: LucideIcon; title: string }> = [
  { type: 'texteditor', Icon: NotebookPen,  title: 'テキストエディタ' },
  { type: 'markdown',   Icon: BookOpenText, title: 'Markdown' },
];

const THOUGHT_BUTTONS: Array<{ type: MediaType; Icon: LucideIcon; title: string }> = [
  { type: 'texteditor', Icon: NotebookPen,  title: 'テキストエディタ' },
  { type: 'datagrid',   Icon: Table,        title: 'テーブル' },
  { type: 'markdown',   Icon: BookOpenText, title: 'Markdown' },
  { type: 'card',       Icon: IdCard,       title: 'カード' },
  { type: 'graph',      Icon: Share2,       title: 'グラフ' },
];

const TABLE_BUTTONS: Array<{ type: MediaType; Icon: LucideIcon; title: string }> = [
  { type: 'texteditor', Icon: NotebookPen,  title: 'テキストエディタ' },
  { type: 'datagrid',   Icon: Table,        title: 'テーブル' },
  { type: 'card',       Icon: IdCard,       title: 'カード' },
];

const CHAT_BUTTONS: Array<{ type: MediaType; Icon: LucideIcon; title: string }> = [
  { type: 'texteditor', Icon: NotebookPen,    title: 'テキストエディタ' },
  { type: 'chat',       Icon: MessageCircle,  title: 'チャット' },
];

// ── URL / パス ドロップ判定ヘルパー ─────────────────────────────────────

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    return segs.length ? decodeURIComponent(segs[segs.length - 1]) : u.hostname;
  } catch {
    return url;
  }
}

function titleFromPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/$/, '').split('/').filter(Boolean).pop() ?? path;
}

function isDragLink(types: readonly string[]): boolean {
  return types.includes('text/uri-list') || types.includes('Files') || types.includes('text/plain');
}

/** file:// URI → ローカルパス文字列に変換 */
function fileUriToPath(uri: string): string {
  try {
    // file:///C:/path/to/file → C:\path\to\file
    const withoutScheme = decodeURIComponent(uri.replace(/^file:\/\/\/?/, ''));
    // Windows: 先頭が /C: などの場合スラッシュを除去
    return withoutScheme.replace(/^\/([a-zA-Z]:)/, '$1').replace(/\//g, '\\');
  } catch {
    return uri;
  }
}

export function extractLinkDrop(e: React.DragEvent): { url: string; title: string } | null {
  // 1. ファイルドロップ（OS ファイルエクスプローラーから）
  //    フルパス取得優先順: Electron file.path > text/plain のパス > file:// URI変換 > file.name
  if (e.dataTransfer.files.length > 0) {
    const file         = e.dataTransfer.files[0];
    // Electron 32+: webUtils.getPathForFile 経由（file.path は非推奨）
    const electronPath = window.electronAPI?.getPathForFile(file) ?? undefined;
    const plainText    = e.dataTransfer.getData('text/plain').trim();
    const uriFirst     = e.dataTransfer.getData('text/uri-list')
                          .split(/\r?\n/).find(l => l.trim() && !l.startsWith('#'))?.trim() ?? '';
    const plainIsPath  = /^[a-zA-Z]:[\\\/]/.test(plainText) || /^\\\\/.test(plainText) || /^\//.test(plainText);
    const uriIsFile    = /^file:\/\//i.test(uriFirst);
    const url =
      electronPath ??
      (plainIsPath ? plainText : null) ??
      (uriIsFile   ? fileUriToPath(uriFirst) : null) ??
      file.name;
    const title = file.name.replace(/\.[^/.]+$/, '');
    return { url, title };
  }
  // 2. プレーンテキスト（URL / Windows パス / Unix パス）
  const plain = e.dataTransfer.getData('text/plain').trim();
  if (plain) {
    if (/^https?:\/\//i.test(plain) || /^ftp:\/\//i.test(plain)) {
      return { url: plain, title: titleFromUrl(plain) };
    }
    if (/^file:\/\//i.test(plain)) {
      const localPath = fileUriToPath(plain);
      return { url: localPath, title: titleFromPath(localPath) };
    }
    if (/^[a-zA-Z]:[\\\/]/.test(plain) || /^\\\\/.test(plain) || /^\//.test(plain)) {
      return { url: plain, title: titleFromPath(plain) };
    }
  }
  // 3. URI list（ブラウザのアドレスバー / リンクドラッグ）
  const uriList = e.dataTransfer.getData('text/uri-list');
  if (uriList) {
    const first = uriList.split(/\r?\n/).find(l => l.trim() && !l.startsWith('#'))?.trim();
    if (first) {
      if (/^file:\/\//i.test(first)) {
        const localPath = fileUriToPath(first);
        return { url: localPath, title: titleFromPath(localPath) };
      }
      return { url: first, title: titleFromUrl(first) };
    }
  }
  return null;
}

// ── コンポーネント ───────────────────────────────────────────────────────

interface Props {
  area:              TTWorkoutArea;
  contentType?:      string;
  isFocused:         boolean;
  isDirty?:          boolean;
  onDragStart:       (e: React.MouseEvent) => void;
  onMediaTypeChange: (type: MediaType) => void;
  onClose:           () => void;
  onResourceDrop:    (thinkId: string) => void;
  onUrlDrop?:        (url: string, title: string) => void;
}

export function WorkoutAreaRibbon({ area, contentType, isFocused, isDirty = false, onDragStart, onMediaTypeChange, onClose, onResourceDrop, onUrlDrop }: Props) {
  const mediaButtons = contentType === 'chat'    ? CHAT_BUTTONS
    : contentType === 'thought' ? THOUGHT_BUTTONS
    : contentType === 'table'   ? TABLE_BUTTONS
    : MEMO_BUTTONS;

  const [isDropTarget, setIsDropTarget] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    const hasThink = types.includes('application/x-thought-id');
    const hasLink  = isDragLink(types);
    if (!hasThink && !hasLink) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDropTarget(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDropTarget(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropTarget(false);
    const thinkId = e.dataTransfer.getData('application/x-thought-id');
    if (thinkId) { onResourceDrop(thinkId); return; }
    const link = extractLinkDrop(e);
    if (link && onUrlDrop) onUrlDrop(link.url, link.title);
  }, [onResourceDrop, onUrlDrop]);

  return (
    <div
      className={[
        'workout-area-ribbon',
        isFocused    ? 'workout-area-ribbon--focused'     : '',
        isDropTarget ? 'workout-area-ribbon--drop-target' : '',
      ].join(' ')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >

      {/* 種別アイコン（ドラッグハンドル兼用）*/}
      <div
        className="workout-area-ribbon__drag"
        onMouseDown={onDragStart}
        data-tip="ドラッグして移動"
        data-tip-side="bottom"
      >
        {(() => { const Icon = CONTENT_TYPE_ICONS[contentType ?? ''] ?? FileText; return <Icon size={13} />; })()}
      </div>

      {/* タイトル（未保存変更があれば ● を表示）*/}
      <span className="workout-area-ribbon__title" data-tip={area.Title} data-tip-side="bottom">
        {isDirty && <span className="workout-area-ribbon__dirty">●</span>}
        {area.Title || '（無題）'}
      </span>

      {/* MediaType ボタン群 */}
      <div className="workout-area-ribbon__media">
        {mediaButtons.map(({ type, Icon, title }) => (
          <button
            key={type}
            className={`workout-area-ribbon__media-btn${area.MediaType === type ? ' workout-area-ribbon__media-btn--active' : ''}`}
            onClick={() => onMediaTypeChange(type)}
            data-tip={title}
            data-tip-side="left"
          >
            <Icon size={12} />
          </button>
        ))}
      </div>

      {/* 閉じるボタン */}
      <button
        className="workout-area-ribbon__close"
        onClick={onClose}
        data-tip="閉じる"
        data-tip-side="bottom"
      >
        <X size={12} />
      </button>
    </div>
  );
}
