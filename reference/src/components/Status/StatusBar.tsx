import React, { useState, useEffect, useRef } from 'react';
import { TTApplication } from '../../Views/TTApplication';
import { StorageManager, ConnectionStatus } from '../../services/storage';
import { conflictResolver } from '../../services/storage/ConflictResolver';

// 段205: 同期状態の表示テキスト・色を返す
function getSyncIndicator(
    connStatus: ConnectionStatus,
    pendingCount: number,
    conflictCount: number
): { text: string; color: string } {
    if (conflictCount > 0) {
        return { text: `⚠ Conflict (${conflictCount}件)`, color: '#ff4444' };
    }
    switch (connStatus) {
        case 'syncing':
            return { text: `◐ Syncing`, color: '#4488ff' };
        case 'offline':
            return pendingCount > 0
                ? { text: `○ Offline (${pendingCount}件未送信)`, color: '#ffcc00' }
                : { text: `○ Offline`, color: '#888888' };
        case 'online':
        default:
            return pendingCount > 0
                ? { text: `◐ Pending (${pendingCount}件)`, color: '#ff8800' }
                : { text: `● Synced`, color: '#44cc44' };
    }
}

export const StatusBar: React.FC = () => {
    const [status, setStatus] = useState<string>('');
    const [key, setKey] = useState<string>('');
    const [action, setAction] = useState<string>('');
    // 段205: 同期状態
    const [connStatus, setConnStatus] = useState<ConnectionStatus>(StorageManager.connectionStatus);
    const [pendingCount, setPendingCount] = useState<number>(0);
    const [conflictCount, setConflictCount] = useState<number>(0);
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // 未送信件数・衝突件数をポーリングで更新（10秒間隔）
    const refreshSyncState = async () => {
        const count = await StorageManager.getPendingCount();
        setPendingCount(count);
        setConflictCount(conflictResolver.conflictCount);
    };

    useEffect(() => {
        const updateState = () => {
            const app = TTApplication.Instance;
            setStatus(app.ContextString);
            setKey(app.LastKeyString);
            setAction(app.LastActionID);
        };

        // Initial update
        updateState();
        refreshSyncState();

        // Subscribe
        TTApplication.Instance.AddOnUpdate('StatusBar', updateState);

        // StorageManager の接続状態変化を購読
        const onStatusChange = (s: ConnectionStatus) => {
            setConnStatus(s);
            refreshSyncState();
        };
        StorageManager.addStatusListener(onStatusChange);

        // ポーリング（10秒間隔）
        pollTimerRef.current = setInterval(refreshSyncState, 10000);

        return () => {
            TTApplication.Instance.RemoveOnUpdate('StatusBar');
            StorageManager.removeStatusListener(onStatusChange);
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
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
            {/* 段205: 同期状態インジケーター */}
            {(() => {
                const ind = getSyncIndicator(connStatus, pendingCount, conflictCount);
                return (
                    <div style={{ marginLeft: 'auto', color: ind.color, fontWeight: 'bold' }}>
                        {ind.text}
                    </div>
                );
            })()}
        </div>
    );
};
