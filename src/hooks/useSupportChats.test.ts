// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { TTThink } from '../models/TTThink';
import { filterSupportChats } from './useSupportChats';

function think(id: string, type: 'chat' | 'memo', name = id) {
  const value = new TTThink(); value.ID = id; value.ContentType = type; value.Name = name; return value;
}
function originatedThink(id: string, origin: string) {
  const value = think(id, 'chat'); value.Metadata.supportOrigin = origin; return value;
}
const items = [
  think('thinktank-owned', 'chat', 'TODO:Thinktank｜[進行中]A'),
  think('overview-owned', 'chat', 'TODO:Overview｜[進行中]B'),
  think('workout-owned', 'chat', 'ASK:Workout｜[未着手]C'),
  think('rethink-owned', 'chat', 'PROJ:ReThink｜[待機]D'),
  think('plain-chat', 'chat', '分類なし'),
  originatedThink('originated-chat', 'Overview'),
  originatedThink('pane-chat', 'Pane'),
  think('memo', 'memo'),
];

it('returns Thinktank-owned and originated unclassified Chats from the whole Vault', () => {
  expect(filterSupportChats(items, 'Thinktank', '', []).map(t => t.ID)).toEqual(['thinktank-owned', 'originated-chat']);
  expect(filterSupportChats(items, 'Thinktank', 'bundle', ['overview-owned']).map(t => t.ID)).toEqual(['thinktank-owned', 'originated-chat']);
});

it.each([
  ['Overview', 'overview-owned'],
  ['Workout', 'workout-owned'],
  ['ReThink', 'rethink-owned'],
] as const)('%s returns only its title-assigned Chats from the selected Overview Bundle', (panel, expected) => {
  expect(filterSupportChats(items, panel, 'bundle', ['thinktank-owned', 'overview-owned', 'workout-owned', 'rethink-owned', 'memo']).map(t => t.ID))
    .toEqual([expected]);
});

it.each(['Overview', 'Workout', 'ReThink'] as const)('%s returns no Chat without an Overview Bundle', panel => {
  expect(filterSupportChats(items, panel, '', ['thinktank-owned', 'overview-owned'])).toEqual([]);
});

it('does not include an unclassified or unrelated Chat from the resolved Bundle IDs', () => {
  expect(filterSupportChats(items, 'Overview', 'bundle', ['plain-chat', 'thinktank-owned'])).toEqual([]);
  expect(filterSupportChats(items, 'Overview', 'bundle', []).map(t => t.ID)).toEqual([]);
});
