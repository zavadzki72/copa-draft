namespace CopaDraft.Api.Services;

/// <summary>
/// Canonical round clock: walks minutes 1..maxMinute at a fixed pace, invoking
/// the tick callback. The server is the single time authority in MP — every
/// client ticker follows these ticks, so the room's tables stay coherent.
/// </summary>
public sealed class RoundClock(int paceMsPerMinute)
{
    /// <param name="skip">Quando completa (todos os humanos terminaram de
    /// assistir), o restante da rodada resolve instantaneamente.</param>
    public async Task RunAsync(int maxMinute, Func<int, Task> onMinute, CancellationToken ct, Task? skip = null)
    {
        for (int minute = 1; minute <= maxMinute; minute++)
        {
            ct.ThrowIfCancellationRequested();
            bool skipped = skip is not null && skip.IsCompleted;
            if (!skipped && paceMsPerMinute > 0)
            {
                Task delay = Task.Delay(paceMsPerMinute, ct);
                await (skip is not null ? Task.WhenAny(delay, skip) : delay);
            }
            await onMinute(minute);
        }
    }
}
