/**
 * aiWorkVersions.ts
 * AIWork の版。AI やアプリが書き換える直前にスナップショットを残し、版どうしを比べ、前の版へ戻す。
 * 記事の「_harness を Git で管理する」の代わり。docs/261122/AIハーネス実装計画.md §3.3
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { StorageManager } from '../storage/StorageManager';
import type { ThinkSnapshotRecord } from '../storage/StorageManager';

export function snapshotContent(snapshot: Pick<ThinkSnapshotRecord, 'title' | 'body'>): string {
  return snapshot.body ? `${snapshot.title}\n${snapshot.body}` : snapshot.title;
}

function sameContent(a: string, b: string): boolean {
  return a.replace(/\s+$/, '') === b.replace(/\s+$/, '');
}

/**
 * 書き換える直前の AIWork をスナップショットに残す。
 * 最新のスナップショットと同じ内容・タイトル行しかない・保存されていない編集がある・スナップショット非対応のときは作らない。
 * 失敗しても書き換えは止めない（警告だけ）。作ったら true。
 */
export async function snapshotBeforeWrite(aiWork: TTThink): Promise<boolean> {
  const storage = StorageManager.instance;
  if (!storage.supportsSnapshots) return false;
  try {
    if (aiWork.IsMetaOnly) await aiWork.LoadContent();
    if (aiWork.IsMetaOnly || aiWork.IsDirty) return false;
    if (!aiWork.Content.trim().includes('\n')) return false;
    const latest = await storage.getSnapshot(aiWork.ID);
    if (latest && sameContent(snapshotContent(latest), aiWork.Content)) return false;
    await storage.createSnapshot(aiWork.ID);
    return true;
  } catch (error) {
    console.warn(`[aiWorkVersions] 書き換え前のスナップショットを作れませんでした (${aiWork.ID})`, error);
    return false;
  }
}

/** この環境で版を残し比べられるか（画面のボタンの表示に使う） */
export function aiWorkVersionsAvailable(): boolean {
  try { return StorageManager.instance.supportsSnapshots === true; }
  catch { return false; }
}

/** 版の一覧（古い順）。非対応なら空 */
export async function listAiWorkVersions(aiWork: TTThink): Promise<ThinkSnapshotRecord[]> {
  const storage = StorageManager.instance;
  if (!storage.supportsSnapshots) return [];
  return storage.listSnapshots(aiWork.ID);
}

/** AIWork を指定の版の内容に戻す。戻す前の内容もスナップショットに残す */
export async function restoreAiWorkVersion(vault: TTVault, aiWork: TTThink, version: Pick<ThinkSnapshotRecord, 'title' | 'body'>): Promise<void> {
  const restored = snapshotContent(version);
  if (aiWork.IsMetaOnly) await aiWork.LoadContent();
  if (sameContent(restored, aiWork.Content)) return;
  await snapshotBeforeWrite(aiWork);
  const previous = aiWork.Content;
  aiWork.Content = restored;
  try { await aiWork.SaveContent(); }
  catch (error) { aiWork.Content = previous; throw error; }
  vault.NotifyUpdated(false);
}
