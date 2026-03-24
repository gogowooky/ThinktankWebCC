import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

import { TTApplication } from './Views/TTApplication';
import { webSocketService } from './services/sync/WebSocketService';
import { setupMemoWebSocketHandler } from './models/TTMemo';
import { TTModels } from './models/TTModels';
import { TTMemo } from './models/TTMemo';
import { SearchApp } from './components/Search/SearchApp';
import { ChatApp } from './components/AI/ChatApp';

const app = TTApplication.Instance;
console.log('TTApplication initialized:', app);
console.log('Panels:', app.Panels);
console.log('Active Panel:', app.ActivePanel);

// WebSocketサービスを初期化
webSocketService.initialize();

// メモのリモート更新ハンドラを設定
setupMemoWebSocketHandler((fileId: string) => {
    const memos = TTModels.Instance?.Memos;
    if (memos) {
        return memos.GetItem(fileId) as TTMemo | undefined;
    }
    return undefined;
});

// Phase 12 段265: AI Facilitator 起動（Memosロード後に実行）
const models = TTModels.Instance;
if (models.Status.GetValue('AI.Facilitator.Enabled') !== 'false') {
    // メモのロード完了後に記念日リコールを実行するため少し遅延させる
    setTimeout(async () => {
        try {
            await app.startFacilitator(models);
        } catch (e) {
            console.warn('[Facilitator] 起動エラー:', e);
        }
    }, 3000); // 3秒後にFacilitatorを起動
}

// Test focus
app.Focus('Library', 'Table', 'Main');
console.log('Focused Tool:', app.FocusedTool);

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        {window.location.pathname === '/' ? <App /> :
            window.location.pathname === '/ttsearch' ? <SearchApp /> :
            window.location.pathname === '/aichat' ? <ChatApp /> :
                <div style={{ backgroundColor: '#ffffff', width: '100vw', height: '100vh' }}></div>}
    </React.StrictMode>
);
