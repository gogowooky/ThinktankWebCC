import { describe, expect, it } from 'vitest';
import { parseManagedChatTitle } from './managedChat';

describe('managed chat titles', () => {
  it('distinguishes recorded state from unspecified and unknown states', () => {
    expect(parseManagedChatTitle('TODO:Overview｜会場予約')?.state).toBe('状態未設定');
    expect(parseManagedChatTitle('TODO:Overview｜[不明]会場予約')?.title).toBe('[不明]会場予約');
    expect(parseManagedChatTitle('PROJ:Workout｜[待機]会場予約')).toEqual({ kind: 'PROJ', panel: 'Workout', state: '待機', title: '会場予約' });
    expect(parseManagedChatTitle('普通のChat')).toBeNull();
    expect(parseManagedChatTitle('TODO:Unknown｜[完了]予約')).toBeNull();
  });
  it.each(['TODO','PROJ','ASK','EVNT','LOOP'])('accepts %s without changing the recorded owner', kind => {
    expect(parseManagedChatTitle(`${kind}:ReThink｜[完了]確認`)?.panel).toBe('ReThink');
  });
});
