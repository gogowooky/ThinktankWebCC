/**
 * Thinktank > 設定 > リンクタイトル取得（GAS）
 * GDrive/GMail の linkファイルを作るとき、名前・件名を問い合わせる GAS の公開URLと合言葉。
 * 手順は docs/261108/GASリンクタイトル取得.md。
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { usePanelSectionsSetAll } from '../../hooks/usePanelSectionsSetAll';
import {
  getLinkTitleGasConfig,
  isValidGasUrl,
  saveLinkTitleGasConfig,
  testLinkTitleGas,
} from '../../services/linkTitleService';
import { BORDER_COLOR, CARD_BG, TEXT_MAIN, TEXT_MUTED, inputStyle } from './settingsPanelStyles';

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

export const LinkTitleGasSettingsPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);
  usePanelSectionsSetAll('thinktank', [setIsOpen]);

  const initial = getLinkTitleGasConfig();
  const [url, setUrl] = useState(initial.url);
  const [token, setToken] = useState(initial.token);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleSave = () => {
    if (url.trim() && !isValidGasUrl(url)) {
      setStatus({ ok: false, message: 'URLは https://script.google.com/macros/s/…/exec の形で入力してください。' });
      return;
    }
    saveLinkTitleGasConfig({ url, token });
    setStatus({ ok: true, message: url.trim() ? '保存しました。' : '保存しました（GAS への問い合わせは行いません）。' });
  };

  const handleTest = async () => {
    setIsTesting(true);
    setStatus({ ok: true, message: '接続を確かめています...' });
    try {
      setStatus(await testLinkTitleGas({ url, token }));
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section className="tt-settings-section" style={{ color: TEXT_MAIN }}>
      <div className="tt-settings-section__header" onClick={() => setIsOpen(v => !v)}>
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <h2 className="tt-settings-section__title">リンクタイトル取得（GAS）</h2>
      </div>

      {isOpen && (
        <div style={{ padding: '10px', marginTop: '4px', borderRadius: '6px', border: `1px solid ${BORDER_COLOR}`, backgroundColor: CARD_BG, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ color: TEXT_MUTED, fontSize: 'calc(10.5px * var(--tt-font-scale, 1))', lineHeight: 1.45 }}>
            GDrive・GMail の linkファイルを作るとき、ファイル名・フォルダー名・メール件名を自分の Google Apps Script に問い合わせて Caption に入れます。
            スクリプトと導入手順は <code>scripts/gas/linkTitle.gs</code> と <code>docs/261108/GASリンクタイトル取得.md</code> にあります。
            設定はこの端末にだけ保存されます。
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
            <button type="button" disabled={isTesting} onClick={() => void handleTest()} style={buttonStyle}>接続テスト</button>
            <button type="button" disabled={isTesting} onClick={handleSave} style={buttonStyle}>保存</button>
          </div>
        </div>
      )}
    </section>
  );
};
