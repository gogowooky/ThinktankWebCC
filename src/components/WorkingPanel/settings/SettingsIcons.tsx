import { GalleryThumbnails, PanelLeftDashed, PanelRightDashed, PanelTopDashed, PanelBottomDashed } from 'lucide-react';

export type Dir = 'right' | 'left' | 'up' | 'down';

export function SplitIcon({ dir }: { dir: Dir; }) {
  switch (dir) {
    case 'left': return <PanelRightDashed size={16} className="ws-icon" />;
    case 'right': return <PanelLeftDashed size={16} className="ws-icon" />;
    case 'up': return <PanelBottomDashed size={16} className="ws-icon" />;
    case 'down': return <PanelTopDashed size={16} className="ws-icon" />;
  }
}

export function AddIcon({ dir }: { dir: Dir; }) {
  let transform = '';
  switch (dir) {
    case 'left': transform = 'rotate(-90deg)'; break;
    case 'right': transform = 'rotate(90deg)'; break;
    case 'up': transform = 'none'; break;
    case 'down': transform = 'rotate(180deg)'; break;
  }
  return <GalleryThumbnails size={16} className="ws-icon" style={{ transform }} />;
}
