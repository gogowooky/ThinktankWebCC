// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TTThinktankPanel, ThinktankViewMode } from '../views/TTThinktankPanel';
import type { LayoutMode } from '../components/Layout/AppLayout';
import { useThinktankViewMode } from './useThinktankViewMode';

let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it.each(['simple', 'sipoc'] as const)('only changes the model after commit in %s mode', async layoutMode => {
  let phase = 'outside';
  const panel = { ViewMode: 'chat' as ThinktankViewMode, SetViewMode: vi.fn((mode: ThinktankViewMode) => {
    expect(phase).toBe('rendered');
    panel.ViewMode = mode;
  }) };
  const visible: ThinktankViewMode[] = [];
  function Probe({ layout }: { layout: LayoutMode }) {
    phase = 'rendering';
    visible.push(useThinktankViewMode(panel as unknown as TTThinktankPanel, layout));
    expect(panel.ViewMode).toBe('chat');
    phase = 'rendered';
    return null;
  }
  await act(async () => root.render(<Probe layout={layoutMode} />));
  expect(visible).toEqual([layoutMode === 'simple' ? 'filter' : 'chat']);
  expect(panel.SetViewMode).toHaveBeenCalledTimes(layoutMode === 'simple' ? 1 : 0);
});
