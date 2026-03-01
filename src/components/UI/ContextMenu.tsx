import React, { useEffect, useRef } from 'react';
import './ContextMenu.css';

export interface ContextMenuItem {
    id: string;
    label: string;
    onClick: () => void;
}

export interface ContextMenuProps {
    items: ContextMenuItem[];
    x: number;
    y: number;
    onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ items, x, y, onClose }) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [adjustedPos, setAdjustedPos] = React.useState({ x, y });

    // Handle Closing (ESC only, per user request to persist on focus loss)
    useEffect(() => {
        // const handleClickOutside = (event: MouseEvent) => {
        //     if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        //         onClose();
        //     }
        // };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        }

        // Delay adding the event listener
        const timeoutId = setTimeout(() => {
            // document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }, 0);

        return () => {
            clearTimeout(timeoutId);
            // document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    // Viewport Adjustment
    React.useLayoutEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let newX = x;
            let newY = y;

            // Right edge check
            if (x + rect.width > viewportWidth) {
                newX = viewportWidth - rect.width - 5;
            }
            // Bottom edge check
            if (y + rect.height > viewportHeight) {
                newY = viewportHeight - rect.height - 5;
            }

            // Ensure not negative (Top/Left check)
            if (newX < 0) newX = 5;
            if (newY < 0) newY = 5;

            setAdjustedPos({ x: newX, y: newY });
        }
    }, [x, y, items]); // items changed -> size changed

    const style: React.CSSProperties = {
        top: adjustedPos.y,
        left: adjustedPos.x,
        // opacity: adjustedPos.x === x && adjustedPos.y === y && x === 0 ? 0 : 1,
        // Simple visibility toggle if needed, or just let useLayoutEffect handle it.
        // For now, removing opacity trick as useLayoutEffect is synchronous.
    };

    return (
        <div
            className="tt-context-menu"
            style={style}
            ref={menuRef}
        >
            <ul>
                {items.map((item) => (
                    <li key={item.id} onClick={(e) => {
                        e.stopPropagation();
                        item.onClick();
                        onClose();
                    }}>
                        {item.label}
                    </li>
                ))}
            </ul>
        </div>
    );
};
