using System.Net.Http.Json;
using System.Text.Json;
using CopaDraft.Api.Hubs;
using CopaDraft.Api.Services;
using CopaDraft.Engine;
using CopaDraft.Engine.Models;
using Microsoft.AspNetCore.SignalR.Client;

namespace CopaDraft.Engine.Tests;

/// <summary>
/// Full multiplayer flow over the real API at zero pace: create/join → start →
/// both submit teams → tournament runs to a champion, with every milestone
/// observed through real SignalR clients.
/// </summary>
public class TournamentIntegrationTests : IClassFixture<ApiTestHost>
{
    private readonly ApiTestHost _host;

    public TournamentIntegrationTests(ApiTestHost host) => _host = host;

    /// <summary>The nth squad whose best XI fully fills a 4-3-3 (some squads
    /// lack e.g. enough LATs) and that still has a reserve GK.</summary>
    private static object ValidTeam(int nth)
    {
        Squad squad = SquadRepository.All
            .Where(s => TeamHelpers.BestXI(s, "4-3-3", GameConfig.Default).Count == 11
                     && s.Players.Count(p => p.Pos == "GOL") >= 2)
            .ElementAt(nth);
        List<EnginePlayer> xi = TeamHelpers.BestXI(squad, "4-3-3", GameConfig.Default);
        var taken = xi.Select(p => p.Id).ToHashSet();
        string benchGk = squad.Players.First(p => p.Pos == "GOL" && !taken.Contains(p.Id)).Id;
        return new
        {
            formation = "4-3-3",
            starters = xi.Select(p => p.Id).ToList(),
            bench = new[] { benchGk },
            captainId = xi[0].Id,
        };
    }

    private static async Task<T> WaitFor<T>(TaskCompletionSource<T> tcs, string what, int seconds = 30)
    {
        Task done = await Task.WhenAny(tcs.Task, Task.Delay(TimeSpan.FromSeconds(seconds)));
        Assert.True(done == tcs.Task, $"timeout esperando {what}");
        return await tcs.Task;
    }

    [Fact]
    public async Task Two_Player_Tournament_Runs_To_A_Champion()
    {
        (Guid hostId, string hostJwt) = _host.NewUser("Zava");
        (Guid guestId, string guestJwt) = _host.NewUser("Amigo");

        HttpClient hostClient = _host.Client(hostJwt);
        HttpResponseMessage created = await hostClient.PostAsync("/api/rooms", null);
        created.EnsureSuccessStatusCode();
        string code = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString()!;

        await using HubConnection hostConn = _host.Hub("/hubs/lobby", hostJwt);
        await using HubConnection guestConn = _host.Hub("/hubs/lobby", guestJwt);

        var yourMatch = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        var finished = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        var lastSnapshot = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        int minuteTicks = 0;
        var sawMatchFinished = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

        hostConn.On<JsonElement>(TournamentOrchestrator.YourMatchEvent, m => yourMatch.TrySetResult(m));
        hostConn.On<int>(TournamentOrchestrator.MinuteTickEvent, _ => Interlocked.Increment(ref minuteTicks));
        hostConn.On<JsonElement>(TournamentOrchestrator.MatchFinishedEvent, _ => sawMatchFinished.TrySetResult(true));
        hostConn.On<JsonElement>(TournamentOrchestrator.TournamentFinishedEvent, f => finished.TrySetResult(f));
        hostConn.On<JsonElement>(TournamentOrchestrator.TournamentStateEvent, s =>
        {
            if (s.GetProperty("phase").GetString() == "encerrada") lastSnapshot.TrySetResult(s);
        });

        await hostConn.StartAsync();
        await guestConn.StartAsync();
        await hostConn.InvokeAsync("JoinRoom", code);
        await guestConn.InvokeAsync("JoinRoom", code);
        await hostConn.InvokeAsync("StartDraft", code);

        await hostConn.InvokeAsync("SubmitTeam", code, ValidTeam(0));
        await guestConn.InvokeAsync("SubmitTeam", code, ValidTeam(5));

        // private log do meu jogo (ticker)
        JsonElement mine = await WaitFor(yourMatch, "YourMatch");
        Assert.True(mine.GetProperty("log").GetProperty("events").GetArrayLength() > 5);
        Assert.Contains(mine.GetProperty("side").GetString(), new[] { "home", "away" });

        await WaitFor(sawMatchFinished, "MatchFinished");
        JsonElement champ = await WaitFor(finished, "TournamentFinished");
        Assert.False(string.IsNullOrEmpty(champ.GetProperty("championTeamId").GetString()));

        JsonElement snapshot = await WaitFor(lastSnapshot, "snapshot final");
        // copa completa: 3 rodadas de grupos + oitavas/quartas/semi/final = 7 relógios
        Assert.True(minuteTicks >= 90 * 7, $"esperava ticks de 7 rodadas, veio {minuteTicks}");

        // sempre 8 grupos (32 times), cada um com no máx. 1 humano
        JsonElement groups = snapshot.GetProperty("groups");
        Assert.Equal(8, groups.GetArrayLength());
        foreach (JsonElement g in groups.EnumerateArray())
        {
            int humans = g.GetProperty("teams").EnumerateArray().Count(t => t.GetProperty("isHuman").GetBoolean());
            Assert.True(humans <= 1);
            // tabela completa: todos com 3 jogos
            foreach (JsonElement row in g.GetProperty("standings").EnumerateArray())
                Assert.Equal(3, row.GetProperty("j").GetInt32());
        }
        JsonElement bracket = snapshot.GetProperty("bracket");
        Assert.Equal(4, bracket.GetArrayLength()); // oitavas, quartas, semi, final
        Assert.Equal("oitavas", bracket[0].GetProperty("roundId").GetString());
        Assert.Equal(8, bracket[0].GetProperty("ties").GetArrayLength());
        Assert.Equal("final", bracket[3].GetProperty("roundId").GetString());
        Assert.True(bracket[3].GetProperty("ties")[0].GetProperty("played").GetBoolean());
    }
}
