import React from 'react'

/**
 * Phase 1: プロジェクト初期化
 * 動作確認用の最小構成。CSS変数とフォントが適用されていることを確認する。
 * Phase 5以降で AppLayout に置き換える。
 */

// モード検出（Phase 13で StorageManager に移動）
const appMode = (window as Window).__THINKTANK_MODE__ ?? 'pwa'
const localApi = (window as Window).__THINKTANK_LOCAL_API__ ?? null

export default function App() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--spacing-lg)',
    }}>
      {/* ロゴ */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: 600,
          color: 'var(--text-accent)',
          letterSpacing: '0.08em',
        }}>
          Thinktank
        </h1>
        <p style={{
          marginTop: 'var(--spacing-sm)',
          color: 'var(--text-muted)',
          fontSize: 'var(--font-size-sm)',
        }}>
          記憶・思考・判断支援アプリ
        </p>
      </div>

      {/* CSS変数確認スウォッチ */}
      <div style={{
        display: 'flex',
        gap: 'var(--spacing-xs)',
        padding: 'var(--spacing-md)',
        background: 'var(--bg-panel)',
        borderRadius: 'var(--radius)',
      }}>
        {[
          { color: 'var(--text-accent)',    label: 'accent' },
          { color: 'var(--text-highlight)', label: 'H1' },
          { color: 'var(--heading-h3)',     label: 'H3' },
          { color: 'var(--heading-h4)',     label: 'H4' },
          { color: 'var(--text-success)',   label: 'ok' },
          { color: 'var(--text-warning)',   label: 'warn' },
          { color: 'var(--text-error)',     label: 'err' },
        ].map(({ color, label }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{
              width: 24,
              height: 24,
              borderRadius: 'var(--radius-sm)',
              background: color,
              marginBottom: 2,
            }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* モード情報 */}
      <div style={{
        padding: 'var(--spacing-sm) var(--spacing-md)',
        background: 'var(--bg-panel)',
        borderRadius: 'var(--radius)',
        fontSize: 'var(--font-size-sm)',
        color: 'var(--text-muted)',
      }}>
        Mode: <span style={{ color: 'var(--text-accent)' }}>{appMode}</span>
        {localApi && (
          <span style={{ marginLeft: 'var(--spacing-md)' }}>
            Local API: <span style={{ color: 'var(--text-success)' }}>{localApi}</span>
          </span>
        )}
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
        Phase 1 initialized — Phase 5 で UI シェルに置き換え
      </p>
    </div>
  )
}
