import { useEffect, useReducer } from 'react';
import type { TTObject } from '../models/TTObject';

/**
 * useAppUpdate
 *
 * TTObject の AddOnUpdate/RemoveOnUpdate を React の再レンダリングに繋ぐフック。
 * obj が NotifyUpdated() を呼ぶたびにコンポーネントが再レンダリングされる。
 *
 * 使用例:
 *   useAppUpdate(TTModels.Instance);         // Models全体の変化を購読
 *   useAppUpdate(TTModels.Instance.Status);  // Status変化のみ購読
 *   useAppUpdate(column);                    // 特定列の変化を購読
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
