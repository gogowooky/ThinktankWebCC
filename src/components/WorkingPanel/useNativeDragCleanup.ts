import { useEffect, useRef } from 'react';

/**
 * ネイティブ D&D が WorkingPanel の外で終わったときにもゴースト類を消す。
 *
 * Think一覧の行は仮想スクロールで、ドラッグ中の再描画でドラッグ元の行が DOM から外れると
 * dragend が window まで届かない。他パネルの drop が stopPropagation する場合も document に
 * 届かない。そのため drop / dragend は window のキャプチャ段階で拾い、それでも取りこぼした分は
 * 「ネイティブ D&D 中は mousemove が来ない」ことを使い、D&D 後の最初の mousemove で消す。
 *
 * drop / dragend での後始末はイベントの配送が終わってから行う。キャプチャ段階で同期的に
 * state を戻すと、React がリスナーの合間（マイクロタスク）に再描画してドラッグシールドを
 * DOM から外し、ドロップ先がシールドだった drop を React が誰にも配らなくなる
 * （Think の D&D で新しい Pane が開かなくなる）。
 */
export function useNativeDragCleanup(cleanup: () => void): void {
  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;

  useEffect(() => {
    let isNativeDragging = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const runCleanup = () => {
      isNativeDragging = false;
      cleanupRef.current();
    };
    const cleanupAfterDispatch = () => {
      const timer = setTimeout(() => { timers.delete(timer); runCleanup(); }, 0);
      timers.add(timer);
    };
    const markNativeDrag = () => { isNativeDragging = true; };
    const cleanupAfterNativeDrag = () => { if (isNativeDragging) runCleanup(); };
    window.addEventListener('dragover',  markNativeDrag,         true);
    window.addEventListener('dragend',   cleanupAfterDispatch,   true);
    window.addEventListener('drop',      cleanupAfterDispatch,   true);
    window.addEventListener('mousemove', cleanupAfterNativeDrag, true);
    return () => {
      window.removeEventListener('dragover',  markNativeDrag,         true);
      window.removeEventListener('dragend',   cleanupAfterDispatch,   true);
      window.removeEventListener('drop',      cleanupAfterDispatch,   true);
      window.removeEventListener('mousemove', cleanupAfterNativeDrag, true);
      timers.forEach(clearTimeout);
    };
  }, []);
}
