// TTNotifyBase の変更通知を React 再レンダリングに接続するフック

import { useEffect, useReducer } from 'react';
import type { TTNotifyBase } from '../models/TTNotifyBase';

export function useNotify(...objects: (TTNotifyBase | null | undefined)[]): void {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const unsubs = objects
      .filter((o): o is TTNotifyBase => !!o)
      .map((o) => o.AddListener(force));
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, objects);
}
