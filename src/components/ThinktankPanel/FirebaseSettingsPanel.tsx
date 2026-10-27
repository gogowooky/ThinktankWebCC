/**
 * src/components/ThinktankPanel/FirebaseSettingsPanel.tsx
 * Thinktank > 設定 > Firebase
 * 「1. Firebase設定」と「2. PC連携」のみを配置する。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Save, Unplug, PlugZap } from 'lucide-react';
import { FirestoreRelayClient } from '../../platform/web/FirestoreRelayClient';
import { FirebaseAuthService } from '../../platform/web/FirebaseAuthService';
import type { ElectronRelayStatus } from '../../services/storage/ElectronStorageBackend';
import { TTModels } from '../../models/TTModels';
import { usePanelSectionsSetAll } from '../../hooks/usePanelSectionsSetAll';

function loadWebPcLinkEnabled(): boolean {
  return FirestoreRelayClient.getConfig().enabled;
}

const TEXT_MAIN = 'color-mix(in srgb, var(--thinktank-base, #1d618f) 30%, #16161f)';
const TEXT_MUTED = 'var(--text-muted, #565f89)';
const CARD_BG = 'var(--thinktank-content-bg, #ffffff)';
const SUB_CARD_BG = 'var(--thinktank-tint-weak, #f2f7fa)';
const BORDER_COLOR = 'var(--thinktank-border, rgba(29, 97, 143, 0.28))';

const inputStyle: React.CSSProperties = {
  width: '100%',
  marginTop: '3px',
  padding: '5px 8px',
  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
  borderRadius: '4px',
  border: `1px solid ${BORDER_COLOR}`,
  backgroundColor: CARD_BG,
  color: TEXT_MAIN,
  boxSizing: 'border-box',
};

const inlineRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const inlineLabelStyle: React.CSSProperties = {
  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
  color: TEXT_MUTED,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const inlineInputStyle: React.CSSProperties = {
  ...inputStyle,
  marginTop: 0,
  flex: 1,
  minWidth: 0,
};

export const FirebaseSettingsPanel: React.FC = () => {
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);
  const [isOpen, setIsOpen] = useState(true);
  usePanelSectionsSetAll('thinktank', [setIsOpen]);
  const [webPcLinkEnabled, setWebPcLinkEnabled] = useState(loadWebPcLinkEnabled);

  // Firebase E2EE 中継設定
  const initialRelayCfg = FirestoreRelayClient.getConfig();
  const [firebaseProjectId, setFirebaseProjectId] = useState(initialRelayCfg.firebaseProjectId);
  const [firebaseUser, setFirebaseUser] = useState(FirebaseAuthService.getCurrentUser());
  const [targetDeviceId, setTargetDeviceId] = useState(initialRelayCfg.targetDeviceId);
  const [pairingSecret, setPairingSecret] = useState(initialRelayCfg.pairingSecret);

  // PC版 Relay Host ステータス
  const [pcRelayStatus, setPcRelayStatus] = useState<ElectronRelayStatus | null>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshConnectionStatus = useCallback(async () => {
    if (isElectron) {
      const synced = await FirebaseAuthService.syncFromElectronRelayIfAvailable();
      if (synced) {
        setFirebaseUser({ uid: synced.uid, email: synced.email });
      }
    }
    if (typeof window !== 'undefined' && window.electronAPI?.relay?.getStatus) {
      try {
        const st = await window.electronAPI.relay.getStatus();
        setPcRelayStatus(st);
        if (st.enabled) {
          await FirebaseAuthService.syncSessionToElectronRelay();
          setPcRelayStatus(await window.electronAPI.relay.getStatus());
        }
      } catch (e) {
        setStatusMessage(
          `Firebase 接続状態を確認できませんでした: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }, [isElectron]);

  useEffect(() => {
    void refreshConnectionStatus();
  }, [refreshConnectionStatus]);

  useEffect(() => {
    const getStatus = window.electronAPI?.relay?.getStatus;
    if (!isOpen || !getStatus) return;
    const timer = setInterval(() => {
      void getStatus().then(setPcRelayStatus).catch(() => {});
    }, 3_000); // クライアント要求の反映を素早く確認できるよう3秒間隔でポーリング
    return () => clearInterval(timer);
  }, [isOpen]);

  const handleElectronGoogleLogin = async (): Promise<ElectronRelayStatus | null> => {
    const signIn = window.electronAPI?.relay?.signInWithGoogle;
    if (!signIn) return null;
    setBusy(true);
    setStatusMessage('ブラウザで Google のログイン画面を開いています... ログインが終わったらこの画面に戻ってください。');
    try {
      const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
      const st = await signIn({ apiKey: env.VITE_FIREBASE_API_KEY || '', firebaseProjectId });
      setPcRelayStatus(st);
      const session = await FirebaseAuthService.syncFromElectronRelayIfAvailable();
      if (session) setFirebaseUser({ uid: session.uid, email: session.email });
      await TTModels.Instance?.Vault?.ReloadAll();
      setStatusMessage(`Think データ用 Firebase にログインしました（${st.firebaseEmail || 'メール不明'}）。`);
      return st;
    } catch (e) {
      setStatusMessage(`Google ログイン失敗: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleOAuthLogin = async (): Promise<boolean> => {
    if (window.electronAPI?.relay?.signInWithGoogle) {
      return Boolean(await handleElectronGoogleLogin());
    }
    setBusy(true);
    setStatusMessage('Think データ用 Firebase のログインウィンドウを開いています...');
    try {
      await FirebaseAuthService.signInWithGooglePopup();
      setFirebaseUser(FirebaseAuthService.getCurrentUser());
      await TTModels.Instance?.Vault?.ReloadAll();
      setStatusMessage('Think データ用 Firebase にログインしました。');
      return true;
    } catch (e) {
      setStatusMessage(`Firebase ログイン失敗: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRelayConfig = () => {
    FirestoreRelayClient.saveConfig({
      firebaseProjectId,
      targetDeviceId,
      pairingSecret,
    });
    setStatusMessage('接続先PCと暗号化キーを保存しました。');
  };

  const handleSaveFirebaseConfig = async () => {
    FirestoreRelayClient.saveConfig({ firebaseProjectId });
    if (window.electronAPI?.relay?.configure) {
      const st = await window.electronAPI.relay.configure({ firebaseProjectId });
      setPcRelayStatus(st);
    }
    setStatusMessage('Think データ用 Firebase の接続設定を保存しました。');
  };

  const handleTogglePcRelay = async (nextEnabled: boolean) => {
    if (!window.electronAPI?.relay?.configure) return;
    if (nextEnabled && !pcRelayStatus?.firebaseSignedIn) {
      const signedIn = await handleElectronGoogleLogin();
      if (!signedIn?.firebaseSignedIn) return;
    }
    setBusy(true);
    try {
      const st = await window.electronAPI.relay.configure({
        enabled: nextEnabled,
        ...(pairingSecret ? { pairingSecret } : {}),
        ...(firebaseProjectId ? { firebaseProjectId } : {}),
      });
      setPcRelayStatus(st);
      setStatusMessage(
        st.enabled
          ? `PC連携をONにしました。このPCがAI CLIの提供側です（Device ID: ${st.deviceId}）。`
          : 'PC連携をOFFにしました。Firebaseのデータログインは維持されます。',
      );
    } catch (e) {
      setStatusMessage(`中継ホスト切替エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleWebPcLink = async (nextEnabled: boolean) => {
    if (nextEnabled && !FirebaseAuthService.getCurrentUser()) {
      const signedIn = await handleOAuthLogin();
      if (!signedIn) return;
    }
    FirestoreRelayClient.saveConfig({ enabled: nextEnabled });
    setWebPcLinkEnabled(nextEnabled);
    setStatusMessage(
      nextEnabled
        ? 'PC連携をONにしました。接続先PCと暗号化キーを確認してください。'
        : 'PC連携をOFFにしました。Firebaseのデータログインは維持されます。',
    );
  };

  const pcLinkEnabled = isElectron ? Boolean(pcRelayStatus?.enabled) : webPcLinkEnabled;
  const signedIn = isElectron ? Boolean(pcRelayStatus?.firebaseSignedIn) : Boolean(firebaseUser);
  const signedInEmail = isElectron ? pcRelayStatus?.firebaseEmail : firebaseUser?.email;

  return (
    <section className="tt-settings-section" style={{ color: TEXT_MAIN }}>
      <div className="tt-settings-section__header" onClick={() => setIsOpen((v) => !v)}>
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <h2 className="tt-settings-section__title">Firebase</h2>
      </div>

      {isOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
          {statusMessage && (
            <div
              role="status"
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: statusMessage.includes('エラー') || statusMessage.includes('失敗')
                  ? 'rgba(239, 68, 68, 0.15)'
                  : statusMessage.includes('完了') || statusMessage.includes('取得') || statusMessage.includes('成功')
                    ? 'rgba(34, 197, 94, 0.15)'
                    : 'rgba(59, 130, 246, 0.15)',
                border: `1px solid ${statusMessage.includes('エラー') || statusMessage.includes('失敗') ? '#ef4444' : '#3b82f6'}`,
                color: TEXT_MAIN,
                fontSize: 'calc(11.5px * var(--tt-font-scale, 1))',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {busy ? '⏳' : statusMessage.includes('エラー') || statusMessage.includes('失敗') ? '⚠️' : '✅'}
              <span>{statusMessage}</span>
            </div>
          )}

          {/* 1. Firebase設定 */}
          <div style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${BORDER_COLOR}`, backgroundColor: CARD_BG, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontWeight: 700, fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MAIN }}>
              1. Firebase設定
            </div>
            <div style={inlineRowStyle}>
              <label htmlFor="tt-firebase-project-id" style={inlineLabelStyle}>Project ID:</label>
              <input id="tt-firebase-project-id" type="text" value={firebaseProjectId} onChange={(e) => setFirebaseProjectId(e.target.value)} placeholder="your-firebase-project-id" style={inlineInputStyle} />
              <button type="button" className="tt-settings-icon-btn" disabled={busy} onClick={() => void handleSaveFirebaseConfig()} data-tip="接続設定を保存" aria-label="接続設定を保存">
                <Save size={16} />
              </button>
            </div>
            <div style={{ padding: '8px', borderRadius: '4px', backgroundColor: SUB_CARD_BG, border: `1px solid ${BORDER_COLOR}`, fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MAIN, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
              <div style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div>
                  Firebaseログイン: {signedIn
                    ? <><strong>{signedInEmail || '(メール不明)'}</strong>{isElectron && '（PC版）'}</>
                    : '未ログイン'}
                </div>
                {signedIn && firebaseUser?.uid && (
                  <div>UID: <code>{firebaseUser.uid}</code></div>
                )}
              </div>
              {signedIn ? (
                <button
                  type="button"
                  className="tt-settings-icon-btn"
                  disabled={busy}
                  data-tip="ログアウト"
                  data-tip-side="left"
                  aria-label="ログアウト"
                  onClick={() => void (async () => {
                    await FirebaseAuthService.signOut();
                    setFirebaseUser(null);
                    if (!isElectron) {
                      FirestoreRelayClient.saveConfig({ enabled: false });
                      setWebPcLinkEnabled(false);
                    } else if (window.electronAPI?.relay?.getStatus) {
                      setPcRelayStatus(await window.electronAPI.relay.getStatus());
                    }
                    setStatusMessage('Firebaseからログアウトしました。PC連携も停止します。');
                  })()}
                >
                  <Unplug size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="tt-settings-icon-btn"
                  disabled={busy}
                  onClick={() => void handleOAuthLogin()}
                  data-tip={isElectron ? 'ブラウザでGoogleにログイン' : 'Googleでログイン'}
                  data-tip-side="left"
                  aria-label={isElectron ? 'ブラウザでGoogleにログイン' : 'Googleでログイン'}
                >
                  <PlugZap size={16} />
                </button>
              )}
            </div>
          </div>

          {/* 2. PC連携 */}
          <div style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${BORDER_COLOR}`, backgroundColor: CARD_BG, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontWeight: 700, fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MAIN }}>
              2. PC連携
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MAIN }}>
              {isElectron ? 'ホストとして連携する' : 'クライアントとして連携する'}
              <input
                type="checkbox"
                role="switch"
                aria-label="PC連携"
                checked={pcLinkEnabled}
                disabled={busy || (isElectron && !pcRelayStatus)}
                onChange={(e) => void (isElectron ? handleTogglePcRelay(e.target.checked) : handleToggleWebPcLink(e.target.checked))}
              />
            </label>

            {!pcLinkEnabled && (
              <div style={{ padding: '7px 8px', borderRadius: '4px', backgroundColor: SUB_CARD_BG, color: TEXT_MUTED, fontSize: 'calc(10.5px * var(--tt-font-scale, 1))' }}>
                通常利用ではOFFです。ThinkデータのFirestore同期は引き続き利用できます。
              </div>
            )}

            {/* PC版のときの情報提示枠 */}
            {isElectron && pcLinkEnabled && pcRelayStatus && (
              <div style={{ padding: '8px', borderRadius: '4px', backgroundColor: SUB_CARD_BG, border: `1px solid ${BORDER_COLOR}`, fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MAIN, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>Device ID: <code>{pcRelayStatus.deviceId}</code></div>
                <div>PC名: <code>{pcRelayStatus.deviceName}</code></div>
                <div>
                  ペアリングシークレット:<br />
                  <code style={{ wordBreak: 'break-all' }}>{pcRelayStatus.pairingSecret}</code>
                </div>
                <div>
                  接続状態: {pcRelayStatus.isAlive
                    ? `オンライン（最終接続: ${new Date(pcRelayStatus.lastHeartbeatAt).toLocaleString()}）`
                    : 'オフライン'}
                </div>
                <div>
                  Client Access: {pcRelayStatus.isProcessing ? (
                    <strong style={{ color: '#2563eb' }}>Requesting...</strong>
                  ) : (
                    <span style={{ color: TEXT_MUTED }}>Idle</span>
                  )}
                </div>
                {!pcRelayStatus.isAlive && pcRelayStatus.firestoreProblem && (
                  <div style={{ color: TEXT_MUTED }}>理由: {pcRelayStatus.firestoreProblem}</div>
                )}
              </div>
            )}

            {/* Web版のときの入力枠 */}
            {!isElectron && pcLinkEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={inlineRowStyle}>
                  <label htmlFor="tt-relay-device-id" style={inlineLabelStyle}>ホストPCのDevice ID:</label>
                  <input id="tt-relay-device-id" type="text" value={targetDeviceId} onChange={(e) => setTargetDeviceId(e.target.value)} placeholder="pc-xxxx" style={inlineInputStyle} />
                </div>
                {/* Pairing Secret: の右に入力欄があって、そのすぐ横に保存アイコンを設置し、1行で表示 */}
                <div style={inlineRowStyle}>
                  <label htmlFor="tt-relay-pairing-secret" style={inlineLabelStyle}>Pairing Secret:</label>
                  <input id="tt-relay-pairing-secret" type="password" value={pairingSecret} onChange={(e) => setPairingSecret(e.target.value)} placeholder="PBKDF2 + AES-256-GCM 共通鍵" style={inlineInputStyle} />
                  <button type="button" className="tt-settings-icon-btn" disabled={busy} onClick={handleSaveRelayConfig} data-tip="PC連携設定を保存" data-tip-side="left" aria-label="PC連携設定を保存">
                    <Save size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
