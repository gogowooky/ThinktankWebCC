/**
 * harnessChat.ts
 * AIハーネスの対話を残す chat ファイル（会話の原本）。project の # AI議論 と chat の metadata の両方から辿れるようにする。
 * 本文は既存の chat 形式（「## 発言」の後にAIの返答）なので、Working の Chat でもそのまま読める。
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { aiReplyHeader } from '../../../shared/contracts/conversationRecord';
import { addProjectDiscussionId, parseChat, parseProject } from '../../utils/thinkFormat';

export const HARNESS_CHAT_METADATA_KEY = 'harnessChat';

function isHarnessChatOf(think: TTThink | undefined, projectId: string): think is TTThink {
  if (!think || think.ContentType !== 'chat') return false;
  const mark = think.Metadata?.[HARNESS_CHAT_METADATA_KEY] as { projectId?: unknown } | undefined;
  return mark?.projectId === projectId;
}

/** project の # AI議論 にある、このハーネスの chat（後に書かれたものを優先） */
export function findHarnessChat(vault: TTVault, project: TTThink): TTThink | null {
  const ids = parseProject(project.Content).aiDiscussionIds;
  for (const id of [...ids].reverse()) {
    const think = vault.GetThink(id);
    if (isHarnessChatOf(think, project.ID)) return think;
  }
  return null;
}

async function saveOrRevert(think: TTThink, previous: string): Promise<void> {
  try { await think.SaveContent(); }
  catch (error) { think.Content = previous; throw error; }
}

/** 会話を残す chat を返す。無ければ作り、# AI議論 と chat の metadata（taskContext）で project に結び付ける */
export async function ensureHarnessChat(vault: TTVault, project: TTThink): Promise<TTThink> {
  if (project.IsMetaOnly) await project.LoadContent();
  const existing = findHarnessChat(vault, project);
  if (existing) {
    if (existing.IsMetaOnly) await existing.LoadContent();
    return existing;
  }
  const title = parseProject(project.Content).title;
  const chat = await vault.CreateChatThink(`TASK:Seeds｜${title}`);
  chat.Metadata = {
    ...chat.Metadata,
    taskContext: { schemaVersion: 1, bundleId: project.ID },
    [HARNESS_CHAT_METADATA_KEY]: { projectId: project.ID },
  };
  await chat.SaveContent();
  const previous = project.Content;
  project.Content = addProjectDiscussionId(previous, chat.ID);
  await saveOrRevert(project, previous);
  vault.NotifyUpdated(false);
  return chat;
}

export interface HarnessChatTurn {
  /** 利用者の発言。自動で続けた回は「（自動）…」 */
  question: string;
  model: string;
  createdAt: string;
  reply: string;
}

/** 返答の中の「## 」は発言の区切りと読まれるため1段下げる */
function guardReply(reply: string): string {
  return reply.split(/\r?\n/).map(line => (/^##\s/.test(line) ? `#${line}` : line)).join('\n').trim();
}

export function formatHarnessChatTurn(turn: HarnessChatTurn): string {
  const question = turn.question.replace(/[\r\n]+/g, ' ').trim() || '（発言なし）';
  return [`## ${question}`, aiReplyHeader(turn.model, turn.createdAt), guardReply(turn.reply) || '（応答なし）'].join('\n');
}

/** chat の末尾に1往復を加えて保存する */
export async function appendHarnessChatTurn(vault: TTVault, chat: TTThink, turn: HarnessChatTurn): Promise<void> {
  if (chat.IsMetaOnly) await chat.LoadContent();
  const previous = chat.Content;
  chat.Content = `${previous.replace(/\s+$/, '')}\n${formatHarnessChatTurn(turn)}\n`;
  await saveOrRevert(chat, previous);
  vault.NotifyUpdated(false);
}

/** 直近の会話（AI に渡す分）。古いものは chat を開けば読める */
export function recentHarnessChatText(chat: TTThink | null, maxMessages: number): string {
  if (!chat) return '';
  const body = chat.Content.split(/\r?\n/).slice(1).join('\n');
  return parseChat(body).slice(-maxMessages)
    .map(m => (m.role === 'user' ? `[利用者] ${m.content}` : `[AI] ${m.content}`))
    .join('\n\n');
}
