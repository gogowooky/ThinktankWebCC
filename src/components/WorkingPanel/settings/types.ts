import type { TTWorkingPanel } from '../../../views/TTWorkingPanel';
import type { TTVault } from '../../../models/TTVault';
import type { SettingsType } from '../WorkingTabBar';
import type { useWorkingSettingsState } from './useWorkingSettingsState';
export interface WorkingSettingAreaProps {
  activeSettings: SettingsType;
  panel: TTWorkingPanel;
  vault: TTVault;
  width: number;
  onSplitLeft: () => void;
  onSplitRight: () => void;
  onSplitAbove: () => void;
  onSplitBelow: () => void;
  onAddLeft: () => void;
  onAddRight: () => void;
  onAddTop: () => void;
  onAddBottom: () => void;
  onRemoveFocused: () => void;
  onClearAll: () => void;
  onCloseNotInBundle: () => void;
  hasBundle: boolean;
  onEqualizeWidths: () => void;
  onEqualizeHeights: () => void;
  onCreateHtml: () => void;
  onCreateMemo: () => void;
  onReadMemo: () => void;
  onSaveMemo: () => void;
  onCreateTable: () => void;
  onReadTable: () => void;
  onSaveTable: () => void;
  /** chatファイル未選択時の保存。作成した Think を返す（続けて選択中として扱うため） */
  onRefresh: () => void;
}

export type WorkingSettingsContext = WorkingSettingAreaProps & ReturnType<typeof useWorkingSettingsState>;
