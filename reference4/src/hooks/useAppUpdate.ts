import { useEffect, useReducer } from 'react';
import type { TTObject } from '../models/TTObject';

/**
 * useAppUpdate
 *
 * TTObject の AddOnUpdate / RemoveOnUpdate を React の再レンダリングに繋ぐフック。
 * obj が NotifyUpdated() を呼ぶたびにコンポーネントが強制再レンダリングされる。
 *
 * @example
 *   // TTModels 全体の変化を購読（粗粒度）
 *   useAppUpdate(TTModels.Instance);
 *
 *   // 特定パネルの変化のみ購読（細粒度・推奨）
 *   useAppUpdate(TTApplication.Instance.MainPanel);
 *   useAppUpdate(TTApplication.Instance.LeftPanel);
 */
export function useAppUpdate(obj: TTObject): void {
  const [, dispatch] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    // ランダムサフィックスで同一オブジェクトへの複数購読が衝突しないようにする
    const key = `useAppUpdate-${obj.ID}-${Math.random().toString(36).slice(2)}`;
    obj.AddOnUpdate(key, dispatch);
    return () => obj.RemoveOnUpdate(key);
  }, [obj]);
}
