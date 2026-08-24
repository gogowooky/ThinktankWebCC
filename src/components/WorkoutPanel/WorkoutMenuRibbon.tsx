/**
 * WorkoutMenuRibbon.tsx
 * WorkoutArea のリボンバー。
 *
 * 左から: [ドラッグハンドル] [タイトル] [MediaTypeボタン群] [閉じるボタン]
 * isFocused=true のとき青みがかった背景で強調表示。
 */

import { useState, useCallback } from 'react';
import { FileText, Library, Table, Link, MessageCircle, Globe, NotebookPen, BookOpenText, IdCard, Share2, X, type LucideIcon } from 'lucide-react';

const CONTENT_TYPE_ICONS: Record<string, LucideIcon> = {
  memo:    FileText,
  bundle:  Library,
  table:   Table,
  links:   Link,
  chat:    MessageCircle,
  nettext: Globe,
};
import type { TTWorkoutArea } from '../../views/TTWorkoutArea';
import { TTShortcutManager } from '../../views/TTShortcutManager';
import { detectLocalDragKind } from '../../utils/keyboardUtils';
import type { MediaType } from '../../types';
import './WorkoutMenuRibbon.css';

const MEMO_BUTTONS: Array<{ type: MediaType; Icon: LucideIcon; title: string }> = [
  { type: 'texteditor', Icon: NotebookPen,  title: 'テキストエディタ' },
  { type: 'markdown',   Icon: BookOpenText, title: 'Markdown' },
];

const BUNDLE_BUTTONS: Array<{ type: MediaType; Icon: LucideIcon; title: string }> = [
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

/**
 * 疑似キー LocalFileDrag / LocalDirDrag / Alt+LocalFileDrag / Alt+LocalDirDrag
 * （docs/DefaultShortcut.md）のデフォルトAction。ThinkFileDragのLoad/Insertと同じく、
 * 通常ドロップ＝Load（Links Think作成・Pane差し替え）、Alt+ドロップ＝Insert
 * （カーソル位置へのファイル参照挿入。TextEditorMedia.tsx側の既存アップロード/
 * 挿入ロジック）に対応する。現状はどちらも既定動作のままだが、Shortcutテーブルで
 * 別Actionへ振り替える／フォーカス限定するといった拡張の受け口として、呼び出し元
 * （WorkoutMenuRibbon/WorkoutArea/WorkoutPanel/TextEditorMedia）は直接
 * extractLinkDrop() の結果を使わず shouldAllowLocalDrop() / shouldInsertLocalDrop()
 * を必ず経由する。
 */
const LOCAL_DROP_DEFAULT_ACTION = 'WorkoutPanel.Load.DroppedLink';
const LOCAL_DROP_INSERT_ACTION  = 'WorkoutPanel.Insert.DroppedLink';

/**
 * OSファイルシステムからのFile/Dirドロップかどうかを判定し、疑似キー
 * LocalFileDrag / LocalDirDrag としてShortcutテーブルに照会する。
 * URL/テキストドラッグ（Filesを含まない）はこの仕組みの対象外のため null を返す。
 */
function resolveLocalDropAction(e: React.DragEvent): { actionId: string | null } | null {
  const dragKind = detectLocalDragKind(e.dataTransfer);
  if (!dragKind) return null;
  return { actionId: TTShortcutManager.instance.resolveDragAction(dragKind, e.nativeEvent) };
}

/**
 * 既定（Load）動作を実行してよいかを判定する。ローカルFile/Dirドラッグでなければ
 * この仕組みの対象外としてそのまま許可する（true）。ローカルFile/Dirドラッグで、
 * Shortcutテーブルで既定Action以外に振り替えられている場合やフォーカス不一致等で
 * 解決できなかった場合は false を返し、呼び出し元は既定動作（リンク作成）を抑止する。
 */
export function shouldAllowLocalDrop(e: React.DragEvent): boolean {
  const resolved = resolveLocalDropAction(e);
  if (!resolved) return true;
  return resolved.actionId === LOCAL_DROP_DEFAULT_ACTION;
}

/**
 * Alt+ドロップ時のInsert動作（TextEditorMedia.tsx既存のアップロード/カーソル挿入）を
 * 実行してよいかを判定する。ローカルFile/Dirドラッグでない場合や、Shortcutテーブルで
 * Insert Action以外に解決された場合は false を返す。
 */
export function shouldInsertLocalDrop(e: React.DragEvent): boolean {
  const resolved = resolveLocalDropAction(e);
  if (!resolved) return false;
  return resolved.actionId === LOCAL_DROP_INSERT_ACTION;
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
  isOutsideBundle?:  boolean;
  onDragStart:       (e: React.MouseEvent) => void;
  onMediaTypeChange: (type: MediaType) => void;
  onClose:           () => void;
  onResourceDrop:    (thinkId: string, e: React.DragEvent) => void;
  onUrlDrop?:        (url: string, title: string) => void;
}

export function WorkoutMenuRibbon({ area, contentType, isFocused, isDirty = false, isOutsideBundle = false, onDragStart, onMediaTypeChange, onClose, onResourceDrop, onUrlDrop }: Props) {
  const mediaButtons = contentType === 'chat'    ? CHAT_BUTTONS
    : contentType === 'bundle' ? BUNDLE_BUTTONS
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
    // Think＋Alt修飾（Insert）のときは 'link' を示し、既定（Load/URL等）は 'copy' のままにする
    e.dataTransfer.dropEffect =
      hasThink && TTShortcutManager.instance.isDragAltHeld(e.nativeEvent) ? 'link' : 'copy';
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
    if (thinkId) { onResourceDrop(thinkId, e); return; }
    const link = extractLinkDrop(e);
    if (link && shouldAllowLocalDrop(e) && onUrlDrop) onUrlDrop(link.url, link.title);
  }, [onResourceDrop, onUrlDrop]);

  return (
    <div
      className={[
        'workout-menu-ribbon',
        isFocused       ? 'workout-menu-ribbon--focused'        : '',
        isOutsideBundle ? 'workout-menu-ribbon--outside-bundle' : '',
        isDropTarget    ? 'workout-menu-ribbon--drop-target'    : '',
      ].join(' ')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >

      {/* 種別アイコン（ドラッグハンドル兼用）*/}
      <div
        className="workout-menu-ribbon__drag"
        onMouseDown={onDragStart}
        data-tip="ドラッグして移動"
        data-tip-side="bottom"
      >
        {(() => { const Icon = CONTENT_TYPE_ICONS[contentType ?? ''] ?? FileText; return <Icon size={13} />; })()}
      </div>

      {/* タイトル（未保存変更があれば ● を表示）*/}
      <span className="workout-menu-ribbon__title" data-tip={area.Title} data-tip-side="bottom">
        {isDirty && <span className="workout-menu-ribbon__dirty">●</span>}
        {area.Title || '（無題）'}
      </span>

      {/* MediaType ボタン群 */}
      <div className="workout-menu-ribbon__media">
        {mediaButtons.map(({ type, Icon, title }) => (
          <button
            key={type}
            className={`workout-menu-ribbon__media-btn${area.MediaType === type ? ' workout-menu-ribbon__media-btn--active' : ''}`}
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
        className="workout-menu-ribbon__close"
        onClick={onClose}
        data-tip="閉じる"
        data-tip-side="bottom"
      >
        <X size={12} />
      </button>
    </div>
  );
}
