import { describe, expect, it } from 'vitest';
import { actionDescriptionFromDoc, parseActionDescriptions } from './actionDescriptions';
import { TTActions } from './TTActions';

describe('Action descriptions from Thinktank_Status-Action-Binding.md', () => {
  it('takes the ActionID from the heading and the first description line of each Action section', () => {
    const map = parseActionDescriptions([
      '## Action：　261014　A.B:C',
      'description:    説明1',
      'description:    後の行は使わない',
      '## Action 実装：　D.E:F',
      '　説明行が無い節',
      '## Status：　261014　S.T',
      'description:    Status の説明は対象外',
      '# 区切り',
      'description:    見出しの外も対象外',
    ].join('\r\n'));
    expect([...map]).toEqual([['A.B:C', '説明1']]);
  });

  it('prefers the document description over the one given in code', () => {
    const doc = actionDescriptionFromDoc('ToolBar.SearchMode.Text:Search');
    expect(doc).toBeTruthy();
    TTActions.Register({ ActionID: 'ToolBar.SearchMode.Text:Search', Description: 'コード側の説明', Completion: () => {} });
    expect(TTActions.Get('ToolBar.SearchMode.Text:Search')?.Description).toBe(doc);

    TTActions.Register({ ActionID: 'Test.NotInDoc:Run', Description: 'コード側の説明', Completion: () => {} });
    expect(TTActions.Get('Test.NotInDoc:Run')?.Description).toBe('コード側の説明');
  });

  it('DDInsertの完了節から説明を読み込む', () => {
    expect(actionDescriptionFromDoc('TextEditor.CurrentEditor.DDInsert:Menu')).toBe('D&Dされた外部URLまたはパスの挿入方法をメニューから選ぶ');
    expect(actionDescriptionFromDoc('TextEditor.CurrentEditor.DDInsert:Link')).toBe('D&DされたURLまたはパスをそのままテキストとして挿入する');
    expect(actionDescriptionFromDoc('TextEditor.CurrentEditor.DDInsert:Tag')).toBe('D&DされたURLまたはパスのlinkファイルを作成し、参照タグを挿入する');
  });
});
