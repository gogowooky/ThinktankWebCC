import {
  readProgress,
  validateProgress,
  progressReview,
  sameProgress,
  type ProgressInput,
  type ProgressLog,
  type ProgressReview,
} from '../../shared/contracts/progressRecord';
import { readBundleMetadata, saveBundleMetadata } from './bundleMetadataStore';

export interface ProgressState {
  bundleId: string;
  version: string;
  log: ProgressLog;
  review: ProgressReview;
}

export class ProgressService {
  async read(bundleId: string): Promise<ProgressState> {
    const { metadata, version } = await readBundleMetadata(bundleId);
    return {
      bundleId,
      version,
      log: readProgress(metadata.thinkProgress),
      review: progressReview(metadata, bundleId),
    };
  }

  async save(
    bundleId: string,
    version: string,
    operationId: string,
    input: ProgressInput,
  ): Promise<ProgressState> {
    validateProgress(input);
    const current = await readBundleMetadata(bundleId);
    const currentLog = readProgress(current.metadata.thinkProgress);

    // 同じ操作IDの再送は保存済みとして扱う（応答を失った後の再試行で二重記録しないため）
    const existing = currentLog.events.find((e) => e.id === operationId);
    if (existing) {
      if (!sameProgress(existing.input, input)) {
        throw new Error('同じ操作IDで異なる到達状態は保存できません。');
      }
      return {
        bundleId,
        version: current.version,
        log: currentLog,
        review: progressReview(current.metadata, bundleId),
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
    const saved = await saveBundleMetadata(bundleId, version, { thinkProgress: nextLog });
    return {
      bundleId,
      version: saved.version,
      log: nextLog,
      review: progressReview(saved.metadata, bundleId),
    };
  }
}
