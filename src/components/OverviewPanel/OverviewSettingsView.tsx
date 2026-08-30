/**
 * OverviewSettingsView.tsx
 * OverviewPanel の設定ビュー。
 * 選択中の Bundle のプロファイルを表示し、タイトルを編集・保存できる。
 */

import { useState, useCallback, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Save, Library, X, ChevronDown, ChevronRight } from 'lucide-react';
import type { TTThink } from '../../models/TTThink';
import type { TTVault } from '../../models/TTVault';
import './OverviewSettingsView.css';

export interface OverviewSettingsViewRef {
  focus: () => void;
}

interface Props {
  think: TTThink | null;
  vault: TTVault;
  onClear: () => void;
}

export const OverviewSettingsView = forwardRef<OverviewSettingsViewRef, Props>(function OverviewSettingsView({ think, vault, onClear }: Props, ref) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => titleInputRef.current?.focus(),
  }));
  const [titleValue,     setTitleValue]     = useState('');
  const [saved,          setSaved]          = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [contentLoaded,  setContentLoaded]  = useState(false);
  const [isBasicOpen,    setIsBasicOpen]    = useState(true);
  const [isReferenceOpen,setIsReferenceOpen]= useState(true);

  // think が切り替わったら入力値リセット & コンテンツをロード
  useEffect(() => {
    setTitleValue(think?.Name ?? '');
    setSaved(false);
    setContentLoaded(false);
    if (!think) return;
    if (think.IsMetaOnly) {
      void think.LoadContent().then(() => setContentLoaded(true));
    } else {
      setContentLoaded(true);
    }
  }, [think?.ID]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveTitle = useCallback(async () => {
    if (!think) return;
    const newTitle = titleValue.trim().slice(0, 100);
    if (!newTitle) return;
    setSaving(true);
    try {
      if (think.IsMetaOnly) await think.LoadContent();
      const lines  = think.Content.split('\n');
      const prefix = lines[0]?.match(/^#+\s*/)?.[0] ?? '';
      lines[0]     = prefix + newTitle;
      think.Content = lines.join('\n');
      await think.SaveContent();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }, [think, titleValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleSaveTitle();
  }, [handleSaveTitle]);

  if (!think) {
    return (
      <div className="ov-settings-view ov-settings-view--empty">
        <Library size={24} className="ov-settings-view__empty-icon" />
        <span>Bundleをドロップして選択してください</span>
      </div>
    );
  }

  const thinkIds  = think.getThinkIds();
  const filterStr = think.Content.split('\n').slice(1).find(l => l.startsWith('> '))?.slice(2).trim() ?? '';
  const thinks    = vault.GetThinksForBundle(think.ID);

  return (
    <div className="ov-settings-view">

      <section className="ov-settings-section">
        <div className="ov-settings-section__header" onClick={() => setIsBasicOpen(v => !v)}>
          {isBasicOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <h2 className="ov-settings-section__title">基本情報</h2>
        </div>
        {isBasicOpen && (
          <dl className="ov-settings-dl">

            <dt>タイトル</dt>
            <dd>
              <div className="ov-settings-field">
                <input
                  ref={titleInputRef}
                  className="ov-settings-input"
                  type="text"
                  value={titleValue}
                  placeholder="（無題）"
                  onChange={e => { setTitleValue(e.target.value.slice(0, 100)); setSaved(false); }}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  className={`ov-settings-save-btn${saved ? ' ov-settings-save-btn--saved' : ''}`}
                  onClick={handleSaveTitle}
                  disabled={saving || !titleValue.trim()}
                  data-tip="保存"
                  data-tip-side="left"
                  aria-label="保存"
                >
                  <Save size={12} />
                </button>
                <button
                  className="ov-settings-clear-btn"
                  onClick={onClear}
                  data-tip="Bundleをクリア"
                  data-tip-side="left"
                  aria-label="Bundleをクリア"
                >
                  <X size={12} />
                </button>
              </div>
            </dd>

            <dt>ID</dt>
            <dd><code>{think.ID}</code></dd>
            <dt>作成日</dt>
            <dd>{think.ID.slice(0, 10)}</dd>
            <dt>更新日</dt>
            <dd>{think.UpdatedAt ? think.UpdatedAt.slice(0, 10) : '—'}</dd>
            <dt>種別</dt>
            <dd><code>{think.ContentType}</code></dd>
          </dl>
        )}
      </section>

      <section className="ov-settings-section">
        <div className="ov-settings-section__header" onClick={() => setIsReferenceOpen(v => !v)}>
          {isReferenceOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <h2 className="ov-settings-section__title">参照 Think</h2>
        </div>
        {isReferenceOpen && (
          <dl className="ov-settings-dl">
            <dt>Think 数</dt>
            <dd>{thinks.length} 件</dd>
            {filterStr && (
              <>
                <dt>Filter</dt>
                <dd><code>{filterStr}</code></dd>
              </>
            )}
            {thinkIds.length > 0 && (
              <>
                <dt>ID リスト</dt>
                <dd>
                  <ul className="ov-settings-id-list">
                    {thinkIds.map(id => {
                      const t = vault.GetThink(id);
                      return (
                        <li key={id}>
                          <code className="ov-settings-id-list__id">{id.slice(0, 10)}</code>
                          {t && <span className="ov-settings-id-list__name">{t.Name || '（無題）'}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </dd>
              </>
            )}
          </dl>
        )}
      </section>

      {(think.Keywords || think.RelatedIDs) && (
        <section className="ov-settings-section">
          <h2 className="ov-settings-section__title">メタデータ</h2>
          <dl className="ov-settings-dl">
            {think.Keywords && (
              <>
                <dt>Keywords</dt>
                <dd>{think.Keywords}</dd>
              </>
            )}
            {think.RelatedIDs && (
              <>
                <dt>RelatedIDs</dt>
                <dd>{think.RelatedIDs}</dd>
              </>
            )}
          </dl>
        </section>
      )}

    </div>
  );
});
