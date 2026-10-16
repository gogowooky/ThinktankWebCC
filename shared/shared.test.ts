import { describe, it, expect } from 'vitest';
import {
  parseMdRecord,
  serializeMdRecord,
  parseSupportFile,
  serializeSupportFile,
  toVaultThinkMeta,
  verifyNoConflict,
  nextVersionTimestamp,
  parseDriveConflictFilename,
  searchVaultRecords,
  createIndexShard,
  mergeIndexShards,
  computeListDiff,
  createBodyPack,
  mergeBodyPacks,
  getBuiltinDomainProfile,
  resolveDomainProfile,
  createEmptyOperationsState,
  addPromotionCandidate,
  approvePromotionCandidate,
  detectRevalidationNeeded,
  resolveRevalidation,
  updateGateStatus,
  buildConversationPrompt,
  validateAiCliResponse,
  splitIntoChunks,
  reassembleChunks,
  encryptRelayPayload,
  decryptRelayPayload,
} from './index';

describe('shared/vaultFormat', () => {
  it('preserves body byte-for-byte including CRLF/LF mix and YAML-like blocks without corruption', () => {
    const bodyWithMixedNewlines =
      '1行目 CRLF\r\n2行目 LF\n---\ntitle: 偽のfrontmatter\n---\n末尾の空行\r\n\r\n';
    const md = serializeMdRecord({
      thinkid: 'memo_20261016_01',
      category: 'memo',
      title: 'テストメモ #タグ',
      keywords: '再生医療, 治験',
      relatedIds: 'bundle_01',
      createdAt: '2026-10-16T00:00:00.000Z',
      updatedAt: '2026-10-16T01:00:00.000Z',
      body: bodyWithMixedNewlines,
    });

    const parsed = parseMdRecord(md, 'memo_20261016_01');
    expect(parsed.thinkid).toBe('memo_20261016_01');
    expect(parsed.category).toBe('memo');
    expect(parsed.title).toBe('テストメモ #タグ');
    expect(parsed.keywords).toBe('再生医療, 治験');
    expect(parsed.relatedIds).toBe('bundle_01');
    // 1バイトも変わらず完全一致すること
    expect(parsed.body).toBe(bodyWithMixedNewlines);
  });

  it('extracts legacy embedded metadata from old frontmatter and separates into support json', () => {
    const legacyMd = [
      '---',
      'id: bundle_old_1',
      'contentType: bundle',
      'title: 旧形式バンドル',
      'createdAt: "2026-01-01T00:00:00.000Z"',
      'updatedAt: "2026-01-02T00:00:00.000Z"',
      'summary: "旧形式ではfrontmatterにsummaryが入っていた"',
      'currentPhase: "計画中"',
      '---',
      '本文テキスト',
    ].join('\n');

    const parsed = parseMdRecord(legacyMd, 'bundle_old_1');
    expect(parsed.thinkid).toBe('bundle_old_1');
    expect(parsed.category).toBe('bundle');
    expect(parsed.body).toBe('本文テキスト');
    expect(parsed.legacyEmbeddedMetadata).toEqual({
      summary: '旧形式ではfrontmatterにsummaryが入っていた',
      currentPhase: '計画中',
    });

    const supportRaw = serializeSupportFile({
      thinkid: parsed.thinkid,
      updatedAt: parsed.updatedAt,
      metadata: parsed.legacyEmbeddedMetadata,
    });
    const support = parseSupportFile(supportRaw, 'bundle_old_1');
    expect(support.metadata.summary).toBe('旧形式ではfrontmatterにsummaryが入っていた');

    const meta = toVaultThinkMeta(parsed, support);
    expect(meta.metadata?.currentPhase).toBe('計画中');
  });
});

describe('shared/conflict', () => {
  it('detects optimistic lock conflicts and generates monotonic version timestamps', () => {
    expect(
      verifyNoConflict(
        { exists: true, updatedAt: '2026-10-16T00:00:00.000Z' },
        '2026-10-16T00:00:00.000Z',
      ).ok,
    ).toBe(true);
    const conflict = verifyNoConflict(
      { exists: true, updatedAt: '2026-10-16T00:05:00.000Z' },
      '2026-10-16T00:00:00.000Z',
    );
    expect(conflict.ok).toBe(false);

    const nextTs = nextVersionTimestamp('2099-01-01T00:00:00.000Z', 1700000000000);
    expect(Date.parse(nextTs)).toBeGreaterThan(Date.parse('2099-01-01T00:00:00.000Z'));
  });

  it('detects Google Drive for desktop conflict filenames', () => {
    expect(parseDriveConflictFilename('memo_123 (1).md')).toEqual({
      filename: 'memo_123 (1).md',
      baseThinkId: 'memo_123',
      copyTag: '1',
      kind: 'md',
    });
    expect(parseDriveConflictFilename('memo_123.support (2).json')).toEqual({
      filename: 'memo_123.support (2).json',
      baseThinkId: 'memo_123',
      copyTag: '2',
      kind: 'support',
    });
    expect(parseDriveConflictFilename('memo_123.md')).toBeNull();
  });
});

describe('shared/searchIndex', () => {
  it('searches body and title while excluding YAML frontmatter noise', () => {
    const meta1 = {
      thinkid: 'doc_1',
      category: 'memo',
      title: '網膜シートCMC規格',
      keywords: 'CMC, 品質',
      relatedIds: '',
      sizeBytes: 100,
      isDeleted: false,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-10T00:00:00Z',
    };
    const meta2 = {
      thinkid: 'doc_2',
      category: 'bundle',
      title: 'PMDA相談準備',
      keywords: '薬事',
      relatedIds: 'doc_1',
      sizeBytes: 120,
      isDeleted: false,
      createdAt: '2026-10-02T00:00:00Z',
      updatedAt: '2026-10-12T00:00:00Z',
    };
    const docs = [
      { meta: meta1, body: '生細胞率80%以上を出荷規格とする。' },
      { meta: meta2, body: '治験届提出前の対面助言アジェンダ。' },
    ];

    const hits1 = searchVaultRecords(docs, '出荷規格');
    expect(hits1).toHaveLength(1);
    expect(hits1[0].thinkid).toBe('doc_1');

    const hits2 = searchVaultRecords(docs, 'category:bundle 対面助言');
    expect(hits2).toHaveLength(1);
    expect(hits2[0].thinkid).toBe('doc_2');

    // シャード索引の合成と差分検知
    const shardA = createIndexShard('pc-a', [meta1]);
    const shardB = createIndexShard('pc-b', [
      { ...meta1, updatedAt: '2026-10-15T00:00:00Z', title: '網膜シートCMC規格（改訂）' },
      meta2,
    ]);
    const merged = mergeIndexShards([shardA, shardB]);
    expect(merged).toHaveLength(2);
    expect(merged.find((m) => m.thinkid === 'doc_1')?.title).toBe('網膜シートCMC規格（改訂）');

    const diff = computeListDiff(merged, {}, '2026-10-11T00:00:00Z');
    expect(diff.updated.map((u) => u.thinkid)).toEqual(['doc_1', 'doc_2']);

    // オフライン高速全文検索用の本文パック合成検証
    const packA = createBodyPack('pc-a', [{ meta: meta1, body: '旧本文' }]);
    const packB = createBodyPack('pc-b', [
      {
        meta: { ...meta1, updatedAt: '2026-10-15T00:00:00Z' },
        body: '生細胞率85%以上（改訂後）を出荷規格とする。',
      },
      { meta: meta2, body: '治験届提出前の対面助言アジェンダ。' },
    ]);
    const mergedBodies = mergeBodyPacks([packA, packB]);
    expect(mergedBodies.doc_1).toBe('生細胞率85%以上（改訂後）を出荷規格とする。');
    expect(mergedBodies.doc_2).toBe('治験届提出前の対面助言アジェンダ。');
  });
});

describe('shared/domainProfile & shared/operations', () => {
  it('switches between clinical-trial and elderly-support profiles and enforces Promotion & Gate rules', () => {
    const clinical = getBuiltinDomainProfile('clinical-trial');
    const elderly = getBuiltinDomainProfile('elderly-support');
    expect(clinical.terminology.gateSectionTitle).toContain('Gate');
    expect(elderly.terminology.gateSectionTitle).toContain('安心確認');

    const custom = resolveDomainProfile(
      { id: 'elderly-support', name: 'カスタム高齢者支援' },
      'elderly-support',
    );
    expect(custom.name).toBe('カスタム高齢者支援');
    expect(custom.id).toBe('elderly-support');

    // Operations: 昇格候補追加 -> Decision承認ガード検証 -> 改訂(Supersede) -> 引用元更新による再検証検知
    let state = createEmptyOperationsState(clinical);
    expect(state.gates.length).toBeGreaterThan(0);

    state = addPromotionCandidate(state, {
      id: 'cand_1',
      bundleId: 'bundle_main',
      type: 'decision',
      title: '免疫抑制剤レジメンの決定',
      summary: 'タクロリムス局所＋短期全身投与を採用',
      citations: [
        {
          sourceThinkid: 'memo_immuno_01',
          sourceTitle: '免疫抑制検討メモ',
          sourceVersionToken: 'v1_hash',
        },
      ],
      createdBy: 'ai',
    });

    // Decision なのに決定者または理由が空の場合は拒否されること
    const failRes = approvePromotionCandidate(state, {
      candidateId: 'cand_1',
      approvedBy: '山田',
      ownerOrDecisionMaker: '',
      rationale: '',
    });
    expect(failRes.ok).toBe(false);

    // 決定者と理由を明記して承認
    const okRes = approvePromotionCandidate(state, {
      candidateId: 'cand_1',
      approvedBy: '山田',
      ownerOrDecisionMaker: '臨床開発責任者 佐藤',
      rationale: '非臨床カニクイザル試験での生着率データに基づく',
    });
    expect(okRes.ok).toBe(true);
    state = okRes.state;
    const recV1 = okRes.record!;
    expect(recV1.version).toBe(1);
    expect(recV1.status).toBe('active');

    // 引用元メモ memo_immuno_01 が v2_hash に更新された場合、needs_revalidation になること
    const revalCheck = detectRevalidationNeeded(
      state,
      new Map([['memo_immuno_01', 'v2_hash']]),
    );
    expect(revalCheck.affectedRecordIds).toEqual([recV1.id]);
    state = revalCheck.state;

    // needs_revalidation のレコードが紐づいている Gate は passed にできないこと
    const gateFail = updateGateStatus(state, {
      gateId: state.gates[0].gateId,
      bundleId: 'bundle_main',
      status: 'passed',
      reviewer: '山田',
      linkedRecordIds: [recV1.id],
    });
    expect(gateFail.ok).toBe(false);

    // 再確認完了後は Gate 通過できること
    state = resolveRevalidation(state, recV1.id, '山田', new Map([['memo_immuno_01', 'v2_hash']]));
    const gateOk = updateGateStatus(state, {
      gateId: state.gates[0].gateId,
      bundleId: 'bundle_main',
      status: 'passed',
      reviewer: '山田',
      linkedRecordIds: [recV1.id],
    });
    expect(gateOk.ok).toBe(true);
  });
});

describe('shared/promptBuilder & shared/responseValidator', () => {
  it('builds self-contained prompt from domain profile and validates JSON CLI output', () => {
    const profile = getBuiltinDomainProfile('clinical-trial');
    const prompt = buildConversationPrompt({
      profile,
      panelRole: 'Discuss',
      agentId: 'cmc-gctp',
      bundleId: 'b_01',
      bundleTitle: '網膜シート治験準備',
      userMessage: '出荷規格のリスクを整理してください',
    });
    expect(prompt).toContain('CMC／GCTP Agent');
    expect(prompt).toContain('出荷規格のリスクを整理してください');

    const rawCliOut = `以下が分析結果です。\n\`\`\`json\n${JSON.stringify({
      reply: '出荷規格における生細胞率のばらつきが主要リスクです。',
      insufficientEvidence: false,
      citations: [{ sourceThinkid: 'memo_1', sourceTitle: 'CMCメモ', snippet: 'p.3' }],
      promotionCandidates: [
        {
          type: 'risk',
          title: '生細胞率ばらつきリスク',
          summary: '輸送温度逸脱時の生細胞率低下',
          rationale: '夏場輸送試験データ未取得',
        },
      ],
    })}\n\`\`\``;

    const validated = validateAiCliResponse(rawCliOut);
    expect(validated.parsedAsJson).toBe(true);
    expect(validated.reply).toContain('生細胞率');
    expect(validated.citations).toHaveLength(1);
    expect(validated.promotionCandidates).toHaveLength(1);
    expect(validated.promotionCandidates[0].type).toBe('risk');
  });
});

describe('shared/relayProtocol & shared/relayCrypto', () => {
  it('encrypts, chunks, reassembles, and decrypts relay payloads via AES-256-GCM', async () => {
    const secret = 'test-pairing-secret-2026';
    const original = {
      requestId: 'req_01',
      kind: 'ai.conversation' as const,
      bundleId: 'bundle_01',
      largeText: 'あいうえお'.repeat(500),
    };

    const encrypted = await encryptRelayPayload(original, secret);
    expect(encrypted).not.toContain('あいうえお');

    const chunks = splitIntoChunks(encrypted, 'request', 200);
    expect(chunks.length).toBeGreaterThan(1);

    const reassembled = reassembleChunks(chunks);
    const decrypted = await decryptRelayPayload<typeof original>(reassembled, secret);
    expect(decrypted).toEqual(original);
  });
});
