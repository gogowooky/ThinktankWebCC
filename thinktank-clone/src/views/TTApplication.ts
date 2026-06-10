// ルートビューモデル。4パネルモデルの統合、Open/Link操作

import { TTNotifyBase } from '../models/TTNotifyBase';
import { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { TTActions } from './TTActions';
import { TTUIStateManager } from './TTUIStateManager';
import {
  TTShortcutManager, DEFAULT_SHORTCUTS, serializeShortcuts, parseShortcuts,
} from './TTShortcutManager';
import { TTWorkoutPanel } from './TTWorkoutPanel';
import { StorageManager } from '../services/StorageManager';
import { THINK_POLICY_IDS, THINK_POLICY_DEFAULTS, type PanelName } from '../services/ThinkPolicies';
import { MEDIA_TYPE_MAP, type ContentType, type LayoutMode } from '../types';

export type StatusBarMode = 'status' | 'highlight' | 'keyaction' | 'cli';
export type ThinktankViewMode = 'list' | 'ai' | 'settings';
export type OverviewViewMode = 'grid' | 'graph' | 'chat' | 'settings';
export type ReThinkViewMode = 'chat' | 'settings';

export class TTApplication extends TTNotifyBase {
  Vault = new TTVault();
  Actions = new TTActions();
  UIState: TTUIStateManager;
  Shortcuts: TTShortcutManager;
  Workout = new TTWorkoutPanel();

  // ── パネル状態 ──
  ThinktankOpen = true;
  OverviewOpen = true;
  ReThinkOpen = true;
  WorkoutSettingOpen = false;
  ThinktankWidth = 240;
  OverviewWidth = 260;
  ReThinkWidth = 260;
  WorkoutSettingWidth = 200;
  LayoutMode: LayoutMode = 'standard';
  CloudSyncEnabled = true;

  ThinktankView: ThinktankViewMode = 'list';
  OverviewView: OverviewViewMode = 'grid';
  ReThinkView: ReThinkViewMode = 'chat';

  /** Overview で選択中の Thought のID */
  SelectedThoughtId = '';

  // ── ステータスバー ──
  StatusBarMode: StatusBarMode = 'status';
  StatusText = '';
  HighlightPattern = '';
  ShowCopyright = false;

  /** フォーカス中エディタ/グリッドが登録するアクションハンドラ */
  MediaActionHandlers = new Map<string, () => void>();

  Initialized = false;

  constructor() {
    super();
    this.UIState = new TTUIStateManager(this);
    this.Shortcuts = new TTShortcutManager(this.Actions);
    this.Vault._parent = this;
    this.Workout._parent = this;
    this.Actions.OnStatus = (actionId, status) => {
      this.StatusText = `${actionId}: ${status}`;
      this.NotifyUpdated(false);
    };
    this.Shortcuts.OnStatusChanged = () => this.NotifyUpdated(false);
    this._registerActions();
  }

  get Mode() {
    return StorageManager.Instance.mode;
  }

  async Initialize(): Promise<void> {
    this.UIState.LoadFromLocalStorage();
    try {
      await this.Vault.LoadAll();
      // システムThinkのシード
      await this.Vault.EnsureSystemThink('__tt_ui_state__', 'table', this.UIState.Serialize());
      const sc = await this.Vault.EnsureSystemThink('__tt_shortcuts__', 'table', serializeShortcuts(DEFAULT_SHORTCUTS));
      const parsed = parseShortcuts(sc.Content);
      this.Shortcuts.SetDefinitions(parsed.length > 0 ? parsed : DEFAULT_SHORTCUTS);
      // パネル毎のAI方針 Thinkファイル
      for (const panel of Object.keys(THINK_POLICY_IDS) as PanelName[]) {
        await this.Vault.EnsureSystemThink(THINK_POLICY_IDS[panel], 'memo', THINK_POLICY_DEFAULTS[panel]);
      }
    } catch (e) {
      this.StatusText = `初期化エラー: ${(e as Error).message}`;
    }
    this.Shortcuts.Attach();
    this.Initialized = true;
    this.NotifyUpdated(false);
  }

  /** パネル毎のAI方針（Thinkファイル本文）を取得 */
  GetThinkPolicy(panel: PanelName): string {
    const think = this.Vault.GetChild(THINK_POLICY_IDS[panel]);
    return think?.Content ?? THINK_POLICY_DEFAULTS[panel];
  }

  async SaveUIStateThink(): Promise<void> {
    const think = this.Vault.GetChild('__tt_ui_state__');
    if (!think) return;
    // 構造維持のため、現在の本文に対して current 列のみを部分更新する
    const { updateTableContent } = await import('../utils/tableFormat');
    const updates = new Map<string, string>();
    for (const [key] of this.UIState.Specs) {
      updates.set(key, this.UIState.GetProperty(key));
    }
    think.Content = updateTableContent(think.Content, 'key', 'current', updates);
    if (think.IsDirty) await this.Vault.SaveThink(think);
  }

  /** Think を Workout パネルで開く（既に開いていればフォーカス） */
  async OpenThink(id: string): Promise<void> {
    const think = await this.Vault.EnsureContent(id);
    if (!think) return;
    const existing = this.Workout.FindAreaByResource(id);
    if (existing) {
      this.Workout.SetFocusedArea(existing.ID);
      return;
    }
    const media = MEDIA_TYPE_MAP[think.ContentType]?.initial ?? 'texteditor';
    this.Workout.AddToEdge('right', id, media);
  }

  SelectThought(id: string): void {
    this.SelectedThoughtId = id;
    void this.Vault.EnsureContent(id);
    this.NotifyUpdated(false);
  }

  get SelectedThought(): TTThink | undefined {
    return this.SelectedThoughtId ? this.Vault.GetChild(this.SelectedThoughtId) : undefined;
  }

  NewThought(content?: string): TTThink {
    const think = this.Vault.NewThink('thought', content);
    void this.Vault.SaveThink(think);
    return think;
  }

  NewThink(contentType: ContentType): TTThink {
    const think = this.Vault.NewThink(contentType);
    void this.Vault.SaveThink(think);
    return think;
  }

  private _registerActions(): void {
    const reg = (actionId: string, description: string, fn: () => void | Promise<void>) => {
      this.Actions.Register({
        ActionID: actionId,
        Description: description,
        Completion: async (item) => {
          await fn();
          item.Result = description;
        },
      });
    };

    reg('Panel.Thinktank.Toggle', 'Thinktankパネル開閉', () => {
      this.UIState.ApplyProperty('ThinktankPanel.Open', String(!this.ThinktankOpen));
    });
    reg('Panel.Overview.Toggle', 'Overviewパネル開閉', () => {
      this.UIState.ApplyProperty('OverviewPanel.Open', String(!this.OverviewOpen));
    });
    reg('Panel.ReThink.Toggle', 'ReThinkパネル開閉', () => {
      this.UIState.ApplyProperty('ReThinkPanel.Open', String(!this.ReThinkOpen));
    });
    reg('Panel.WorkoutSetting.Toggle', 'Workout設定トレイ開閉', () => {
      this.UIState.ApplyProperty('WorkoutPanel.SettingOpen', String(!this.WorkoutSettingOpen));
    });
    reg('Application.LayoutMode.Toggle', 'レイアウトモード切替', () => {
      this.UIState.ApplyProperty('Application.LayoutMode', this.LayoutMode === 'standard' ? 'compact' : 'standard');
    });
    reg('UIState.Undo', 'UI状態を元に戻す', () => this.UIState.Undo());
    reg('UIState.Redo', 'UI状態をやり直す', () => this.UIState.Redo());
    reg('Workout.Equalize', 'ペイン幅の均等化', () => {
      this.Workout.Equalize('v');
      this.Workout.Equalize('h');
    });
    reg('Workout.CloseFocused', 'フォーカス中ペインを閉じる', () => {
      if (this.Workout.FocusedAreaId) this.Workout.CloseArea(this.Workout.FocusedAreaId);
    });
    reg('Workout.SaveFocused', 'フォーカス中ペインを保存', async () => {
      const area = this.Workout.GetArea(this.Workout.FocusedAreaId);
      if (!area?.ResourceID) return;
      const think = this.Vault.GetChild(area.ResourceID);
      if (think) await this.Vault.SaveThink(think);
    });

    // メディア（TextEditor/DataGrid）系はフォーカス中コンポーネントが登録したハンドラへ委譲
    const mediaActions: Array<[string, string]> = [
      ['TextEditor.Folding.OpenEachLevel', '見出しの段階的展開'],
      ['TextEditor.Folding.CloseEachLevel', '見出しの段階的折りたたみ'],
      ['TextEditor.Heading.Previous', '前の表示見出しへ移動'],
      ['TextEditor.Heading.Next', '次の表示見出しへ移動'],
      ['TextEditor.Heading.Parent', '親見出しへ移動'],
      ['DataGrid.EditCell', 'セルの編集'],
      ['DataGrid.AddRow', '行を追加'],
      ['DataGrid.AddColumn', '列を追加'],
      ['DataGrid.DeleteRow', '行を削除'],
    ];
    for (const [actionId, description] of mediaActions) {
      reg(actionId, description, () => {
        this.MediaActionHandlers.get(actionId)?.();
      });
    }
  }
}

export const app = new TTApplication();
