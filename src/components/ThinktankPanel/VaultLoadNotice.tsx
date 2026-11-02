/**
 * VaultLoadNotice.tsx
 * Think一覧を読めなかったときに、空の一覧の代わりに理由と次の操作を示す。
 * 新しいPC・ブラウザでは Think データ用 Firebase が未ログインなのが普通で、
 * 何も出さないと「データが消えた」ように見えるため。
 */

import { useState } from 'react';
import { LogIn, RefreshCw, Settings } from 'lucide-react';
import type { TTVault, VaultLoadError } from '../../models/TTVault';
import { isElectronBrowserSignIn, signInForThinkData } from '../../services/thinkDataSignIn';
import './VaultLoadNotice.css';

interface Props {
  vault: TTVault;
  error: VaultLoadError;
  onOpenSettings: () => void;
}

export function VaultLoadNotice({ vault, error, onOpenSettings }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isSignIn = error.kind === 'signin';

  const handleSignIn = async () => {
    setBusy(true);
    setMessage(
      isElectronBrowserSignIn()
        ? 'ブラウザで Google のログイン画面を開いています... ログインが終わったらこの画面に戻ってください。'
        : null,
    );
    try {
      await signInForThinkData();
      setMessage('ログインしました。Think一覧を読み込んでいます...');
      await vault.ReloadAll();
      setMessage(null);
    } catch (e) {
      setMessage(`ログインできませんでした: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleReload = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await vault.ReloadAll();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tt-vault-notice" role="status">
      <div className="tt-vault-notice__card">
        <h3 className="tt-vault-notice__title">
          {isSignIn ? 'Think データ用のログインが必要です' : 'Think一覧を読み込めませんでした'}
        </h3>
        {isSignIn ? (
          <p className="tt-vault-notice__text">
            データはクラウド（Firebase）に保存されています。このPC・ブラウザではまだログインしていないため、一覧を表示できません。
            Chrome などで Google にログイン済みでも、アプリでは一度ログイン操作が必要です。
          </p>
        ) : (
          <p className="tt-vault-notice__text tt-vault-notice__text--error">{error.message}</p>
        )}
        <div className="tt-vault-notice__actions">
          {isSignIn ? (
            <button
              type="button"
              className="tt-vault-notice__btn tt-vault-notice__btn--primary"
              disabled={busy}
              onClick={() => void handleSignIn()}
            >
              <LogIn size={14} aria-hidden="true" />
              Google でログイン
            </button>
          ) : (
            <button
              type="button"
              className="tt-vault-notice__btn tt-vault-notice__btn--primary"
              disabled={busy}
              onClick={() => void handleReload()}
            >
              <RefreshCw size={14} aria-hidden="true" />
              再読み込み
            </button>
          )}
          <button type="button" className="tt-vault-notice__btn" disabled={busy} onClick={onOpenSettings}>
            <Settings size={14} aria-hidden="true" />
            接続設定を開く
          </button>
        </div>
        {message && <p className="tt-vault-notice__message">{message}</p>}
      </div>
    </div>
  );
}
