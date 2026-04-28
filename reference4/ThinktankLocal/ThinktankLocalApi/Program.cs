// ThinktankLocalApi - ASP.NET Core Minimal API
// ローカルファイルシステム操作と同期キュー管理を担当する。
//
// Phase 1: スケルトン（ヘルスチェックのみ）
// Phase 21: LocalFsService（Local FS R/W）
// Phase 22: SyncQueueService + SyncBackgroundService
// Phase 23: ConflictResolver

using ThinktankLocalApi;

var builder = WebApplication.CreateBuilder(args);

// CORS: React SPA（localhost:5173）からのアクセスを許可
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(
            "http://localhost:5173",   // Vite dev server
            "http://localhost:4173"    // Vite preview
        )
        .AllowAnyHeader()
        .AllowAnyMethod();
    });
});

// サービス登録（各 Phase で追加していく）
// Phase 21: builder.Services.AddSingleton<LocalFsService>();
// Phase 22: builder.Services.AddSingleton<SyncQueueService>();
// Phase 22: builder.Services.AddHostedService<SyncBackgroundService>();

var app = builder.Build();

app.UseCors();

// ── ヘルスチェック ──────────────────────────────────────────
app.MapGet("/api/health", () => new
{
    status = "ok",
    mode = "local",
    version = "4.0.0",
    timestamp = DateTimeOffset.UtcNow
});

// ── 同期ステータス（Phase 22 で実装）──────────────────────
app.MapGet("/api/sync/status", () => new
{
    pending = 0,
    isSyncing = false,
    isOnline = true,
    lastSyncAt = (DateTimeOffset?)null
});

// ── Files API（Phase 21 で実装）───────────────────────────
// GET  /api/files/meta        メタデータ一覧
// GET  /api/files/{id}/content 本文取得
// POST /api/files             保存
// DELETE /api/files/{id}      削除
// GET  /api/files/search      全文検索

app.Run();
