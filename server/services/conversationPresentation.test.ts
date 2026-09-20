import { expect, it } from 'vitest';
import { conversationPresentation } from './conversationPresentation';
import { mergeConversationTranscript, type ConversationTurn } from './conversationRecord';

function turn(): ConversationTurn {
  return { schemaVersion: 1, id: 'turn', createdAt: '2026-09-20T16:00:00Z', question: '質問',
    provider: 'test', model: 'test',
    context: { schemaVersion: 1, snapshotId: 'snapshot', vaultId: 'vault', bundleId: 'bundle',
      capturedAt: '2026-09-20T16:00:00Z', scope: 'bundle-only', quality: 'complete', manualState: null, issues: [],
      sources: [{ thinkId: 'a', contentType: 'memo', title: '資料A\n続き', content: '正確な引用', contentHash: 'hash' },
        { thinkId: 'b', contentType: 'links', title: '資料B', content: '複数行の\n引用', contentHash: 'hash' }] },
    answer: { reply: '正確な引用を確認しました。', insufficientEvidence: false, proposals: [], citations: [
      { thinkId: 'a', quote: '正確な引用', contentHash: 'hash', start: 0, end: 5 },
      { thinkId: 'b', quote: '複数行の\n引用', contentHash: 'hash', start: 0, end: 7 },
    ] } };
}

it('formats verified Think citations without references or notices and preserves stored records', () => {
  const value = turn(); const before = JSON.stringify(value);
  const formatted = conversationPresentation(value);
  expect(formatted.reply).toBe('正確な引用[Think:a,1]を確認しました。\n「複数行の\n引用」[Think:b,1]');
  expect(formatted.links).toEqual([{ marker: '[Think:a,1]', thinkId: 'a', line: 1 }, { marker: '[Think:b,1]', thinkId: 'b', line: 1 }]);
  expect(JSON.stringify(value)).toBe(before);
  const transcript = mergeConversationTranscript('Chat\n手書きのメモ', [value]);
  expect(transcript).toContain(formatted.reply);
  expect(transcript).not.toContain('引用は回答時点');
  expect(transcript).not.toContain('[:');
  expect(mergeConversationTranscript(transcript, [value])).toBe(transcript);
});

it('replaces repeated internal markers without duplicating quotations', () => {
  const value = turn(); value.answer.reply = '要点[:>1]。補足[:>1]。続き[:>2]。';
  expect(conversationPresentation(value).reply).toBe('要点[Think:a,1]。補足[Think:a,1]。続き[Think:b,1]。');
});

it.each(['\n', '\r\n'])('counts title and preceding lines using the verified offset with %j', newline => {
  const value = turn(); const prefix = `資料タイトル${newline}😀正確な引用${newline}`;
  value.context.sources[0].content = prefix + '正確な引用';
  value.answer.citations[0].start = prefix.length;
  value.answer.reply = '回答[:>1]';
  expect(conversationPresentation(value).reply).toContain('回答[Think:a,3]');
});

it('keeps answers without citations unchanged', () => {
  const value = turn(); value.answer.citations = [];
  expect(conversationPresentation(value)).toEqual({ reply: value.answer.reply, links: [] });
});
