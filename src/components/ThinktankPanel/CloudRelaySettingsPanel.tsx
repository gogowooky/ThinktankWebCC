/**
 * src/components/ThinktankPanel/CloudRelaySettingsPanel.tsx
 * Google Drive 正本接続・オフライン全文検索キャッシュ同期・Firebase E2EE 中継設定パネル。
 * Thinktank パネルの明るい地色（--thinktank-area-bg / --thinktank-content-bg）と
 * 基礎色（--thinktank-base）に合わせた高コントラスト・高視認性の配色を使用する。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { StorageManager } from '../../services/storage/StorageManager';
import { GoogleAuthService } from '../../platform/web/GoogleAuthService';
import { FirestoreRelayClient } from '../../platform/web/FirestoreRelayClient';
import { FirebaseAuthService } from '../../platform/web/FirebaseAuthService';
import { TTModels } from '../../models/TTModels';

const TEXT_MAIN = 'color-mix(in srgb, var(--thinktank-base, #1d618f) 30%, #16161f)';
const TEXT_MUTED = 'var(--text-muted, #565f89)';
const CARD_BG = 'var(--thinktank-content-bg, #ffffff)';
const SUB_CARD_BG = 'var(--thinktank-tint-weak, #f2f7fa)';
const BORDER_COLOR = 'var(--thinktank-border, rgba(29, 97, 143, 0.28))';
const ACCENT_BG = 'var(--thinktank-ribbon-bg, #1d618f)';
const ACCENT_FG = 'rgb(var(--thinktank-on-ribbon-rgb, 255 255 255) / 0.95)';

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

const primaryBtnStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
  fontWeight: 600,
  borderRadius: '4px',
  border: `1px solid ${ACCENT_BG}`,
  backgroundColor: ACCENT_BG,
  color: ACCENT_FG,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const secondaryBtnStyle: React.CSSProperties = {
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

export const CloudRelaySettingsPanel: React.FC = () => {
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);
  const [isOpen, setIsOpen] = useState(true);

  const [webProvider, setWebProvider] = useState<'drive' | 'local'>(
    StorageManager.instance.webProvider,
  );

  // Google Drive Auth 設定
  const initialDriveCfg = GoogleAuthService.getConfig();
  const [googleClientId, setGoogleClientId] = useState(initialDriveCfg.clientId);
  const [googleAccessToken, setGoogleAccessToken] = useState(initialDriveCfg.accessToken);
  const [driveRootFolderId, setDriveRootFolderId] = useState(initialDriveCfg.driveRootFolderId);

  // キャッシュ統計
  const [cacheStats, setCacheStats] = useState<{
    metaCount: number;
    bodyCount: number;
    lastBodySyncAt: string | null;
    bodySyncInProgress: boolean;
  }>({
    metaCount: 0,
    bodyCount: 0,
    lastBodySyncAt: null,
    bodySyncInProgress: false,
  });

  // Firebase E2EE 中継設定
  const initialRelayCfg = FirestoreRelayClient.getConfig();
  const [firebaseProjectId, setFirebaseProjectId] = useState(initialRelayCfg.firebaseProjectId);
  const [firebaseUser, setFirebaseUser] = useState(FirebaseAuthService.getCurrentUser());
  const [targetDeviceId, setTargetDeviceId] = useState(initialRelayCfg.targetDeviceId);
  const [pairingSecret, setPairingSecret] = useState(initialRelayCfg.pairingSecret);

  // PC版 Relay Host ステータス
  const [pcRelayStatus, setPcRelayStatus] = useState<{
    enabled: boolean;
    deviceId: string;
    deviceName: string;
    pairingSecret: string;
    lastHeartbeatAt: string | null;
  } | null>(null);

  // Web版から見たローカル中継サーバ (/api/health) の稼働状態
  const [localServerInfo, setLocalServerInfo] = useState<{
    mode?: string;
    vaultDir?: string;
    deviceId?: string;
  } | null>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStats = useCallback(async () => {
    const driveBackend = StorageManager.instance.getDriveBackend();
    if (driveBackend) {
      const st = await driveBackend.getCacheStats();
      setCacheStats(st);
    }
    if (!FirebaseAuthService.getCurrentUser()) {
      const synced = await FirebaseAuthService.syncFromLocalRelayIfAvailable();
      if (synced) {
        setFirebaseUser({ uid: synced.uid, email: synced.email });
      }
    }
    if (typeof window !== 'undefined' && window.electronAPI?.relay?.getStatus) {
      try {
        const st = await window.electronAPI.relay.getStatus();
        setPcRelayStatus(st);
      } catch {
        // ignore
      }
    } else {
      try {
        let res = await fetch('/api/health');
        const ct = res.headers?.get?.('content-type') || '';
        if (!res.ok || ct.includes('text/html')) {
          res = await fetch('http://localhost:8080/api/health');
        }
        if (res.ok && !(res.headers?.get?.('content-type') || '').includes('text/html')) {
          const info = (await res.json()) as {
            mode?: string;
            vaultDir?: string;
            deviceId?: string;
          };
          setLocalServerInfo(info);
        }
      } catch {
        setLocalServerInfo(null);
      }
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats, webProvider]);

  const handleProviderChange = async (next: 'drive' | 'local') => {
    StorageManager.instance.setWebProvider(next);
    setWebProvider(next);
    setStatusMessage(
      next === 'drive'
        ? 'データ接続先を「Google Drive API 直接接続 + IndexedDB キャッシュ」に切り替えました。'
        : 'データ接続先を「ローカル中継サーバ（PC内 Vault フォルダ & AI CLI）」に切り替えました。',
    );
    try {
      await TTModels.Instance.Vault.LoadCache();
      await refreshStats();
    } catch {
      // ignore if token not set yet
    }
  };

  const handleSaveDriveSettings = async () => {
    GoogleAuthService.saveConfig({
      clientId: googleClientId,
      accessToken: googleAccessToken,
      driveRootFolderId,
    });
    setStatusMessage('Google Drive 接続設定を保存しました。');
    if (webProvider === 'drive' && GoogleAuthService.hasValidToken() && driveRootFolderId) {
      setBusy(true);
      try {
        await TTModels.Instance.Vault.LoadCache();
        await refreshStats();
        setStatusMessage('Google Drive から索引を読み込みました。');
      } catch (e) {
        setStatusMessage(`読み込みエラー: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
    }
  };

  const handleOAuthLogin = async () => {
    const effectiveClientId =
      googleClientId.trim() ||
      '699735546730-9td02a2p0hj5jj9srvqr9m48fhd0qc8h.apps.googleusercontent.com';
    setGoogleClientId(effectiveClientId);
    GoogleAuthService.saveConfig({ clientId: effectiveClientId });
    setBusy(true);
    setStatusMessage('Google ログインウィンドウを開いています... ポップアップでログインと権限を許可してください。');
    try {
      const cfg = await GoogleAuthService.startBrowserOAuthFlow();
      setGoogleAccessToken(cfg.accessToken);
      setStatusMessage('Google アクセストークンを取得しました！ Drive 設定を保存中...');
      try {
        await FirebaseAuthService.signInWithGoogleToken();
        setFirebaseUser(FirebaseAuthService.getCurrentUser());
      } catch (e) {
        setStatusMessage(`Firebase ログイン失敗: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!cfg.driveRootFolderId && !driveRootFolderId) {
        try {
          const folderId = await GoogleAuthService.autoDetectThinktankFolder('Thinktank');
          setDriveRootFolderId(folderId);
          setStatusMessage(
            `Google ログイン成功！「Thinktank」フォルダ (${folderId}) を自動検出して設定しました。`,
          );
        } catch {
          setStatusMessage('Google ログイン成功！「Drive ルートフォルダID」を入力して「Drive設定を保存」を押してください。');
        }
      }
      if (webProvider === 'drive') {
        await TTModels.Instance.Vault.LoadCache();
        await refreshStats();
      }
    } catch (e) {
      setStatusMessage(`Google ログイン失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAutoDetectFolder = async () => {
    if (!googleAccessToken.trim()) {
      setStatusMessage('先に「Google でログイン」ボタンを押してアクセストークンを取得してください。');
      return;
    }
    GoogleAuthService.saveConfig({ accessToken: googleAccessToken });
    setBusy(true);
    setStatusMessage('Google Drive 内の「Thinktank」フォルダを検索中...');
    try {
      const folderId = await GoogleAuthService.autoDetectThinktankFolder('Thinktank');
      setDriveRootFolderId(folderId);
      setStatusMessage(`Drive 上の「Thinktank」フォルダを自動検出しました (ID: ${folderId})。「Drive設定を保存」を押してください。`);
    } catch (e) {
      setStatusMessage(`フォルダ自動検出エラー: ${e instanceof Error ? e.message : String(e)}。Google ドライブの URL からフォルダIDをコピーして直接貼り付けてください。`);
    } finally {
      setBusy(false);
    }
  };

  const handleSyncBodyPackNow = async () => {
    const driveBackend = StorageManager.instance.getDriveBackend();
    if (!driveBackend) {
      setStatusMessage('先に「Google Drive API 直接接続」に切り替えてください。');
      return;
    }
    setBusy(true);
    setStatusMessage('索引シャードと全文検索用本文パック (body-pack) を同期中...');
    try {
      await TTModels.Instance.Vault.LoadCache();
      const count = await driveBackend.syncBodyPacksInBackground(true);
      await refreshStats();
      setStatusMessage(
        `同期完了：全文検索用の本文キャッシュ ${count} 件を IndexedDB に格納しました。`,
      );
    } catch (e) {
      setStatusMessage(`本文キャッシュ同期エラー: ${e instanceof Error ? e.message : String(e)}`);
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
    setStatusMessage('Firebase E2EE 中継設定を保存しました。');
  };

  const handleTogglePcRelay = async (nextEnabled: boolean) => {
    if (!window.electronAPI?.relay?.configure) return;
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
          ? `このPCを中継役ホスト（Device ID: ${st.deviceId}）として有効化しました。`
          : '中継役ホストを停止しました。',
      );
    } catch (e) {
      setStatusMessage(`中継ホスト切替エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tt-settings-section" style={{ color: TEXT_MAIN }}>
      <div
        className="tt-settings-section__header"
        onClick={() => setIsOpen((v) => !v)}
      >
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <h2 className="tt-settings-section__title">
          データ接続先・Google Drive API・Firebase E2EE 中継
        </h2>
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
                border: `1px solid ${
                  statusMessage.includes('エラー') || statusMessage.includes('失敗')
                    ? '#ef4444'
                    : statusMessage.includes('完了') || statusMessage.includes('取得') || statusMessage.includes('成功')
                      ? '#22c55e'
                      : '#3b82f6'
                }`,
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

          {!isElectron && (
            <div
              style={{
                padding: '10px',
                borderRadius: '6px',
                border: `1px solid ${BORDER_COLOR}`,
                backgroundColor: CARD_BG,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                  color: TEXT_MAIN,
                  marginBottom: '6px',
                }}
              >
                1. Web版 データ接続先（ストレージプロバイダ）
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleProviderChange('local')}
                  style={
                    webProvider === 'local'
                      ? primaryBtnStyle
                      : secondaryBtnStyle
                  }
                >
                  {webProvider === 'local' ? '● ' : '○ '}
                  ローカル中継サーバ（PC内 Vault フォルダ &amp; AI CLI）
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleProviderChange('drive')}
                  style={
                    webProvider === 'drive'
                      ? primaryBtnStyle
                      : secondaryBtnStyle
                  }
                >
                  {webProvider === 'drive' ? '● ' : '○ '}
                  Google Drive API 直接接続 + IndexedDB キャッシュ（外出先・単体Web用）
                </button>
              </div>
              {webProvider === 'local' && localServerInfo?.vaultDir && (
                <div
                  style={{
                    marginTop: '6px',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    backgroundColor: SUB_CARD_BG,
                    fontSize: 'calc(10.5px * var(--tt-font-scale, 1))',
                    color: TEXT_MAIN,
                  }}
                >
                  接続中 Vault: <code>{localServerInfo.vaultDir}</code>
                  {localServerInfo.deviceId ? ` (Device: ${localServerInfo.deviceId})` : ''}
                </div>
              )}
            </div>
          )}

          {!isElectron && (
            <div
              style={{
                padding: '10px',
                borderRadius: '6px',
                border: `1px solid ${BORDER_COLOR}`,
                backgroundColor: CARD_BG,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                  color: TEXT_MAIN,
                }}
              >
                2. Google Drive API 接続 &amp; オフライン高速全文検索キャッシュ
              </div>

              <label style={{ fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MUTED }}>
                Google OAuth Client ID
                <input
                  type="text"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                  placeholder="xxxx.apps.googleusercontent.com"
                  style={inputStyle}
                />
              </label>

              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                <label
                  style={{
                    fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                    color: TEXT_MUTED,
                    flex: 1,
                  }}
                >
                  Access Token（ログインで自動入力、または手動貼付）
                  <input
                    type="password"
                    value={googleAccessToken}
                    onChange={(e) => setGoogleAccessToken(e.target.value)}
                    placeholder="ya29.a0..."
                    style={inputStyle}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleOAuthLogin()}
                  style={primaryBtnStyle}
                >
                  Google でログイン
                </button>
              </div>

              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                <label
                  style={{
                    fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                    color: TEXT_MUTED,
                    flex: 1,
                  }}
                >
                  Drive ルートフォルダID（Thinktank フォルダ）
                  <input
                    type="text"
                    value={driveRootFolderId}
                    onChange={(e) => setDriveRootFolderId(e.target.value)}
                    placeholder="1AbCdEfGhIjKlMnOpQrStUvWxYz"
                    style={inputStyle}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAutoDetectFolder()}
                  style={secondaryBtnStyle}
                >
                  「Thinktank」自動検索
                </button>
              </div>

              <div
                style={{
                  marginTop: '2px',
                  padding: '8px',
                  borderRadius: '4px',
                  backgroundColor: SUB_CARD_BG,
                  border: `1px solid ${BORDER_COLOR}`,
                  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                  color: TEXT_MAIN,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '6px',
                }}
              >
                <span>
                  IndexedDB キャッシュ: メタデータ <strong>{cacheStats.metaCount}</strong> 件 / 本文{' '}
                  <strong>{cacheStats.bodyCount}</strong> 件
                  {cacheStats.lastBodySyncAt
                    ? ` (最終同期: ${cacheStats.lastBodySyncAt.slice(0, 19).replace('T', ' ')})`
                    : ''}
                </span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSaveDriveSettings()}
                    style={primaryBtnStyle}
                  >
                    Drive 設定を保存
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSyncBodyPackNow()}
                    style={secondaryBtnStyle}
                  >
                    今すぐ索引・本文キャッシュを同期
                  </button>
                </div>
              </div>
            </div>
          )}

          <div
            style={{
              padding: '10px',
              borderRadius: '6px',
              border: `1px solid ${BORDER_COLOR}`,
              backgroundColor: CARD_BG,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                color: TEXT_MAIN,
              }}
            >
              {isElectron
                ? 'PC版 中継役ホスト（Active Relay）& Firebase E2EE 設定'
                : '3. Firebase E2EE 中継設定（Web版から自宅PCのAI CLIを呼び出す設定）'}
            </div>

            {isElectron && pcRelayStatus && (
              <div
                style={{
                  padding: '8px',
                  borderRadius: '4px',
                  backgroundColor: SUB_CARD_BG,
                  border: `1px solid ${BORDER_COLOR}`,
                  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                  color: TEXT_MAIN,
                }}
              >
                <div>
                  このPCの Device ID: <code>{pcRelayStatus.deviceId}</code> (
                  {pcRelayStatus.deviceName})
                </div>
                <div>
                  ペアリングシークレット: <code>{pcRelayStatus.pairingSecret}</code>
                </div>
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleTogglePcRelay(!pcRelayStatus.enabled)}
                    style={pcRelayStatus.enabled ? secondaryBtnStyle : primaryBtnStyle}
                  >
                    {pcRelayStatus.enabled
                      ? '中継役ホストを停止する'
                      : 'このPCを中継役ホストとして開始する'}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <label
                style={{
                  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                  color: TEXT_MUTED,
                  flex: '1 1 180px',
                }}
              >
                Firebase Project ID
                <input
                  type="text"
                  value={firebaseProjectId}
                  onChange={(e) => setFirebaseProjectId(e.target.value)}
                  placeholder="your-firebase-project-id"
                  style={inputStyle}
                />
              </label>
            </div>

            {!isElectron && (
              <div
                style={{
                  padding: '8px',
                  borderRadius: '4px',
                  backgroundColor: SUB_CARD_BG,
                  border: `1px solid ${BORDER_COLOR}`,
                  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                  color: TEXT_MAIN,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '6px',
                }}
              >
                <span>
                  Firebase ログイン:{' '}
                  {firebaseUser ? (
                    <>
                      <strong>{firebaseUser.email || '(メール不明)'}</strong> (UID:{' '}
                      <code>{firebaseUser.uid}</code>)
                    </>
                  ) : (
                    '未ログイン（中継役PCと同じ Google アカウントでログインしてください）'
                  )}
                </span>
                {firebaseUser ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      FirebaseAuthService.signOut();
                      setFirebaseUser(null);
                      setStatusMessage('Firebase からログアウトしました。');
                    }}
                    style={secondaryBtnStyle}
                  >
                    ログアウト
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleOAuthLogin()}
                    style={primaryBtnStyle}
                  >
                    Google でログイン
                  </button>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <label
                style={{
                  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                  color: TEXT_MUTED,
                  flex: '1 1 160px',
                }}
              >
                中継役PCの Device ID
                <input
                  type="text"
                  value={targetDeviceId}
                  onChange={(e) => setTargetDeviceId(e.target.value)}
                  placeholder="pc-xxxx"
                  style={inputStyle}
                />
              </label>
              <label
                style={{
                  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                  color: TEXT_MUTED,
                  flex: '1 1 180px',
                }}
              >
                E2EE 共通パスフレーズ（Pairing Secret）
                <input
                  type="password"
                  value={pairingSecret}
                  onChange={(e) => setPairingSecret(e.target.value)}
                  placeholder="PBKDF2 + AES-256-GCM 共通鍵"
                  style={inputStyle}
                />
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleSaveRelayConfig}
                style={primaryBtnStyle}
              >
                Firebase 中継設定を保存
              </button>
            </div>
          </div>

          {statusMessage && (
            <div
              role="status"
              style={{
                padding: '6px 10px',
                borderRadius: '4px',
                backgroundColor: SUB_CARD_BG,
                border: `1px solid ${ACCENT_BG}`,
                color: TEXT_MAIN,
                fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                fontWeight: 600,
              }}
            >
              {statusMessage}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
