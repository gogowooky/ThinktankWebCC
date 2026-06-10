// 最下段ステータスバー（仕様書02 §1.1-⑤）

import { app } from '../../views/TTApplication';
import { useNotify } from '../../hooks/useNotify';
import {
  IconMonitor, IconGlobe, IconInfo, IconHighlight, IconActivity, IconTerminal, IconCopyright,
} from './Icons';
import type { StatusBarMode } from '../../views/TTApplication';
import { useState } from 'react';
import './ApplicationStatusBarArea.css';

export function ApplicationStatusBarArea() {
  useNotify(app);
  const [cliInput, setCliInput] = useState('');
  const mode = app.StatusBarMode;
  const st = app.Shortcuts.Status;

  const setMode = (m: StatusBarMode) => {
    app.StatusBarMode = m;
    app.NotifyUpdated(false);
  };

  const runCli = () => {
    const cmd = cliInput.trim();
    if (!cmd) return;
    if (app.Actions.Has(cmd)) {
      app.Actions.Execute(cmd);
    } else {
      app.StatusText = `不明なコマンド: ${cmd}`;
      app.NotifyUpdated(false);
    }
    setCliInput('');
  };

  return (
    <div className="ApplicationStatusBarArea" data-focusable="StatusBar">
      <div
        className="ApplicationStatusBarArea__mode-indicator"
        data-tip={app.Mode === 'local' ? 'Local モード' : 'Online モード'}
      >
        {app.Mode === 'local' ? <IconMonitor size={14} /> : <IconGlobe size={14} />}
      </div>
      <div className="ApplicationStatusBarArea__indicator-divider" />

      {mode === 'status' && (
        app.ShowCopyright ? (
          <div className="ApplicationStatusBarArea__author-banner" onClick={() => { app.ShowCopyright = false; app.NotifyUpdated(false); }}>
            <span className="ApplicationStatusBarArea__author-banner-text">
              Thinktank Clone — ナレッジ管理・思考支援システム
            </span>
          </div>
        ) : (
          <input
            className="ApplicationStatusBarArea__input"
            value={app.StatusText}
            readOnly
            placeholder="ステータス"
          />
        )
      )}

      {mode === 'highlight' && (
        <input
          className="ApplicationStatusBarArea__input"
          value={app.HighlightPattern}
          placeholder="単語ハイライト（正規表現）"
          onChange={(e) => {
            app.HighlightPattern = e.target.value;
            app.NotifyUpdated(false);
          }}
        />
      )}

      {mode === 'keyaction' && (
        <div className="ApplicationStatusBarArea__keyaction">
          <span className="ApplicationStatusBarArea__ka-field">
            <span className="ApplicationStatusBarArea__ka-label">focus</span>
            <span className="ApplicationStatusBarArea__ka-value ApplicationStatusBarArea__ka-value--focus">{st.Focus || '-'}</span>
          </span>
          <span className="ApplicationStatusBarArea__ka-divider" />
          <span className="ApplicationStatusBarArea__ka-field">
            <span className="ApplicationStatusBarArea__ka-label">key</span>
            <span className="ApplicationStatusBarArea__ka-value">{st.LastKey || '-'}</span>
          </span>
          <span className="ApplicationStatusBarArea__ka-divider" />
          <span className="ApplicationStatusBarArea__ka-field">
            <span className="ApplicationStatusBarArea__ka-label">ex</span>
            <span className="ApplicationStatusBarArea__ka-value ApplicationStatusBarArea__ka-value--exmode">{st.ExMode || '-'}</span>
          </span>
          <span className="ApplicationStatusBarArea__ka-divider" />
          <span className="ApplicationStatusBarArea__ka-field">
            <span className="ApplicationStatusBarArea__ka-label">action</span>
            <span className="ApplicationStatusBarArea__ka-value ApplicationStatusBarArea__ka-value--action">{st.LastAction || '-'}</span>
          </span>
        </div>
      )}

      {mode === 'cli' && (
        <input
          className="ApplicationStatusBarArea__input"
          value={cliInput}
          placeholder="コマンド（ActionID）を入力して Enter"
          onChange={(e) => setCliInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runCli();
            e.stopPropagation();
          }}
        />
      )}

      <div className="ApplicationStatusBarArea__modes">
        <button
          className={`ApplicationStatusBarArea__mode-btn${mode === 'status' ? ' ApplicationStatusBarArea__mode-btn--active' : ''}`}
          data-tip="ステータス表示" onClick={() => setMode('status')}
        >
          <IconInfo size={13} />
        </button>
        <button
          className={`ApplicationStatusBarArea__mode-btn${mode === 'highlight' ? ' ApplicationStatusBarArea__mode-btn--active' : ''}`}
          data-tip="単語ハイライト" onClick={() => setMode('highlight')}
        >
          <IconHighlight size={13} />
        </button>
        <button
          className={`ApplicationStatusBarArea__mode-btn${mode === 'keyaction' ? ' ApplicationStatusBarArea__mode-btn--active' : ''}`}
          data-tip="キーアクション履歴" onClick={() => setMode('keyaction')}
        >
          <IconActivity size={13} />
        </button>
        <button
          className={`ApplicationStatusBarArea__mode-btn${mode === 'cli' ? ' ApplicationStatusBarArea__mode-btn--active' : ''}`}
          data-tip="CLIコマンドライン" onClick={() => setMode('cli')}
        >
          <IconTerminal size={13} />
        </button>
      </div>

      <div className="ApplicationStatusBarArea__utils">
        <button
          className={`ApplicationStatusBarArea__util-btn${app.ShowCopyright ? ' ApplicationStatusBarArea__util-btn--active' : ''}`}
          data-tip="コピーライト表示"
          onClick={() => { app.ShowCopyright = !app.ShowCopyright; app.NotifyUpdated(false); }}
        >
          <IconCopyright size={13} />
        </button>
      </div>
    </div>
  );
}
