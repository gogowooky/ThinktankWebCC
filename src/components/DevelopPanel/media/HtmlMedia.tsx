import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { MediaProps } from './types';
import { buildHtmlPreview } from '../../../utils/htmlPreview';
import { TTApplication } from '../../../views/TTApplication';
import { useAppUpdate } from '../../../hooks/useAppUpdate';
import { supportRecord } from '../../../services/thoughtSupport';
import './HtmlMedia.css';

export interface HtmlMediaRef { focus: () => void }
export const HtmlMedia = forwardRef<HtmlMediaRef, MediaProps>(function HtmlMedia({ think }, ref) {
  const vault = TTApplication.Instance.Models.Vault;
  useAppUpdate(vault);
  const source = think?.Metadata.supportSource as { chatId: string; chatVersion: number; generatedAt: string; sources: Array<{ id: string; updatedAt: string }> } | undefined;
  const stale = source && (supportRecord(vault.GetThink(source.chatId)).version !== source.chatVersion || source.sources.some(s => !vault.GetThink(s.id) || vault.GetThink(s.id)?.UpdatedAt !== s.updatedAt));
  const root = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(18);
  useImperativeHandle(ref, () => ({ focus: () => root.current?.focus() }), []);
  const document = useMemo(() => buildHtmlPreview(think?.Content ?? '', fontSize), [think?.Content, fontSize]);
  return <div className="html-media" ref={root} tabIndex={-1}>
    <div className="html-media__toolbar"><span>HTML資料 · 閲覧</span>
      <label>文字サイズ <select value={fontSize} onChange={e => setFontSize(Number(e.target.value))}>
        <option value={16}>標準</option><option value={18}>大きめ</option><option value={22}>大</option><option value={26}>特大</option>
      </select></label>
    </div>
    {source && <p role="status">作成：{source.generatedAt} {stale ? '／ 元の記録が変わっています。AIChatで内容の再確認・再作成を相談してください。' : '／ 参照時点の資料です。'}</p>}
    <iframe title={think?.Name ? `HTML資料：${think.Name}` : 'HTML資料'} sandbox="" referrerPolicy="no-referrer" srcDoc={document} />
  </div>;
});
