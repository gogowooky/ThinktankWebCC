import React, { useEffect, useState, useRef, useMemo } from 'react';
import './CommandPalette.css';
import { CommandPaletteItem } from '../../Views/TTApplication';

export interface CommandPaletteProps {
    items: CommandPaletteItem[];
    placeholder?: string;
    onSelect: (item: CommandPaletteItem) => void;
    onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ items, placeholder, onSelect, onClose }) => {
    const [inputValue, setInputValue] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Filter items based on input
    const filteredItems = useMemo(() => {
        if (!inputValue) return items;
        const lowerInput = inputValue.toLowerCase();
        return items.filter(item =>
            item.label.toLowerCase().includes(lowerInput) ||
            (item.description && item.description.toLowerCase().includes(lowerInput))
        );
    }, [items, inputValue]);

    // Reset selection when list changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [filteredItems]);

    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Auto-focus input on mount
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < filteredItems.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredItems.length > 0) {
                onSelect(filteredItems[selectedIndex]);
                onClose();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    // Close on click outside overlay
    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="tt-command-palette-overlay" onMouseDown={handleOverlayClick}>
            <div className="tt-command-palette">
                <div className="tt-command-palette-input-container">
                    <input
                        ref={inputRef}
                        type="text"
                        className="tt-command-palette-input"
                        placeholder={placeholder || "Type to search..."}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                </div>
                <ul className="tt-command-palette-list" ref={listRef}>
                    {filteredItems.map((item, index) => (
                        <li
                            key={item.id}
                            className={`tt-command-palette-item ${index === selectedIndex ? 'selected' : ''}`}
                            onClick={() => {
                                onSelect(item);
                                onClose();
                            }}
                            onMouseEnter={() => setSelectedIndex(index)}
                        >
                            <span className="tt-command-palette-item-label">{item.label}</span>
                            {item.description && (
                                <span className="tt-command-palette-item-desc">{item.description}</span>
                            )}
                        </li>
                    ))}
                    {filteredItems.length === 0 && (
                        <li className="tt-command-palette-item" style={{ cursor: 'default', color: 'gray' }}>
                            <span className="tt-command-palette-item-label">No matching commands</span>
                        </li>
                    )}
                </ul>
            </div>
        </div>
    );
};
