import { useEffect, useState } from 'react';
import { apiFetch } from '../services/apiClient';
import { fetchAiProviderAvailability } from '../services/aiModels';
import type { AiProviderAvailability } from '../services/aiModels';

/**
 * useAiProviderAvailability
 *
 * AI モデル選択ドロップダウンから「API キー未設定で使えないプロバイダ」を
 * 隠すための可用性情報を取得する。結果はセッション内で 1 度だけ取得し共有する。
 * 取得完了までは全プロバイダを利用可能として扱う（フェイルオープン）。
 */

const OPTIMISTIC: AiProviderAvailability = { anthropic: true, openai: true, gemini: true };

let cached: AiProviderAvailability | null = null;
let inflight: Promise<AiProviderAvailability> | null = null;

function load(): Promise<AiProviderAvailability> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetchAiProviderAvailability(apiFetch).then((result) => {
      cached = result;
      inflight = null;
      return result;
    });
  }
  return inflight;
}

export function useAiProviderAvailability(): AiProviderAvailability {
  const [availability, setAvailability] = useState<AiProviderAvailability>(cached ?? OPTIMISTIC);

  useEffect(() => {
    let alive = true;
    void load().then((result) => { if (alive) setAvailability(result); });
    return () => { alive = false; };
  }, []);

  return availability;
}
