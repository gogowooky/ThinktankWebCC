import { useEffect, useReducer } from 'react';
import { TTNotifyBase } from '../models/TTNotifyBase';

/**
 * useAppUpdate
 *
 * TTNotifyBase の変更通知を React の再レンダリングに繋ぐフック。
 * obj が NotifyUpdated() を呼ぶたびにコンポーネントが強制再レンダリングされる。
 */
export function useAppUpdate(obj: TTNotifyBase): void {
  const [, dispatch] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    // ランダムサフィックスで同一オブジェクトへの複数購読が衝突しないようにする
    const key = `useAppUpdate-${Math.random().toString(36).slice(2)}`;
    obj.AddOnUpdate(key, dispatch);
    return () => obj.RemoveOnUpdate(key);
  }, [obj]);
}
