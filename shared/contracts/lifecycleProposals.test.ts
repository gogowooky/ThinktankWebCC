import { expect, it } from 'vitest';
import { validatePauseCandidates, validateSubtaskCandidates } from './lifecycleProposals';

const candidate = { id: 'venue', title: '会場予約', goal: '会場を確保する', completionCriteria: '予約確認を受け取る', reason: '先に場所を確定する' };
const pause = { paused: true, userQuote: '保留します', reason: '回答待ち', resumeCondition: '', resumeSummary: '会場の返事を待つ' };
it.each([null, [candidate, candidate], Array(6).fill(candidate), [{ ...candidate, id: '' }], [{ ...candidate, title: '名前\n別の行' }], [{ ...candidate, goal: '' }]])('rejects malformed or duplicated decomposition candidates', value => {
  expect(() => validateSubtaskCandidates(value, 'bundle-only')).toThrow();
});
it.each([null, [pause, pause], [{ ...pause, userQuote: '再開します' }], [{ ...pause, paused: 'true' }]])('rejects unsupported pause candidates and fabricated user quotes', value => {
  expect(() => validatePauseCandidates(value, '保留します', 'bundle-only')).toThrow();
});
it('accepts legacy omission and rejects candidates outside a Bundle', () => {
  expect(() => validateSubtaskCandidates(undefined, 'bundle-only')).not.toThrow();
  expect(() => validatePauseCandidates(undefined, '', 'bundle-only')).not.toThrow();
  expect(() => validateSubtaskCandidates([candidate], 'chat-only')).toThrow();
  expect(() => validatePauseCandidates([pause], '保留します', 'chat-only')).toThrow();
});
