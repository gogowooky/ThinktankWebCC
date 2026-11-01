/**
 * AbstractView.tsx
 * Thinktank / Seeds の「プロジェクト」サブパネル。
 * ロードした projectファイルを WorkingPanel の TextEditor ペインと同じ TextEditor で表示・編集する。
 * リボンの左端には「root」（Thinktank のみ）「新規」「クリア」、右端には表示形式（TextEditor のみ）を置く。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CirclePlus, CircleMinus, Target } from 'lucide-react';
import type { TTVault } from '../../models/TTVault';
import type { TTWorkingPanel } from '../../views/TTWorkingPanel';
import type { TTProjectView } from '../../views/TTProjectView';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { TextEditorMedia, type TextEditorMediaRef } from '../WorkingPanel/media/TextEditorMedia';
import { TextEditorModeButton } from '../Layout/TextEditorModeButton';
import { useEditorSettings } from '../WorkingPanel/media/useEditorSettings';
import { readColHeader, tableContentWithBodyHeader } from '../../utils/tableFormat';
import { ROOT_PROJECT_TITLE, isRootProjectTitle } from '../../utils/thinkFormat';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { TTShortcutManager } from '../../views/TTShortcutManager';
import { TTActions } from '../../views/TTActions';
import { clientPointToPosition } from '../../utils/editorDropPosition';
import { isReadOnlyContentType } from '../../types';
import '../Layout/MenuRibbon.css';
import './AbstractView.css';


// 未保存表示（●）を出す場所がリボンにないため、変更状態は受け取るだけにする
const ignoreDirty = () => {};

interface Props {
  projectView:  TTProjectView;
  vault:        TTVault;
  /** TextEditor の表示・色設定の出所 */
  workingPanel: TTWorkingPanel;
  /** リボンの配色を所属パネルに合わせる */
  panelKey:     'thinktank' | 'seeds';
}

export function AbstractView({ projectView, vault, workingPanel, panelKey }: Props) {
  const app = TTApplication.Instance;
  const ownerPanel = panelKey === 'thinktank' ? app.ThinktankPanel : app.SeedsPanel;
  useAppUpdate(projectView);
  useAppUpdate(workingPanel);
  useAppUpdate(ownerPanel);

  const thinkId = projectView.ThinkID || ownerPanel.ProjectID;
  const [loadedThinkId, setLoadedThinkId] = useState<string | null>(null);
  const autoSaveRef = useRef<(() => void | Promise<unknown>) | null>(null);
  const mediaRef = useRef<TextEditorMediaRef | null>(null);
  const editorSettings = useEditorSettings(workingPanel);
  // YAML＋本文 表示は、そのファイルを開いている間だけ（別ファイルをロードしたら通常表示に戻す）
  const [rawYamlThinkId, setRawYamlThinkId] = useState<string | null>(null);
  const rawYaml = !!thinkId && rawYamlThinkId === thinkId;

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
    if (!think || isReadOnlyContentType(think.ContentType)) return Promise.resolve();
    think.Content = content;
    return think.SaveContent().then(() => {
      const managerContent = tableContentWithBodyHeader(content, readColHeader(think.Metadata));
      TTUIStateManager.instance.onThinkSaved(think.ID, managerContent);
      TTShortcutManager.instance.onThinkSaved(think.ID, managerContent);
    });
  }, [vault, thinkId]);

  const handleTitleChange = useCallback((title: string) => {
    const think = vault.GetThink(thinkId);
    if (think && !isReadOnlyContentType(think.ContentType) && think.Name !== title) {
      think.Name = title;
      vault.NotifyUpdated(false);
    }
  }, [vault, thinkId]);

  // 新規projectファイル（規定フォーマットのテンプレート）を、ロード中の project の配下に作成して表示・設定する
  const handleCreateProject = useCallback(async () => {
    if (thinkId) {
      await autoSaveRef.current?.();
    }
    const parentId = vault.GetThink(thinkId)?.ContentType === 'project' ? thinkId : undefined;
    const created = await vault.CreateProject(undefined, parentId);
    projectView.Open(created.ID);
    if (panelKey === 'thinktank') {
      app.ThinktankPanel.OpenProject(created.ID);
    } else {
      app.SeedsPanel.OpenProject(created.ID, 'project');
    }
  }, [projectView, thinkId, vault, panelKey, app]);

  // タイトルが「Thinktank」の projectファイルを開く。無ければ作る（同名が複数あれば最も古いもの）
  const handleOpenRoot = useCallback(async () => {
    if (thinkId) {
      await autoSaveRef.current?.();
    }
    const existing = vault.GetThinks()
      .filter(t => t.ContentType === 'project' && isRootProjectTitle(t.Name))
      .sort((a, b) => a.ID.localeCompare(b.ID))[0];
    const root = existing ?? await vault.CreateProject(ROOT_PROJECT_TITLE);
    app.ThinktankPanel.OpenProject(root.ID);
  }, [thinkId, vault, app]);

  // このサブパネルに設定されていたprojectだけを解除する
  const handleClearProject = useCallback(() => {
    if (thinkId) {
      void autoSaveRef.current?.();
    }
    projectView.Close();
    if (panelKey === 'thinktank') {
      app.ThinktankPanel.ClearProject();
    } else {
      app.SeedsPanel.ClearProject();
    }
  }, [projectView, thinkId, panelKey, app]);

  const think = thinkId ? vault.GetThink(thinkId) ?? null : null;
  const hasFile = !!thinkId;
  const contentReady = hasFile && loadedThinkId === thinkId;

  // Think一覧などから Thinkファイルをドロップすると、ドロップ位置に参照タグを挿入する。
  // WorkingPanel の Pane と違い Load 先が無いので、Alt の有無にかかわらず挿入にする。
  // 親へ伝えると SeedsPanel のドロップ（project への追加・切替）まで走るため、ここで止める
  const acceptsThinkDrop = (e: React.DragEvent) =>
    contentReady && e.dataTransfer.types.includes('application/x-thought-id');

  const handleThinkDragOver = (e: React.DragEvent) => {
    if (!acceptsThinkDrop(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'link';
  };

  const handleThinkDrop = (e: React.DragEvent) => {
    if (!acceptsThinkDrop(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const droppedId = e.dataTransfer.getData('application/x-thought-id');
    const editor = TTShortcutManager.instance.getAreaEditor(projectView.ID);
    if (!droppedId || droppedId === thinkId || !editor) return;
    const position = clientPointToPosition(editor, e.clientX, e.clientY);
    if (position) editor.setPosition(position);
    TTShortcutManager.instance.setActiveEditor(editor);
    TTShortcutManager.instance.setPendingThinkDrop({ thinkId: droppedId, kind: 'insert' });
    void TTActions.Execute('WorkingPanel.DroppedFile.ID:Insert');
  };

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
  } else {
    body = <TextEditorMedia key={`${thinkId}-${rawYaml ? 'raw-yaml' : 'text'}`} ref={mediaRef} {...mediaProps} rawYaml={rawYaml} />;
  }

  return (
    <div className="abstract-view" tabIndex={-1}>
      <div className={`menu-ribbon abstract-view__ribbon abstract-view__ribbon--${panelKey}`}>
        {panelKey === 'thinktank' && (
          <button
            className="menu-ribbon__btn menu-ribbon__btn--icon"
            onClick={() => void handleOpenRoot()}
            data-tip="root"
            data-tip-side="right"
          >
            <Target size={14} />
          </button>
        )}
        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon"
          onClick={() => void handleCreateProject()}
          data-tip="新規"
          data-tip-side="right"
        >
          <CirclePlus size={14} />
        </button>
        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon"
          onClick={handleClearProject}
          disabled={!hasFile}
          data-tip="クリア"
          data-tip-side="right"
        >
          <CircleMinus size={14} />
        </button>
        <div className="menu-ribbon__spacer" />
        {/* 表示形式は TextEditor だけ */}
        <TextEditorModeButton rawYaml={rawYaml} onChange={raw => setRawYamlThinkId(raw ? thinkId : null)} />
      </div>
      <div className="abstract-view__content" onDragOver={handleThinkDragOver} onDrop={handleThinkDrop}>
        {body}
      </div>
    </div>
  );
}

export const ProjectView = AbstractView;
