import type { TTDiscussPanel } from '../../../views/TTDiscussPanel';
import type { TTVault } from '../../../models/TTVault';
import type { SettingsType } from '../DiscussTabBar';
import type { useDiscussSettingsState } from './useDiscussSettingsState';
export interface DiscussSettingAreaProps {
  activeSettings: SettingsType;
  panel: TTDiscussPanel;
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

export type DiscussSettingsContext = DiscussSettingAreaProps & ReturnType<typeof useDiscussSettingsState>;
