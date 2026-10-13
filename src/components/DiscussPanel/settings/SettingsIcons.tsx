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

export function DatabaseArrowDown({ size = 16, className }: { size?: number; className?: string; }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m16 19 3 3 3-3" />
      <path d="M19 16v6" />
      <path d="M21 12.536V5" />
      <path d="M3 12A9 3 0 0 0 15.182 14.806" />
      <path d="M3 5V19A9 3 0 0 0 13.318 21.968" />
      <ellipse cx="12" cy="5" rx="9" ry="3" />
    </svg>
  );
}
