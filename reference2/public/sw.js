/**
 * Service Worker for Thinktank Web
 * オフライン対応とキャッシュ管理
 */

const CACHE_NAME = 'thinktank-v2';

// キャッシュするファイル（静的アセット）
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json'
];

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    // 即座にアクティブ化
    self.skipWaiting();
});

// アクティベーション時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        })
    );
    // 全てのクライアントを即座に制御
    self.clients.claim();
});

// Fetch イベントの処理
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // HTTPまたはHTTPS以外のスキームは無視（chrome-extension など）
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // API リクエストはネットワークファースト
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    // オフライン時はエラーレスポンスを返す
                    return new Response(
                        JSON.stringify({ error: 'Offline', offline: true }),
                        {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                })
        );
        return;
    }

    // 静的アセットはネットワークファースト（開発時の更新を確実に反映）
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 成功したレスポンスをキャッシュに保存
                if (response.ok && event.request.method === 'GET') {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // ネットワーク失敗時のみキャッシュを使用（オフライン対応）
                return caches.match(event.request);
            })
    );
});

// メッセージ処理（将来の拡張用）
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
