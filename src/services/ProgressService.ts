import { apiFetch, readApiJson } from './apiClient';
import { TTModels } from '../models/TTModels';
import { StorageManager } from './storage/StorageManager';
import {
  readProgress,
  validateProgress,
  progressReview,
  sameProgress,
  type ProgressInput,
  type ProgressLog,
  type ProgressReview,
} from '../../server/contracts/progressRecord';
import { object } from '../../server/contracts/conversationRecord';

export interface ProgressState {
  bundleId: string;
  version: string;
  log: ProgressLog;
  review: ProgressReview;
}

function isWebCloudMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (StorageManager.instance?.webProvider === 'drive') return true;
  const host = window.location?.hostname || '';
  return host.endsWith('.web.app') || host.endsWith('.firebaseapp.com');
}

async function parse(response: Response, bundleId: string): Promise<ProgressState> {
  const value = await readApiJson(response, '保存先との通信に失敗しました。');
  if (
    !object(value) ||
    value.bundleId !== bundleId ||
    typeof value.version !== 'string' ||
    !Number.isFinite(Date.parse(value.version)) ||
    !object(value.review) ||
    !['goal', 'nextAction', 'completionCriteria'].every(
      (k) => typeof (value.review as Record<string, unknown>)[k] === 'string',
    ) ||
    !Array.isArray(value.review.notes) ||
    !value.review.notes.every((n) => typeof n === 'string')
  ) {
    throw new Error('保存結果の形式または対象が一致しません。');
  }
  readProgress(value.log);
  return value as unknown as ProgressState;
}

export class ProgressService {
  async read(bundleId: string): Promise<ProgressState> {
    if (typeof window !== 'undefined' && window.electronAPI?.storage?.getRecord) {
      const rec = await window.electronAPI.storage.getRecord(bundleId);
      if (!rec) throw new Error('対象のBundleが見つかりません。');
      const metadata = rec.meta.metadata ?? {};
      const log = readProgress(metadata.thinkProgress);
      const review = progressReview(metadata, bundleId);
      return {
        bundleId,
        version: rec.meta.updatedAt,
        log,
        review,
      };
    }

    if (isWebCloudMode()) {
      const think = TTModels.Instance?.Vault?.GetThink(bundleId);
      if (!think) throw new Error('対象のBundleが見つかりません。');
      const metadata = think.Metadata ?? {};
      const log = readProgress(metadata.thinkProgress);
      const review = progressReview(metadata, bundleId);
      return {
        bundleId,
        version: think.UpdatedAt || new Date().toISOString(),
        log,
        review,
      };
    }

    return parse(
      await apiFetch(`/api/think-support/progress/bundles/${encodeURIComponent(bundleId)}`),
      bundleId,
    );
  }

  async save(
    bundleId: string,
    version: string,
    operationId: string,
    input: ProgressInput,
  ): Promise<ProgressState> {
    if (
      typeof window !== 'undefined' &&
      window.electronAPI?.storage?.getRecord &&
      window.electronAPI?.storage?.saveSupport
    ) {
      validateProgress(input);
      const rec = await window.electronAPI.storage.getRecord(bundleId);
      if (!rec) throw new Error('対象のBundleが見つかりません。');
      const metadata = rec.meta.metadata ?? {};
      const currentLog = readProgress(metadata.thinkProgress);

      const existing = currentLog.events.find((e) => e.id === operationId);
      if (existing) {
        if (!sameProgress(existing.input, input)) {
          throw new Error('同じ操作IDで異なる到達状態は保存できません。');
        }
        return {
          bundleId,
          version: rec.meta.updatedAt,
          log: currentLog,
          review: progressReview(metadata, bundleId),
        };
      }

      const nextLog: ProgressLog = {
        schemaVersion: 1,
        events: [
          ...currentLog.events,
          {
            id: operationId,
            revision: currentLog.events.length + 1,
            confirmedAt: new Date().toISOString(),
            author: 'human',
            input,
          },
        ],
      };

      const saved = await window.electronAPI.storage.saveSupport(
        bundleId,
        { thinkProgress: nextLog },
        version || undefined,
      );
      return {
        bundleId,
        version: saved.updatedAt,
        log: nextLog,
        review: progressReview(saved.metadata, bundleId),
      };
    }

    if (isWebCloudMode()) {
      validateProgress(input);
      const think = TTModels.Instance?.Vault?.GetThink(bundleId);
      if (!think) throw new Error('対象のBundleが見つかりません。');
      const metadata = think.Metadata ?? {};
      const currentLog = readProgress(metadata.thinkProgress);

      const existing = currentLog.events.find((e) => e.id === operationId);
      if (existing) {
        if (!sameProgress(existing.input, input)) {
          throw new Error('同じ操作IDで異なる到達状態は保存できません。');
        }
        return {
          bundleId,
          version: think.UpdatedAt || new Date().toISOString(),
          log: currentLog,
          review: progressReview(metadata, bundleId),
        };
      }

      const nextLog: ProgressLog = {
        schemaVersion: 1,
        events: [
          ...currentLog.events,
          {
            id: operationId,
            revision: currentLog.events.length + 1,
            confirmedAt: new Date().toISOString(),
            author: 'human',
            input,
          },
        ],
      };

      const nextMetadata: Record<string, unknown> = {
        ...metadata,
        thinkProgress: nextLog,
      };
      think.Metadata = nextMetadata;
      const savedMeta = await StorageManager.instance.save({
        thinkid: think.ID,
        category: think.ContentType,
        fullContent: think.Content,
        keywords: think.Keywords,
        relatedIds: think.RelatedIDs,
        metadata: nextMetadata,
        baseUpdatedAt: version || think.UpdatedAt || undefined,
      });
      think.UpdatedAt = savedMeta.updatedAt;
      think.markSaved();
      think.markMetadataSaved();
      TTModels.Instance?.Vault?.NotifyUpdated(false);
      return {
        bundleId,
        version: savedMeta.updatedAt,
        log: nextLog,
        review: progressReview(nextMetadata, bundleId),
      };
    }

    return parse(
      await apiFetch(`/api/think-support/progress/bundles/${encodeURIComponent(bundleId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: version, operationId, input, confirmed: true }),
      }),
      bundleId,
    );
  }
}
