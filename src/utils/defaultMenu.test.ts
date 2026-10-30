import { describe, expect, it } from 'vitest';
import content from '../../docs/DefaultMenu.md?raw';
import { buildDefaultMenuNodes, parseDefaultMenu } from './defaultMenu';
import type { MenuNode } from './monacoMenu';

const leaves = (nodes: MenuNode[]): MenuNode[] => nodes.flatMap(n => n.children ? leaves(n.children) : [n]);

describe('DefaultMenu.md menus', () => {
  it('reads every row of the real file, including full-width padding, and skips comments', () => {
    const rows = parseDefaultMenu(content);
    expect(rows.length).toBe(content.split(/\r\n|\n/).filter(l => l.trim().startsWith('"')).length);
    expect(rows.find(r => r.id === 'GoogleRoute')?.tree).toEqual(['タグ挿入', 'G)場所', 'R)Googleルート']);
    expect(rows.find(r => r.id === 'Yahoo')?.tree).toEqual(['タグ挿入', 'Q)検索', 'Y)Yahoo!検索']);
  });

  it('builds the menu from the rows starting with the menu name, without that name, with the ID as tooltip', () => {
    const nodes = buildDefaultMenuNodes(parseDefaultMenu(content), 'タグ挿入');
    expect(nodes.map(n => n.label)).toContain('検索');
    const search = nodes.find(n => n.label === '検索')!;
    expect(search.key).toBe('Q');
    const google = search.children!.find(n => n.value === 'Google')!;
    expect(google).toMatchObject({ key: 'J', label: 'Google検索J', tip: 'Google' });
    expect(leaves(nodes).every(n => n.tip === n.value)).toBe(true);
  });

  it('LINK.D&Dメニューから2つのDDInsert Actionを選べる', () => {
    const rows = parseDefaultMenu(content);
    expect(leaves(buildDefaultMenuNodes(rows, 'LINK.D&D')).map(n => n.value)).toEqual([
      'TextEditor.CurrentEditor.DDInsert:Link',
      'TextEditor.CurrentEditor.DDInsert:Tag',
    ]);
  });

  it('returns nothing for a menu name that is not defined', () => {
    expect(buildDefaultMenuNodes(parseDefaultMenu('"A > X)x", X1\n"B > Y)y", Y1'), 'C')).toEqual([]);
    expect(buildDefaultMenuNodes(parseDefaultMenu('"A > X)x", X1\n"AB > Y)y", Y1'), 'A').map(n => n.value)).toEqual(['X1']);
  });
});
