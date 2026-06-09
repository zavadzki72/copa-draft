using CopaDraft.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CopaDraft.Api.Services;

/// <summary>
/// Na subida da API, retoma torneios interrompidos por um restart: salas em
/// Groups/Knockout sem runner em memória são re-executadas — o engine é
/// determinístico, então a re-simulação reproduz o mesmo torneio (mesma seed).
/// </summary>
public sealed class TournamentResumeWorker(
    IServiceScopeFactory scopes, TournamentOrchestrator orchestrator) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        // pequena folga para o host terminar de subir (hubs/migrations)
        await Task.Delay(TimeSpan.FromSeconds(2), ct);

        List<string> interrupted;
        using (IServiceScope scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            interrupted = await db.Rooms.AsNoTracking()
                .Where(r => r.State == RoomState.Groups || r.State == RoomState.Knockout)
                .Select(r => r.Code)
                .ToListAsync(ct);
        }

        foreach (string code in interrupted)
        {
            try
            {
                bool resumed = await orchestrator.ResumeAsync(code, ct);
                Console.WriteLine($"[resume] sala {code}: {(resumed ? "torneio retomado" : "ignorada")}");
            }
            catch (Exception e)
            {
                Console.Error.WriteLine($"[resume] sala {code}: {e.Message}");
            }
        }
    }
}
