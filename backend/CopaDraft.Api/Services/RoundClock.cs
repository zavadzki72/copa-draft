namespace CopaDraft.Api.Services;

/// <summary>
/// Canonical round clock: walks minutes 1..maxMinute at a fixed pace, invoking
/// the tick callback. The server is the single time authority in MP — every
/// client ticker follows these ticks, so the room's tables stay coherent.
/// </summary>
public sealed class RoundClock(int paceMsPerMinute)
{
    public async Task RunAsync(int maxMinute, Func<int, Task> onMinute, CancellationToken ct)
    {
        for (int minute = 1; minute <= maxMinute; minute++)
        {
            ct.ThrowIfCancellationRequested();
            if (paceMsPerMinute > 0) await Task.Delay(paceMsPerMinute, ct);
            await onMinute(minute);
        }
    }
}
