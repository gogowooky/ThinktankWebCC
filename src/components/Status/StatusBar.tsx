import React, { useState, useEffect } from 'react';
import { TTApplication } from '../../Views/TTApplication';

export const StatusBar: React.FC = () => {
    const [status, setStatus] = useState<string>('');
    const [key, setKey] = useState<string>('');
    const [action, setAction] = useState<string>('');

    useEffect(() => {
        const updateState = () => {
            const app = TTApplication.Instance;
            setStatus(app.ContextString);
            setKey(app.LastKeyString);
            setAction(app.LastActionID);
        };

        // Initial update
        updateState();

        // Subscribe
        TTApplication.Instance.AddOnUpdate('StatusBar', updateState);

        return () => {
            TTApplication.Instance.RemoveOnUpdate('StatusBar');
        };
    }, []);

    return (
        <div style={{
            height: '22px',
            backgroundColor: 'var(--tt-title-bg, #3c3c3c)',
            color: 'var(--tt-title-fg, white)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
            fontSize: '11px',
            fontFamily: 'Meiryo',
            width: '100%',
            boxSizing: 'border-box',
            position: 'fixed',
            bottom: 0,
            left: 0,
            zIndex: 1000,
            gap: '20px'
        }}
            onMouseDown={(e) => {
                // Build Event Context
                let key = '';
                const detail = e.detail;

                if (e.button === 0) {
                    key = `StatusBar_LEFT${detail}`;
                } else if (e.button === 1) {
                    key = `StatusBar_MIDDLE${detail}`;
                } else if (e.button === 2) {
                    key = `StatusBar_RIGHT${detail}`;
                } else {
                    return;
                }

                const mods: string[] = [];
                if (e.ctrlKey) mods.push('Control');
                if (e.shiftKey) mods.push('Shift');
                if (e.altKey) mods.push('Alt');
                if (e.metaKey) mods.push('Meta');

                const context = {
                    Key: key,
                    Mods: mods,
                    ScreenX: e.screenX,
                    ScreenY: e.screenY,
                    ClientX: e.clientX,
                    ClientY: e.clientY,
                };

                const app = TTApplication.Instance;
                const handled = app.UIRequestTriggeredAction(context);

                if (handled) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }}
        >
            <div>Status: {status}</div>
            <div>Key: {key}</div>
            <div>Action: {action}</div>
        </div>
    );
};
