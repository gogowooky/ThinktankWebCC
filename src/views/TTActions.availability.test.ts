import { expect, it, vi } from 'vitest';
import { TTActions } from './TTActions';
import { UNAVAILABLE_ACTIONS } from './unavailableActions';

it('keeps unavailable IDs registered but excludes them from executable candidates', async () => {
  for (const action of Object.values(UNAVAILABLE_ACTIONS)) TTActions.Register(action);
  for (const action of Object.values(UNAVAILABLE_ACTIONS)) {
    expect(TTActions.Has(action.ActionID)).toBe(true);
    expect(TTActions.GetRegisteredActions().some(item => item.ActionID === action.ActionID)).toBe(true);
    expect(TTActions.GetAvailableActions().some(item => item.ActionID === action.ActionID)).toBe(false);
    expect(await TTActions.Execute(action.ActionID)).toMatchObject({
      ActionID: action.ActionID, Result: `[未実装] ${action.UnavailableReason}`, Allow: false,
    });
  }
});

it('still executes available sync and async actions and preserves their results', async () => {
  const complete = vi.fn((item: { Result: string }) => { item.Result = 'done'; });
  TTActions.Register({ ActionID: 'Test.Available.Sync', Completion: complete });
  TTActions.Register({ ActionID: 'Test.Available.Async', Completion: async item => { complete(item); } });
  expect(TTActions.GetAvailableActions().some(action => action.ActionID === 'Test.Available.Sync')).toBe(true);
  expect(await TTActions.Execute('Test.Available.Sync')).toMatchObject({ Result: 'done' });
  expect(await TTActions.Execute('Test.Available.Async')).toMatchObject({ Result: 'done' });
  expect(complete).toHaveBeenCalledTimes(2);
});
