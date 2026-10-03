import { expect, it } from 'vitest';
import { readTaskRelation } from './taskRelation';

it('reads an existing Workout subtask without changing the saved metadata', () => {
  const saved = { schemaVersion: 1, parentId: 'parent', chatId: 'chat', turnId: 'turn', panel: 'Workout' };
  expect(readTaskRelation(saved)?.panel).toBe('Develop');
  expect(saved.panel).toBe('Workout');
});
