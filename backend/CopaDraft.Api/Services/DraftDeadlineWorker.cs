using CopaDraft.Api.Data;
using CopaDraft.Api.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace CopaDraft.Api.Services;

/// <summary>
/// Watches rooms whose draft deadline expired: autofills missing teams and
/// kicks the tournament off, so absent/slow players never block the room.
/// </summary>
public sealed class DraftDeadlineWorker(
    IServiceScopeFactory scopes, IHubContext<LobbyHub> hub, TournamentOrchestrator orchestrator)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try { await SweepAsync(ct); }
            catch (Exception e) { Console.Error.WriteLine($"[draft-deadline] {e.Message}"); }
            await Task.Delay(TimeSpan.FromSeconds(5), ct);
        }
    }

    private async Task SweepAsync(CancellationToken ct)
    {
        using IServiceScope scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var draft = scope.ServiceProvider.GetRequiredService<DraftService>();

        List<string> expired = await db.Rooms.AsNoTracking()
            .Where(r => r.State == RoomState.Draft && r.DraftDeadline != null && r.DraftDeadline < DateTimeOffset.UtcNow)
            .Select(r => r.Code)
            .ToListAsync(ct);

        foreach (string code in expired)
        {
            int filled = await draft.AutofillMissingAsync(code, ct);
            if (filled > 0)
            {
                DraftProgressDto progress = await draft.ProgressAsync(code, ct);
                await hub.Clients.Group(code).SendAsync(LobbyHub.DraftProgressEvent, progress, ct);
            }
            await hub.Clients.Group(code).SendAsync(LobbyHub.DraftCompleteEvent, ct);
            await orchestrator.TryStartAsync(code, ct);
        }
    }
}
