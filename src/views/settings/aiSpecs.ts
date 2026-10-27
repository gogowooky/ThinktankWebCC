import type { TTApplication } from '../TTApplication';
import { AI_CHAT_PROVIDER_NAMES, NO_MODEL, getModelNames, isProviderName, setModelNames, type AiChatProviderName } from '../../services/aiChatModelStatus';
import type { PropSpec, PanelKey } from './types';

function aiChatModelNameSpecs(): Record<string, PropSpec> {
  const specs: Record<string, PropSpec> = {};
  for (const name of AI_CHAT_PROVIDER_NAMES) {
    specs[`AIChat.ModelNames.${name}`] = {
      panel: 'Application',
      default: NO_MODEL,
      type: 'string',
      // 一覧は実行時に決まるので、ここでは CSV であることだけを確かめる
      candidates: '^[^,]+(,[^,]+)*$',
      description: `各パネルのAIChatが${name}のときのモデルID（CSV。先頭が選択中）`,
      get: () => getModelNames(name),
      set: (_app, v) => { setModelNames(name, v); },
    };
  }
  return specs;
}

function aiChatProviderSpec(
  panel: PanelKey,
  description: string,
  get: (app: TTApplication) => AiChatProviderName,
  set: (app: TTApplication, v: AiChatProviderName) => void,
): PropSpec {
  return {
    panel,
    default: 'Claude',
    type: 'string',
    candidates: `^(${AI_CHAT_PROVIDER_NAMES.join('|')})$`,
    description,
    get,
    set: (app, v) => { if (isProviderName(v)) set(app, v); },
  };
}

export const aiChatModelNames = aiChatModelNameSpecs();

export const aiSpecs: Record<string, PropSpec> = {
  'ThinktankPanel.AIChat.ModelName': aiChatProviderSpec('ThinktankPanel', 'ThinktankPanelのAIChatで用いるAIモデル名',
    app => app.ThinktankPanel.AIChatProviderName, (app, v) => { app.ThinktankPanel.AIChatProviderName = v; }),
  'SeedsPanel.AIChat.ModelName': aiChatProviderSpec('SeedsPanel', 'SeedsPanelのAIChatで用いるAIモデル名',
    app => app.SeedsPanel.AIChatProviderName, (app, v) => { app.SeedsPanel.AIChatProviderName = v; }),
  'WorkingSettingPanel.AIChat.ModelName': aiChatProviderSpec('WorkingPanel', 'WorkingSettingPanelのAIChatで用いるAIモデル名',
    app => app.WorkingPanel.SettingAIChatProviderName, (app, v) => { app.WorkingPanel.SettingAIChatProviderName = v; }),
  'WorkingPanel.AIChat.ModelName': aiChatProviderSpec('WorkingPanel', 'WorkingPanelのAIChatで用いるAIモデル名',
    app => app.WorkingPanel.AIChatProviderName, (app, v) => { app.WorkingPanel.AIChatProviderName = v; }),
  'HarvestPanel.AIChat.ModelName': aiChatProviderSpec('HarvestPanel', 'HarvestPanelのAIChatで用いるAIモデル名',
    app => app.HarvestPanel.AIChatProviderName, (app, v) => { app.HarvestPanel.AIChatProviderName = v; })
};
