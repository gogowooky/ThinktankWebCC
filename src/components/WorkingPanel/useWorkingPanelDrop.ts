/**
 * useWorkingPanelDrop.ts
 * WorkingPanel の D&D（Think・URL・パスのドロップ、Pane タイトルのドラッグ）の状態と処理。
 * ドロップ位置のゴースト（新しい Pane の位置）と、Alt+ThinkFileDrag の挿入位置の Caret もここで計算する。
 */
import { useCallback, useRef, useState } from 'react';
import { TTShortcutManager } from '../../views/TTShortcutManager';
import { TTActions } from '../../views/TTActions';
import type { TTVault } from '../../models/TTVault';
import type { TTWorkingPanel } from '../../views/TTWorkingPanel';
import { useNativeDragCleanup } from './useNativeDragCleanup';
import { externalDropDragKind, extractLinkDrop, isDragLink, resolveLinkDrop, shouldAllowLocalDrop } from './WorkingMenuRibbon';
import { getPcName } from '../../utils/pcName';
import { isLocalPathTarget } from '../../utils/linkFormat';
import { clientPointToPosition } from '../../utils/editorDropPosition';

type DropEdgeDir = 'left' | 'right' | 'up' | 'down';

/**
 * 画面座標(clientX/clientY)の直下にある WorkingArea の ID を返す（無ければ null）。
 * computeDropOverlay() の isOuter（パネル外縁判定）とは独立したヒットテスト。
 * Alt+ThinkFileDrag（Insert）の対象判定は、パネル端に近いPane（よくあるレイアウト）でも
 * 常にそのPaneをInsert対象にできるよう、isOuterによる新規Pane追加ゾーン判定より
 * 優先してこちらを使う必要がある。
 */
function findWorkingAreaIdAtPoint(clientX: number, clientY: number, excludeAreaId?: string): string | null {
  const els = document.elementsFromPoint(clientX, clientY);
  const areaEl = els.find(el =>
    el.classList.contains('working-area') &&
    el.getAttribute('data-area-id') !== excludeAreaId,
  ) as HTMLElement | undefined;
  return areaEl?.getAttribute('data-area-id') ?? null;
}

export function useWorkingPanelDrop(panel: TTWorkingPanel, vault: TTVault, seedsProjectId: string | undefined) {
  // ドラッグ状態
  const [dragId,      setDragId]     = useState<string | null>(null);
  const [overAreaId,  setOverAreaId] = useState<string | null>(null);
  const overAreaIdRef                = useRef<string | null>(null);

  // Ghost アニメーション
  const [dragTitle, setDragTitle] = useState<string | null>(null);
  const [dragPos,   setDragPos]   = useState<{ x: number; y: number } | null>(null);

  // 外部D&D中フラグ（Monaco のイベント横取りを防ぐドラッグシールド用）
  const [isExternalDrag, setIsExternalDrag] = useState(false);

  // D&D オーバーレイ（アイテムドロップ時の新Paneプレビュー）
  const bodyRef = useRef<HTMLDivElement>(null);

  useNativeDragCleanup(() => {
    setDropOverlay(null);
    setInsertCaret(null);
    setIsExternalDrag(false);
  });

  interface DropOverlay {
    /** swap = Pane タイトル同士の D&D（両 Pane の内容を入れ替える） */
    type:   'add' | 'split' | 'swap';
    /**
     * ゴーストの色の種類。added = Pane 領域全体（端・空の領域）から決めた位置、
     * divided = 特定 Pane の上で決めた位置。Pane が1つのときは type が 'add' でも divided になる
     * （ドロップ時の動作は type で決まり、色とは別）。
     */
    ghost:  'added' | 'divided';
    dir:    DropEdgeDir;
    style:  React.CSSProperties;
    areaId?: string;
  }
  const [dropOverlay, setDropOverlay] = useState<DropOverlay | null>(null);

  // Alt+ThinkFileDrag（Insert）中の挿入位置プレビュー用カスタムCaret。
  // ネイティブD&D中はブラウザがフォーカス移動を抑制するため editor.focus() で
  // Monaco自身のカーソル描画に頼れず、独自にオーバーレイを描画して追随させる。
  interface InsertCaret { left: number; top: number; height: number }
  const [insertCaret, setInsertCaret] = useState<InsertCaret | null>(null);

  // ── D&D オーバーレイ計算（ドロップ後の新Pane位置をプレビュー）──────────

  const OUTER_RATIO   = 0.15; // パネル外縁15%以内 → エリア追加
  const NEW_PANE_FRAC = 0.35; // 追加時の新ペイン幅/高さ比率

  const computeDropOverlay = useCallback((
    e: { clientX: number; clientY: number },
    opts: { skipRibbonCheck?: boolean; excludeAreaId?: string } = {},
  ) => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return null;

    // タイトルバー（WorkingMenuRibbon）上にいる場合はオーバーレイを表示しない
    if (!opts.skipRibbonCheck) {
      const elemsUnderCursor = document.elementsFromPoint(e.clientX, e.clientY);
      if (elemsUnderCursor.some(el => el.classList.contains('working-menu-ribbon'))) {
        return null;
      }
    }

    const br   = bodyEl.getBoundingClientRect();

    // ── エリアが1つも無い場合：全面を緑オーバーレイ ──
    if (panel.Layout === null) {
      return {
        type: 'add' as const,
        ghost: 'added' as const,
        dir: 'right' as DropEdgeDir,
        style: { left: 0, top: 0, width: br.width, height: br.height } as React.CSSProperties,
      };
    }

    const px   = (e.clientX - br.left) / br.width;
    const py   = (e.clientY - br.top)  / br.height;
    const dl   = px;
    const dr   = 1 - px;
    const du   = py;
    const dd   = 1 - py;
    const min  = Math.min(dl, dr, du, dd);
    const dir: DropEdgeDir =
      min === dl ? 'left' : min === dr ? 'right' : min === du ? 'up' : 'down';
    const isOuter = min < OUTER_RATIO;

    if (isOuter) {
      const fw = br.width  * NEW_PANE_FRAC;
      const fh = br.height * NEW_PANE_FRAC;
      const s: React.CSSProperties =
        dir === 'left'  ? { left: 0,   top: 0, width: fw, height: br.height } :
        dir === 'right' ? { right: 0,  top: 0, width: fw, height: br.height } :
        dir === 'up'    ? { left: 0,   top: 0, width: br.width, height: fh } :
                          { left: 0, bottom: 0, width: br.width, height: fh };
      return { type: 'add' as const, ghost: 'added' as const, dir, style: s };
    }

    // 内側 → 各ペインで分割
    const els    = document.elementsFromPoint(e.clientX, e.clientY);
    const areaEl = els.find(el =>
      el.classList.contains('working-area') &&
      el.getAttribute('data-area-id') !== opts.excludeAreaId,
    ) as HTMLElement | undefined;
    if (!areaEl) return null;
    const areaId = areaEl.getAttribute('data-area-id');
    if (!areaId) return null;

    const ar  = areaEl.getBoundingClientRect();
    const ax  = (e.clientX - ar.left) / ar.width  - 0.5;
    const ay  = (e.clientY - ar.top)  / ar.height - 0.5;
    const splitDir: DropEdgeDir =
      Math.abs(ax) > Math.abs(ay)
        ? (ax < 0 ? 'left' : 'right')
        : (ay < 0 ? 'up'   : 'down');

    const aLeft = ar.left - br.left;
    const aTop  = ar.top  - br.top;
    const aW    = ar.width;
    const aH    = ar.height;
    const s: React.CSSProperties =
      splitDir === 'left'  ? { left: aLeft,        top: aTop, width: aW/2, height: aH } :
      splitDir === 'right' ? { left: aLeft + aW/2,  top: aTop, width: aW/2, height: aH } :
      splitDir === 'up'    ? { left: aLeft,          top: aTop, width: aW,   height: aH/2 } :
                              { left: aLeft, top: aTop + aH/2,  width: aW,   height: aH/2 };

    // ── エリアが1つだけのとき：ドロップ時の動作は add に統一する（色は Pane 上なので divided のまま）──
    const overlayType = panel.Areas.length <= 1 ? 'add' as const : 'split' as const;
    return { type: overlayType, ghost: 'divided' as const, dir: splitDir, areaId, style: s };
  }, [panel]);

  // Pane タイトルへの D&D は表示位置の選択ではなく、その Pane の内容を置き換える
  // （Pane 同士なら入れ替え）。ゴーストは対象 Pane 全体に出し、そこへ入ることを示す
  const computeTitleOverlay = useCallback((
    e: { clientX: number; clientY: number },
    excludeAreaId?: string,
  ): DropOverlay | null => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return null;
    const ribbonEl = document.elementsFromPoint(e.clientX, e.clientY)
      .find(el => el.classList.contains('working-menu-ribbon'));
    const areaEl = ribbonEl?.closest('.working-area') as HTMLElement | null | undefined;
    const areaId = areaEl?.getAttribute('data-area-id');
    if (!areaEl || !areaId || areaId === excludeAreaId) return null;
    const br = bodyEl.getBoundingClientRect();
    const ar = areaEl.getBoundingClientRect();
    return {
      type: 'swap',
      ghost: 'divided',
      dir: 'right',
      areaId,
      style: { left: ar.left - br.left, top: ar.top - br.top, width: ar.width, height: ar.height },
    };
  }, []);

  const handleBodyDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    const hasThink = types.includes('application/x-thought-id');
    const hasLink  = types.includes('text/uri-list') || types.includes('Files') || types.includes('text/plain');
    if (!hasThink && !hasLink) return;
    e.preventDefault();

    // 外部URL/パスがTextEditor上にある場合は、Pane追加用シールドを外してTextEditor自身の
    // LocalFileDrag処理へ渡す。シールドが残ると画像等のFilesドロップが
    // WorkingPanel側に吸われ、新しいlinkファイルのPane作成になってしまう。
    if (hasLink) {
      const externalAreaId = findWorkingAreaIdAtPoint(e.clientX, e.clientY);
      const externalEditor = externalAreaId ? TTShortcutManager.instance.getAreaEditor(externalAreaId) : null;
      if (externalEditor) {
        e.dataTransfer.dropEffect = 'copy';
        setIsExternalDrag(false);
        setDropOverlay(null);
        setInsertCaret(null);
        return;
      }
    }

    // Alt+ThinkFileDrag（Insert）は、computeDropOverlay()のisOuter（パネル外縁15%は
    // 新規Pane追加ゾーン）判定より優先してカーソル直下の既存Paneを直接ヒットテストする。
    // isOuter判定はパネル本体の端からの距離だけで決まるため、パネル端に近い既存Pane
    // （よくあるレイアウト）の上にいても isOuter=true になり areaId が付かず、Insertが
    // 一切成立しない不具合があった。Alt押下時は「マウス直下にPaneがあるか」だけで判定する。
    const altHeld = hasThink && TTShortcutManager.instance.isDragAltHeld(e.nativeEvent);
    const hoveredAreaId = altHeld ? findWorkingAreaIdAtPoint(e.clientX, e.clientY) : null;
    const targetEditor = hoveredAreaId ? TTShortcutManager.instance.getAreaEditor(hoveredAreaId) : null;
    const canInsert = !!targetEditor;
    e.dataTransfer.dropEffect = canInsert ? 'link' : 'copy';
    setIsExternalDrag(true);

    if (canInsert) {
      // Alt+ThinkFileDrag: Pane配置のゴーストは表示せず、代わりにマウス直下の位置へ
      // 対象エディタのカーソルを追従させ、挿入位置をその場でプレビューする。
      // editor.focus() はネイティブD&D中はブラウザがフォーカス移動そのものを
      // 抑制するため、Monaco自身のCaret描画（DOMフォーカス依存）はあてにならない。
      // 代わりに getScrolledVisiblePosition() でピクセル座標を求め、
      // 独自のCaretオーバーレイ（insertCaret）をbodyRef基準で描画する。
      setDropOverlay(null);
      const pos = clientPointToPosition(targetEditor, e.clientX, e.clientY);
      if (pos) {
        targetEditor.setPosition(pos);
        const coords = targetEditor.getScrolledVisiblePosition(pos);
        const domRect = targetEditor.getDomNode()?.getBoundingClientRect();
        const br = bodyRef.current?.getBoundingClientRect();
        if (coords && domRect && br) {
          setInsertCaret({
            left:   domRect.left - br.left + coords.left,
            top:    domRect.top  - br.top  + coords.top,
            height: coords.height,
          });
        } else {
          setInsertCaret(null);
        }
      } else {
        setInsertCaret(null);
      }
      if (TTShortcutManager.instance.activeEditor !== targetEditor) {
        targetEditor.focus();
        TTShortcutManager.instance.setActiveEditor(targetEditor);
      }
    } else {
      setInsertCaret(null);
      setDropOverlay(computeDropOverlay(e));
    }
  }, [computeDropOverlay]);

  // タイトルバー（WorkingMenuRibbon）はdragoverをstopPropagationするため handleBodyDragOver が
  // 呼ばれない。キャプチャ段階で、Pane タイトル同士の D&D と同じ Pane 全体のゴーストに切り替える
  const handleBodyDragOverCapture = useCallback((e: React.DragEvent) => {
    if (!(e.target as Element).closest?.('.working-menu-ribbon')) return;
    setInsertCaret(null);
    const types = e.dataTransfer.types;
    const accepts = types.includes('application/x-thought-id') || isDragLink(types);
    setDropOverlay(accepts ? computeTitleOverlay(e) : null);
  }, [computeTitleOverlay]);

  // タイトルバーの drop も stopPropagation されるため、document の後始末に届かない
  const handleBodyDropCapture = useCallback((e: React.DragEvent) => {
    if (!(e.target as Element).closest?.('.working-menu-ribbon')) return;
    setDropOverlay(null);
    setInsertCaret(null);
    setIsExternalDrag(false);
  }, []);

  const handleBodyDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropOverlay(null);
      setInsertCaret(null);
      setIsExternalDrag(false);
    }
  }, []);

  const handleBodyDrop = useCallback(async (e: React.DragEvent) => {
    const thinkId = e.dataTransfer.getData('application/x-thought-id');
    const fallbackLink = thinkId ? null : extractLinkDrop(e);

    // TextEditor上の外部URL/パスは、シールドがdrop直前まで残った場合もここで救済し、
    // Pane作成ではなくDefaultShortcutのLocalFileDrag Actionへ渡す。
    if (fallbackLink) {
      const hoveredAreaId = findWorkingAreaIdAtPoint(e.clientX, e.clientY);
      const editor = hoveredAreaId ? TTShortcutManager.instance.getAreaEditor(hoveredAreaId) : null;
      if (editor) {
        const dragKind = externalDropDragKind(e, fallbackLink);
        const nativeEvent = e.nativeEvent;
        const resolvedLink = resolveLinkDrop(e);
        const position = clientPointToPosition(editor, e.clientX, e.clientY) ?? editor.getPosition?.();
        const range = position
          ? { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column }
          : editor.getSelection?.();
        e.preventDefault();
        e.stopPropagation();
        setDropOverlay(null);
        setInsertCaret(null);
        setIsExternalDrag(false);
        if (!dragKind || !range) return;

        const link = await resolvedLink ?? fallbackLink;
        const actionId = TTShortcutManager.instance.resolveDragAction(dragKind, nativeEvent);
        if (!actionId) return;
        TTShortcutManager.instance.setActiveEditor(editor);
        TTShortcutManager.instance.setPendingTextEditorDrop({
          target: link.url,
          title: link.title,
          ...(link.pageTitle ? { pageTitle: link.pageTitle } : {}),
          ...(link.isDirectory !== undefined ? { isDirectory: link.isDirectory } : {}),
          kind: isLocalPathTarget(link.url) ? 'path' : 'url',
          editor,
          range,
        });
        TTShortcutManager.instance.executeActionDirect(actionId);
        TTShortcutManager.instance.setPendingTextEditorDrop(null);
        return;
      }
    }

    const overlay = computeDropOverlay(e);
    setDropOverlay(null);
    setInsertCaret(null);
    setIsExternalDrag(false);
    if (!overlay) return;
    e.preventDefault();

    // Think D&D（WorkingPanel.DroppedFile.ID:Load / WorkingPanel.DroppedFile.ID:Insert、
    // docs/DefaultShortcut.md参照）。コンテンツ領域へのThinkドロップはLoad/Insertいずれも
    // ここで一元的に判定する（各Paneのコンポーネント側では消費しない）。個別コンポーネントの
    // dragover/dropハンドラーとタイミング・判定がずれてAlt判定を取りこぼす問題を避けるため。
    if (thinkId) {
      // Insertは、computeDropOverlay()のisOuter（パネル外縁は新規Pane追加ゾーン）判定より
      // 優先してカーソル直下の既存Paneを直接ヒットテストする（handleBodyDragOverと同じ理由。
      // isOuter判定に引きずられるとパネル端に近い既存Pane上でもLoadにフォールバックしてしまう）。
      const actionId = TTShortcutManager.instance.resolveDragAction('ThinkFileDrag', e.nativeEvent);
      const hoveredAreaId = actionId === 'WorkingPanel.DroppedFile.ID:Insert'
        ? findWorkingAreaIdAtPoint(e.clientX, e.clientY)
        : null;
      const editor = hoveredAreaId ? TTShortcutManager.instance.getAreaEditor(hoveredAreaId) : null;
      if (editor) {
        TTShortcutManager.instance.setActiveEditor(editor);
        TTShortcutManager.instance.setPendingThinkDrop({ thinkId, kind: 'insert' });
        void TTActions.Execute('WorkingPanel.DroppedFile.ID:Insert');
        return;
      }
      // ドロップ位置に応じたPane配置（overlay）は、ゴースト表示のためにここで既に計算済みの
      // ものをそのままActionへ渡す（ジオメトリ計算はUI層の責務のためActionでは再計算しない）。
      TTShortcutManager.instance.setPendingThinkDrop(
        overlay.type === 'add'
          ? { thinkId, kind: 'load-place', overlayType: 'add', dir: overlay.dir }
          : { thinkId, kind: 'load-place', overlayType: 'split', dir: overlay.dir, areaId: overlay.areaId }
      );
      void TTActions.Execute('WorkingPanel.DroppedFile.ID:Load');
      return;
    }

    // URL / path D&D → links Think を新規作成
    const link = extractLinkDrop(e);
    if (link && shouldAllowLocalDrop(e)) {
      const { think: linkThink } = await vault.GetOrCreateLinksThink(
        { target: link.url, title: link.title, pageTitle: link.pageTitle, isDirectory: link.isDirectory },
        await getPcName(), seedsProjectId);
      const id    = linkThink.ID;
      const title = linkThink.Name;
      if (overlay.type === 'split' && overlay.areaId) panel.FocusArea(overlay.areaId);
      panel.InsertArea(id, 'texteditor', title, overlay.dir, overlay.type);
    }
  }, [computeDropOverlay, panel, vault, seedsProjectId]);

  const handleDragStart = useCallback((e: React.MouseEvent, areaId: string) => {
    e.preventDefault();
    const area  = panel.GetArea(areaId);
    const title = area?.Title || '（無題）';

    setDragId(areaId);
    setDragTitle(title);
    setDragPos({ x: e.clientX, y: e.clientY });

    const computeOverlay = (ev: MouseEvent): DropOverlay | null =>
      computeTitleOverlay(ev, areaId)
      ?? computeDropOverlay(ev, { skipRibbonCheck: true, excludeAreaId: areaId });

    const onMouseMove = (ev: MouseEvent) => {
      setDragPos({ x: ev.clientX, y: ev.clientY });
      setDropOverlay(computeOverlay(ev));
    };
    const onMouseUp = (ev: MouseEvent) => {
      const overlay = computeOverlay(ev);
      setDropOverlay(null);
      if (overlay?.type === 'swap') {
        if (overlay.areaId) {
          panel.SwapAreas(areaId, overlay.areaId);
          panel.FocusArea(areaId);
        }
      } else if (overlay) {
        panel.MoveArea(areaId, overlay.areaId ?? null, overlay.dir, overlay.type);
      }
      overAreaIdRef.current = null;
      setDragId(null);
      setOverAreaId(null);
      setDragTitle(null);
      setDragPos(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  }, [panel, computeDropOverlay, computeTitleOverlay]);

  const handleDragEnter = useCallback((areaId: string) => {
    if (dragId && dragId !== areaId) {
      overAreaIdRef.current = areaId;
      setOverAreaId(areaId);
    }
  }, [dragId]);

  const handleDragLeave = useCallback(() => {
    overAreaIdRef.current = null;
    setOverAreaId(null);
  }, []);

  return {
    bodyRef, dragId, overAreaId, dragTitle, dragPos, isExternalDrag, dropOverlay, insertCaret,
    handleBodyDragOverCapture, handleBodyDragOver, handleBodyDragLeave, handleBodyDrop, handleBodyDropCapture,
    handleDragStart, handleDragEnter, handleDragLeave,
  };
}
