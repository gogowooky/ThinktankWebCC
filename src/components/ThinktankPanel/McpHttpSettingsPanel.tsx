/**
 * src/components/ThinktankPanel/McpHttpSettingsPanel.tsx
 * Thinktank > 設定 > MCP HTTPサーバー
 * きなこ（クラウド側 AI）が Tailscale 越しに接続する MCP の入口（POST /mcp）を、画面から ON/OFF し、
 * 接続用トークンを発行・再発行・失効する。
 *
 * - 既定は OFF。ローカル運用モードでは操作できず、サーバーも起動しない（main 側でも同じ判定をしている）。
 * - トークンの平文は発行した直後の1回だけここに表示する。保存されるのはハッシュだけで、後から見ることはできない。
 * - Electron 版だけの機能。Web 版（mcpHttp が無い環境）では何も描画しない。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, KeyRound, RefreshCw, Save, Trash2 } from 'lucide-react';
import type {
  ElectronMcpHttpIssuedToken,
  ElectronMcpHttpStatus,
} from '../../services/storage/ElectronStorageBackend';
import { usePanelSectionsSetAll } from '../../hooks/usePanelSectionsSetAll';
import { BORDER_COLOR, CARD_BG, SUB_CARD_BG, TEXT_MAIN, TEXT_MUTED, inputStyle } from './settingsPanelStyles';

const DEFAULT_TOKEN_LABEL = 'kinako';

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

const fieldStyle: React.CSSProperties = { ...inputStyle, marginTop: 0, flex: 1, minWidth: 0 };

const KIND_LABEL: Record<string, string> = {
  loopback: 'localhost のみ',
  tailscale: 'Tailscale',
  other: 'その他',
};

function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  // Electron は IPC の例外メッセージに "Error invoking remote method ..." を付けるので、本文だけ見せる
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

export const McpHttpSettingsPanel: React.FC = () => {
  const api = typeof window !== 'undefined' ? window.electronAPI?.mcpHttp : undefined;
  const [isOpen, setIsOpen] = useState(true);
  usePanelSectionsSetAll('thinktank', [setIsOpen]);

  const [status, setStatus] = useState<ElectronMcpHttpStatus | null>(null);
  const [portInput, setPortInput] = useState('');
  const portDirty = useRef(false);
  const [labelInput, setLabelInput] = useState(DEFAULT_TOKEN_LABEL);
  const [issued, setIssued] = useState<ElectronMcpHttpIssuedToken | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const applyStatus = useCallback((st: ElectronMcpHttpStatus) => {
    setStatus(st);
    // 入力途中のポート番号は、定期更新で上書きしない
    if (!portDirty.current) setPortInput(String(st.port));
  }, []);

  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      applyStatus(await api.getStatus());
    } catch (e) {
      setMessage({ text: `状態を取得できませんでした: ${errorText(e)}`, isError: true });
    }
  }, [api, applyStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isOpen || !api) return;
    const timer = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(timer);
  }, [isOpen, api, refresh]);

  // 画面を閉じる・畳むと平文は消える（再表示はできない）
  useEffect(() => {
    if (!isOpen) setIssued(null);
  }, [isOpen]);

  if (!api) return null;

  const localMode = Boolean(status?.localMode);
  const locked = busy || localMode || !status;
  const activeTokens = (status?.tokens ?? []).filter((t) => !t.revokedAt);
  const revokedTokens = (status?.tokens ?? []).filter((t) => t.revokedAt);
  const tailscaleAddresses = (status?.addresses ?? []).filter((a) => a.kind === 'tailscale');

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage({ text: `エラー: ${errorText(e)}`, isError: true });
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = (next: boolean) =>
    run(async () => {
      const st = await api.setEnabled(next);
      applyStatus(st);
      if (!next) {
        setMessage({ text: 'MCP HTTPサーバーを停止しました。', isError: false });
      } else if (st.listening) {
        setMessage({ text: `MCP HTTPサーバーを起動しました（${st.endpointUrl}）。`, isError: false });
      } else {
        setMessage({ text: `起動できませんでした: ${st.lastError || '理由不明'}`, isError: true });
      }
    });

  const handleBindAddress = (address: string) =>
    run(async () => {
      applyStatus(await api.configure({ bindAddress: address }));
      setMessage({ text: `待ち受けアドレスを ${address} にしました。`, isError: false });
    });

  const handleSavePort = () =>
    run(async () => {
      const port = Number(portInput);
      const st = await api.configure({ port });
      portDirty.current = false;
      applyStatus(st);
      setMessage({ text: `ポートを ${st.port} にしました。`, isError: false });
    });

  const handleIssue = (reissue: boolean) =>
    run(async () => {
      if (
        reissue &&
        activeTokens.length > 0 &&
        !window.confirm('有効なトークンをすべて失効させ、新しいトークンを発行します。きなこ側のトークンは使えなくなります。よろしいですか？')
      ) {
        return;
      }
      const label = labelInput.trim() || DEFAULT_TOKEN_LABEL;
      const token = reissue ? await api.reissueToken({ label }) : await api.createToken({ label });
      setIssued(token);
      await refresh();
      setMessage({
        text: reissue ? 'トークンを再発行しました。以前のトークンは失効しています。' : 'トークンを発行しました。',
        isError: false,
      });
    });

  const handleRevoke = (id: string) =>
    run(async () => {
      if (!window.confirm('このトークンを失効させます。このトークンで接続しているクライアントは使えなくなります。よろしいですか？')) return;
      applyStatus(await api.revokeToken(id));
      if (issued?.id === id) setIssued(null);
      setMessage({ text: 'トークンを失効しました。', isError: false });
    });

  const handleCopy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.token);
      setMessage({ text: 'トークンをクリップボードにコピーしました。', isError: false });
    } catch {
      setMessage({ text: 'コピーできませんでした。表示されたトークンを手で選択してコピーしてください。', isError: true });
    }
  };

  return (
    <section className="tt-settings-section" style={{ color: TEXT_MAIN }} aria-label="MCP HTTPサーバー">
      <div className="tt-settings-section__header" onClick={() => setIsOpen((v) => !v)}>
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <h2 className="tt-settings-section__title">MCP HTTPサーバー</h2>
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
              ローカル運用モードでは、ネットワークに公開しないため MCP HTTPサーバーは使えません（起動しません）。
            </div>
          )}

          {/* 1. サーバー */}
          <div style={cardStyle}>
            <div style={{ fontWeight: 700, fontSize: 'calc(11px * var(--tt-font-scale, 1))' }}>1. サーバー</div>
            <label style={{ ...rowStyle, cursor: locked ? 'default' : 'pointer', fontSize: 'calc(11px * var(--tt-font-scale, 1))' }}>
              きなこ向けに MCP を公開する
              <input
                type="checkbox"
                role="switch"
                aria-label="MCP HTTPサーバー"
                checked={Boolean(status?.enabled) && !localMode}
                disabled={locked}
                onChange={(e) => void handleToggle(e.target.checked)}
              />
            </label>

            <div style={rowStyle}>
              <label htmlFor="tt-mcp-http-bind" style={labelStyle}>待ち受けアドレス:</label>
              <select
                id="tt-mcp-http-bind"
                value={status?.bindAddress ?? '127.0.0.1'}
                disabled={locked}
                onChange={(e) => void handleBindAddress(e.target.value)}
                style={fieldStyle}
              >
                {(status?.addresses ?? []).map((a) => (
                  <option key={a.address} value={a.address}>
                    {a.address}（{KIND_LABEL[a.kind]}）
                  </option>
                ))}
                {status && !status.addresses.some((a) => a.address === status.bindAddress) && (
                  <option value={status.bindAddress}>
                    {status.bindAddress}（{KIND_LABEL[status.bindKind]}・現在このPCに見つかりません）
                  </option>
                )}
              </select>
            </div>
            <div style={rowStyle}>
              <label htmlFor="tt-mcp-http-port" style={labelStyle}>ポート:</label>
              <input
                id="tt-mcp-http-port"
                type="number"
                min={1024}
                max={65535}
                value={portInput}
                disabled={locked}
                onChange={(e) => {
                  portDirty.current = true;
                  setPortInput(e.target.value);
                }}
                style={fieldStyle}
              />
              <button
                type="button"
                className="tt-settings-icon-btn"
                disabled={locked || !portDirty.current}
                onClick={() => void handleSavePort()}
                data-tip="ポートを保存"
                data-tip-side="left"
                aria-label="ポートを保存"
              >
                <Save size={16} />
              </button>
            </div>

            <div style={subCardStyle}>
              <div>
                状態:{' '}
                {status?.listening ? (
                  <strong>待ち受け中</strong>
                ) : (
                  <span style={{ color: TEXT_MUTED }}>停止中</span>
                )}
              </div>
              {status?.listening && (
                <div>
                  接続先: <code style={{ wordBreak: 'break-all' }}>{status.endpointUrl}</code>（{KIND_LABEL[status.bindKind]}）
                </div>
              )}
              {status && <div>このPCの識別子: <code>{status.pcId}</code></div>}
              {status?.lastError && <div style={{ color: '#b91c1c' }}>エラー: {status.lastError}</div>}
              {status && !localMode && status.bindKind === 'loopback' && (
                <div style={{ color: TEXT_MUTED }}>
                  localhost のみの待ち受けです。きなこ（別端末）から接続するには、待ち受けアドレスに Tailscale のアドレスを選んでください。
                </div>
              )}
              {status && !localMode && tailscaleAddresses.length === 0 && (
                <div style={{ color: TEXT_MUTED }}>
                  このPCに Tailscale のアドレスが見つかりません。Tailscale が起動しているか確認してください。
                </div>
              )}
            </div>
          </div>

          {/* 2. トークン */}
          <div style={cardStyle}>
            <div style={{ fontWeight: 700, fontSize: 'calc(11px * var(--tt-font-scale, 1))' }}>2. このPC用トークン</div>
            <div style={{ fontSize: 'calc(10.5px * var(--tt-font-scale, 1))', color: TEXT_MUTED }}>
              トークンの平文は発行した直後の1回だけ表示されます。保存されるのはハッシュだけなので、後から見ることはできません。
            </div>

            {issued && (
              <div
                role="alert"
                style={{ ...subCardStyle, border: '1px solid #f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.12)' }}
              >
                <div style={{ fontWeight: 700 }}>発行したトークン（この画面を閉じると二度と表示されません）</div>
                <code
                  data-testid="mcp-http-issued-token"
                  style={{ wordBreak: 'break-all', userSelect: 'all', padding: '4px', backgroundColor: CARD_BG, borderRadius: '4px' }}
                >
                  {issued.token}
                </code>
                <div style={rowStyle}>
                  <button type="button" className="tt-settings-icon-btn" onClick={() => void handleCopy()} aria-label="トークンをコピー" data-tip="コピー">
                    <Copy size={16} />
                  </button>
                  <button type="button" onClick={() => setIssued(null)} style={{ fontSize: 'calc(11px * var(--tt-font-scale, 1))' }}>
                    コピーしたので閉じる
                  </button>
                </div>
              </div>
            )}

            <div style={rowStyle}>
              <label htmlFor="tt-mcp-http-token-label" style={labelStyle}>名前:</label>
              <input
                id="tt-mcp-http-token-label"
                type="text"
                value={labelInput}
                maxLength={80}
                disabled={locked}
                onChange={(e) => setLabelInput(e.target.value)}
                style={fieldStyle}
              />
              <button type="button" className="tt-settings-icon-btn" disabled={locked} onClick={() => void handleIssue(false)} aria-label="トークンを発行" data-tip="トークンを発行">
                <KeyRound size={16} />
              </button>
              <button type="button" className="tt-settings-icon-btn" disabled={locked} onClick={() => void handleIssue(true)} aria-label="トークンを再発行" data-tip="再発行（既存を失効）" data-tip-side="left">
                <RefreshCw size={16} />
              </button>
            </div>

            <div style={subCardStyle}>
              {activeTokens.length === 0 ? (
                <div style={{ color: TEXT_MUTED }}>有効なトークンはありません。</div>
              ) : (
                activeTokens.map((t) => (
                  <div key={t.id} style={{ ...rowStyle, justifyContent: 'space-between' }}>
                    <span style={{ overflowWrap: 'anywhere' }}>
                      <code>{t.id}</code> {t.label && `「${t.label}」`}
                      <span style={{ color: TEXT_MUTED }}> 発行: {new Date(t.createdAt).toLocaleString()}</span>
                    </span>
                    <button
                      type="button"
                      className="tt-settings-icon-btn"
                      disabled={locked}
                      onClick={() => void handleRevoke(t.id)}
                      aria-label={`トークン ${t.id} を失効`}
                      data-tip="失効"
                      data-tip-side="left"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
              {revokedTokens.length > 0 && (
                <div style={{ color: TEXT_MUTED }}>失効済み: {revokedTokens.length} 件</div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
