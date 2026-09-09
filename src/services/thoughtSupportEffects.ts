import type { TTVault } from '../models/TTVault';
import type { TTThink } from '../models/TTThink';
import { KINDS, supportRecord, saveSupportTurn, linkSupportFiles, type SupportAnswer } from './thoughtSupport';

async function effectId(sourceId: string, key: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sourceId}:${key}`));
  return `support-${Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Durable pending journal + deterministic IDs: retries complete links without creating duplicates. */
export async function applySupportEffects(vault: TTVault, source: TTThink) {
  const pending = source.Metadata.supportPendingEffects as { answer: SupportAnswer; sources: Array<{ id: string; updatedAt: string }>; operationId: string } | undefined;
  if (!pending) return;
  const { answer, operationId } = pending;
  if (answer.createBundle !== undefined && (typeof answer.createBundle !== 'string' || !answer.createBundle.trim() || answer.createBundle.length > 300)) throw new Error('Bundle名が不正です。');
  if (answer.children && (!Array.isArray(answer.children) || answer.children.length > 12)) throw new Error('一度に作る課題が多すぎます。');
  for (const child of answer.children ?? []) {
    if (!child || typeof child.key !== 'string' || !child.key || !(KINDS as readonly string[]).includes(child.kind) || typeof child.title !== 'string' || /[\r\n]/.test(child.title) || typeof child.goal !== 'string') throw new Error('子課題の形式が不正です。');
  }
  if (answer.artifact && (!['memo', 'table', 'html', 'links'].includes(answer.artifact.type) || typeof answer.artifact.body !== 'string' || answer.artifact.body.length > 150000 || typeof answer.artifact.key !== 'string' || !answer.artifact.key || typeof answer.artifact.title !== 'string')) throw new Error('成果物の形式が不正です。');
  let bundleId = supportRecord(source).bundleId;
  if (answer.createBundle && !bundleId) {
    const id = await effectId(source.ID, 'bundle');
    let bundle = vault.GetThink(id);
    if (!bundle) bundle = await vault.AddThinkWithContent(id, answer.createBundle, 'bundle', '', `> ${answer.createBundle.replace(/[\r\n]/g, ' ')}\n* ${source.ID}`);
    bundleId = bundle.ID;
    source.Metadata = { ...source.Metadata, thoughtSupport: { ...supportRecord(source), bundleId } };
    await source.SaveContent();
  }
  const links = [...(answer.linkIds ?? [])];
  if (bundleId) links.push(source.ID);
  for (const child of answer.children ?? []) {
    const id = await effectId(source.ID, `child:${child.occurrence || child.key}`);
    let target = vault.GetThink(id);
    if (!target) {
      const title = `${child.kind}:Workout｜[未着手]${child.title}`;
      target = await vault.AddThinkWithContent(id, title, 'chat', '', `${title}\n`);
    }
    await target.LoadContent();
    if (target.IsMetaOnly) throw new Error('子課題を読み込めませんでした。');
    const record = supportRecord(target);
    if (!record.parentId) await saveSupportTurn(target, record.messages ?? [], { record: { goal: child.goal, parentId: source.ID, loopId: child.occurrence ? source.ID : '', occurrence: child.occurrence || '', references: [source.ID] } }, target.Content, record.version, `${operationId}:${child.key}`, '');
    if (bundleId && !supportRecord(target).bundleId) {
      target.Metadata = { ...target.Metadata, thoughtSupport: { ...supportRecord(target), bundleId } };
      await target.SaveContent();
    }
    links.push(id);
  }
  if (answer.artifact) {
    const a = answer.artifact;
    const id = await effectId(source.ID, `artifact:${a.key}:${operationId}`);
    let target = vault.GetThink(id);
    if (!target) target = await vault.AddThinkWithContent(id, a.title, a.type, '', `${a.title.replace(/[\r\n]/g, ' ')}\n${a.body}`);
    target.Metadata = { ...target.Metadata, supportSource: { chatId: source.ID, chatVersion: supportRecord(source).version, operationId, generatedAt: new Date().toISOString(), sources: pending.sources.filter(s => s.id !== source.ID).map(s => ({ id: s.id, updatedAt: s.updatedAt })) } };
    await target.SaveContent(); links.push(id);
  }
  if (bundleId) await linkSupportFiles(vault, bundleId, [...new Set(links)]);
  else if (answer.linkIds?.length) throw new Error('資料の登録先Bundleがありません。相談でBundleを作成してください。');
  const old = supportRecord(source);
  const previousMetadata = source.Metadata;
  source.Metadata = { ...source.Metadata, thoughtSupport: { ...old, references: [...new Set([...old.references, ...links.filter(id => id !== source.ID)])] } };
  delete source.Metadata.supportPendingEffects;
  try { await source.SaveContent(); } catch (e) { source.Metadata = previousMetadata; throw e; }
}
