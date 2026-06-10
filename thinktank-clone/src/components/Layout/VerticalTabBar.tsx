// 各パネル側部の縦型タブバー

import type { ReactNode } from 'react';
import './VerticalTabBar.css';

interface VerticalTabBarProps {
  theme: 'thinktank' | 'overview' | 'workout' | 'rethink';
  side: 'left' | 'right';
  label: string;
  children?: ReactNode;
  bottom?: ReactNode;
}

export function VerticalTabBar({ theme, side, label, children, bottom }: VerticalTabBarProps) {
  return (
    <div className={`vertical-tab-bar vertical-tab-bar--${theme}`} data-side={side}>
      <div className="vertical-tab-bar__buttons">{children}</div>
      <div className="vertical-tab-bar__spacer" />
      {bottom && <div className="vertical-tab-bar__bottom">{bottom}</div>}
      <div className="vertical-tab-bar__label-wrap">
        <span className="vertical-tab-bar__label">{label}</span>
      </div>
    </div>
  );
}

interface TabButtonProps {
  tip: string;
  tipSide?: 'left' | 'right';
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function TabButton({ tip, tipSide = 'right', active, onClick, children }: TabButtonProps) {
  return (
    <button
      className={`vertical-tab-bar__toggle${active ? ' vertical-tab-bar__toggle--active' : ''}`}
      data-tip={tip}
      data-tip-side={tipSide}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
