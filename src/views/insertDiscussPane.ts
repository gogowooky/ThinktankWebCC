import type { TTVault } from '../models/TTVault';
import type { TTDiscussPanel, PaneDirection, PanePlacement } from './TTDiscussPanel';

export async function duplicateDiscussPane(
  panel: TTDiscussPanel,
  vault: Pick<TTVault, 'CreateBlankThink'>,
  dir: PaneDirection,
  placement: PanePlacement,
): Promise<void> {
  if (panel.Layout === null) {
    const think = await vault.CreateBlankThink('memo', '新規メモ');
    if (placement === 'split') panel.AddFirst(think.ID, 'texteditor', think.Name);
    else panel.InsertArea(think.ID, 'texteditor', think.Name, dir, placement);
  } else {
    const focused = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
    if (focused) panel.InsertArea(focused.ResourceID, focused.MediaType, focused.Title, dir, placement);
  }
}
