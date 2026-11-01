import { forwardRef, useImperativeHandle } from 'react';
import type { WorkingSettingAreaProps as Props } from './settings/types';
import { useWorkingSettingsState } from './settings/useWorkingSettingsState';
import { PaneSettings } from './settings/PaneSettings';
import { TextEditorSettings } from './settings/TextEditorSettings';
import { ChatSettings } from './settings/ChatSettings';
import { HtmlSettings } from './settings/HtmlSettings';
import { DataGridSettings } from './settings/DataGridSettings';
import { AiViewPanel, AiChatPanel } from '../AiPanels/AiPanels';
import './WorkingSettingArea.css';

export interface WorkingSettingAreaRef { focus: () => void; }

export const WorkingSettingArea = forwardRef<WorkingSettingAreaRef, Props>(function WorkingSettingArea(props, ref) {
  const { activeSettings, width } = props;
  const state = useWorkingSettingsState(props.panel, props.vault, activeSettings);
  const { panelRef, firstPanesRef, firstTexteditorRef, firstDatagridRef, firstHtmlRef, panelName } = state;
  useImperativeHandle(ref, () => ({
    focus: () => {
      switch (activeSettings) {
        case 'panes':
          // disabled の可能性があるためフォーカスできなければパネル自体へ
          if (firstPanesRef.current && !firstPanesRef.current.disabled) {
            firstPanesRef.current.focus();
          } else {
            panelRef.current?.focus();
          }
          break;
        case 'texteditor': firstTexteditorRef.current?.focus(); break;
        case 'datagrid': firstDatagridRef.current?.focus(); break;
        case 'html': firstHtmlRef.current?.focus(); break;
        default: panelRef.current?.focus(); break;
      }
    },
  }));
  const context = { ...props, ...state };
  return (
    <div ref={panelRef} className="working-setting-area" style={{ width, maxWidth: width }} tabIndex={-1}>

      <div className="working-setting-area__header">Working&gt;{panelName}</div>

      <div className={`working-setting-area__body${activeSettings === 'aiview' || activeSettings === 'aichat' ? ' working-setting-area__body--fill' : ''}`}>
        {activeSettings === 'panes' ? <PaneSettings {...context} />
            : activeSettings === 'texteditor' ? <TextEditorSettings {...context} />
              : activeSettings === 'chatsetting' ? <ChatSettings {...context} />
              : activeSettings === 'html' ? <HtmlSettings {...context} />
                : activeSettings === 'datagrid' ? <DataGridSettings {...context} />
                  : activeSettings === 'aiview' ? <AiViewPanel panelKey="working" />
                  : activeSettings === 'aichat' ? <AiChatPanel />
                  : <div className="working-setting-area__placeholder">
                    {panelName} の設定は今後追加予定です。
                  </div>}
      </div>

    </div>
  );
});
