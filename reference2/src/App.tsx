import { MainLayout } from './components/Layout/MainLayout';
import { StatusBar } from './components/Status/StatusBar';
import { ContextMenu } from './components/UI/ContextMenu';
import { CommandPalette } from './components/UI/CommandPalette';
import { TTApplication, CommandPaletteState } from './Views/TTApplication';
import { useState, useEffect } from 'react';

function App() {
    const [contextMenu, setContextMenu] = useState(TTApplication.Instance.ContextMenu);
    const [commandPalette, setCommandPalette] = useState<CommandPaletteState | null>(TTApplication.Instance.CommandPalette);

    useEffect(() => {
        const updateState = () => {
            setContextMenu(TTApplication.Instance.ContextMenu);
            setCommandPalette(TTApplication.Instance.CommandPalette);
        };
        TTApplication.Instance.AddOnUpdate('App', updateState);
        return () => {
            TTApplication.Instance.RemoveOnUpdate('App');
        };
    }, []);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // 同一オリジンからのメッセージのみ受け付ける
            if (event.origin !== window.location.origin) return;

            const data = event.data;
            if (data && data.type === 'TT_WEBVIEW_ACTION' && data.event) {
                const app = TTApplication.Instance;
                app.UIRequestTriggeredAction(data.event);
            }
            // iframe内のSearchApp等からのナビゲーション通知 → WebView.Keywordに反映
            if (data && data.type === 'TT_WEBVIEW_NAVIGATE' && data.url) {
                const app = TTApplication.Instance;
                const panel = app.ActivePanel;
                if (panel && panel.Mode === 'WebView') {
                    panel.WebView.ApplyUrl(data.url);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const closeContextMenu = () => {
        TTApplication.Instance.HideContextMenu();
    };

    const closeCommandPalette = () => {
        TTApplication.Instance.HideCommandPalette();
    };

    const handleCommandSelect = (item: any) => { // Type as any or fix import if circular dependency
        // item is CommandPaletteItem
        if (commandPalette?.onSelect) {
            commandPalette.onSelect(item);
        } else {
            item.onClick();
        }
    };

    return (
        <div className="app-container">
            <main className="editor-area" style={{ padding: 0, paddingBottom: '22px' }}>
                <MainLayout />
            </main>
            <StatusBar />
            {contextMenu && (
                <ContextMenu
                    items={contextMenu.items}
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={closeContextMenu}
                />
            )}
            {commandPalette && commandPalette.visible && (
                <CommandPalette
                    items={commandPalette.items}
                    placeholder={commandPalette.placeholder}
                    onSelect={handleCommandSelect}
                    onClose={closeCommandPalette}
                />
            )}
        </div>
    )
}

export default App
