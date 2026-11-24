/**
 * Thinktank > 設定 > Google Workspace 連携（GAS）
 * Gmail（読み取り）・Google ドライブ（読み書き）・Google カレンダー（読み取り）・Google Tasks（読み取り）を
 * Thinktank MCP 経由で全 AI CLI（Claude / ChatGPT / Gemini）から利用するための GAS 設定。
 * 手順は docs/261123/GAS_GoogleWorkspace連携.md。
 */

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { usePanelSectionsSetAll } from '../../hooks/usePanelSectionsSetAll';
import { isValidGasUrl } from '../../services/linkTitleService';
import { BORDER_COLOR, CARD_BG, TEXT_MAIN, TEXT_MUTED, inputStyle } from './settingsPanelStyles';

interface WorkspaceGasApi {
  getConfig: () => Promise<{ url: string; token: string }>;
  saveConfig: (partial: { url: string; token: string }) => Promise<{ url: string; token: string }>;
  test: (partial: { url: string; token: string }) => Promise<{ ok: boolean; message: string }>;
}

function getWorkspaceGasApi(): WorkspaceGasApi | undefined {
  return (window as unknown as { electronAPI?: { workspaceGas?: WorkspaceGasApi } }).electronAPI?.workspaceGas;
}

const buttonStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
  fontWeight: 600,
  borderRadius: '4px',
  border: `1px solid ${BORDER_COLOR}`,
  backgroundColor: CARD_BG,
  color: TEXT_MAIN,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const labelStyle: React.CSSProperties = { fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MUTED };

export const GoogleWorkspaceGasSettingsPanel: React.FC = () => {
  const api = getWorkspaceGasApi();
  const [isOpen, setIsOpen] = useState(true);
  usePanelSectionsSetAll('thinktank', [setIsOpen]);

  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    void api.getConfig().then(cfg => {
      if (cancelled) return;
      setUrl(cfg.url || '');
      setToken(cfg.token || '');
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [api]);

  if (!api) return null;

  const handleSave = async () => {
    if (url.trim() && !isValidGasUrl(url)) {
      setStatus({ ok: false, message: 'URLは https://script.google.com/macros/s/…/exec の形で入力してください。' });
      return;
    }
    setIsBusy(true);
    try {
      await api.saveConfig({ url: url.trim(), token: token.trim() });
      setStatus({
        ok: true,
        message: url.trim() ? '保存しました。AI ハーネスから Gmail・Drive・カレンダー・ToDo を参照できます。' : '保存しました（連携は無効です）。',
      });
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsBusy(false);
    }
  };

  const handleTest = async () => {
    setIsBusy(true);
    setStatus({ ok: true, message: '接続を確かめています...' });
    try {
      setStatus(await api.test({ url: url.trim(), token: token.trim() }));
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="tt-settings-section" style={{ color: TEXT_MAIN }}>
      <div className="tt-settings-section__header" onClick={() => setIsOpen(v => !v)}>
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <h2 className="tt-settings-section__title">Google Workspace 連携（GAS）</h2>
      </div>

      {isOpen && (
        <div style={{ padding: '10px', marginTop: '4px', borderRadius: '6px', border: `1px solid ${BORDER_COLOR}`, backgroundColor: CARD_BG, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ color: TEXT_MUTED, fontSize: 'calc(10.5px * var(--tt-font-scale, 1))', lineHeight: 1.45 }}>
            AI ハーネスから Gmail（読取）・Google ドライブ（読み書き）・カレンダー（読取）・ToDo（読取）を使うための GAS 設定です。
            スクリプトと導入手順は <code>scripts/gas/googleWorkspace.gs</code> と <code>docs/261123/GAS_GoogleWorkspace連携.md</code> にあります。
          </div>
          <label style={labelStyle}>
            ウェブアプリの URL
            <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            合言葉（setupToken の実行ログに出た値）
            <input type="password" value={token} onChange={e => setToken(e.target.value)} style={inputStyle} />
          </label>
          {status && (
            <div role="status" style={{ fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: status.ok ? TEXT_MAIN : '#dc2626' }}>
              {status.message}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
            <button type="button" disabled={isBusy} onClick={() => void handleTest()} style={buttonStyle}>接続テスト</button>
            <button type="button" disabled={isBusy} onClick={() => void handleSave()} style={buttonStyle}>保存</button>
          </div>
        </div>
      )}
    </section>
  );
};
