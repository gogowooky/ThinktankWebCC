import type { TTWorkingPanel } from '../../../views/TTWorkingPanel';
import { FOLDING_HEADER_STATUS_ID, LINK_STYLE_STATUS_IDS, isUnset, parseAttrs, parseMarks, styleStatusId, type ColorProp, type MarkKind } from '../../../utils/defaultColor';
import { DD_GHOST_KINDS, FOCUSING_BORDER_STATUS_ID, PANEL_THEME_KINDS, ddGhostStatusId, panelThemeStatusId } from '../../../utils/panelTheme';

export const TEXT_EDITOR_BASE_COLORS: {
  statusId: string;
  label: string;
  /** 並べる色見本と、その見本が編集する ColorProp・ツールチップ */
  pickers: { prop: ColorProp; tip: string; fallback: string; }[];
}[][] = [
    // 配列1つが1行。基本｜選択 / 出現｜折畳 の2列に並べる
    [
      {
        statusId: 'TextEditor.Text', label: '基本', pickers: [
          { prop: 'Color', tip: '基本の文字色', fallback: '#000000' },
          { prop: 'BgColor', tip: '基本の背景色', fallback: '#ffffff' },
        ],
      },
      { statusId: 'TextEditor.Selection.Theme', label: '選択', pickers: [{ prop: 'Color', tip: '選択範囲の背景色', fallback: '#ffffff' }] },
    ],
    [
      { statusId: 'TextEditor.Occurrence.Theme', label: '出現', pickers: [{ prop: 'Color', tip: '出現（同じ語）の背景色', fallback: '#ffffff' }] },
      { statusId: FOLDING_HEADER_STATUS_ID, label: '折畳', pickers: [{ prop: 'Color', tip: '折り畳まれている行の背景色', fallback: '#ffffff' }] },
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

export function ColorStyleRow({ panel, statusId, label }: { panel: TTWorkingPanel; statusId: string; label: string; }) {
  const style = panel.GetColorStatus(statusId);
  const attrs = parseAttrs(style.Attrs);
  const hasBg = !isUnset(style.BgColor);
  return (
    <div className="working-setting-area__heading-style-row">
      <span className="working-setting-area__heading-style-label working-setting-area__swatch-label">{label}</span>
      <input
        type="color"
        className="working-setting-area__color-picker"
        value={isUnset(style.Color) ? '#000000' : style.Color.slice(0, 7)}
        onChange={e => panel.SetColorStatus(statusId, 'Color', e.target.value)}
        data-tip={`${label}の文字色`}
      />
      <label className="working-setting-area__small-checkbox">
        <input
          type="checkbox"
          checked={attrs.has('bold')}
          onChange={e => panel.ToggleColorStatusAttr(statusId, 'bold', e.target.checked)}
        />
        B
      </label>
      <label className="working-setting-area__small-checkbox">
        <input
          type="checkbox"
          checked={attrs.has('underline')}
          onChange={e => panel.ToggleColorStatusAttr(statusId, 'underline', e.target.checked)}
        />
        U
      </label>
      <label className="working-setting-area__small-checkbox">
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
          className="working-setting-area__color-picker"
          value={style.BgColor.slice(0, 7)}
          onChange={e => panel.SetColorStatus(statusId, 'BgColor', e.target.value)}
          data-tip={`${label}の背景色`}
        />
      )}
    </div>
  );
}

export function MarkStyleRows({ panel, kind }: { panel: TTWorkingPanel; kind: MarkKind; }) {
  const marks = parseMarks(panel.TextEditor[kind].Marks);
  return (
    <>
      {marks.map((mark, i) => (
        <ColorStyleRow key={i} panel={panel} statusId={styleStatusId(kind, i + 1)} label={mark} />
      ))}
    </>
  );
}
