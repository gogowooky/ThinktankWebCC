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
  think('seeds-owned', 'chat', 'TODO:Seeds｜[進行中]B'),
  think('discuss-owned', 'chat', 'ASK:Discuss｜[未着手]C'),
  think('harvest-owned', 'chat', 'PROJ:Harvest｜[待機]D'),
  think('plain-chat', 'chat', '分類なし'),
  originatedThink('originated-chat', 'Seeds'),
  originatedThink('pane-chat', 'Pane'),
  think('memo', 'memo'),
];

it('returns Thinktank-owned and originated unclassified Chats from the whole Vault', () => {
  expect(filterSupportChats(items, 'Thinktank', '', []).map(t => t.ID)).toEqual(['thinktank-owned', 'originated-chat']);
  expect(filterSupportChats(items, 'Thinktank', 'bundle', ['seeds-owned']).map(t => t.ID)).toEqual(['thinktank-owned', 'originated-chat']);
});

it.each([
  ['Seeds', 'seeds-owned'],
  ['Discuss', 'discuss-owned'],
  ['Harvest', 'harvest-owned'],
] as const)('%s returns only its title-assigned Chats from the selected Seeds Bundle', (panel, expected) => {
  expect(filterSupportChats(items, panel, 'bundle', ['thinktank-owned', 'seeds-owned', 'discuss-owned', 'harvest-owned', 'memo']).map(t => t.ID))
    .toEqual([expected]);
});

it.each(['Seeds', 'Discuss', 'Harvest'] as const)('%s returns no Chat without an Seeds Bundle', panel => {
  expect(filterSupportChats(items, panel, '', ['thinktank-owned', 'seeds-owned'])).toEqual([]);
});

it('does not include an unclassified or unrelated Chat from the resolved Bundle IDs', () => {
  expect(filterSupportChats(items, 'Seeds', 'bundle', ['plain-chat', 'thinktank-owned'])).toEqual([]);
  expect(filterSupportChats(items, 'Seeds', 'bundle', []).map(t => t.ID)).toEqual([]);
});

it('keeps Chats with saved old owners in the renamed panel lists', () => {
  const previous = [
    think('old-seeds', 'chat', 'TASK:Overview｜企画'),
    think('old-discuss', 'chat', 'TODO:Workout｜予約'),
    think('old-harvest', 'chat', 'ASK:ReThink｜振り返り'),
  ];
  const ids = previous.map(item => item.ID);
  expect(filterSupportChats(previous, 'Seeds', 'bundle', ids).map(t => t.ID)).toEqual(['old-seeds']);
  expect(filterSupportChats(previous, 'Discuss', 'bundle', ids).map(t => t.ID)).toEqual(['old-discuss']);
  expect(filterSupportChats(previous, 'Harvest', 'bundle', ids).map(t => t.ID)).toEqual(['old-harvest']);
});
