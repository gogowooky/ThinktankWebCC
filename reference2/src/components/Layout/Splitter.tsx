import React, { useState, useCallback } from 'react';

interface SplitterProps {
    direction: 'horizontal' | 'vertical';
    onResize: (delta: number) => void;
    className?: string;
}

export const Splitter: React.FC<SplitterProps> = ({ direction, onResize, className }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);

        const startX = e.clientX;
        const startY = e.clientY;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (direction === 'horizontal') {
                onResize(moveEvent.clientX - startX);
            } else {
                onResize(moveEvent.clientY - startY);
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [direction, onResize]);

    return (
        <div
            className={`splitter ${direction} ${isDragging ? 'dragging' : ''} ${className || ''}`}
            onMouseDown={handleMouseDown}
            style={{
                cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
                zIndex: 10,
                userSelect: 'none',
            }}
        />
    );
};
