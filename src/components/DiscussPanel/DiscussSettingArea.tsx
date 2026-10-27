import { forwardRef, useImperativeHandle } from 'react';
import type { DiscussSettingAreaProps as Props } from './settings/types';
import { useDiscussSettingsState } from './settings/useDiscussSettingsState';
import { ChatSettings } from './settings/ChatSettings';
import { PaneSettings } from './settings/PaneSettings';
import { TextEditorSettings } from './settings/TextEditorSettings';
import { HtmlSettings } from './settings/HtmlSettings';
import { DataGridSettings } from './settings/DataGridSettings';
import { AbstractView } from '../Abstract/AbstractView';
import './DiscussSettingArea.css';

export interface DiscussSettingAreaRef { focus: () => void; }

export const DiscussSettingArea = forwardRef<DiscussSettingAreaRef, Props>(function DiscussSettingArea(props, ref) {
  const { activeSettings, width } = props;
  const state = useDiscussSettingsState(props.panel, props.vault, activeSettings);
  const { panelRef, firstPanesRef, firstTexteditorRef, firstDatagridRef, firstHtmlRef, aiChatViewRef, panelName } = state;
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
        case 'chat': aiChatViewRef.current?.focus(); break;
        default: panelRef.current?.focus(); break;
      }
    },
  }));
  const context = { ...props, ...state };
  return (
    <div ref={panelRef} className="discuss-setting-area" style={{ width, maxWidth: width }} tabIndex={-1}>

      <div className="discuss-setting-area__header">Discuss&gt;{panelName}</div>

      <div className={`discuss-setting-area__body${activeSettings === 'chat' ? ' discuss-setting-area__body--chat' : ''}`}>
        {activeSettings === 'chat' ? <ChatSettings {...context} />
          : activeSettings === 'panes' ? <PaneSettings {...context} />
            : activeSettings === 'texteditor' ? <TextEditorSettings {...context} />
              : activeSettings === 'html' ? <HtmlSettings {...context} />
                : activeSettings === 'datagrid' ? <DataGridSettings {...context} />
                  : activeSettings === 'project' ? <AbstractView />
                  : <div className="discuss-setting-area__placeholder">
                    {panelName} の設定は今後追加予定です。
                  </div>}
      </div>

    </div>
  );
});
