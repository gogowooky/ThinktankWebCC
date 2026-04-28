/**
 * OverviewSettingsView.tsx
 * OverviewPanel の設定ビュー。
 * 選択中の Thought のプロファイルを表示し、タイトルを編集・保存できる。
 */

import { useState, useCallback, useEffect } from 'react';
import { Save, BookOpen } from 'lucide-react';
import type { TTThink } from '../../models/TTThink';
import type { TTVault } from '../../models/TTVault';
import './OverviewSettingsView.css';

interface Props {
  think: TTThink | null;
  vault: TTVault;
}

export function OverviewSettingsView({ think, vault }: Props) {
  const [titleValue, setTitleValue] = useState('');
  const [saved,      setSaved]      = useState(false);
  const [saving,     setSaving]     = useState(false);

  // think が切り替わったら入力値をリセット
  useEffect(() => {
    setTitleValue(think?.Name ?? '');
    setSaved(false);
  }, [think?.ID]);

  const handleSaveTitle = useCallback(async () => {
    if (!think) return;
    const newTitle = titleValue.trim();
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
    if (e.key === 'Enter') handleSaveTitle();
  }, [handleSaveTitle]);

  if (!think) {
    return (
      <div className="ov-settings-view ov-settings-view--empty">
        <BookOpen size={24} className="ov-settings-view__empty-icon" />
        <span>Thoughtをドロップして選択してください</span>
      </div>
    );
  }

  const thinkIds  = think.getThinkIds();
  const filterStr = think.getFilter();
  const thinks    = vault.GetThinksForThought(think.ID);

  return (
    <div className="ov-settings-view">

      <section className="ov-settings-section">
        <h2 className="ov-settings-section__title">基本情報</h2>
        <dl className="ov-settings-dl">

          <dt>タイトル</dt>
          <dd>
            <div className="ov-settings-field">
              <input
                className="ov-settings-input"
                type="text"
                value={titleValue}
                placeholder="（無題）"
                onChange={e => { setTitleValue(e.target.value); setSaved(false); }}
                onKeyDown={handleKeyDown}
                spellCheck={false}
              />
              <button
                className={`ov-settings-save-btn${saved ? ' ov-settings-save-btn--saved' : ''}`}
                onClick={handleSaveTitle}
                disabled={saving || !titleValue.trim()}
                title="保存"
                aria-label="保存"
              >
                <Save size={12} />
                <span>{saved ? '保存済み' : '保存'}</span>
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
      </section>

      <section className="ov-settings-section">
        <h2 className="ov-settings-section__title">参照 Think</h2>
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
}
