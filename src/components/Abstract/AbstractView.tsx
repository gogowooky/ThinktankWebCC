/**
 * AbstractView.tsx
 * Thinktank / Seeds / Working / Harvest に共通の「プロジェクト」サブパネル。
 * WorkingPanel の TextEditor ペインと同じく、TextEditor と Markdown を切り替えて1ファイルを表示する。
 * リボンの左側は今後のボタン用に空けておき、表示切替と閉じるボタンは右端に置く。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { NotebookPen, BookOpenText, X, Target, type LucideIcon } from 'lucide-react';
import type { TTVault } from '../../models/TTVault';
import type { TTWorkingPanel } from '../../views/TTWorkingPanel';
import type { TTProjectView, ProjectViewMediaType } from '../../views/TTProjectView';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { TextEditorMedia, type TextEditorMediaRef } from '../WorkingPanel/media/TextEditorMedia';
import { MarkdownMedia, type MarkdownMediaRef } from '../WorkingPanel/media/MarkdownMedia';
import { useEditorSettings } from '../WorkingPanel/media/useEditorSettings';
import { readColHeader, tableContentWithBodyHeader } from '../../utils/tableFormat';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { TTShortcutManager } from '../../views/TTShortcutManager';
import '../Layout/MenuRibbon.css';
import './AbstractView.css';

const MEDIA_BUTTONS: Array<{ type: ProjectViewMediaType; Icon: LucideIcon; title: string }> = [
  { type: 'texteditor', Icon: NotebookPen,  title: 'テキストエディタ' },
  { type: 'markdown',   Icon: BookOpenText, title: 'Markdown' },
];

// 未保存表示（●）を出す場所がリボンにないため、変更状態は受け取るだけにする
const ignoreDirty = () => {};

interface Props {
  projectView:  TTProjectView;
  vault:        TTVault;
  /** TextEditor の表示・色設定の出所 */
  workingPanel: TTWorkingPanel;
  /** リボンの配色を所属パネルに合わせる */
  panelKey:     'thinktank' | 'seeds' | 'working' | 'harvest';
}

export function AbstractView({ projectView, vault, workingPanel, panelKey }: Props) {
  useAppUpdate(projectView);
  useAppUpdate(workingPanel);

  const thinkId = projectView.ThinkID;
  const [loadedThinkId, setLoadedThinkId] = useState<string | null>(null);
  const autoSaveRef = useRef<(() => void | Promise<unknown>) | null>(null);
  const mediaRef = useRef<TextEditorMediaRef | MarkdownMediaRef | null>(null);
  const editorSettings = useEditorSettings(workingPanel);

  useEffect(() => {
    if (!thinkId) return;
    let cancelled = false;
    const updateKey = `${projectView.ID}-load`;

    const load = async () => {
      const t = vault.GetThink(thinkId);
      if (!t) {
        // Vault 読み込み前に開かれた場合は読み込み完了を待つ
        if (!vault.IsLoaded) {
          vault.AddOnUpdate(updateKey, () => {
            if (!vault.IsLoaded) return;
            vault.RemoveOnUpdate(updateKey);
            void load();
          });
        } else if (!cancelled) {
          setLoadedThinkId(thinkId);
        }
        return;
      }
      if (t.IsMetaOnly) await t.LoadContent();
      if (!cancelled) setLoadedThinkId(thinkId);
    };
    void load();

    return () => {
      cancelled = true;
      vault.RemoveOnUpdate(updateKey);
    };
  }, [thinkId, vault, projectView.ID]);

  // 保存先は content の出所（savedThinkId）に固定する。表示切替をまたいだ遅延保存で別ファイルを上書きしないため
  const handleSave = useCallback((content: string, savedThinkId?: string) => {
    const think = vault.GetThink(savedThinkId ?? thinkId);
    if (!think) return Promise.resolve();
    think.Content = content;
    return think.SaveContent().then(() => {
      const managerContent = tableContentWithBodyHeader(content, readColHeader(think.Metadata));
      TTUIStateManager.instance.onThinkSaved(think.ID, managerContent);
      TTShortcutManager.instance.onThinkSaved(think.ID, managerContent);
    });
  }, [vault, thinkId]);

  const handleTitleChange = useCallback((title: string) => {
    const think = vault.GetThink(thinkId);
    if (think) think.Name = title;
  }, [vault, thinkId]);

  // TextEditor から離れる・閉じる前に未保存の編集を書き出す
  const flushEditor = useCallback(() => {
    if (projectView.MediaType === 'texteditor') void autoSaveRef.current?.();
  }, [projectView]);

  const handleMediaTypeChange = useCallback((type: ProjectViewMediaType) => {
    if (type === projectView.MediaType) return;
    flushEditor();
    projectView.SetMediaType(type);
  }, [projectView, flushEditor]);

  const handleClose = useCallback(() => {
    flushEditor();
    projectView.Close();
  }, [projectView, flushEditor]);

  const think = thinkId ? vault.GetThink(thinkId) ?? null : null;
  const hasFile = !!thinkId;
  const contentReady = hasFile && loadedThinkId === thinkId;

  const mediaProps = {
    areaId: projectView.ID, think, vault, onSave: handleSave, onDirtyChange: ignoreDirty,
    onTitleChange: handleTitleChange, editorSettings, autoSaveRef,
  };

  let body: React.ReactNode;
  if (!hasFile) {
    body = (
      <div className="abstract-view__empty">
        <Target size={20} className="abstract-view__icon" />
        <span>ファイルが開かれていません。</span>
      </div>
    );
  } else if (!contentReady) {
    body = <div className="abstract-view__empty">読み込み中…</div>;
  } else if (projectView.MediaType === 'markdown') {
    body = <MarkdownMedia key={thinkId} ref={mediaRef as React.Ref<MarkdownMediaRef>} {...mediaProps} />;
  } else {
    body = <TextEditorMedia key={thinkId} ref={mediaRef as React.Ref<TextEditorMediaRef>} {...mediaProps} />;
  }

  return (
    <div className="abstract-view" tabIndex={-1}>
      <div className={`menu-ribbon abstract-view__ribbon abstract-view__ribbon--${panelKey}`}>
        <div className="menu-ribbon__spacer" />
        {MEDIA_BUTTONS.map(({ type, Icon, title }) => (
          <button
            key={type}
            className={`menu-ribbon__btn menu-ribbon__btn--icon${hasFile && projectView.MediaType === type ? ' menu-ribbon__btn--active' : ''}`}
            onClick={() => handleMediaTypeChange(type)}
            disabled={!hasFile}
            data-tip={title}
            data-tip-side="left"
          >
            <Icon size={14} />
          </button>
        ))}
        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon"
          onClick={handleClose}
          disabled={!hasFile}
          data-tip="閉じる"
          data-tip-side="left"
        >
          <X size={14} />
        </button>
      </div>
      <div className="abstract-view__content" data-media-type={projectView.MediaType}>
        {body}
      </div>
    </div>
  );
}

export const ProjectView = AbstractView;
