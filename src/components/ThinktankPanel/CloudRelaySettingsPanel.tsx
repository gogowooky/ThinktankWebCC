/**
 * src/components/ThinktankPanel/CloudRelaySettingsPanel.tsx
 * Think 正本の Firebase 接続・PC連携・Google Drive 外部資料設定パネル。
 * Thinktank パネルの明るい地色（--thinktank-area-bg / --thinktank-content-bg）と
 * 基礎色（--thinktank-base）に合わせた高コントラスト・高視認性の配色を使用する。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { GoogleAuthService } from '../../platform/web/GoogleAuthService';
import { FirestoreRelayClient } from '../../platform/web/FirestoreRelayClient';
import { FirebaseAuthService } from '../../platform/web/FirebaseAuthService';
import type { ElectronRelayStatus } from '../../services/storage/ElectronStorageBackend';
import { TTModels } from '../../models/TTModels';
import { StorageManager } from '../../services/storage/StorageManager';

function loadWebPcLinkEnabled(): boolean {
  return FirestoreRelayClient.getConfig().enabled;
}

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
  const [webPcLinkEnabled, setWebPcLinkEnabled] = useState(loadWebPcLinkEnabled);

  // Google Drive Auth 設定
  const initialDriveCfg = GoogleAuthService.getConfig();
  const [googleClientId, setGoogleClientId] = useState(initialDriveCfg.clientId);
  const [googleAccessToken, setGoogleAccessToken] = useState(initialDriveCfg.accessToken);
  const [driveRootFolderId, setDriveRootFolderId] = useState(initialDriveCfg.driveRootFolderId);

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
      // Electronではメインプロセスのログインを正とし、rendererに古い別アカウントが
      // 残っていても同じUIDへ揃える。
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

  // ハートビートは60秒ごとなので、設定画面を開いている間だけ表示を更新する。
  useEffect(() => {
    const getStatus = window.electronAPI?.relay?.getStatus;
    if (!isOpen || !getStatus) return;
    const timer = setInterval(() => {
      void getStatus().then(setPcRelayStatus).catch(() => {});
    }, 10_000);
    return () => clearInterval(timer);
  }, [isOpen]);

  const handleSaveDriveSettings = () => {
    GoogleAuthService.saveConfig({
      clientId: googleClientId,
      accessToken: googleAccessToken,
      driveRootFolderId,
    });
    setStatusMessage('外部資料用の Google Drive 接続設定を保存しました。');
  };

  // Electron 版の画面（app:// や localhost:5173）は Google の戻り先に登録できないため、
  // ポップアップではなくメインプロセスがいつものブラウザでログイン画面を開く
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

  const handleDriveOAuthLogin = async () => {
    const effectiveClientId = googleClientId.trim();
    if (!effectiveClientId) {
      setStatusMessage('Google OAuth Client IDを入力してください。');
      return;
    }
    GoogleAuthService.saveConfig({ clientId: effectiveClientId });
    setBusy(true);
    setStatusMessage('外部資料用Google Driveへのアクセスを承認してください...');
    try {
      const cfg = await GoogleAuthService.startBrowserOAuthFlow({ includeDrive: true });
      setGoogleAccessToken(cfg.accessToken);
      const folderId = await GoogleAuthService.ensureThinktankFolder('Thinktank');
      setDriveRootFolderId(folderId);
      setStatusMessage(`外部資料用のアプリ専用「Thinktank」フォルダを準備しました (ID: ${folderId})。`);
    } catch (e) {
      setStatusMessage(`Driveログイン失敗: ${e instanceof Error ? e.message : String(e)}`);
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
      const folderId = await GoogleAuthService.ensureThinktankFolder('Thinktank');
      setDriveRootFolderId(folderId);
      setStatusMessage(`Drive 上のアプリ専用「Thinktank」フォルダを準備しました (ID: ${folderId})。「Drive設定を保存」を押してください。`);
    } catch (e) {
      setStatusMessage(`フォルダ自動検出エラー: ${e instanceof Error ? e.message : String(e)}。Google ドライブの URL からフォルダIDをコピーして直接貼り付けてください。`);
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

  const handleImportMarkdownBackup = async () => {
    if (!FirebaseAuthService.getCurrentUser()) {
      setStatusMessage('先にThinkデータ用Firebaseへログインしてください。');
      return;
    }
    setBusy(true);
    setStatusMessage('MarkdownバックアップからFirestoreへ未登録Thinkを取り込んでいます...');
    try {
      const result = await StorageManager.instance.importElectronMarkdownBackup();
      await TTModels.Instance?.Vault?.ReloadAll();
      setStatusMessage(
        `初回取り込み完了: ${result.imported}件追加、${result.skipped}件スキップ` +
          (result.systemSkipped ? `（システム設定 ${result.systemSkipped}件を含む）` : '') +
          (result.failedIds.length ? `、${result.failedIds.length}件失敗` : ''),
      );
    } catch (e) {
      setStatusMessage(`初回取り込みエラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const pcLinkEnabled = isElectron ? Boolean(pcRelayStatus?.enabled) : webPcLinkEnabled;

  return (
    <section className="tt-settings-section" style={{ color: TEXT_MAIN }}>
      <div className="tt-settings-section__header" onClick={() => setIsOpen((v) => !v)}>
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <h2 className="tt-settings-section__title">データ接続</h2>
      </div>

      {isOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
          {statusMessage && (
            <div
              role="status"
              style={{
                padding: '8px 12px', borderRadius: '6px',
                backgroundColor: statusMessage.includes('エラー') || statusMessage.includes('失敗')
                  ? 'rgba(239, 68, 68, 0.15)'
                  : statusMessage.includes('完了') || statusMessage.includes('取得') || statusMessage.includes('成功')
                    ? 'rgba(34, 197, 94, 0.15)'
                    : 'rgba(59, 130, 246, 0.15)',
                border: `1px solid ${statusMessage.includes('エラー') || statusMessage.includes('失敗') ? '#ef4444' : '#3b82f6'}`,
                color: TEXT_MAIN, fontSize: 'calc(11.5px * var(--tt-font-scale, 1))',
                fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              {busy ? '⏳' : statusMessage.includes('エラー') || statusMessage.includes('失敗') ? '⚠️' : '✅'}
              <span>{statusMessage}</span>
            </div>
          )}

          <div style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${BORDER_COLOR}`, backgroundColor: CARD_BG, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontWeight: 700, fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MAIN }}>
              1. Think正本 — Firebase
            </div>
            <p style={{ margin: 0, color: TEXT_MUTED, fontSize: 'calc(11px * var(--tt-font-scale, 1))', lineHeight: 1.5 }}>
              Think本文とメタデータはFirestoreを正本として、PC版とWeb版で同じ内容を利用します。PC連携モードをOFFにしても、このログインは維持されます。
            </p>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MUTED, flex: '1 1 200px' }}>
                Firebase Project ID
                <input type="text" value={firebaseProjectId} onChange={(e) => setFirebaseProjectId(e.target.value)} placeholder="your-firebase-project-id" style={inputStyle} />
              </label>
              <button type="button" disabled={busy} onClick={() => void handleSaveFirebaseConfig()} style={secondaryBtnStyle}>
                接続設定を保存
              </button>
            </div>
            <div style={{ padding: '8px', borderRadius: '4px', backgroundColor: SUB_CARD_BG, border: `1px solid ${BORDER_COLOR}`, fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MAIN, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              {isElectron ? (
                <span>
                  Firebaseログイン: {pcRelayStatus?.firebaseSignedIn
                    ? <><strong>{pcRelayStatus.firebaseEmail || '(メール不明)'}</strong>（PC版）</>
                    : '未ログイン'}
                </span>
              ) : (
                <span>
                  Firebaseログイン: {firebaseUser
                    ? <><strong>{firebaseUser.email || '(メール不明)'}</strong> (UID: <code>{firebaseUser.uid}</code>)</>
                    : '未ログイン'}
                </span>
              )}
              {(isElectron ? pcRelayStatus?.firebaseSignedIn : Boolean(firebaseUser)) ? (
                <button
                  type="button"
                  disabled={busy}
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
                  style={secondaryBtnStyle}
                >
                  ログアウト
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => void handleOAuthLogin()} style={primaryBtnStyle}>
                  {isElectron ? 'ブラウザでGoogleにログイン' : 'Googleでログイン'}
                </button>
              )}
            </div>
          </div>

          <div style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${BORDER_COLOR}`, backgroundColor: CARD_BG, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <span>
                <strong style={{ display: 'block', fontSize: 'calc(11px * var(--tt-font-scale, 1))' }}>2. PC連携モード</strong>
                <span style={{ color: TEXT_MUTED, fontSize: 'calc(10.5px * var(--tt-font-scale, 1))' }}>
                  {isElectron ? 'このPCをAI CLIの提供側（server）にします。' : 'このWeb版を自宅PCへの接続側（client）にします。'}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: 'calc(11px * var(--tt-font-scale, 1))' }}>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="PC連携モード"
                  checked={pcLinkEnabled}
                  disabled={busy || (isElectron && !pcRelayStatus)}
                  onChange={(e) => void (isElectron ? handleTogglePcRelay(e.target.checked) : handleToggleWebPcLink(e.target.checked))}
                />
                {pcLinkEnabled ? 'ON' : 'OFF'}
              </span>
            </label>

            {!pcLinkEnabled && (
              <div style={{ padding: '7px 8px', borderRadius: '4px', backgroundColor: SUB_CARD_BG, color: TEXT_MUTED, fontSize: 'calc(10.5px * var(--tt-font-scale, 1))' }}>
                通常利用ではOFFです。ThinkデータのFirestore同期は引き続き利用できます。
              </div>
            )}

            {isElectron && pcLinkEnabled && pcRelayStatus && (
              <div style={{ padding: '8px', borderRadius: '4px', backgroundColor: SUB_CARD_BG, border: `1px solid ${BORDER_COLOR}`, fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MAIN }}>
                <div>役割: <strong>AI CLI提供側（server）</strong></div>
                <div>このPCのDevice ID: <code>{pcRelayStatus.deviceId}</code> ({pcRelayStatus.deviceName})</div>
                <div>ペアリングシークレット: <code>{pcRelayStatus.pairingSecret}</code></div>
                <div>
                  接続状態: {pcRelayStatus.isAlive
                    ? `オンライン（最終接続: ${new Date(pcRelayStatus.lastHeartbeatAt).toLocaleString()}）`
                    : 'オフライン'}
                </div>
                {!pcRelayStatus.isAlive && pcRelayStatus.firestoreProblem && (
                  <div style={{ color: TEXT_MUTED }}>理由: {pcRelayStatus.firestoreProblem}</div>
                )}
              </div>
            )}

            {!isElectron && pcLinkEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ color: TEXT_MUTED, fontSize: 'calc(10.5px * var(--tt-font-scale, 1))' }}>
                  役割: <strong style={{ color: TEXT_MAIN }}>AI CLI接続側（client）</strong>。提供側PCに表示された値を入力します。
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MUTED, flex: '1 1 160px' }}>
                    接続先PCのDevice ID
                    <input type="text" value={targetDeviceId} onChange={(e) => setTargetDeviceId(e.target.value)} placeholder="pc-xxxx" style={inputStyle} />
                  </label>
                  <label style={{ fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MUTED, flex: '1 1 180px' }}>
                    E2EE共通パスフレーズ（Pairing Secret）
                    <input type="password" value={pairingSecret} onChange={(e) => setPairingSecret(e.target.value)} placeholder="PBKDF2 + AES-256-GCM 共通鍵" style={inputStyle} />
                  </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" disabled={busy} onClick={handleSaveRelayConfig} style={primaryBtnStyle}>PC連携設定を保存</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${BORDER_COLOR}`, backgroundColor: CARD_BG, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontWeight: 700, fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MAIN }}>
              3. 外部資料とMarkdownバックアップ
            </div>
            <p style={{ margin: 0, color: TEXT_MUTED, fontSize: 'calc(11px * var(--tt-font-scale, 1))', lineHeight: 1.5 }}>
              PDF・画像・Office文書などの外部資料はGoogle Driveに置き、Thinkにはリンクを保存します。Markdownは正本ではなく、閲覧・持ち出し・復旧用のバックアップです。
            </p>
            {isElectron ? (
              <div style={{ padding: '7px 8px', borderRadius: '4px', backgroundColor: SUB_CARD_BG, color: TEXT_MUTED, fontSize: 'calc(10.5px * var(--tt-font-scale, 1))', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <span>PC版のMarkdownバックアップ先は「ローカルAI CLI・Markdownバックアップ」で設定します。Google Driveのリンクは通常のブラウザで開けます。</span>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" disabled={busy} onClick={() => void handleImportMarkdownBackup()} style={secondaryBtnStyle}>
                    既存MarkdownをFirestoreへ初回取り込み
                  </button>
                </div>
              </div>
            ) : (
              <details style={{ padding: '8px', borderRadius: '4px', backgroundColor: SUB_CARD_BG, border: `1px solid ${BORDER_COLOR}` }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 'calc(11px * var(--tt-font-scale, 1))' }}>
                  外部資料用Google Drive API設定（任意）
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  <div style={{ color: TEXT_MUTED, fontSize: 'calc(10.5px * var(--tt-font-scale, 1))', lineHeight: 1.45 }}>
                    審査範囲を抑えるため <code>drive.file</code> のみ使用します。既存の全Driveを検索せず、このアプリが作成した専用フォルダだけを扱います。
                  </div>
                  <label style={{ fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MUTED }}>
                    Google OAuth Client ID
                    <input type="text" value={googleClientId} onChange={(e) => setGoogleClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" style={inputStyle} />
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" disabled={busy} onClick={() => void handleDriveOAuthLogin()} style={secondaryBtnStyle}>
                      Google Driveへのアクセスを承認
                    </button>
                  </div>
                  <label style={{ fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MUTED }}>
                    Access Token
                    <input type="password" value={googleAccessToken} onChange={(e) => setGoogleAccessToken(e.target.value)} placeholder="ya29.a0..." style={inputStyle} />
                  </label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MUTED, flex: '1 1 200px' }}>
                      外部資料のDriveルートフォルダID
                      <input type="text" value={driveRootFolderId} onChange={(e) => setDriveRootFolderId(e.target.value)} placeholder="1AbCdEfGhIjKlMnOpQrStUvWxYz" style={inputStyle} />
                    </label>
                    <button type="button" disabled={busy} onClick={() => void handleAutoDetectFolder()} style={secondaryBtnStyle}>専用フォルダを準備</button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" disabled={busy} onClick={handleSaveDriveSettings} style={primaryBtnStyle}>Drive設定を保存</button>
                  </div>
                </div>
              </details>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
