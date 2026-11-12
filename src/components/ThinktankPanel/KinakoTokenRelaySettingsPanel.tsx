/**
 * src/components/ThinktankPanel/KinakoTokenRelaySettingsPanel.tsx
 * Thinktank > 設定 > きなこ連携（認証）
 * きなこ専用の Firebase アカウントでこのPCがサインインし、有効期限1時間の ID トークンを
 * Google Drive 経由で きなこ に渡す。きなこ側はパスワードを持たない。
 *
 * - パスワードはメインプロセスへ渡して使い切る。画面側には保存せず、送信後は入力欄を必ず空にする。
 * - トークンファイルは PC連携モードが ON の間だけ書き出される（OFF にすると消える）。
 * - Electron 版だけの機能。Web 版（relay の きなこ API が無い環境）では何も描画しない。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ElectronKinakoAuthStatus } from '../../services/storage/ElectronStorageBackend';
import { usePanelSectionsSetAll } from '../../hooks/usePanelSectionsSetAll';
import { BORDER_COLOR, CARD_BG, SUB_CARD_BG, TEXT_MAIN, TEXT_MUTED, inputStyle } from './settingsPanelStyles';

const cardStyle: React.CSSProperties = {
  padding: '10px',
  borderRadius: '6px',
  border: `1px solid ${BORDER_COLOR}`,
  backgroundColor: CARD_BG,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const subCardStyle: React.CSSProperties = {
  padding: '8px',
  borderRadius: '4px',
  backgroundColor: SUB_CARD_BG,
  border: `1px solid ${BORDER_COLOR}`,
  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
  color: TEXT_MAIN,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px' };

const labelStyle: React.CSSProperties = {
  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
  color: TEXT_MUTED,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const buttonStyle: React.CSSProperties = { fontSize: 'calc(11px * var(--tt-font-scale, 1))', flexShrink: 0 };

const fieldStyle: React.CSSProperties = { ...inputStyle, marginTop: 0, flex: 1, minWidth: 0 };

function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  // Electron は IPC の例外メッセージに "Error invoking remote method ..." を付けるので、本文だけ見せる
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

export const KinakoTokenRelaySettingsPanel: React.FC = () => {
  const relay = typeof window !== 'undefined' ? window.electronAPI?.relay : undefined;
  const getStatus = relay?.getKinakoAuthStatus;
  const setPassword = relay?.setKinakoPassword;
  const signOut = relay?.signOutKinako;

  const [isOpen, setIsOpen] = useState(true);
  usePanelSectionsSetAll('thinktank', [setIsOpen]);

  const [status, setStatus] = useState<ElectronKinakoAuthStatus | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!getStatus) return;
    try {
      setStatus(await getStatus());
    } catch (e) {
      setMessage({ text: `状態を取得できませんでした: ${errorText(e)}`, isError: true });
    }
  }, [getStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 有効期限はメイン側の更新で進むので、開いている間だけ追いかける
  useEffect(() => {
    if (!isOpen || !getStatus) return;
    const timer = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(timer);
  }, [isOpen, getStatus, refresh]);

  if (!getStatus || !setPassword || !signOut) return null;

  const localMode = Boolean(status?.localMode);
  const locked = busy || localMode || !status;
  const connected = Boolean(status?.connected);

  const handleConnect = async () => {
    const password = passwordInput;
    // 成否にかかわらず、入力したパスワードを画面に残さない
    setPasswordInput('');
    if (!password) {
      setMessage({ text: 'パスワードを入力してください。', isError: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const st = await setPassword(password);
      setStatus(st);
      setMessage({ text: 'きなこ専用アカウントに接続しました。', isError: false });
    } catch (e) {
      setMessage({ text: `接続できませんでした: ${errorText(e)}`, isError: true });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('きなこ連携（認証）を切断します。トークンファイルを削除し、きなこ は Firestore に接続できなくなります。よろしいですか？')) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      setStatus(await signOut());
      setMessage({ text: '切断しました。', isError: false });
    } catch (e) {
      setMessage({ text: `切断できませんでした: ${errorText(e)}`, isError: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tt-settings-section" style={{ color: TEXT_MAIN }} aria-label="きなこ連携（認証）">
      <div className="tt-settings-section__header" onClick={() => setIsOpen((v) => !v)}>
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <h2 className="tt-settings-section__title">きなこ連携（認証）</h2>
      </div>

      {isOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
          {message && (
            <div
              role="status"
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: message.isError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                border: `1px solid ${message.isError ? '#ef4444' : '#22c55e'}`,
                color: TEXT_MAIN,
                fontSize: 'calc(11.5px * var(--tt-font-scale, 1))',
                fontWeight: 700,
                overflowWrap: 'anywhere',
              }}
            >
              {message.isError ? '⚠️' : '✅'} {message.text}
            </div>
          )}

          {localMode && (
            <div role="note" style={{ ...subCardStyle, color: TEXT_MUTED }}>
              ローカル運用モードでは Firebase に接続しないため、きなこ連携（認証）は使えません。
            </div>
          )}

          <div style={cardStyle}>
            <div style={subCardStyle} data-testid="kinako-auth-status">
              <div>
                状態:{' '}
                {connected ? <strong>接続済み</strong> : <span style={{ color: TEXT_MUTED }}>未接続</span>}
              </div>
              {status && <div>アカウント: <code style={{ wordBreak: 'break-all' }}>{status.email}</code></div>}
              {connected && status?.tokenExpiresAt && (
                <div>トークン有効期限: {new Date(status.tokenExpiresAt).toLocaleString()}</div>
              )}
              {connected && status && !status.relayEnabled && (
                <div style={{ color: TEXT_MUTED }}>
                  PC連携モードが OFF のため、トークンファイルは書き出していません。PC連携モードを ON にすると書き出します。
                </div>
              )}
              {status?.problem && <div style={{ color: '#b91c1c' }}>エラー: {status.problem}</div>}
            </div>

            <div style={rowStyle}>
              <label htmlFor="tt-kinako-password" style={labelStyle}>パスワード:</label>
              <input
                id="tt-kinako-password"
                type="password"
                autoComplete="off"
                value={passwordInput}
                disabled={locked}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleConnect();
                }}
                style={fieldStyle}
              />
              <button type="button" disabled={locked} onClick={() => void handleConnect()} style={buttonStyle}>
                接続
              </button>
              <button
                type="button"
                disabled={locked || !connected}
                onClick={() => void handleDisconnect()}
                style={buttonStyle}
              >
                切断
              </button>
            </div>
            <div style={{ fontSize: 'calc(10.5px * var(--tt-font-scale, 1))', color: TEXT_MUTED }}>
              パスワードは保存しません。このPCに残るのは更新用のトークンだけで、きなこ には有効期限1時間のトークンを Google Drive 経由で渡します。
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
