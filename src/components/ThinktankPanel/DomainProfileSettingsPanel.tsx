/**
 * src/components/ThinktankPanel/DomainProfileSettingsPanel.tsx
 * 1. ドメインプロファイル（.thinktank/prompts/）切替・プロンプト/コンテキスト編集UI
 * 2. PC版 ローカル AI CLI（claude / codex / gemini 設定隔離実行）および Vault フォルダ設定UI
 * Thinktank パネルの明るい地色と基礎色（--thinktank-base）に合わせた高視認性スタイルで描画する。
 */

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useDomainProfile } from '../../platform/DomainProfileManager';
import type { PanelId } from '../../../shared/domainProfile';
import type {
  ElectronVaultConfig,
  ElectronAiStatus,
} from '../../services/storage/ElectronStorageBackend';

const PANELS: PanelId[] = ['Thinktank', 'Seeds', 'Discuss', 'Harvest'];

const TEXT_MAIN = 'color-mix(in srgb, var(--thinktank-base, #1d618f) 30%, #16161f)';
const TEXT_MUTED = 'var(--text-muted, #565f89)';
const CARD_BG = 'var(--thinktank-content-bg, #ffffff)';
const SUB_CARD_BG = 'var(--thinktank-tint-weak, #f2f7fa)';
const BORDER_COLOR = 'var(--thinktank-border, rgba(29, 97, 143, 0.28))';
const ACCENT_BG = 'var(--thinktank-ribbon-bg, #1d618f)';
const ACCENT_FG = 'rgb(var(--thinktank-on-ribbon-rgb, 255 255 255) / 0.95)';

const controlStyle: React.CSSProperties = {
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
};

export function DomainProfileSettingsPanel() {
  const {
    profile,
    availableProfiles,
    switchProfile,
    saveCustomProfile,
    resetProfileToDefault,
  } = useDomainProfile();

  const [isOpen, setIsOpen] = useState(true);
  const [editingPanel, setEditingPanel] = useState<PanelId>('Discuss');
  const [commonPolicyDraft, setCommonPolicyDraft] = useState(profile.commonPolicyPrompt);
  const [panelRoleDraft, setPanelRoleDraft] = useState(
    profile.panelRoles[editingPanel].rolePrompt,
  );
  const [vaultConfig, setVaultConfig] = useState<ElectronVaultConfig | null>(null);
  const [aiStatus, setAiStatus] = useState<ElectronAiStatus | null>(null);
  const [conflictsCount, setConflictsCount] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setCommonPolicyDraft(profile.commonPolicyPrompt);
    setPanelRoleDraft(profile.panelRoles[editingPanel]?.rolePrompt || '');
  }, [profile, editingPanel]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;
    void (async () => {
      try {
        if (window.electronAPI?.vault) {
          setVaultConfig(await window.electronAPI.vault.getConfig());
          const conflicts = await window.electronAPI.vault.listConflicts();
          setConflictsCount(conflicts.length);
        }
        if (window.electronAPI?.ai) {
          setAiStatus(await window.electronAPI.ai.getStatus());
        }
      } catch {
        // ignore in test environments
      }
    })();
  }, []);

  async function handleSavePrompts() {
    const next = structuredClone(profile);
    next.commonPolicyPrompt = commonPolicyDraft;
    next.panelRoles[editingPanel].rolePrompt = panelRoleDraft;
    await saveCustomProfile(next);
    setMessage(`プロファイル「${next.name}」のコンテキスト・プロンプトを保存しました。`);
  }

  async function handleResetPrompts() {
    await resetProfileToDefault(profile.id);
    setMessage(`プロファイル「${profile.name}」を初期設定に戻しました。`);
  }

  async function handleSelectVaultFolder() {
    if (!window.electronAPI?.vault) return;
    const updated = await window.electronAPI.vault.selectFolder();
    if (updated) {
      setVaultConfig(updated);
      setMessage(`Vault フォルダを「${updated.vaultDir}」に切り替えました。`);
    }
  }

  async function handlePreferredCliChange(cli: 'claude' | 'codex' | 'gemini') {
    if (!window.electronAPI?.vault) return;
    const updated = await window.electronAPI.vault.setConfig({ preferredCli: cli });
    setVaultConfig(updated);
    if (window.electronAPI.ai) {
      setAiStatus(await window.electronAPI.ai.getStatus());
    }
    setMessage(`優先 AI CLI を「${cli}」に設定しました。`);
  }

  return (
    <section
      className="tt-settings-section domain-profile-settings"
      style={{ color: TEXT_MAIN }}
    >
      <div
        className="tt-settings-section__header"
        onClick={() => setIsOpen((v) => !v)}
      >
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <h2 className="tt-settings-section__title">
          運用プロファイル（コンテキスト切替） ＆ プロンプト編集
        </h2>
      </div>

      {isOpen && (
        <div
          style={{
            padding: '10px',
            borderRadius: '6px',
            border: `1px solid ${BORDER_COLOR}`,
            backgroundColor: CARD_BG,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            marginTop: '4px',
          }}
        >
          {message && (
            <div
              role="status"
              style={{
                padding: '6px 8px',
                borderRadius: '4px',
                backgroundColor: SUB_CARD_BG,
                border: `1px solid ${ACCENT_BG}`,
                color: TEXT_MAIN,
                fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                fontWeight: 600,
              }}
            >
              {message}
            </div>
          )}

          {/* 1. ドメインプロファイル切替 */}
          <label
            style={{
              fontSize: 'calc(11px * var(--tt-font-scale, 1))',
              fontWeight: 600,
              color: TEXT_MAIN,
            }}
          >
            運用ドメイン切替（業務管理 ⇄ 高齢者 思考・生活支援）
            <select
              aria-label="運用ドメインプロファイル"
              value={profile.id}
              onChange={(e) => {
                void switchProfile(e.target.value).then((p) =>
                  setMessage(`運用ドメインを「${p.name}」に切り替えました。`),
                );
              }}
              style={controlStyle}
            >
              {availableProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              fontSize: 'calc(11px * var(--tt-font-scale, 1))',
              color: TEXT_MUTED,
              lineHeight: 1.45,
            }}
          >
            {profile.description}
          </div>

          {/* 2. コンテキスト・プロンプトのカスタマイズ（.thinktank/prompts/） */}
          <details
            style={{
              padding: '8px',
              borderRadius: '4px',
              backgroundColor: SUB_CARD_BG,
              border: `1px solid ${BORDER_COLOR}`,
              fontSize: 'calc(11px * var(--tt-font-scale, 1))',
              color: TEXT_MAIN,
            }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 700, color: TEXT_MAIN }}>
              コンテキスト・プロンプト編集（.thinktank/prompts/{profile.id}/profile.json）
            </summary>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginTop: '8px',
              }}
            >
              <label style={{ color: TEXT_MUTED }}>
                <div>共通行動規範・ガードレール（Common Policy Prompt）</div>
                <textarea
                  rows={4}
                  value={commonPolicyDraft}
                  onChange={(e) => setCommonPolicyDraft(e.target.value)}
                  style={{ ...controlStyle, fontFamily: 'monospace' }}
                />
              </label>

              <label style={{ color: TEXT_MUTED }}>
                <div>パネル別役割プロンプト</div>
                <select
                  value={editingPanel}
                  onChange={(e) => setEditingPanel(e.target.value as PanelId)}
                  style={controlStyle}
                >
                  {PANELS.map((pid) => (
                    <option key={pid} value={pid}>
                      {pid} — {profile.panelRoles[pid]?.perspectiveLabel}
                    </option>
                  ))}
                </select>
              </label>

              <textarea
                rows={4}
                value={panelRoleDraft}
                onChange={(e) => setPanelRoleDraft(e.target.value)}
                style={{ ...controlStyle, fontFamily: 'monospace' }}
              />

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={primaryBtnStyle}
                  onClick={() => void handleSavePrompts()}
                >
                  プロンプト変更を保存
                </button>
                <button
                  type="button"
                  style={secondaryBtnStyle}
                  onClick={() => void handleResetPrompts()}
                >
                  標準プロンプトに戻す
                </button>
              </div>
            </div>
          </details>

          {/* 3. PC版設定（ローカル AI CLI 設定隔離実行・Vaultフォルダ） */}
          {vaultConfig && (
            <details
              style={{
                padding: '8px',
                borderRadius: '4px',
                backgroundColor: SUB_CARD_BG,
                border: `1px solid ${BORDER_COLOR}`,
                fontSize: 'calc(11px * var(--tt-font-scale, 1))',
                color: TEXT_MAIN,
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: TEXT_MAIN }}>
                PC版：ローカル AI CLI（設定隔離）・Vault 正本フォルダ設定
              </summary>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  marginTop: '8px',
                }}
              >
                <label style={{ color: TEXT_MUTED }}>
                  優先 AI CLI
                  <select
                    aria-label="優先AI CLI"
                    value={vaultConfig.preferredCli}
                    onChange={(e) =>
                      void handlePreferredCliChange(
                        e.target.value as 'claude' | 'codex' | 'gemini',
                      )
                    }
                    style={controlStyle}
                  >
                    <option value="claude">
                      claude ({aiStatus?.availableClis?.claude?.available ? '検出済' : '未検出'})
                    </option>
                    <option value="codex">
                      codex ({aiStatus?.availableClis?.codex?.available ? '検出済' : '未検出'})
                    </option>
                    <option value="gemini">
                      gemini ({aiStatus?.availableClis?.gemini?.available ? '検出済' : '未検出'})
                    </option>
                  </select>
                </label>

                <div>
                  <div style={{ color: TEXT_MUTED }}>
                    Vault 正本フォルダ: <code style={{ color: TEXT_MAIN }}>{vaultConfig.vaultDir}</code>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={primaryBtnStyle}
                      onClick={() => void handleSelectVaultFolder()}
                    >
                      Vault フォルダを変更…
                    </button>
                    <button
                      type="button"
                      style={secondaryBtnStyle}
                      onClick={() =>
                        void window.electronAPI?.vault
                          ?.writeShard()
                          .then(() =>
                            setMessage(
                              '端末シャード索引 & 本文パック (.thinktank/index/) を更新しました。',
                            ),
                          )
                      }
                    >
                      シャード索引・本文パックを更新
                    </button>
                  </div>
                  {conflictsCount > 0 && (
                    <div style={{ color: '#b45309', fontWeight: 600, marginTop: '4px' }}>
                      ⚠ Drive 衝突コピーファイルが {conflictsCount} 件検出されています。
                    </div>
                  )}
                </div>
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
