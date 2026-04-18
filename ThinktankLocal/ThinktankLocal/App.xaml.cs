using System.Windows;
using ThinktankLocalApi;

namespace ThinktankLocal;

public partial class App : Application
{
    private LocalApiServer? _apiServer;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // C# ローカルAPIサーバーをバックグラウンドで起動（Phase 21で実装）
        _apiServer = new LocalApiServer(port: 8081);
        _apiServer.StartAsync();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _apiServer?.Stop();
        base.OnExit(e);
    }
}
