/**
 * shared/promptBuilder.ts
 * DomainProfile と Bundle コンテキストから、AI CLI（claude / codex / antigravity）へ渡す
 * 自己完結型プロンプトを生成する純粋関数群。
 * プロファイル（.thinktank/prompts/<profile>/）を差し替えるだけで、
 * 業務管理用と高齢者思考支援・生活支援用の振る舞いを完全に切り替える。
 */

import type { DomainProfile, PanelId, PanelRoleKey } from './domainProfile';
import type { PromotedRecord, GateRecord } from './operations';

export interface PromptDocumentContext {
  thinkid: string;
  title: string;
  category?: string;
  updatedAt?: string;
  excerpt: string;
}

export interface PromptSubtaskContext {
  id: string;
  title: string;
  status: string;
  assignee?: string;
}

export interface PromptPausePointContext {
  id: string;
  reason: string;
  resumeCondition: string;
  status: string;
}

export interface PromptChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
}

export interface BuildConversationPromptParams {
  profile: DomainProfile;
  panelRole?: PanelRoleKey;
  agentId?: string;
  bundleId: string;
  bundleTitle: string;
  bundleSummary?: string;
  currentPhase?: string;
  nextAction?: string;
  subtasks?: PromptSubtaskContext[];
  pausePoints?: PromptPausePointContext[];
  promotedRecords?: PromotedRecord[];
  gates?: GateRecord[];
  relatedDocuments?: PromptDocumentContext[];
  recentMessages?: PromptChatMessage[];
  userMessage: string;
  /** Thinktank MCP サーバーが接続されている場合にツール利用案内を含める（既定: true） */
  mcpEnabled?: boolean;
  /** MCP有効時に関連資料の抜粋を圧縮してオンデマンド取得を促す1件あたり最大文字数（既定: 600） */
  mcpExcerptMaxLength?: number;
}

function normalizePanelId(role?: PanelRoleKey): PanelId {
  if (!role) return 'Discuss';
  const lower = role.toLowerCase();
  if (lower === 'thinktank') return 'Thinktank';
  if (lower === 'seeds') return 'Seeds';
  if (lower === 'harvest') return 'Harvest';
  return 'Discuss';
}

/**
 * AI CLI に渡す会話・思考支援・業務管理プロンプトを組み立てる。
 */
export function buildConversationPrompt(params: BuildConversationPromptParams): string {
  const {
    profile,
    panelRole = 'Discuss',
    agentId,
    bundleId,
    bundleTitle,
    bundleSummary,
    currentPhase,
    nextAction,
    subtasks = [],
    pausePoints = [],
    promotedRecords = [],
    gates = [],
    relatedDocuments = [],
    recentMessages = [],
    userMessage,
    mcpEnabled = true,
    mcpExcerptMaxLength = 600,
  } = params;

  const panelId = normalizePanelId(panelRole);
  const panelConfig = profile.panelRoles[panelId] ?? profile.panelRoles.Discuss;
  const specialistAgent = agentId
    ? profile.agents.find((a) => a.id === agentId)
    : undefined;

  const activeRecords = promotedRecords.filter((r) => r.status !== 'superseded');
  const promotionTypesList = Object.values(profile.promotionKinds)
    .map((t) => `- "${t.kind}" (${t.label}): ${t.description}`)
    .join('\n');

  const lines: string[] = [];

  lines.push('# System Role & Domain Profile');
  lines.push(`Domain Profile: ${profile.name} (${profile.id})`);
  lines.push(`Subtitle: ${profile.subtitle}`);
  lines.push(profile.description);
  lines.push('');
  lines.push('## Common Policy & Guardrails');
  lines.push(profile.commonPolicyPrompt);
  lines.push('');
  lines.push(`## Active Panel Role: ${panelConfig.panelId} - ${panelConfig.perspectiveLabel}`);
  lines.push(`Core Question: ${panelConfig.coreQuestion}`);
  lines.push(panelConfig.rolePrompt);

  if (specialistAgent) {
    lines.push('');
    lines.push(`## Specialist Agent Role: ${specialistAgent.name} (${specialistAgent.id})`);
    lines.push(`Description: ${specialistAgent.description}`);
    lines.push(`Automation Ceiling (Human Boundary): ${specialistAgent.automationCeiling}`);
    lines.push(specialistAgent.systemPrompt);
  }

  lines.push('');
  lines.push('# Target Bundle Context');
  lines.push(`- Bundle ID: ${bundleId}`);
  lines.push(`- Title: ${bundleTitle}`);
  if (currentPhase) lines.push(`- Phase / Status: ${currentPhase}`);
  if (nextAction) lines.push(`- Next Action: ${nextAction}`);
  if (bundleSummary) {
    lines.push(`- Summary:\n${bundleSummary}`);
  }

  if (gates.length > 0) {
    lines.push('');
    lines.push(`## ${profile.terminology.gateSectionTitle}`);
    for (const g of gates) {
      lines.push(
        `- [${g.status.toUpperCase()}] ${g.label} (${g.gateId}): ${g.description}${
          g.blockers.length > 0 ? ` | Blockers: ${g.blockers.join(', ')}` : ''
        }`,
      );
    }
  }

  if (activeRecords.length > 0) {
    lines.push('');
    lines.push(`## ${profile.terminology.promotionSectionTitle}`);
    for (const r of activeRecords.slice(0, 25)) {
      lines.push(
        `- [${r.type.toUpperCase()} v${r.version} | ${r.status}] ${r.title}: ${r.summary} (担当/決定者: ${r.ownerOrDecisionMaker})`,
      );
    }
  }

  if (subtasks.length > 0) {
    lines.push('');
    lines.push(`## ${profile.terminology.taskUnit}`);
    for (const st of subtasks.slice(0, 30)) {
      lines.push(`- [${st.status}] ${st.title} (id: ${st.id})`);
    }
  }

  if (pausePoints.length > 0) {
    lines.push('');
    lines.push('## Pause Points / Open Hold Items');
    for (const pp of pausePoints.slice(0, 15)) {
      lines.push(`- [${pp.status}] 理由: ${pp.reason} / 再開条件: ${pp.resumeCondition}`);
    }
  }

  if (relatedDocuments.length > 0) {
    lines.push('');
    lines.push('## Related Vault Documents (Evidence Sources)');
    const maxExcerptChars = mcpEnabled ? mcpExcerptMaxLength : 2000;
    for (const doc of relatedDocuments.slice(0, 15)) {
      lines.push(`### [thinkid: ${doc.thinkid}] ${doc.title}`);
      if (doc.category) lines.push(`Category: ${doc.category}`);
      if (doc.updatedAt) lines.push(`UpdatedAt: ${doc.updatedAt}`);
      const trimmedExcerpt = doc.excerpt.slice(0, maxExcerptChars);
      lines.push(
        mcpEnabled && doc.excerpt.length > maxExcerptChars
          ? `${trimmedExcerpt}\n...(※全文は MCP ツール thinktank_get_record で thinkid="${doc.thinkid}" を指定して取得できます)`
          : trimmedExcerpt,
      );
      lines.push('');
    }
  }

  if (mcpEnabled) {
    lines.push('');
    lines.push('# Available Thinktank MCP Tools');
    lines.push(
      '本セッションでは Thinktank MCP サーバー（`thinktank`）が接続されています。必要に応じて以下のツールを自律的に呼び出してください：',
    );
    lines.push('- `thinktank_search`: Vault内の関連メモ・課題・過去事例をキーワードやタグで全文検索する');
    lines.push('- `thinktank_list_meta`: Vault全体または特定Projectに紐づくThinkのメタデータ一覧を取得する');
    lines.push('- `thinktank_get_record`: 指定 `thinkid` の全文（body）および思考支援メタデータ（support）を取得する');
    lines.push('- `thinktank_get_project_context`: 指定 `projectId` の目標・Gate状態・昇格済みレコード・関連Thinkを一括取得する');
    lines.push('- `thinktank_create_think`: ユーザーの依頼に基づき新規Think（memo / task / links / table）を作成しProjectに紐づける');
    lines.push('- `thinktank_update_think`: 既存Thinkを更新する（事前に `thinktank_get_record` で取得した `expectedVersion` が必須）');
    lines.push('- `thinktank_add_promotion_candidate`: 重要な決定・根拠・リスク等をProjectの昇格候補（`pending_review`）として登録する');
  }

  if (recentMessages.length > 0) {
    lines.push('');
    lines.push('## Recent Conversation History');
    for (const msg of recentMessages.slice(-10)) {
      lines.push(`[${msg.role.toUpperCase()}]: ${msg.content}`);
    }
  }

  lines.push('');
  lines.push('# User Question / Instruction');
  lines.push(userMessage);

  lines.push('');
  lines.push('# Output Format (Strict JSON)');
  lines.push(
    '以下の JSON スキーマに従い、純粋な JSON オブジェクト（または ```json コードブロック）で応答してください。',
  );
  lines.push(`昇格候補（promotionCandidates）の type には以下が指定可能です:\n${promotionTypesList}`);
  lines.push(`
\`\`\`json
{
  "reply": "ユーザーへの回答テキスト（Markdown可、日本語）",
  "insufficientEvidence": false,
  "citations": [
    {
      "sourceThinkid": "参照したメモのthinkid",
      "sourceTitle": "参照したメモのタイトル",
      "snippet": "根拠となった箇所の抜粋"
    }
  ],
  "proposals": [
    {
      "field": "currentPhase | nextAction | summary",
      "proposedValue": "提案する新しい値",
      "reason": "変更理由"
    }
  ],
  "subtaskCandidates": [
    {
      "title": "新規サブタスク名",
      "reason": "追加理由"
    }
  ],
  "pauseCandidates": [
    {
      "reason": "保留理由",
      "resumeCondition": "再開条件"
    }
  ],
  "promotionCandidates": [
    {
      "type": "decision | evidence | risk | assumption | action | gate_result | learning",
      "title": "昇格候補の簡潔なタイトル",
      "summary": "要旨",
      "rationale": "背景・理由・根拠",
      "impactScope": "影響範囲",
      "proposedOwner": "想定担当者または決定者ロール",
      "citations": [
        { "sourceThinkid": "thinkid", "sourceTitle": "タイトル", "snippet": "抜粋" }
      ]
    }
  ]
}
\`\`\`
`);

  return lines.join('\n');
}
