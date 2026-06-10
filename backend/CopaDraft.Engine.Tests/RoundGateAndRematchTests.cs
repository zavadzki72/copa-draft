using System.Net.Http.Json;
using System.Text.Json;
using CopaDraft.Api.Hubs;
using CopaDraft.Api.Services;
using CopaDraft.Engine;
using CopaDraft.Engine.Models;
using Microsoft.AspNetCore.SignalR.Client;

namespace CopaDraft.Engine.Tests;

/// <summary>Ready-gate por rodada ("iniciar partida") e revanche (PlayAgain).</summary>
public class RoundGateAndRematchTests : IClassFixture<ApiTestHost>
{
    private readonly ApiTestHost _host;

    public RoundGateAndRematchTests(ApiTestHost host) => _host = host;

    private static object ValidTeam(int nth)
    {
        Squad squad = SquadRepository.All
            .Where(s => TeamHelpers.BestXI(s, "4-3-3", GameConfig.Default).Count == 11)
            .ElementAt(nth);
        List<EnginePlayer> xi = TeamHelpers.BestXI(squad, "4-3-3", GameConfig.Default);
        return new { formation = "4-3-3", starters = xi.Select(p => p.Id).ToList(), bench = Array.Empty<string>(), captainId = (string?)null };
    }

    private static async Task<T> WaitFor<T>(TaskCompletionSource<T> tcs, string what, int seconds = 30)
    {
        Task done = await Task.WhenAny(tcs.Task, Task.Delay(TimeSpan.FromSeconds(seconds)));
        Assert.True(done == tcs.Task, $"timeout esperando {what}");
        return await tcs.Task;
    }

    [Fact]
    public async Task Round_Waits_For_All_Players_To_Click_Start()
    {
        // host próprio com o gate LIGADO (timeout alto: só o clique destrava)
        using var gated = new ApiTestHost(new Dictionary<string, string?> { ["Mp:RoundReadySeconds"] = "120" });
        (_, string hostJwt) = gated.NewUser("G1");
        (_, string guestJwt) = gated.NewUser("G2");
        HttpClient hostClient = gated.Client(hostJwt);
        HttpResponseMessage created = await hostClient.PostAsync("/api/rooms", null);
        string code = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString()!;

        await using HubConnection h = gated.Hub("/hubs/lobby", hostJwt);
        await using HubConnection g = gated.Hub("/hubs/lobby", guestJwt);

        var roundReady = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var roundStarted = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var progressSeen = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        h.On<JsonElement>(TournamentOrchestrator.RoundReadyEvent, _ => roundReady.TrySetResult(true));
        h.On<JsonElement>(TournamentOrchestrator.RoundReadyProgressEvent, p => progressSeen.TrySetResult(p));
        h.On<JsonElement>(TournamentOrchestrator.RoundStartedEvent, _ => roundStarted.TrySetResult(true));

        await h.StartAsync(); await g.StartAsync();
        await h.InvokeAsync("JoinRoom", code);
        await g.InvokeAsync("JoinRoom", code);
        await h.InvokeAsync("StartDraft", code);
        await h.InvokeAsync("SubmitTeam", code, ValidTeam(0));
        await g.InvokeAsync("SubmitTeam", code, ValidTeam(3));

        await WaitFor(roundReady, "RoundReady");
        // só um clicou: a rodada NÃO pode começar
        await h.InvokeAsync("ReadyForRound", code);
        JsonElement progress = await WaitFor(progressSeen, "progresso do gate");
        Assert.Equal(1, progress.GetProperty("ready").GetInt32());
        Assert.Equal(2, progress.GetProperty("total").GetInt32());
        Task early = await Task.WhenAny(roundStarted.Task, Task.Delay(1500));
        Assert.False(early == roundStarted.Task, "rodada começou antes de todos clicarem");

        // segundo clique destrava na hora
        await g.InvokeAsync("ReadyForRound", code);
        await WaitFor(roundStarted, "RoundStarted após todos prontos", 10);
    }

    [Fact]
    public async Task PlayAgain_Resets_Room_To_Lobby_For_A_Rematch()
    {
        (Guid hostId, string hostJwt) = _host.NewUser("R1");
        (_, string guestJwt) = _host.NewUser("R2");
        HttpClient hostClient = _host.Client(hostJwt);
        HttpResponseMessage created = await hostClient.PostAsync("/api/rooms", null);
        string code = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString()!;

        await using HubConnection h = _host.Hub("/hubs/lobby", hostJwt);
        await using HubConnection g = _host.Hub("/hubs/lobby", guestJwt);

        var finished = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var backToLobby = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        var guestError = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        h.On<JsonElement>(TournamentOrchestrator.TournamentFinishedEvent, _ => finished.TrySetResult(true));
        h.On<JsonElement>(LobbyHub.RoomStateEvent, s =>
        {
            if (s.GetProperty("state").GetString() == "aguardando" && finished.Task.IsCompleted)
                backToLobby.TrySetResult(s);
        });
        g.On<string>(LobbyHub.ErrorEvent, e => guestError.TrySetResult(e));

        await h.StartAsync(); await g.StartAsync();
        await h.InvokeAsync("JoinRoom", code);
        await g.InvokeAsync("JoinRoom", code);
        await h.InvokeAsync("StartDraft", code);
        await h.InvokeAsync("SubmitTeam", code, ValidTeam(0));
        await g.InvokeAsync("SubmitTeam", code, ValidTeam(3));
        await WaitFor(finished, "torneio encerrar");

        // convidado não pode dar PlayAgain
        await g.InvokeAsync("PlayAgain", code);
        string err = await WaitFor(guestError, "erro do não-anfitrião");
        Assert.Contains("anfitrião", err);

        // anfitrião reseta: sala volta a aguardando com ready zerado e sem times
        await h.InvokeAsync("PlayAgain", code);
        JsonElement lobby = await WaitFor(backToLobby, "sala de volta ao lobby");
        foreach (JsonElement p in lobby.GetProperty("players").EnumerateArray())
        {
            Assert.False(p.GetProperty("ready").GetBoolean());
            Assert.False(p.GetProperty("hasTeam").GetBoolean());
        }

        // e dá pra jogar de novo: novo draft + novo torneio até o fim
        var finished2 = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        h.On<JsonElement>(TournamentOrchestrator.TournamentFinishedEvent, _ => finished2.TrySetResult(true));
        await h.InvokeAsync("StartDraft", code);
        await h.InvokeAsync("SubmitTeam", code, ValidTeam(0));
        await g.InvokeAsync("SubmitTeam", code, ValidTeam(5));
        await WaitFor(finished2, "revanche encerrar");
    }
}
