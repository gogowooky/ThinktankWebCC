import { expect, it } from 'vitest';
import { readTaskRelation } from './taskRelation';

it('reads an existing Workout subtask without changing the saved metadata', () => {
  const saved = { schemaVersion: 1, parentId: 'parent', chatId: 'chat', turnId: 'turn', panel: 'Workout' };
  expect(readTaskRelation(saved)?.panel).toBe('Working');
  expect(saved.panel).toBe('Workout');
});

it('reads an existing Develop subtask under Working', () => {
  const saved = { schemaVersion: 1, parentId: 'parent', chatId: 'chat', turnId: 'turn', panel: 'Develop' };
  expect(readTaskRelation(saved)?.panel).toBe('Working');
  expect(saved.panel).toBe('Develop');
});

it('reads an existing Discuss subtask under Working', () => {
  const saved = { schemaVersion: 1, parentId: 'parent', chatId: 'chat', turnId: 'turn', panel: 'Discuss' };
  expect(readTaskRelation(saved)?.panel).toBe('Working');
  expect(saved.panel).toBe('Discuss');
});
