/**
 * AiModelSettingsPanel.tsx
 * Thinktank>設定>AIモデル。プロバイダごとに使うモデルを CSV で入力する。
 * 値は Status AIChat.ModelNames.{OpenAI|Gemini|Claude|GNB|Local}（先頭が送信に使う値）に保存する。
 */

import { useCallback, useEffect, useReducer, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { getModelNames, modelIdsOf, normalizeModelNames, onModelNamesChange, type AiChatProviderName } from '../../services/aiChatModelStatus';
import { geminiNotebookUrl } from '../../services/chatAiSetting';
import type { ElectronAiAuthStatus, ElectronAiProviderAuthStatus } from '../../services/storage/ElectronStorageBackend';

const PROVIDERS: Array<{ name: AiChatProviderName; label: string }> = [
  { name: 'OpenAI', label: 'ChatGPT' },
  { name: 'Gemini', label: 'Gemini' },
  { name: 'Claude', label: 'Claude' },
  { name: 'GNB',    label: 'GeminiNotebook(GNB)' },
  { name: 'Local',  label: 'Local' },
];

const LOGIN_URLS: Record<AiChatProviderName, string> = {
  OpenAI: 'https://chatgpt.com/auth/login',
  Gemini: 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fgemini.google.com%2F',
  Claude: 'https://claude.ai/login',
  GNB: 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fnotebook.google.com%2F',
  Local: '',
};

const DEFAULT_AUTH_STATUS: ElectronAiAuthStatus = {
  OpenAI: { available: false, loggedIn: false, loginUrl: LOGIN_URLS.OpenAI },
  Gemini: { available: false, loggedIn: false, loginUrl: LOGIN_URLS.Gemini },
  Claude: { available: false, loggedIn: false, loginUrl: LOGIN_URLS.Claude },
  GNB: { available: false, loggedIn: false, loginUrl: LOGIN_URLS.GNB },
  Local: { available: false, loggedIn: false, loginUrl: '' },
};

const LS_GNB_TITLES_KEY = 'tt-gnb-notebook-titles';

function loadCachedNotebookTitle(notebookId: string): string | null {
  if (!notebookId) return null;
  try {
    const raw = localStorage.getItem(LS_GNB_TITLES_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, unknown>;
    const title = map?.[notebookId];
    return typeof title === 'string' && title.trim() ? title : null;
  } catch {
    return null;
  }
}

function saveCachedNotebookTitle(notebookId: string, title: string): void {
  if (!notebookId || !title.trim()) return;
  try {
    const raw = localStorage.getItem(LS_GNB_TITLES_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[notebookId] = title;
    localStorage.setItem(LS_GNB_TITLES_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

// Status 経由で保存しないと、再起動や他端末で入力が失われる。
// 空欄や末尾のカンマは Status の検証で弾かれるので、先に整える（空欄は None）。
function saveModelNames(name: AiChatProviderName, csv: string): void {
  TTUIStateManager.instance.applyProperty(`AIChat.ModelNames.${name}`, normalizeModelNames(csv));
}

function ProviderModels({
  name,
  label,
  auth,
  onLogin,
  refreshCount,
}: {
  name: AiChatProviderName;
  label: string;
  auth: ElectronAiProviderAuthStatus;
  onLogin: (name: AiChatProviderName, event: ReactMouseEvent<HTMLAnchorElement>) => void;
  refreshCount: number;
}) {
  const ids = modelIdsOf(getModelNames(name));
  const saved = ids.join(',');
  const [draft, setDraft] = useState(saved);
  const isGnb = name === 'GNB';
  const primaryNotebookId = ids[0] ?? '';
  const notebookHref = isGnb ? geminiNotebookUrl(primaryNotebookId) : '';
  const [notebookTitle, setNotebookTitle] = useState(() => (
    primaryNotebookId ? (loadCachedNotebookTitle(primaryNotebookId) ?? '未取得') : '未設定'
  ));
  const [manualTitleRefreshCount, setManualTitleRefreshCount] = useState(0);

  // Status 側の編集を入力欄に反映する
  useEffect(() => { setDraft(saved); }, [saved]);

  useEffect(() => {
    if (!isGnb) return;
    if (!primaryNotebookId) {
      setNotebookTitle('未設定');
      return;
    }
    const cached = loadCachedNotebookTitle(primaryNotebookId);
    const forceRefresh = refreshCount > 0 || manualTitleRefreshCount > 0;
    if (cached && !forceRefresh) {
      setNotebookTitle(cached);
      return;
    }
    const getTitle = window.electronAPI?.ai?.getGnbNotebookTitle;
    if (!getTitle) {
      setNotebookTitle(cached ?? '取得できません');
      return;
    }
    let cancelled = false;
    setNotebookTitle('取得中…');
    void getTitle(primaryNotebookId).then(
      title => {
        if (cancelled) return;
        saveCachedNotebookTitle(primaryNotebookId, title);
        setNotebookTitle(title);
      },
      () => { if (!cancelled) setNotebookTitle('取得できません'); },
    );
    return () => { cancelled = true; };
  }, [auth.loggedIn, isGnb, primaryNotebookId, refreshCount, manualTitleRefreshCount]);

  const commit = () => {
    if (normalizeModelNames(draft) !== getModelNames(name)) saveModelNames(name, draft);
    else setDraft(saved);
  };

  const handleLoginClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    commit();
    onLogin(name, event);
  };

  const handleTitleClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    commit();
    setManualTitleRefreshCount(c => c + 1);
  };

  return (
    <div className="tt-ai-model">
      <div className="tt-ai-model__header">
        <div className="tt-ai-model__label">
          {notebookHref
            ? <a className="tt-ai-model__label-link" href={notebookHref} target="_blank" rel="noopener noreferrer">{label}</a>
            : label}
        </div>
        {name === 'Local'
          ? <span className="tt-ai-model__auth tt-ai-model__auth--unset">未設定</span>
          : auth.loggedIn
            ? (
              <span className="tt-ai-model__auth tt-ai-model__auth--logged-in">
                ログイン済（
                <a
                  className="tt-ai-model__auth--login-link"
                  href={auth.loginUrl || LOGIN_URLS[name]}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleLoginClick}
                >再ログイン</a>
                ）
              </span>
            )
            : <a
              className="tt-ai-model__auth tt-ai-model__auth--login-link"
              href={auth.loginUrl || LOGIN_URLS[name]}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleLoginClick}
            >未ログイン</a>}
      </div>
      <input
        className="tt-settings-input"
        aria-label={`${label}の${isGnb ? 'Notebook ID' : 'モデル'}（CSV）`}
        placeholder={isGnb ? 'Notebook IDをカンマ区切りで入力' : 'モデルIDをカンマ区切りで入力'}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit();
        }}
      />
      {isGnb && (
        <div className="tt-ai-model__notebook-title" aria-live="polite">
          <a
            className="tt-ai-model__notebook-title-link"
            href={notebookHref}
            onClick={handleTitleClick}
          >タイトル</a>：{notebookTitle}
        </div>
      )}
    </div>
  );
}

export function AiModelSettingsPanel() {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [authStatus, setAuthStatus] = useState<ElectronAiAuthStatus>(DEFAULT_AUTH_STATUS);
  const [gnbRefreshCount, setGnbRefreshCount] = useState(0);
  useEffect(() => onModelNamesChange(rerender), []);

  const refreshAuthStatus = useCallback(async () => {
    const getAuthStatus = window.electronAPI?.ai?.getAuthStatus;
    if (!getAuthStatus) return;
    try {
      setAuthStatus(await getAuthStatus());
    } catch {
      setAuthStatus(DEFAULT_AUTH_STATUS);
    }
  }, []);

  useEffect(() => {
    void refreshAuthStatus();
    const onFocus = () => {
      void refreshAuthStatus();
      setGnbRefreshCount(c => c + 1);
    };
    window.addEventListener('focus', onFocus);
    const unsubscribeAuthChanged = window.electronAPI?.ai?.onAuthChanged?.(payload => {
      void refreshAuthStatus();
      if (!payload?.provider || payload.provider === 'GNB') {
        setGnbRefreshCount(c => c + 1);
      }
    });
    return () => {
      window.removeEventListener('focus', onFocus);
      unsubscribeAuthChanged?.();
    };
  }, [refreshAuthStatus]);

  const startLogin = useCallback(async (
    name: AiChatProviderName,
    event: ReactMouseEvent<HTMLAnchorElement>,
  ) => {
    const login = window.electronAPI?.ai?.login;
    if (!login) return; // Web版では href の認証ページをそのまま開く
    event.preventDefault();
    try {
      await login(name);
      await refreshAuthStatus();
      if (name === 'GNB') {
        setGnbRefreshCount(c => c + 1);
      }
    } catch {
      window.open(LOGIN_URLS[name], '_blank', 'noopener,noreferrer');
    }
  }, [refreshAuthStatus]);

  return (
    <div className="tt-ai-models">
      {PROVIDERS.map(p => (
        <ProviderModels
          key={p.name}
          name={p.name}
          label={p.label}
          auth={authStatus[p.name]}
          onLogin={startLogin}
          refreshCount={p.name === 'GNB' ? gnbRefreshCount : 0}
        />
      ))}
    </div>
  );
}
