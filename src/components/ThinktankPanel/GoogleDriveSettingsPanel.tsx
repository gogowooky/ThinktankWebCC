/**
 * src/components/ThinktankPanel/GoogleDriveSettingsPanel.tsx
 * Thinktank > 設定 > Google Drive API
 * 外部資料用の Google Drive API 設定と、PC版でのバックアップ管理リンクを配置する。
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { GoogleAuthService } from '../../platform/web/GoogleAuthService';
import { FirebaseAuthService } from '../../platform/web/FirebaseAuthService';
import { TTModels } from '../../models/TTModels';
import { StorageManager } from '../../services/storage/StorageManager';
import { usePanelSectionsSetAll } from '../../hooks/usePanelSectionsSetAll';

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

const linkActionStyle: React.CSSProperties = {
  color: 'var(--thinktank-base, #1d618f)',
  textDecoration: 'underline',
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  textAlign: 'left',
};

export const GoogleDriveSettingsPanel: React.FC = () => {
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);
  const [isOpen, setIsOpen] = useState(true);
  usePanelSectionsSetAll('thinktank', [setIsOpen]);

  // Google Drive Auth 設定
  const initialDriveCfg = GoogleAuthService.getConfig();
  const [googleClientId, setGoogleClientId] = useState(initialDriveCfg.clientId);
  const [googleAccessToken, setGoogleAccessToken] = useState(initialDriveCfg.accessToken);
  const [driveRootFolderId, setDriveRootFolderId] = useState(initialDriveCfg.driveRootFolderId);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const handleSaveDriveSettings = () => {
    GoogleAuthService.saveConfig({
      clientId: googleClientId,
      accessToken: googleAccessToken,
      driveRootFolderId,
    });
    setStatusMessage('外部資料用の Google Drive 接続設定を保存しました。');
  };

  const handleDriveOAuthLogin = async () => {
    const effectiveClientId = googleClientId.trim();
    if (!effectiveClientId) {
      setStatusMessage('Google OAuth Client IDを入力してください。');
      return;
    }
    GoogleAuthService.saveConfig({ clientId: effectiveClientId });
    setActiveAction('driveAuth');
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
      setActiveAction(null);
    }
  };

  const handleAutoDetectFolder = async () => {
    if (!googleAccessToken.trim()) {
      setStatusMessage('先に「Google でログイン」ボタンを押してアクセストークンを取得してください。');
      return;
    }
    GoogleAuthService.saveConfig({ accessToken: googleAccessToken });
    setActiveAction('detectFolder');
    setStatusMessage('Google Drive 内の「Thinktank」フォルダを検索中...');
    try {
      const folderId = await GoogleAuthService.ensureThinktankFolder('Thinktank');
      setDriveRootFolderId(folderId);
      setStatusMessage(`Drive 上のアプリ専用「Thinktank」フォルダを準備しました (ID: ${folderId})。「Drive設定を保存」を押してください。`);
    } catch (e) {
      setStatusMessage(`フォルダ自動検出エラー: ${e instanceof Error ? e.message : String(e)}。Google ドライブの URL からフォルダIDをコピーして直接貼り付けてください。`);
    } finally {
      setActiveAction(null);
    }
  };

  // 1. Firestoreへの初回取り込み
  const handleImportMarkdownBackup = async () => {
    if (!FirebaseAuthService.getCurrentUser()) {
      setStatusMessage('先にThinkデータ用Firebaseへログインしてください。');
      return;
    }
    setActiveAction('import');
    setStatusMessage('初回取り込み中（MarkdownバックアップからFirestoreへ未登録Thinkを取り込んでいます）...');
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
      setActiveAction(null);
    }
  };

  // 2. Firestoreデータのバックアップ
  const handleBackupToMarkdown = async () => {
    if (!FirebaseAuthService.getCurrentUser()) {
      setStatusMessage('先にThinkデータ用Firebaseへログインしてください。');
      return;
    }
    setActiveAction('backup');
    setStatusMessage('Firestoreデータをバックアップ中（ローカルMarkdownバックアップへ一括書き出し中）...');
    try {
      const result = await StorageManager.instance.exportAllToElectronMarkdownBackup();
      setStatusMessage(
        `バックアップ完了: ${result.exported}件書き出し` +
          (result.failedIds.length ? `、${result.failedIds.length}件失敗` : ''),
      );
    } catch (e) {
      setStatusMessage(`バックアップエラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActiveAction(null);
    }
  };

  // 3. バックアップデータのFirestoreへの書戻し
  const handleRestoreFromMarkdown = async () => {
    if (!FirebaseAuthService.getCurrentUser()) {
      setStatusMessage('先にThinkデータ用Firebaseへログインしてください。');
      return;
    }
    if (!window.confirm('ローカルのMarkdownバックアップデータでFirestoreの正本を上書き・書き戻します。よろしいですか？')) {
      return;
    }
    setActiveAction('restore');
    setStatusMessage('バックアップデータを書戻し中（ローカルMarkdownからFirestoreへ反映中）...');
    try {
      const result = await StorageManager.instance.restoreFromElectronMarkdownBackup();
      await TTModels.Instance?.Vault?.ReloadAll();
      setStatusMessage(
        `書戻し完了: ${result.restored}件反映` +
          (result.failedIds.length ? `、${result.failedIds.length}件失敗` : ''),
      );
    } catch (e) {
      setStatusMessage(`書戻しエラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActiveAction(null);
    }
  };

  const isBusy = activeAction !== null;

  return (
    <section className="tt-settings-section" style={{ color: TEXT_MAIN }}>
      <div className="tt-settings-section__header" onClick={() => setIsOpen((v) => !v)}>
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <h2 className="tt-settings-section__title">Google Drive API</h2>
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
              {isBusy ? '⏳' : statusMessage.includes('エラー') || statusMessage.includes('失敗') ? '⚠️' : '✅'}
              <span>{statusMessage}</span>
            </div>
          )}

          <div style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${BORDER_COLOR}`, backgroundColor: CARD_BG, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {isElectron ? (
              <div style={{ padding: '7px 8px', borderRadius: '4px', backgroundColor: SUB_CARD_BG, color: TEXT_MUTED, fontSize: 'calc(10.5px * var(--tt-font-scale, 1))', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span>PC版のMarkdownバックアップ先は「ローカルAI CLI・Markdownバックアップ」で設定します。Google Driveのリンクは通常のブラウザで開けます。</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                  <div>
                    {activeAction === 'import' ? (
                      <span style={{ color: '#2563eb', fontWeight: 600 }}>動作中: Firestoreへの初回取り込み...</span>
                    ) : (
                      <button type="button" disabled={isBusy} onClick={() => void handleImportMarkdownBackup()} style={linkActionStyle}>
                        Firestoreへの初回取り込み
                      </button>
                    )}
                  </div>
                  <div>
                    {activeAction === 'backup' ? (
                      <span style={{ color: '#2563eb', fontWeight: 600 }}>動作中: Firestoreデータのバックアップ...</span>
                    ) : (
                      <button type="button" disabled={isBusy} onClick={() => void handleBackupToMarkdown()} style={linkActionStyle}>
                        Firestoreデータのバックアップ
                      </button>
                    )}
                  </div>
                  <div>
                    {activeAction === 'restore' ? (
                      <span style={{ color: '#2563eb', fontWeight: 600 }}>動作中: バックアップデータのFirestoreへの書戻し...</span>
                    ) : (
                      <button type="button" disabled={isBusy} onClick={() => void handleRestoreFromMarkdown()} style={linkActionStyle}>
                        バックアップデータのFirestoreへの書戻し
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ color: TEXT_MUTED, fontSize: 'calc(10.5px * var(--tt-font-scale, 1))', lineHeight: 1.45 }}>
                  審査範囲を抑えるため <code>drive.file</code> のみ使用します。既存の全Driveを検索せず、このアプリが作成した専用フォルダだけを扱います。
                </div>
                <label style={{ fontSize: 'calc(11px * var(--tt-font-scale, 1))', color: TEXT_MUTED }}>
                  Google OAuth Client ID
                  <input type="text" value={googleClientId} onChange={(e) => setGoogleClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" style={inputStyle} />
                </label>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" disabled={isBusy} onClick={() => void handleDriveOAuthLogin()} style={secondaryBtnStyle}>
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
                  <button type="button" disabled={isBusy} onClick={() => void handleAutoDetectFolder()} style={secondaryBtnStyle}>専用フォルダを準備</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" disabled={isBusy} onClick={handleSaveDriveSettings} style={primaryBtnStyle}>Drive設定を保存</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
