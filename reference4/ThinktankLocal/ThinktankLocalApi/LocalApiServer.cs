using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace ThinktankLocalApi;

/// <summary>
/// WPF の App.xaml.cs から呼び出す API サーバーラッパー。
/// ASP.NET Core ホストをバックグラウンドスレッドで起動する。
/// </summary>
public class LocalApiServer(int port = 8081)
{
    private WebApplication? _app;
    private readonly int _port = port;

    public Task StartAsync()
    {
        var args = new[] { $"--urls=http://localhost:{_port}" };
        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddCors(options =>
        {
            options.AddDefaultPolicy(policy =>
            {
                policy.WithOrigins("http://localhost:5173", "http://localhost:4173")
                      .AllowAnyHeader()
                      .AllowAnyMethod();
            });
        });

        _app = builder.Build();
        _app.UseCors();

        _app.MapGet("/api/health", () => new { status = "ok", mode = "local" });
        _app.MapGet("/api/sync/status", () => new { pending = 0, isSyncing = false, isOnline = true });

        return _app.StartAsync();
    }

    public void Stop() => _app?.StopAsync().GetAwaiter().GetResult();
}
