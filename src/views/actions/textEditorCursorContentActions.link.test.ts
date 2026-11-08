// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { registerTextEditorCursorContentActions } from './textEditorCursorContentActions';

const menuMocks = vi.hoisted(() => ({ showDefaultMenu: vi.fn() }));
vi.mock('../../utils/defaultMenu', () => ({ showDefaultMenu: menuMocks.showDefaultMenu }));

const LINK_ID = '2026-10-30-120000';

interface FakeThink { ID: string; ContentType: string; Content: string; IsMetaOnly: boolean; LoadContent: () => Promise<void> }

function fakeThink(contentType: string, content: string, isMetaOnly = false): FakeThink {
  const think: FakeThink = {
    ID: LINK_ID, ContentType: contentType, Content: isMetaOnly ? content.split('\n')[0] : content, IsMetaOnly: isMetaOnly,
    LoadContent: vi.fn(async () => { think.Content = content; think.IsMetaOnly = false; }),
  };
  return think;
}

function setup(line: string, column: number, think: FakeThink | undefined) {
  const executeEdits = vi.fn();
  const editor = {
    getPosition: () => ({ lineNumber: 1, column }),
    getModel: () => ({ getLineContent: () => line }),
    getSelection: () => ({ startLineNumber: 1, startColumn: column, endLineNumber: 1, endColumn: column }),
    executeEdits,
    focus: vi.fn(),
  };
  TTShortcutManager.instance.setActiveEditor(editor);
  const openThink = vi.fn(() => undefined);
  const createLinksThink = vi.fn(async (source: { target: string; title: string }) => ({
    think: { ID: '2026-10-30-130000', IsMetaOnly: false, Content: `${source.title}\n=\n# Caption\n${source.title}\n# Link\n${source.target}\n# Affiliation\n# Abstract` },
    created: true,
  }));
  const app = {
    Models: { Vault: { GetThink: (id: string) => (id === LINK_ID ? think : undefined), GetOrCreateLinksThink: createLinksThink } },
    WorkingPanel: { Areas: [], FocusedAreaId: '', DroppedFileID: '' },
    OpenThinkInWorking: openThink,
  } as unknown as TTApplication;
  registerTextEditorCursorContentActions(app);
  return { editor, executeEdits, openThink, createLinksThink };
}

async function run(actionId: string): Promise<string> {
  const res = await TTActions.Execute(actionId);
  return res.Result;
}

const NEW_FORMAT = ['資料', '=', '# Link', 'https://drive.google.com/file/d/abc/view', '# Affiliation', 'drive.google.com', '# Abstract', ''].join('\n');

let windowOpen: ReturnType<typeof vi.fn>;
beforeEach(() => {
  windowOpen = vi.fn();
  vi.stubGlobal('open', windowOpen);
  menuMocks.showDefaultMenu.mockReset();
  menuMocks.showDefaultMenu.mockResolvedValue(null);
});
afterEach(() => {
  TTShortcutManager.instance.setActiveEditor(null);
  TTShortcutManager.instance.setPendingTextEditorDrop(null);
  vi.unstubAllGlobals();
});

describe('Linkタグ（[gdrive:ID] 等）', () => {
  it('DoOnCursorPos でリンク先のURLを開く（本文未読込なら読んでから）', async () => {
    const think = fakeThink('links', NEW_FORMAT, true);
    setup(`参照 [GDrive:${LINK_ID}] を見る`, 8, think);
    expect(await run('TextEditor.CurrentEditor.DoOnCursorPos')).toBe('URL [https://drive.google.com/file/d/abc/view] を開きました');
    expect(think.LoadContent).toHaveBeenCalled();
    expect(windowOpen).toHaveBeenCalledWith('https://drive.google.com/file/d/abc/view', '_blank');
  });

  it('旧書式の linkファイルも先頭のリンクを開く', async () => {
    setup(`[link:${LINK_ID}]`, 2, fakeThink('links', '旧リンク集\n* [A](https://a.example/)\n* [B](https://b.example/)'));
    await run('TextEditor.CurrentEditor.DoOnCursorPos:Link:Open');
    expect(windowOpen).toHaveBeenCalledWith('https://a.example/', '_blank');
  });

  it('パスはブラウザ版では開かず、PC版のみと伝える', async () => {
    setup(`[path:${LINK_ID}]`, 2, fakeThink('links', 'b.md\n=\n# Link\nC:\\a\\b.md\n# Affiliation\nPC:C:\n# Abstract'));
    expect(await run('TextEditor.CurrentEditor.DoOnCursorPos:Link:Open')).toContain('PC版');
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('http(s) 以外のリンク先は window.open に渡さない', async () => {
    setup(`[link:${LINK_ID}]`, 2, fakeThink('links', 'x\n=\n# Link\njavascript:alert(1)\n# Abstract'));
    expect(await run('TextEditor.CurrentEditor.DoOnCursorPos:Link:Open')).toContain('開けない形式');
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('linkファイルが無いときは理由を返す', async () => {
    setup(`[gmail:${LINK_ID}]`, 2, undefined);
    expect(await run('TextEditor.CurrentEditor.DoOnCursorPos:Link:Open')).toBe(`linkファイル [${LINK_ID}] が見つかりません`);
  });

  it('LinkFile:Open は linkファイル自体をWorkingで開く', async () => {
    const { openThink } = setup(`[gnb:${LINK_ID}]`, 2, fakeThink('links', NEW_FORMAT));
    await run('TextEditor.CurrentEditor.DoOnCursorPos:LinkFile:Open');
    expect(openThink).toHaveBeenCalledWith(LINK_ID);
  });
});

describe('ThinkファイルのInsertドロップ', () => {
  it('linkファイルはリンク先に応じたLinkタグで挿入する', async () => {
    const { executeEdits } = setup('', 1, fakeThink('links', NEW_FORMAT, true));
    TTShortcutManager.instance.setPendingThinkDrop({ thinkId: LINK_ID, kind: 'insert' });
    await run('WorkingPanel.DroppedFile.ID:Insert');
    expect(executeEdits.mock.calls[0][1][0].text).toBe(`[gdrive:${LINK_ID}] 資料`);
  });

  it('Caption 項があればそれをタグの後ろに添える', async () => {
    const content = NEW_FORMAT.replace('=\n', '=\n# Caption\n見積書.pdf\n');
    const { executeEdits } = setup('', 1, fakeThink('links', content));
    TTShortcutManager.instance.setPendingThinkDrop({ thinkId: LINK_ID, kind: 'insert' });
    await run('WorkingPanel.DroppedFile.ID:Insert');
    expect(executeEdits.mock.calls[0][1][0].text).toBe(`[gdrive:${LINK_ID}] 見積書.pdf`);
  });

  it('linkファイル以外は従来どおり [memo:ID]', async () => {
    const { executeEdits } = setup('', 1, fakeThink('memo', 'メモ\n本文'));
    TTShortcutManager.instance.setPendingThinkDrop({ thinkId: LINK_ID, kind: 'insert' });
    await run('WorkingPanel.DroppedFile.ID:Insert');
    expect(executeEdits.mock.calls[0][1][0].text).toBe(`[memo:${LINK_ID}]`);
  });
});

describe('URL / パスのDDInsert', () => {
  const range = { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 3 };

  it('Linkはパスを引用符で囲んでドロップ位置へ挿入する', async () => {
    const { editor, executeEdits, createLinksThink } = setup('', 1, undefined);
    TTShortcutManager.instance.setPendingTextEditorDrop({ target: 'C:\\docs\\plan.md', title: 'plan', kind: 'path', editor, range });
    expect(await run('TextEditor.CurrentEditor.DDInsert:Link')).toBe('Insert: "C:\\docs\\plan.md"');
    expect(executeEdits.mock.calls[0][1][0]).toMatchObject({ range, text: '"C:\\docs\\plan.md"' });
    expect(createLinksThink).not.toHaveBeenCalled();
  });

  it('Tagはlinkファイルを作り、リンク先に応じた参照タグを挿入する', async () => {
    const { editor, executeEdits, createLinksThink } = setup('', 1, undefined);
    const target = 'https://mail.google.com/mail/u/0/#inbox';
    TTShortcutManager.instance.setPendingTextEditorDrop({ target, title: 'Gmail', pageTitle: '件名', kind: 'url', editor, range });
    expect(await run('TextEditor.CurrentEditor.DDInsert:Tag')).toBe('Insert: [gmail:2026-10-30-130000] Gmail');
    expect(createLinksThink).toHaveBeenCalledWith({ target, title: 'Gmail', pageTitle: '件名' }, '');
    expect(executeEdits.mock.calls[0][1][0]).toMatchObject({ range, text: '[gmail:2026-10-30-130000] Gmail' });
  });

  it('ドロップ情報が無い場合は何も作成・挿入しない', async () => {
    const { executeEdits, createLinksThink } = setup('', 1, undefined);
    expect(await run('TextEditor.CurrentEditor.DDInsert:Tag')).toBe('[ドロップ情報なし]');
    expect(createLinksThink).not.toHaveBeenCalled();
    expect(executeEdits).not.toHaveBeenCalled();
  });

  it('Menuは統一LINK.D&Dメニューを表示し、選択したActionへ同じドロップ情報を渡す', async () => {
    const { editor, executeEdits } = setup('', 1, undefined);
    const target = 'https://example.com/page';
    menuMocks.showDefaultMenu.mockResolvedValue('TextEditor.CurrentEditor.DDInsert:Link');
    TTShortcutManager.instance.setPendingTextEditorDrop({ target, title: 'Example', kind: 'url', editor, range });
    expect(await run('TextEditor.CurrentEditor.DDInsert:Menu')).toBe(`Insert: ${target}`);
    expect(menuMocks.showDefaultMenu).toHaveBeenCalledWith('LINK.D&D', null, `LINK.D&D: ${target}`);
    expect(executeEdits.mock.calls[0][1][0]).toMatchObject({ range, text: target });
  });
});

describe('URL/パス ⇔ Linkタグ', () => {
  const withSetPosition = (editor: object) => Object.assign(editor, { setPosition: vi.fn() });

  it('Url:ToTag はURLを参照タグ（Caption付き）に置き換える', async () => {
    const line = '資料 https://example.com/page を見る';
    const { editor, executeEdits, createLinksThink } = setup(line, 12, undefined);
    withSetPosition(editor);
    expect(await run('TextEditor.CurrentEditor.DoOnCursorPos:Url:ToTag')).toBe('タグ化: [link:2026-10-30-130000] page');
    expect(createLinksThink).toHaveBeenCalledWith({ target: 'https://example.com/page', title: 'page' }, '');
    expect(executeEdits.mock.calls[0][1][0]).toMatchObject({
      range: { startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 28 },
      text: '[link:2026-10-30-130000] page',
    });
  });

  it('File:ToTag は引用符ごとパスを [file:ID] に置き換える', async () => {
    const line = '"C:\\My Docs\\plan.md" 参照';
    const { editor, executeEdits, createLinksThink } = setup(line, 5, undefined);
    withSetPosition(editor);
    expect(await run('TextEditor.CurrentEditor.DoOnCursorPos:File:ToTag')).toBe('タグ化: [file:2026-10-30-130000] plan.md');
    expect(createLinksThink.mock.calls[0][0]).toEqual({ target: 'C:\\My Docs\\plan.md', title: 'plan.md' });
    expect(executeEdits.mock.calls[0][1][0].range).toMatchObject({ startColumn: 1, endColumn: 21 });
  });

  it('URLでない位置では何もしない', async () => {
    const { createLinksThink } = setup('ただの文章', 2, undefined);
    expect(await run('TextEditor.CurrentEditor.DoOnCursorPos:Url:ToTag')).toBe('カーソル位置のテキストがURLではありません');
    expect(await run('TextEditor.CurrentEditor.DoOnCursorPos:File:ToTag')).toBe('カーソル位置のテキストがファイルパスではありません');
    expect(createLinksThink).not.toHaveBeenCalled();
  });

  it('Link:FromTag はタグと直後の Caption をリンク先に置き換える', async () => {
    const content = NEW_FORMAT.replace('=\n', '=\n# Caption\n見積書.pdf\n');
    const line = `前 [gdrive:${LINK_ID}] 見積書.pdf 後`;
    const { editor, executeEdits } = setup(line, 5, fakeThink('links', content));
    withSetPosition(editor);
    expect(await run('TextEditor.CurrentEditor.DoOnCursorPos:Link:FromTag')).toBe('リンク先に置換: https://drive.google.com/file/d/abc/view');
    const edit = executeEdits.mock.calls[0][1][0];
    expect(line.slice(edit.range.startColumn - 1, edit.range.endColumn - 1)).toBe(`[gdrive:${LINK_ID}] 見積書.pdf`);
  });

  it('Link:FromTag はパスを引用符で囲み、Caption が無ければタグだけを置き換える', async () => {
    const line = `[file:${LINK_ID}] メモ`;
    const { editor, executeEdits } = setup(line, 3, fakeThink('links', 'b.md\n=\n# Caption\nFile:b.md\n# Link\n"C:\\a\\b.md"\n# Abstract'));
    withSetPosition(editor);
    await run('TextEditor.CurrentEditor.DoOnCursorPos:Link:FromTag');
    const edit = executeEdits.mock.calls[0][1][0];
    expect(edit.text).toBe('"C:\\a\\b.md"');
    expect(line.slice(edit.range.startColumn - 1, edit.range.endColumn - 1)).toBe(`[file:${LINK_ID}]`);
  });
});

describe('Projectの AIまとめ・AI議論 のタグ', () => {
  it.each(['aiview', 'chat', 'AIView'])('[%s:ID] はそのThinkを開く', async tag => {
    const { openThink } = setup(`[${tag}:${LINK_ID}]`, 2, fakeThink('chat', '議論\n## 質問'));
    await run('TextEditor.CurrentEditor.DoOnCursorPos');
    expect(openThink).toHaveBeenCalledWith(LINK_ID);
  });

  it('IDでない [chat:語] は開かずに従来どおりchat検索へ回す', async () => {
    const { openThink } = setup('[chat:設計]', 2, undefined);
    await run('TextEditor.CurrentEditor.DoOnCursorPos');
    expect(openThink).not.toHaveBeenCalled();
  });
});
