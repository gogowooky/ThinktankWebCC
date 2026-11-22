/**
 * harnessRoles.ts
 * チームの担当（役割）の定義。役割は「繰り返し使う小さな project」として、root の配下に置く。
 * タイトル「役割｜名前」、# 状態「ツール」、# 規約 に担う仕事と返す内容、# 条件 に「AI: claude」「モデル: 名前」を書く。
 * 記事 7章の役割（読む・探す／調べる／下書き／確かめる／仕分ける／批評する）を雛形として用意する。
 * docs/261122/AIハーネス実装計画.md §3.7
 */

import type { TTVault } from '../../models/TTVault';
import type { TTThink } from '../../models/TTThink';
import { PROJECT_RULES_HEADING, readProjectSectionText, readProjectStatus } from '../../utils/thinkFormat';
import { ensureRootHarness } from './harnessRoot';

export const ROLE_TITLE_PREFIX = '役割｜';

export interface RoleTemplate { name: string; rules: string; conditions?: string }

export const ROLE_TEMPLATES: RoleTemplate[] = [
  { name: '読む・探す', rules: 'Vault の Think を MCP で探して読み、依頼に関係する箇所を抜き出す。\n返す内容: 見つけたもの（thinkid・タイトル・該当箇所の抜粋）と、探したが見つからなかったもの。' },
  { name: '調べる', rules: '公式情報や先行事例を調べる。Web を使えない環境なら、使えなかったと書く。\n返す内容: 分かったこと・出典・確かでないこと。' },
  { name: '下書きする', rules: '文書や依頼文の初稿を作る。\n返す内容: 下書きの本文と、前提にしたこと。' },
  { name: '確かめる', rules: '成果物を指定の正本と突き合わせる。\n返す内容: 一致・不一致の箇所と根拠（どの正本のどこか）、確かめられなかったこと。' },
  { name: '仕分ける', rules: '受信や項目を分類し、要約する。見出しだけで判断せず、本文を読む。\n返す内容: 分類ごとの一覧と、判断に迷ったもの。' },
  { name: '批評する', rules: '重要な成果物を、作った担当とは独立に批評する。\n返す内容: 問題点・その重さ・直し方の案。', conditions: '（作者とは別の AI を使うときは「AI: claude」のように書く）' },
];

export interface HarnessRole {
  id: string;
  name: string;
  rules: string;
  /** # 条件 の「AI: 」 */
  cli?: 'claude' | 'codex' | 'antigravity';
  /** # 条件 の「モデル: 」 */
  model?: string;
}

function roleName(think: TTThink): string | null {
  return think.Name.startsWith(ROLE_TITLE_PREFIX) ? think.Name.slice(ROLE_TITLE_PREFIX.length).trim() : null;
}

function parseConditions(text: string): Pick<HarnessRole, 'cli' | 'model'> {
  const cli = /^\s*AI\s*[:：]\s*(claude|codex|antigravity)\s*$/im.exec(text)?.[1] as HarnessRole['cli'] | undefined;
  const model = /^\s*モデル\s*[:：]\s*(\S+)\s*$/m.exec(text)?.[1];
  return { ...(cli ? { cli } : {}), ...(model ? { model } : {}) };
}

/** 役割の project（タイトル「役割｜…」で状態「ツール」）。本文を読み込んで返す */
export async function listRoles(vault: TTVault): Promise<HarnessRole[]> {
  const roles: HarnessRole[] = [];
  for (const p of vault.GetProjects()) {
    const name = roleName(p);
    if (!name) continue;
    if (p.IsMetaOnly) await p.LoadContent();
    if (p.IsMetaOnly || readProjectStatus(p.Content).state !== 'ツール') continue;
    roles.push({
      id: p.ID, name,
      rules: readProjectSectionText(p.Content, PROJECT_RULES_HEADING),
      ...parseConditions(readProjectSectionText(p.Content, '条件')),
    });
  }
  return roles.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export function findRole(roles: HarnessRole[], name: string): HarnessRole | null {
  const key = name.replace(/^役割｜/, '').trim();
  return roles.find(r => r.name === key) ?? null;
}

/**
 * 役割が1つも無ければ、雛形の役割を root の配下に作る。作った数を返す。
 * 1つでもあれば作らない（利用者が消した役割を勝手に作り直さないため）
 */
export async function ensureRoleProjects(vault: TTVault): Promise<number> {
  if (vault.GetProjects().some(p => roleName(p) !== null)) return 0;
  const missing = ROLE_TEMPLATES;
  const { root } = await ensureRootHarness(vault);
  for (const t of missing) {
    const project = await vault.CreateProject(`${ROLE_TITLE_PREFIX}${t.name}`, root.ID);
    project.Content = project.Content
      .replace('# 状態\n未着手', '# 状態\nツール')
      .replace('# 条件', `# ${PROJECT_RULES_HEADING}\n${t.rules}\n# 条件${t.conditions ? `\n${t.conditions}` : ''}`);
    await project.SaveContent();
  }
  vault.NotifyUpdated(false);
  return missing.length;
}
