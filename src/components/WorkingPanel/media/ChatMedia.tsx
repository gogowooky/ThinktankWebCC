import { forwardRef, useRef, useImperativeHandle, useEffect, useState } from 'react';
import type { MediaProps } from './types';
import { TTApplication } from '../../../views/TTApplication';
import { DEFAULT_AI_MODEL_SELECTION, type AiModelSelection, type AiProvider } from '../../../services/aiModels';
import { NO_MODEL } from '../../../services/aiChatModelStatus';
import {
  CHAT_AI_PROVIDER_CHOICES, aiProviderLabel, aiProviderSiteUrl, chatAiSelection, gnbNotebookName, gnbNotebooks,
  setChatNotebook, setChatProvider,
} from '../../../services/chatAiSetting';
import { onDictionaryChange } from '../../../utils/defaultDictionary';
import { showMonacoMenu } from '../../../utils/monacoMenu';
import { SupportChat, type SupportChatRef } from '../../ThoughtSupport/SupportChat';
import './ChatMedia.css';

interface ChatAiLabelProps {
  think: NonNullable<MediaProps['think']>;
  selection: AiModelSelection;
  /** metadata に無い項目の出所（Pane の AI） */
  fallback: AiModelSelection;
}

/**
 * 送信の右（待機・失敗の文言が無い間）に出す、このチャットの AI 種別。
 * AI 種別を押すと種別を、GNB の Notebook 名を押すと Notebook を選べる。末尾の「web」はその Web サイトへのリンク
 */
function ChatAiLabel({ think, selection, fallback }: ChatAiLabelProps) {
  const [, setDictionaryTick] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => onDictionaryChange(() => setDictionaryTick(n => n + 1)), []);

  const save = async (write: () => Promise<void>, what: string) => {
    try {
      setError('');
      await write();
      TTApplication.Instance.Models.Vault.NotifyUpdated(false);
    } catch (e) {
      setError(`${what}を設定できませんでした: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const chooseProvider = async (anchor: HTMLElement) => {
    const provider = await showMonacoMenu({
      title: 'このチャットの AI',
      nodes: CHAT_AI_PROVIDER_CHOICES.map(p => ({
        key: '', label: aiProviderLabel(p), value: p, detail: p === selection.provider ? '選択中' : undefined,
      })),
      anchor,
    });
    if (!provider || provider === selection.provider) return;
    await save(() => setChatProvider(think, provider as AiProvider, fallback), 'AI');
  };

  const chooseNotebook = async (anchor: HTMLElement) => {
    const id = await showMonacoMenu({
      title: 'このチャットの GNB Notebook',
      nodes: gnbNotebooks().map(nb => ({ key: '', label: nb.name, detail: nb.id === selection.model ? '選択中' : undefined, value: nb.id, tip: nb.id })),
      anchor,
      emptyMessage: 'Dictionary の ai_settings.gnb.notebookid に Notebook が登録されていません',
    });
    if (!id || id === selection.model) return;
    await save(() => setChatNotebook(think, id), 'Notebook');
  };

  if (error) return <span className="chat-media__ai chat-media__ai--error">{error}</span>;
  const siteUrl = aiProviderSiteUrl(selection);
  const hasNotebook = selection.model && selection.model !== NO_MODEL;
  return (
    <span className="chat-media__ai">
      <button
        type="button"
        className="chat-media__choice"
        onClick={e => void chooseProvider(e.currentTarget)}
        data-tip="このチャットの AI を選ぶ"
      >
        {aiProviderLabel(selection.provider)}
      </button>
      {selection.provider === 'gnb' && (<>
        {' ('}
        <button
          type="button"
          className="chat-media__choice"
          onClick={e => void chooseNotebook(e.currentTarget)}
          data-tip={hasNotebook ? `Notebook ID: ${selection.model}（押すと変更）` : 'このチャットで使う Notebook を選ぶ'}
        >
          {hasNotebook ? gnbNotebookName(selection.model) ?? selection.model : 'Notebook 未設定'}
        </button>
        {')'}
      </>)}
      {siteUrl && (<>
        {' '}
        <a className="chat-media__site" href={siteUrl} target="_blank" rel="noopener noreferrer" data-tip={siteUrl}>web</a>
      </>)}
    </span>
  );
}

export interface ChatMediaRef { focus: () => void }
export const ChatMedia = forwardRef<ChatMediaRef, MediaProps>(function ChatMedia({ think, onDirtyChange, aiChatModel, onAiChatModelChange }, ref) {
  const chat = useRef<SupportChatRef>(null);
  useImperativeHandle(ref, () => ({ focus: () => chat.current?.focus() }));
  useEffect(() => {
    if (think) onDirtyChange(false);
  }, [think, onDirtyChange]);
  if (!think) return null;
  // metadata に AI が書かれたチャットはそれを使い、無い項目は Pane の AI に従う
  const fallback = aiChatModel ?? DEFAULT_AI_MODEL_SELECTION;
  const selection = chatAiSelection(think.Metadata, fallback);
  return <div className="chat-media"><SupportChat ref={chat} pane vault={TTApplication.Instance.Models.Vault}
    panelName="Working" selectedId={think.ID} bundleId={TTApplication.Instance.SeedsPanel.BundleID}
    modelSelector={{ value: selection, onChange: next => onAiChatModelChange?.(next) }}
    idleStatus={<ChatAiLabel think={think} selection={selection} fallback={fallback} />} />
  </div>;
});
