import { describe, expect, it } from 'vitest';
import { STATUS_ACTION_BINDING } from './statusActionBinding';

describe('docs/status-action/ の読み込み', () => {
  const headings = STATUS_ACTION_BINDING.split('\n').filter(line => line.startsWith('# ')).map(line => line.replace(/\s*=+\s*$/, ''));

  it('番号付きファイルを番号順につなげる', () => {
    expect(headings[0]).toBe('# Application');
    expect(headings.at(-1)).toBe('# その他');
    expect(headings.indexOf('# ToolBar')).toBeLessThan(headings.indexOf('# Panel AIChat'));
    expect(headings.indexOf('# TextEditor Edit')).toBeLessThan(headings.indexOf('# TextEditor ExDate'));
    expect(headings).toHaveLength(20);
  });

  it('README（書式の説明）は読み込まない', () => {
    expect(STATUS_ACTION_BINDING).not.toContain('# AIへの指示');
    expect(STATUS_ACTION_BINDING).not.toContain('# IDの命名規則');
  });
});
