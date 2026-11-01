// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const editorCapture = vi.hoisted(() => ({ props: null as Record<string, any> | null }));

vi.mock('@monaco-editor/react', () => ({
  default: (props: Record<string, any>) => {
    editorCapture.props = props;
    return <div data-testid="monaco" />;
  },
}));
vi.mock('./monacoSetup', () => ({}));

import { TTThink } from '../../../models/TTThink';
import { TextEditorMedia } from './TextEditorMedia';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  editorCapture.props = null;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('opens aiview text in Monaco without allowing edits or save callbacks', async () => {
  const think = new TTThink();
  think.ID = '2026-10-30-120000-aiview';
  think.ContentType = 'aiview';
  think.setContentSilent('AIまとめ\n# 結論');
  const onSave = vi.fn(async () => {});
  const onDirtyChange = vi.fn();
  const onTitleChange = vi.fn();

  await act(async () => root.render(
    <TextEditorMedia
      think={think}
      vault={{} as never}
      onSave={onSave}
      onDirtyChange={onDirtyChange}
      onTitleChange={onTitleChange}
    />,
  ));

  expect(editorCapture.props?.options).toMatchObject({ readOnly: true, domReadOnly: true });
  await act(async () => editorCapture.props?.onChange('書き換え'));
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  expect(onSave).not.toHaveBeenCalled();
  expect(onTitleChange).not.toHaveBeenCalled();
});
