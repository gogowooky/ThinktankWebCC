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

  const [webProvider, setWebProvider] = useState<'drive' | 'bigquery'>(
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
  const [firebaseUid, setFirebaseUid] = useState(initialRelayCfg.firebaseUid);
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

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStats = useCallback(async () => {
    const driveBackend = StorageManager.instance.getDriveBackend();
    if (driveBackend) {
      const st = await driveBackend.getCacheStats();
      setCacheStats(st);
    }
    if (typeof window !== 'undefined' && window.electronAPI?.relay?.getStatus) {
      try {
        const st = await window.electronAPI.relay.getStatus();
        setPcRelayStatus(st);
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats, webProvider]);

  const handleProviderChange = async (next: 'drive' | 'bigquery') => {
    StorageManager.instance.setWebProvider(next);
    setWebProvider(next);
    setStatusMessage(
      next === 'drive'
        ? 'データ接続先を「Google Drive 正本 + IndexedDB 高速キャッシュ」に切り替えました。'
        : 'データ接続先を「BigQuery (Express 経由)」に切り替えました。',
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
    GoogleAuthService.saveConfig({ clientId: googleClientId });
    setBusy(true);
    setStatusMessage('Google ログインウィンドウを開いています...');
    try {
      const cfg = await GoogleAuthService.startBrowserOAuthFlow();
      setGoogleAccessToken(cfg.accessToken);
      setStatusMessage('Google アクセストークンを取得しました。');
      if (!cfg.driveRootFolderId) {
        try {
          const folderId = await GoogleAuthService.autoDetectThinktankFolder('Thinktank');
          setDriveRootFolderId(folderId);
          setStatusMessage(
            `Google ログイン完了 &「Thinktank」フォルダ (${folderId}) を自動検出しました。`,
          );
        } catch {
          // フォルダ自動検出失敗時は手動入力を促す
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
    GoogleAuthService.saveConfig({ accessToken: googleAccessToken });
    setBusy(true);
    try {
      const folderId = await GoogleAuthService.autoDetectThinktankFolder('Thinktank');
      setDriveRootFolderId(folderId);
      setStatusMessage(`Drive 上の「Thinktank」フォルダを検出しました (ID: ${folderId})。`);
    } catch (e) {
      setStatusMessage(`フォルダ自動検出エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSyncBodyPackNow = async () => {
    const driveBackend = StorageManager.instance.getDriveBackend();
    if (!driveBackend) {
      setStatusMessage('先に「Google Drive 正本モード」に切り替えてください。');
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
      firebaseUid,
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
        ...(firebaseUid ? { firebaseUid } : {}),
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
          Google Drive 正本・全文検索キャッシュ・Firebase E2EE 中継
        </h2>
      </div>

      {isOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
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
                  onClick={() => void handleProviderChange('drive')}
                  style={
                    webProvider === 'drive'
                      ? primaryBtnStyle
                      : secondaryBtnStyle
                  }
                >
                  {webProvider === 'drive' ? '● ' : '○ '}
                  Google Drive 正本 + IndexedDB 高速キャッシュ（新方式）
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleProviderChange('bigquery')}
                  style={
                    webProvider === 'bigquery'
                      ? primaryBtnStyle
                      : secondaryBtnStyle
                  }
                >
                  {webProvider === 'bigquery' ? '● ' : '○ '}
                  BigQuery / ローカル開発サーバ（従来方式）
                </button>
              </div>
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
              <label
                style={{
                  fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                  color: TEXT_MUTED,
                  flex: '1 1 140px',
                }}
              >
                Firebase User UID
                <input
                  type="text"
                  value={firebaseUid}
                  onChange={(e) => setFirebaseUid(e.target.value)}
                  placeholder="default_user"
                  style={inputStyle}
                />
              </label>
            </div>

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
