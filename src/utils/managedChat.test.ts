import { describe, expect, it } from 'vitest';
import { parseManagedChatTitle } from './managedChat';

describe('managed chat titles', () => {
  it('distinguishes recorded state from unspecified and unknown states', () => {
    expect(parseManagedChatTitle('TODO:Seeds｜会場予約')?.state).toBe('状態未設定');
    expect(parseManagedChatTitle('TODO:Seeds｜[不明]会場予約')?.title).toBe('[不明]会場予約');
    expect(parseManagedChatTitle('PROJ:Develop｜[待機]会場予約')).toEqual({ kind: 'PROJ', panel: 'Develop', state: '待機', title: '会場予約' });
    expect(parseManagedChatTitle('普通のChat')).toBeNull();
    expect(parseManagedChatTitle('TODO:Unknown｜[完了]予約')).toBeNull();
  });
  it.each(['TASK','TODO','PROJ','ASK','EVNT','LOOP'])('accepts %s without changing the recorded owner', kind => {
    expect(parseManagedChatTitle(`${kind}:Harvest｜[完了]確認`)?.panel).toBe('Harvest');
  });
  it('keeps old saved Chat titles visible under the new owner', () => {
    expect(parseManagedChatTitle('TASK:Overview｜[進行中]企画')?.panel).toBe('Seeds');
    expect(parseManagedChatTitle('TODO:Workout｜[待機]予約')?.panel).toBe('Develop');
    expect(parseManagedChatTitle('ASK:ReThink｜振り返り')?.panel).toBe('Harvest');
  });
});
