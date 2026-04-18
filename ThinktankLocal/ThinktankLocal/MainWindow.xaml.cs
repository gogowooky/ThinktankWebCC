using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace ThinktankLocal;

/// <summary>
/// WebView2 を使って ThinktankPWA (React SPA) をホストするメインウィンドウ。
///
/// Phase 20 で完全実装。Phase 1 はスケルトンのみ。
/// </summary>
public partial class MainWindow : Window
{
    // ローカルAPIのポート番号（App.xaml.cs と一致させること）
    private const int LocalApiPort = 8081;

    // React SPA のURL（開発時は Vite dev server、本番時は dist/ をローカルサーバーで配信）
    private const string SpaUrl = "http://localhost:5173";

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        await InitWebViewAsync();
    }

    private async Task InitWebViewAsync()
    {
        // WebView2 環境を初期化
        await webView.EnsureCoreWebView2Async(null);

        // DevTools を有効化（開発中のみ）
#if DEBUG
        webView.CoreWebView2.OpenDevToolsWindow();
#endif

        // ナビゲーション完了後に JS 変数を注入
        webView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;

        // React SPA を読み込む
        webView.CoreWebView2.Navigate(SpaUrl);
    }

    private async void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess) return;

        // Local モードを示す JS 変数を注入（Phase 13 の StorageManager が参照する）
        await webView.CoreWebView2.ExecuteScriptAsync($@"
            window.__THINKTANK_MODE__ = 'local';
            window.__THINKTANK_LOCAL_API__ = 'http://localhost:{LocalApiPort}';
            console.log('[ThinktankLocal] Mode injected: local, API port: {LocalApiPort}');
        ");

        // タイトルバーを同期状態で更新（Phase 24 で拡張）
        UpdateTitle("起動中...");
    }

    /// <summary>タイトルバーに同期状態を表示する（Phase 24 で完全実装）</summary>
    public void UpdateTitle(string syncStatus)
    {
        Dispatcher.Invoke(() =>
        {
            Title = $"Thinktank — {syncStatus}";
        });
    }
}
