// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
// 表示部は Monaco を読み込むため、何を開いたかだけ分かる差し替えにする
vi.mock('../WorkingPanel/media/TextEditorMedia', () => ({
  TextEditorMedia: ({ think, rawYaml }: { think: { ID: string } | null; rawYaml?: boolean }) =>
    <div data-testid="texteditor" data-raw-yaml={String(!!rawYaml)}>{think?.ID}</div>,
}));
import { AbstractView } from './AbstractView';
import { ThinktankTabBar } from '../ThinktankPanel/ThinktankTabBar';
import { SeedsTabBar } from '../SeedsPanel/SeedsTabBar';
import { SeedsMenuRibbon } from '../SeedsPanel/SeedsMenuRibbon';
import { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';
import { TTApplication } from '../../views/TTApplication';
import { TTProjectView } from '../../views/TTProjectView';
import { TTThinktankPanel } from '../../views/TTThinktankPanel';
import { TTSeedsPanel } from '../../views/TTSeedsPanel';
import { TTHarvestPanel } from '../../views/TTHarvestPanel';
import { TTWorkingPanel } from '../../views/TTWorkingPanel';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { StorageManager } from '../../services/storage/StorageManager';
import { parseProject, serializeProject } from '../../utils/thinkFormat';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>, vault: TTVault, view: TTProjectView;
const ID = '2026-10-30-000001';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(StorageManager.instance, 'save').mockResolvedValue(undefined as never);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  const app = TTApplication.Instance;
  TTUIStateManager.instance.init(app);
  vault = app.Models.Vault;
  view = app.ThinktankPanel.ProjectView;
  const t = new TTThink(); t.ID = ID; t.ContentType = 'project'; t.Content = '計画A\n='; t.markSaved(); vault.AddItem(t);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); TTApplication.resetInstance(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function show(panelKey: 'thinktank' | 'seeds' = 'thinktank') {
  const app = TTApplication.Instance;
  const pv = panelKey === 'thinktank' ? app.ThinktankPanel.ProjectView : app.SeedsPanel.ProjectView;
  await act(async () => root.render(<AbstractView projectView={pv} vault={vault} workingPanel={app.WorkingPanel} panelKey={panelKey} />));
}

it('リボンは左端に root・新規・クリア、右端に TextEditor の表示形式アイコンだけを置き、一覧は出さない', async () => {
  await show();
  const ribbon = host.querySelector('.abstract-view__ribbon')!;
  expect([...ribbon.children].map(el => el.getAttribute('aria-label') ?? el.getAttribute('data-tip') ?? el.className))
    .toEqual(['root', '新規', 'クリア', 'menu-ribbon__spacer', 'テキストエディタ']);
  expect(host.querySelector<HTMLButtonElement>('[data-tip="クリア"]')?.disabled).toBe(true);
  expect(host.querySelector('.thoughts-list')).toBeNull();
  expect(host.textContent).toContain('ファイルが開かれていません。');
});

it('ロードしたファイルは TextEditor だけで表示する（Markdown 表示は無い）', async () => {
  await show();
  await act(async () => view.Open(ID));
  expect(host.querySelector('[data-testid="texteditor"]')?.textContent).toBe(ID);
  expect(host.querySelector('[data-tip="Markdown"]')).toBeNull();
  expect(host.querySelectorAll('.abstract-view__ribbon .menu-ribbon__btn--active')).toHaveLength(1);
  expect(host.querySelector('.menu-ribbon__btn--active')?.getAttribute('aria-label')).toBe('テキストエディタ');
});

it('TextEditor アイコンは Pane と同じく Shift+クリックで YAML＋本文 表示、クリックで通常表示にし、別ファイルのロードで戻す', async () => {
  const other = new TTThink(); other.ID = '2026-10-30-000002'; other.ContentType = 'project'; other.Content = '計画B\n='; other.markSaved(); vault.AddItem(other);
  await show();
  await act(async () => view.Open(ID));
  const button = () => host.querySelector<HTMLButtonElement>('[aria-label="テキストエディタ"]')!;
  const raw = () => host.querySelector('[data-testid="texteditor"]')?.getAttribute('data-raw-yaml');
  expect(raw()).toBe('false');
  expect(button().getAttribute('data-tip')).toContain('Shift+クリック: YAML込みで表示・保存');

  await act(async () => { button().dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); });
  expect(raw()).toBe('true');
  expect(button().classList.contains('menu-ribbon__btn--raw')).toBe(true);

  await act(async () => { button().click(); });
  expect(raw()).toBe('false');

  await act(async () => { button().dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); });
  await act(async () => view.Open(other.ID));
  expect(raw()).toBe('false');
});

it('新規ボタンで規定フォーマットのprojectファイルを作成・表示し、Project.IDとパネルバーラベルを設定し、クリアは各パネルだけを解除する', async () => {
  const app = TTApplication.Instance;

  // 1. Thinktank>Project で新規作成
  await show('thinktank');
  await act(async () => { host.querySelector<HTMLButtonElement>('[data-tip="新規"]')!.click(); });
  const ttProjId = app.ThinktankPanel.ProjectID;
  expect(ttProjId).not.toBe('');
  expect(TTUIStateManager.instance.getProperty('ThinktankPanel.Project.ID')).toBe(ttProjId);
  expect(host.querySelector('[data-testid="texteditor"]')?.textContent).toBe(ttProjId);
  const ttCreated = vault.GetThink(ttProjId)!;
  expect(ttCreated.ContentType).toBe('project');
  expect(ttCreated.Content).toBe(serializeProject({ title: '新規プロジェクト' }));

  // 2. Seeds>Project で新規作成
  await show('seeds');
  await act(async () => { host.querySelector<HTMLButtonElement>('[data-tip="新規"]')!.click(); });
  const seedsProjId = app.SeedsPanel.ProjectID;
  expect(seedsProjId).not.toBe('');
  expect(TTUIStateManager.instance.getProperty('SeedsPanel.Project.ID')).toBe(seedsProjId);
  expect(host.querySelector('[data-testid="texteditor"]')?.textContent).toBe(seedsProjId);

  // 3. パネルバー（左端）にProjectタイトルが表示される
  await act(async () => root.render(
    <div>
      <ThinktankTabBar isOpen={true} onToggle={() => {}} viewMode="project" onSetViewMode={() => {}} onRefresh={() => {}} projectName={vault.GetThink(app.ThinktankPanel.ProjectID)?.Name} />
      <SeedsTabBar isOpen={true} viewMode="project" onToggle={() => {}} onViewMode={() => {}} bundleName={vault.GetThink(app.SeedsPanel.ProjectID)?.Name} />
    </div>
  ));
  const labels = [...host.querySelectorAll('.vertical-tab-bar__label')].map(el => el.textContent);
  expect(labels).toEqual(['新規プロジェクト', '新規プロジェクト']);

  // 4. Seeds で「クリア」→ Seeds のみ解除、Thinktank は残る
  await show('seeds');
  await act(async () => { host.querySelector<HTMLButtonElement>('[data-tip="クリア"]')!.click(); });
  expect(app.SeedsPanel.ProjectID).toBe('');
  expect(TTUIStateManager.instance.getProperty('SeedsPanel.Project.ID')).toBe('none');
  expect(app.ThinktankPanel.ProjectID).toBe(ttProjId);

  // 5. Seeds に再度Projectを設定してから、Thinktank で「クリア」→ Thinktank だけが解除される
  app.SeedsPanel.OpenProject(ID, 'project');
  expect(app.SeedsPanel.ProjectID).toBe(ID);
  await show('thinktank');
  await act(async () => { host.querySelector<HTMLButtonElement>('[data-tip="クリア"]')!.click(); });
  expect(app.ThinktankPanel.ProjectID).toBe('');
  expect(TTUIStateManager.instance.getProperty('ThinktankPanel.Project.ID')).toBe('none');
  expect(app.SeedsPanel.ProjectID).toBe(ID);
  expect(app.SeedsPanel.ProjectView.ThinkID).toBe(ID);
  expect(TTUIStateManager.instance.getProperty('SeedsPanel.Project.ID')).toBe(ID);
  expect(host.textContent).toContain('ファイルが開かれていません。');
});

it('Seeds>Think一覧のメニューリボンからBundle設定をクリアボタンが廃止されている', async () => {
  await act(async () => root.render(
    <SeedsMenuRibbon
      showSettings={false}
      mediaType="datagrid"
      visibleIds={[ID]}
      checkedIds={[]}
      showCheckedOnly={false}
      showColumnDialog={false}
      showFilterSelectDialog={false}
      onCheckAll={() => {}}
      onClearChecks={() => {}}
      onExcludeChecked={() => {}}
      onToggleCheckedOnly={() => {}}
      onToggleColumnDialog={() => {}}
      onToggleFilterSelectDialog={() => {}}
      onRefresh={() => {}}
    />
  ));
  expect(host.querySelector('[data-tip="Bundle設定をクリア"]')).toBeNull();
});

it('旧値の表示モードは置き換え先のサブパネルで開く', () => {
  const thinktank = new TTThinktankPanel(); thinktank.SetViewMode('chat');
  const seeds = new TTSeedsPanel(); seeds.SetViewMode('chat');
  expect([thinktank.ViewMode, seeds.ViewMode]).toEqual(['aichat', 'aichat']);
  seeds.SetMediaType('chat');
  expect(seeds.ViewMode).toBe('aichat');

  const harvest = new TTHarvestPanel();
  expect(harvest.ViewMode).toBe('aiview');
  harvest.SetViewMode('chat'); expect(harvest.ViewMode).toBe('aichat');
  harvest.SetViewMode('project'); expect(harvest.ViewMode).toBe('aiview');

  const working = new TTWorkingPanel();
  working.SetViewMode('chat'); expect(working.ViewMode).toBe('aichat');
  working.SetViewMode('project'); expect(working.ViewMode).toBe('panes');
});

it('projectをロード中に「新規」を押すと、その配下に規定のprojectファイルを作ってロードする', async () => {
  vi.spyOn(StorageManager.instance, 'save').mockResolvedValue({ updatedAt: '2026-10-31T00:00:00Z' } as never);
  const app = TTApplication.Instance;
  app.ThinktankPanel.OpenProject(ID);
  await show('thinktank');
  await act(async () => { host.querySelector<HTMLButtonElement>('[data-tip="新規"]')!.click(); });
  const childId = app.ThinktankPanel.ProjectID;
  expect(childId).not.toBe(ID);
  expect(vault.GetThink(childId)!.Content).toBe(serializeProject({ title: '新規プロジェクト' }));
  // ロード中だった project の本文に載り、親の記録も付く
  expect(parseProject(vault.GetThink(ID)!.Content).ids).toEqual([childId]);
  await vi.waitFor(() => expect(vault.GetThink(childId)!.Metadata.parentProjectid).toBe(ID));
  expect(host.querySelector('[data-testid="texteditor"]')?.textContent).toBe(childId);
});

it('「root」は Thinktank だけにあり、タイトル「Thinktank」のprojectファイルを開く（無ければ作る）', async () => {
  vi.spyOn(StorageManager.instance, 'save').mockResolvedValue({ updatedAt: '2026-10-31T00:00:00Z' } as never);
  const app = TTApplication.Instance;
  await show('seeds');
  expect(host.querySelector('[data-tip="root"]')).toBeNull();

  // 無ければ規定の書式で作って開く
  await show('thinktank');
  await act(async () => { host.querySelector<HTMLButtonElement>('[data-tip="root"]')!.click(); });
  const rootId = app.ThinktankPanel.ProjectID;
  expect(vault.GetThink(rootId)!.Content).toBe(serializeProject({ title: 'Thinktank' }));
  expect(host.querySelector('[data-testid="texteditor"]')?.textContent).toBe(rootId);

  // あれば作らずにそれを開く（別のprojectをロード中でも）
  app.ThinktankPanel.OpenProject(ID);
  const count = vault.GetThinks().length;
  await act(async () => { host.querySelector<HTMLButtonElement>('[data-tip="root"]')!.click(); });
  expect(app.ThinktankPanel.ProjectID).toBe(rootId);
  expect(vault.GetThinks()).toHaveLength(count);
});

it('Thinkファイルをドロップすると、ドロップ位置に参照タグを挿入する（親パネルのドロップ処理へは渡さない）', async () => {
  const { TTShortcutManager } = await import('../../views/TTShortcutManager');
  const { TTActions } = await import('../../views/TTActions');
  const execute = vi.spyOn(TTActions, 'Execute').mockResolvedValue(undefined as never);
  const editor = { setPosition: vi.fn(), getPosition: vi.fn(() => ({ lineNumber: 1, column: 1 })) };
  // SeedsPanel と同じく、親の React 要素がドロップを受けるかを見る
  const parentDrop = vi.fn();
  const app = TTApplication.Instance;
  await act(async () => root.render(
    <div onDrop={parentDrop}>
      <AbstractView projectView={view} vault={vault} workingPanel={app.WorkingPanel} panelKey="thinktank" />
    </div>,
  ));
  await act(async () => view.Open(ID));
  TTShortcutManager.instance.registerAreaEditor(view.ID, editor);

  const content = host.querySelector('.abstract-view__content')!;
  const drop = (thinkId: string) => {
    const data = new Map([['application/x-thought-id', thinkId]]);
    const ev = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown; clientX: number; clientY: number };
    ev.dataTransfer = { types: [...data.keys()], getData: (k: string) => data.get(k) ?? '' };
    ev.clientX = 10; ev.clientY = 10;
    content.dispatchEvent(ev);
    return ev;
  };

  const ev = drop('2026-10-31-777777');
  expect(ev.defaultPrevented).toBe(true);
  expect(parentDrop).not.toHaveBeenCalled();
  expect(execute).toHaveBeenCalledWith('WorkingPanel.DroppedFile.ID:Insert');
  expect(TTShortcutManager.instance.activeEditor).toBe(editor);
  expect(TTShortcutManager.instance.consumePendingThinkDrop()).toEqual({ thinkId: '2026-10-31-777777', kind: 'insert' });

  // 開いている projectファイル自身は挿入しない
  execute.mockClear();
  drop(ID);
  expect(execute).not.toHaveBeenCalled();
  TTShortcutManager.instance.unregisterAreaEditor(view.ID, editor);
  TTShortcutManager.instance.setActiveEditor(null);
});

it('タイトル「Thinktank」のprojectファイルは Thinktank にだけ設定でき、Seeds には設定しない', () => {
  const app = TTApplication.Instance;
  const root = new TTThink(); root.ID = '2026-10-31-000099'; root.ContentType = 'project';
  root.Content = serializeProject({ title: 'Thinktank' }); root.markSaved(); vault.AddItem(root);

  app.SeedsPanel.OpenProject(root.ID, 'datagrid');
  expect(app.SeedsPanel.ProjectID).toBe('');
  app.SeedsPanel.OpenProject(ID, 'datagrid');
  expect(app.SeedsPanel.ProjectID).toBe(ID);
  // 別の project を設定中でも root で置き換わらない
  app.SeedsPanel.OpenProject(root.ID, 'datagrid');
  expect(app.SeedsPanel.ProjectID).toBe(ID);

  app.ThinktankPanel.OpenProject(root.ID);
  expect(app.ThinktankPanel.ProjectID).toBe(root.ID);
});

it('クリアボタンは「クリア」で circle-minus アイコン', async () => {
  await show();
  const clear = host.querySelector('[data-tip="クリア"]')!;
  expect(clear.querySelector('svg')?.getAttribute('class')).toContain('lucide-circle-minus');
});
