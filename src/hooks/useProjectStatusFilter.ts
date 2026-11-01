/**
 * useProjectStatusFilter.ts
 * Think一覧（Thinktank / Seeds）で、種別が project だけのときに使う「状態」「見通し」の絞り込み。
 * 値は各projectファイル本文の # 状態 / # 見通し から読む（readProjectStatus）。
 */

import { useEffect, useMemo, useState } from 'react';
import type { TTThink } from '../models/TTThink';
import { PROJECT_OUTLOOKS, PROJECT_STATES, readProjectStatus } from '../utils/thinkFormat';

// 旧「対話」の一覧と同じく、終わったもの（完了・中止）は既定で隠す
const defaultStates = () => new Set<string>(PROJECT_STATES.filter(s => s !== '完了' && s !== '中止'));
const defaultOutlooks = () => new Set<string>(PROJECT_OUTLOOKS);

function statusKey(t: TTThink): string {
  if (t.ContentType !== 'project') return '';
  const s = readProjectStatus(t.Content);
  return `${s.state}/${s.outlook}`;
}

export function useProjectStatusFilter(thinks: TTThink[], enabled: boolean) {
  const [states, setStates] = useState<Set<string>>(defaultStates);
  const [outlooks, setOutlooks] = useState<Set<string>>(defaultOutlooks);
  const [loadCount, setLoadCount] = useState(0);

  // 一覧に載っただけ（IsMetaOnly）のファイルは本文が無く値を読めないので、絞り込むときに取りに行く
  useEffect(() => {
    if (!enabled) return;
    const metaOnly = thinks.filter(t => t.ContentType === 'project' && t.IsMetaOnly);
    if (metaOnly.length === 0) return;
    let cancelled = false;
    void Promise.allSettled(metaOnly.map(t => t.LoadContent())).then(() => {
      if (!cancelled) setLoadCount(c => c + 1);
    });
    return () => { cancelled = true; };
  }, [thinks, enabled]);

  // 本文で # 状態 を書き換えたときも絞り込み直すため、各ファイルの値を鍵に含める
  const key = enabled ? thinks.map(statusKey).join('|') : '';

  const filtered = useMemo(() => {
    if (!enabled) return thinks;
    return thinks.filter(t => {
      if (t.ContentType !== 'project') return true;
      const s = readProjectStatus(t.Content);
      return states.has(s.state) && outlooks.has(s.outlook);
    });
  }, [thinks, enabled, states, outlooks, key, loadCount]); // eslint-disable-line react-hooks/exhaustive-deps

  return { filtered, states, setStates, outlooks, setOutlooks };
}
