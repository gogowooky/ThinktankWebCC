/**
 * LinkTargetMedia.tsx
 * linkファイル（ContentType = 'links'）の HTML表示。ファイル自体ではなく、# Link のリンク先を表示する。
 *
 * https のページは iframe に埋め込む。埋め込みを拒むサイト（X-Frame-Options 等）は白紙になるため、
 * どの場合もツールバーから外部で開けるようにしておく。ローカルパスは埋め込めないので既定アプリで開く。
 */

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { MediaProps } from './types';
import { isLocalPathTarget, linkEmbedUrl, parseLinkFile } from '../../../utils/linkFormat';
import { getErrorMessage } from '../../../utils/errorMessage';
import './HtmlMedia.css';
import './LinkTargetMedia.css';

export interface LinkTargetMediaRef { focus: () => void }

export const LinkTargetMedia = forwardRef<LinkTargetMediaRef, MediaProps>(function LinkTargetMedia({ think }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const [openError, setOpenError] = useState('');
  useImperativeHandle(ref, () => ({ focus: () => root.current?.focus() }), []);

  const target = useMemo(() => parseLinkFile(think?.Content ?? '')?.link.trim() ?? '', [think?.Content]);
  const embedUrl = useMemo(() => (target ? linkEmbedUrl(target) : null), [target]);
  const isPath = !!target && isLocalPathTarget(target);
  const system = window.electronAPI?.system;

  const handleOpenExternal = async () => {
    setOpenError('');
    try {
      if (isPath) {
        if (!system) { setOpenError('ローカルファイルの起動はPC版（Electron）でのみ利用できます'); return; }
        const res = await system.openPath(target);
        if (!res.ok) setOpenError(res.error);
        return;
      }
      // javascript: 等は開かない
      if (/^https?:\/\//i.test(target)) window.open(target, '_blank');
    } catch (err) {
      setOpenError(getErrorMessage(err));
    }
  };

  const canOpenExternal = isPath || /^https?:\/\//i.test(target);

  return (
    <div className="html-media link-target-media" ref={root} tabIndex={-1}>
      <div className="html-media__toolbar">
        <span className="link-target-media__target" data-tip={target} data-tip-side="bottom">
          {target ? `リンク先 · ${target}` : 'リンク先 · 未記載'}
        </span>
        {canOpenExternal && (
          <button type="button" onClick={() => void handleOpenExternal()}>
            {isPath ? '既定のアプリで開く' : 'ブラウザで開く'}
          </button>
        )}
      </div>
      {openError && <p role="alert" className="link-target-media__notice">{openError}</p>}
      {embedUrl ? (
        <iframe
          title={think?.Name ? `リンク先：${think.Name}` : 'リンク先'}
          src={embedUrl}
          // 親（アプリ）へは触れさせない。トップの遷移・ポップアップも許さない
          sandbox="allow-scripts allow-same-origin allow-forms"
          referrerPolicy="no-referrer"
        />
      ) : (
        <p className="link-target-media__notice">
          {!target
            ? 'このlinkファイルには # Link にリンク先が書かれていません。'
            : isPath
              ? 'ローカルのファイル・フォルダはここに表示できません。上のボタンから既定のアプリで開いてください。'
              : 'このリンク先（https 以外）はここに表示できません。'}
        </p>
      )}
    </div>
  );
});
