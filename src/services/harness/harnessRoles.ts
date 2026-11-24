/**
 * harnessRoles.ts
 * チームの担当（役割）の定義。役割は AIWork で、タイトルを「役割 | 名前」とし、project の「# 役割」項に並べる。
 * 本文の「# 仕事」に担う仕事と返す内容、「# 条件」に「AI: claude」「モデル: 名前」（任意）を書く。
 * 使える役割は、root から対象 project までの「# 役割」に並んだもの（子のほうが後）。
 * 記事 7章の役割（読む・探す／調べる／下書き／確かめる／仕分ける／批評する）を雛形として root に用意する。
 * docs/261122/AIハーネス実装計画.md §3.7
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { projectHarnessIds, readProjectSectionText, setProjectHarnessId } from '../../utils/thinkFormat';
import { ensureRootHarness } from './harnessRoot';

export const ROLE_TITLE_PREFIX = '役割 | ';
export const ROLE_FIELD = '役割' as const;

export interface RoleTemplate { name: string; work: string; conditions?: string }

export const ROLE_TEMPLATES: RoleTemplate[] = [
  { name: '読む・探す', work: 'Vault の Think を MCP で探して読み、依頼に関係する箇所を抜き出す。\n返す内容: 見つけたもの（thinkid・タイトル・該当箇所の抜粋）と、探したが見つからなかったもの。' },
  { name: '調べる', work: '公式情報や先行事例を調べる。Web を使えない環境なら、使えなかったと書く。\n返す内容: 分かったこと・出典・確かでないこと。' },
  { name: '下書きする', work: '文書や依頼文の初稿を作る。\n返す内容: 下書きの本文と、前提にしたこと。' },
  { name: '確かめる', work: '成果物を指定の正本と突き合わせる。\n返す内容: 一致・不一致の箇所と根拠（どの正本のどこか）、確かめられなかったこと。' },
  { name: '仕分ける', work: '受信や項目を分類し、要約する。見出しだけで判断せず、本文を読む。\n返す内容: 分類ごとの一覧と、判断に迷ったもの。' },
  { name: '批評する', work: '重要な成果物を、作った担当とは独立に批評する。\n返す内容: 問題点・その重さ・直し方の案。', conditions: '（作者とは別の AI を使うときは「AI: claude」のように書く）' },
];

export type HarnessCliName = 'claude' | 'codex' | 'antigravity';

export interface HarnessRole {
  id: string;
  name: string;
  /** 本文の「# 仕事」 */
  rules: string;
  /** 「# 条件」の「AI: 」 */
  cli?: HarnessCliName;
  /** 「# 条件」の「モデル: 」 */
  model?: string;
}

/** タイトル「役割 | 名前」の名前。役割の AIWork でなければ null（「｜」や前後の空白の違いも受け付ける） */
export function roleNameOf(title: string): string | null {
  const m = /^役割\s*[|｜]\s*(.+)$/.exec(title.trim());
  return m ? m[1].trim() : null;
}

export function serializeRole(name: string, work: string, conditions = ''): string {
  return [`${ROLE_TITLE_PREFIX}${name}`, '# 仕事', work, '# 条件', ...(conditions ? [conditions] : [])].join('\n');
}

const CLI_ALIASES: Record<string, HarnessCliName> = {
  claude: 'claude',
  codex: 'codex',
  openai: 'codex',
  chatgpt: 'codex',
  antigravity: 'antigravity',
  gemini: 'antigravity',
};

/** 「# 条件」欄の「AI: ...」「モデル: ...」を読む（役割と project で共用） */
export function parseAiConditions(text: string): { cli?: HarnessCliName; model?: string } {
  const rawCli = /^\s*AI\s*[:：]\s*(\S+)\s*$/im.exec(text)?.[1]?.toLowerCase();
  const cli = rawCli ? CLI_ALIASES[rawCli] : undefined;
  const model = /^\s*モデル\s*[:：]\s*(\S+)\s*$/m.exec(text)?.[1];
  return { ...(cli ? { cli } : {}), ...(model ? { model } : {}) };
}

/** 役割の AIWork を読む。役割でなければ null */
export function readRole(think: TTThink): HarnessRole | null {
  const name = think.ContentType === 'aiview' ? roleNameOf(think.Name) : null;
  if (!name) return null;
  return {
    id: think.ID, name,
    rules: readProjectSectionText(think.Content, '仕事'),
    ...parseAiConditions(readProjectSectionText(think.Content, '条件')),
  };
}

/** 渡した project（親→子の順）の「# 役割」に並んだ役割。同じ名前は子のものを使う */
export async function listRoles(vault: TTVault, lineage: TTThink[]): Promise<HarnessRole[]> {
  const byName = new Map<string, HarnessRole>();
  for (const p of lineage) {
    for (const id of projectHarnessIds(p.Content, ROLE_FIELD)) {
      const think = vault.GetThink(id);
      if (!think) continue;
      if (think.IsMetaOnly) await think.LoadContent();
      const role = readRole(think);
      if (role) byName.set(role.name, role);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export function findRole(roles: HarnessRole[], name: string): HarnessRole | null {
  const key = roleNameOf(name) ?? name.trim();
  return roles.find(r => r.name === key) ?? null;
}

/**
 * root の「# 役割」に役割が1つも無ければ、雛形の役割の AIWork を作って並べる。作った数を返す。
 * 1つでもあれば作らない（利用者が消した役割を勝手に作り直さないため）
 */
export async function ensureRoleWorks(vault: TTVault): Promise<number> {
  const { root } = await ensureRootHarness(vault);
  if (projectHarnessIds(root.Content, ROLE_FIELD).some(id => vault.GetThink(id))) return 0;
  const works: TTThink[] = [];
  for (const t of ROLE_TEMPLATES) works.push(await vault.CreateAiViewThink(serializeRole(t.name, t.work, t.conditions)));
  const previous = root.Content;
  root.Content = works.reduce((content, w) => setProjectHarnessId(content, ROLE_FIELD, w.ID), previous);
  try { await root.SaveContent(); }
  catch (error) { root.Content = previous; throw error; }
  vault.NotifyUpdated(false);
  return works.length;
}
