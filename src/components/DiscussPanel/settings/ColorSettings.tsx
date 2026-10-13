import type { TTDiscussPanel } from '../../../views/TTDiscussPanel';
import { FOLDING_HEADER_STATUS_ID, LINK_STYLE_STATUS_IDS, isUnset, parseAttrs, parseMarks, styleStatusId, type MarkKind } from '../../../utils/defaultColor';
import { DD_GHOST_KINDS, FOCUSING_BORDER_STATUS_ID, PANEL_THEME_KINDS, ddGhostStatusId, panelThemeStatusId } from '../../../utils/panelTheme';

export const TEXT_EDITOR_BASE_COLORS: {
  statusId: string;
  label: string;
  hasColor: boolean;
}[][] = [
    // 配列1つが1行。基本｜選択 / 出現｜折畳 の2列に並べる
    [
      { statusId: 'TextEditor.Text', label: '基本', hasColor: true },
      { statusId: 'TextEditor.Selection', label: '選択', hasColor: false },
    ],
    [
      { statusId: 'TextEditor.Occurrence', label: '出現', hasColor: false },
      { statusId: FOLDING_HEADER_STATUS_ID, label: '折畳', hasColor: false },
    ],
  ];

export const TEXT_EDITOR_TAG_COLORS: { statusId: string; label: string; }[] = [
  { statusId: LINK_STYLE_STATUS_IDS.url, label: 'Url' },
  { statusId: LINK_STYLE_STATUS_IDS.filepath, label: 'File' },
  { statusId: LINK_STYLE_STATUS_IDS.tag, label: 'Tag' },
];

export const PANEL_COLOR_ROWS: { statusId: string; label: string; tip: string; }[] = [
  ...PANEL_THEME_KINDS.map(kind => ({ statusId: panelThemeStatusId(kind), label: kind, tip: `${kind}パネルの基礎色` })),
  { statusId: FOCUSING_BORDER_STATUS_ID, label: 'Border', tip: 'パネル間ボーダーのマウスオーバー／ドラッグ中の色' },
  ...DD_GHOST_KINDS.map(kind => ({
    statusId: ddGhostStatusId(kind),
    label: kind,
    tip: {
      Added: 'D&D時のゴースト色：Pane領域全体へのPane追加位置',
      Divided: 'D&D時のゴースト色：単独Paneを分割したPane位置',
      Replaced: 'D&D時のゴースト色：置き換える単独Paneのタイトル部分',
    }[kind],
  })),
];

export function ColorStyleRow({ panel, statusId, label }: { panel: TTDiscussPanel; statusId: string; label: string; }) {
  const style = panel.GetColorStatus(statusId);
  const attrs = parseAttrs(style.Attrs);
  const hasBg = !isUnset(style.BgColor);
  return (
    <div className="discuss-setting-area__heading-style-row">
      <span className="discuss-setting-area__heading-style-label discuss-setting-area__swatch-label">{label}</span>
      <input
        type="color"
        className="discuss-setting-area__color-picker"
        value={isUnset(style.Color) ? '#000000' : style.Color.slice(0, 7)}
        onChange={e => panel.SetColorStatus(statusId, 'Color', e.target.value)}
        data-tip={`${label}の文字色`}
      />
      <label className="discuss-setting-area__small-checkbox">
        <input
          type="checkbox"
          checked={attrs.has('bold')}
          onChange={e => panel.ToggleColorStatusAttr(statusId, 'bold', e.target.checked)}
        />
        B
      </label>
      <label className="discuss-setting-area__small-checkbox">
        <input
          type="checkbox"
          checked={attrs.has('underline')}
          onChange={e => panel.ToggleColorStatusAttr(statusId, 'underline', e.target.checked)}
        />
        U
      </label>
      <label className="discuss-setting-area__small-checkbox">
        <input
          type="checkbox"
          checked={hasBg}
          onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.checked ? '#ffffff' : 'undefined')}
        />
        BG
      </label>
      {hasBg && (
        <input
          type="color"
          className="discuss-setting-area__color-picker"
          value={style.BgColor.slice(0, 7)}
          onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.value)}
          data-tip={`${label}の背景色`}
        />
      )}
    </div>
  );
}

export function MarkStyleRows({ panel, kind }: { panel: TTDiscussPanel; kind: MarkKind; }) {
  const marks = parseMarks(panel.TextEditor[kind].Marks);
  return (
    <>
      {marks.map((mark, i) => (
        <ColorStyleRow key={i} panel={panel} statusId={styleStatusId(kind, i + 1)} label={mark} />
      ))}
    </>
  );
}
