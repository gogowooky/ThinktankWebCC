// アプリの初期化、グローバルイベントリスナー登録

import { useEffect } from 'react';
import { app } from './views/TTApplication';
import { useNotify } from './hooks/useNotify';
import { AppLayout } from './components/Layout/AppLayout';

export default function App() {
  useNotify(app);

  useEffect(() => {
    void app.Initialize();
    return () => app.Shortcuts.Detach();
  }, []);

  return <AppLayout />;
}
