import { useSupportSelection } from '../../../hooks/useSupportSelection';
import { TTApplication } from '../../../views/TTApplication';
import { type SupportChatRef } from '../../ThoughtSupport/SupportChat';
import { useSupportChats } from '../../../hooks/useSupportChats';
import { usePanelSectionsSetAll } from '../../../hooks/usePanelSectionsSetAll';
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { TTDiscussPanel } from '../../../views/TTDiscussPanel';
import type { TTVault } from '../../../models/TTVault';
import { TTVoiceInput, isVoiceInputSupported } from '../../../views/TTVoiceInput';
import type { SettingsType } from '../DiscussTabBar';
import { DEVELOP_SETTINGS } from '../DiscussTabBar';
import { DEFAULT_COLUMNS, DEFAULT_SORT } from '../../ThinktankPanel/ColumnSortDialog';
import type { ColumnConfig, SortConfig } from '../../ThinktankPanel/ColumnSortDialog';
import { DEFAULT_CHAT_FILTER_VISIBILITY } from '../../ThinktankPanel/FilterSelectDialog';
import type { FilterVisibility } from '../../ThinktankPanel/FilterSelectDialog';
import { NEW_CHAT_SENTINEL_ID } from '../../../utils/thinkFormat';

export function useDiscussSettingsState(panel: TTDiscussPanel, vault: TTVault, activeSettings: SettingsType) {
  const panelRef = useRef<HTMLDivElement>(null);

  const firstPanesRef = useRef<HTMLButtonElement>(null);

  const firstTexteditorRef = useRef<HTMLButtonElement>(null);

  const firstDatagridRef = useRef<HTMLButtonElement>(null);

  const firstHtmlRef = useRef<HTMLButtonElement>(null);

  const aiChatViewRef = useRef<SupportChatRef>(null);

  const [selectedTodoMemoId, setSelectedTodoMemoId] = useSupportSelection(vault, 'Discuss');

  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);

  const [sort, setSort] = useState<SortConfig>(DEFAULT_SORT);

  const [showColumnDialog, setShowColumnDialog] = useState(false);

  const [filterVisibility, setFilterVisibility] = useState<FilterVisibility>(DEFAULT_CHAT_FILTER_VISIBILITY);

  const [showFilterSelectDialog, setShowFilterSelectDialog] = useState(false);

  const { chats: todoMemoThinks, error: supportListError } = useSupportChats(vault, "Discuss", TTApplication.Instance.SeedsPanel.BundleID, selectedTodoMemoId);

  useEffect(() => {
    if (vault.IsLoaded && selectedTodoMemoId && !todoMemoThinks.some(t => t.ID === selectedTodoMemoId)) {
      setSelectedTodoMemoId('');
    }
  }, [todoMemoThinks, selectedTodoMemoId]);

  const handleSelectTodoMemo = useCallback((id: string) => {
    aiChatViewRef.current?.abortStreaming();
    setSelectedTodoMemoId(id === NEW_CHAT_SENTINEL_ID ? '' : id);
  }, []);

  const handleToggleColumnDialog = useCallback(() => setShowColumnDialog(v => !v), []);

  const handleToggleFilterSelectDialog = useCallback(() => setShowFilterSelectDialog(v => !v), []);

  const hasFocus = panel.Layout !== null;

  const entry = DEVELOP_SETTINGS.find(s => s.type === activeSettings);

  const panelName = entry?.name ?? '';

  const [isActionSettingsOpen, setIsActionSettingsOpen] = useState(true);

  const [isDisplaySettingsOpen, setIsDisplaySettingsOpen] = useState(true);

  const [isColorSettingsOpen, setIsColorSettingsOpen] = useState(true);

  const [isCommentColorOpen, setIsCommentColorOpen] = useState(true);

  const [isBulletColorOpen, setIsBulletColorOpen] = useState(true);

  const [isSectionColorOpen, setIsSectionColorOpen] = useState(true);

  const [isHighlightColorOpen, setIsHighlightColorOpen] = useState(true);

  const [isPanelColorOpen, setIsPanelColorOpen] = useState(true);

  const [isMemoSettingsOpen, setIsMemoSettingsOpen] = useState(true);

  const [isEditSettingsOpen, setIsEditSettingsOpen] = useState(true);

  const [isKeySettingsOpen, setIsKeySettingsOpen] = useState(true);

  const [isTableSettingsOpen, setIsTableSettingsOpen] = useState(true);

  const [isTableDisplaySettingsOpen, setIsTableDisplaySettingsOpen] = useState(true);

  usePanelSectionsSetAll('discuss', [
    setIsActionSettingsOpen, setIsDisplaySettingsOpen, setIsColorSettingsOpen,
    setIsCommentColorOpen, setIsBulletColorOpen, setIsSectionColorOpen,
    setIsHighlightColorOpen, setIsPanelColorOpen, setIsMemoSettingsOpen,
    setIsEditSettingsOpen, setIsKeySettingsOpen, setIsTableSettingsOpen,
    setIsTableDisplaySettingsOpen,
  ]);

  const voiceSupported = useMemo(() => isVoiceInputSupported(), []);

  const [isVoiceListening, setIsVoiceListening] = useState(TTVoiceInput.instance.isListening);

  const [voiceError, setVoiceError] = useState(TTVoiceInput.instance.lastError);

  useEffect(() => TTVoiceInput.instance.onStatusChange(setIsVoiceListening), []);

  useEffect(() => TTVoiceInput.instance.onErrorChange(setVoiceError), []);

  const handleVoiceMicOn = useCallback(() => { TTVoiceInput.instance.start(); }, []);

  const handleVoiceMicOff = useCallback(() => { TTVoiceInput.instance.stop(); }, []);

  const handleVoiceEraser = useCallback(() => { TTVoiceInput.instance.cancel(); }, []);
  return {
    panelRef,
    firstPanesRef,
    firstTexteditorRef,
    firstDatagridRef,
    firstHtmlRef,
    aiChatViewRef,
    selectedTodoMemoId,
    setSelectedTodoMemoId,
    columns,
    setColumns,
    sort,
    setSort,
    showColumnDialog,
    setShowColumnDialog,
    filterVisibility,
    setFilterVisibility,
    showFilterSelectDialog,
    setShowFilterSelectDialog,
    todoMemoThinks,
    supportListError,
    handleSelectTodoMemo,
    handleToggleColumnDialog,
    handleToggleFilterSelectDialog,
    hasFocus,
    entry,
    panelName,
    isActionSettingsOpen,
    setIsActionSettingsOpen,
    isDisplaySettingsOpen,
    setIsDisplaySettingsOpen,
    isColorSettingsOpen,
    setIsColorSettingsOpen,
    isCommentColorOpen,
    setIsCommentColorOpen,
    isBulletColorOpen,
    setIsBulletColorOpen,
    isSectionColorOpen,
    setIsSectionColorOpen,
    isHighlightColorOpen,
    setIsHighlightColorOpen,
    isPanelColorOpen,
    setIsPanelColorOpen,
    isMemoSettingsOpen,
    setIsMemoSettingsOpen,
    isEditSettingsOpen,
    setIsEditSettingsOpen,
    isKeySettingsOpen,
    setIsKeySettingsOpen,
    isTableSettingsOpen,
    setIsTableSettingsOpen,
    isTableDisplaySettingsOpen,
    setIsTableDisplaySettingsOpen,
    voiceSupported,
    isVoiceListening,
    setIsVoiceListening,
    voiceError,
    setVoiceError,
    handleVoiceMicOn,
    handleVoiceMicOff,
    handleVoiceEraser,
  };
}
