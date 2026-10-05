import { expect, it } from 'vitest';
import { readTaskRelation } from './taskRelation';

it('reads an existing Workout subtask without changing the saved metadata', () => {
  const saved = { schemaVersion: 1, parentId: 'parent', chatId: 'chat', turnId: 'turn', panel: 'Workout' };
  expect(readTaskRelation(saved)?.panel).toBe('Discuss');
  expect(saved.panel).toBe('Workout');
});

it('reads an existing Develop subtask under Discuss', () => {
  const saved = { schemaVersion: 1, parentId: 'parent', chatId: 'chat', turnId: 'turn', panel: 'Develop' };
  expect(readTaskRelation(saved)?.panel).toBe('Discuss');
  expect(saved.panel).toBe('Develop');
});
