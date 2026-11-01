import { usePanelSectionsSetAll } from '../../../hooks/usePanelSectionsSetAll';
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { TTWorkingPanel } from '../../../views/TTWorkingPanel';
import type { TTVault } from '../../../models/TTVault';
import { TTVoiceInput, isVoiceInputSupported } from '../../../views/TTVoiceInput';
import type { SettingsType } from '../WorkingTabBar';
import { DEVELOP_SETTINGS } from '../WorkingTabBar';

export function useWorkingSettingsState(panel: TTWorkingPanel, _vault: TTVault, activeSettings: SettingsType) {
  const panelRef = useRef<HTMLDivElement>(null);

  const firstPanesRef = useRef<HTMLButtonElement>(null);

  const firstTexteditorRef = useRef<HTMLButtonElement>(null);

  const firstDatagridRef = useRef<HTMLButtonElement>(null);

  const firstHtmlRef = useRef<HTMLButtonElement>(null);

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

  usePanelSectionsSetAll('working', [
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
