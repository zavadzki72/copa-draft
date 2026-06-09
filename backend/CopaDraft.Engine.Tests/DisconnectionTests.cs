using System.Net.Http.Json;
using System.Text.Json;
using CopaDraft.Api.Hubs;
using CopaDraft.Api.Services;
using CopaDraft.Engine;
using CopaDraft.Engine.Models;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;

namespace CopaDraft.Engine.Tests;

/// <summary>Disconnection semantics: lobby drop = leave; tournament drop = AI
/// takes over and the tournament still finishes; rejoin restores control.</summary>
public class DisconnectionTests : IClassFixture<ApiTestHost>
{
    private readonly ApiTestHost _host;

    public DisconnectionTests(ApiTestHost host) => _host = host;

    private static object ValidTeam(int nth)
    {
        Squad squad = SquadRepository.All
            .Where(s => TeamHelpers.BestXI(s, "4-3-3", GameConfig.Default).Count == 11)
            .ElementAt(nth);
        List<EnginePlayer> xi = TeamHelpers.BestXI(squad, "4-3-3", GameConfig.Default);
        return new
        {
            formation = "4-3-3",
            starters = xi.Select(p => p.Id).ToList(),
            bench = Array.Empty<string>(),
            captainId = (string?)null,
        };
    }

    private async Task<(string Code, HubConnection Host, HubConnection Guest, string GuestJwt, Guid GuestId)> RoomWithTwo(
        string hostName, string guestName)
    {
        (_, string hostJwt) = _host.NewUser(hostName);
        (Guid guestId, string guestJwt) = _host.NewUser(guestName);
        HttpClient hostClient = _host.Client(hostJwt);
        HttpResponseMessage created = await hostClient.PostAsync("/api/rooms", null);
        string code = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString()!;

        HubConnection hostConn = _host.Hub("/hubs/lobby", hostJwt);
        HubConnection guestConn = _host.Hub("/hubs/lobby", guestJwt);
        await hostConn.StartAsync();
        await guestConn.StartAsync();
        await hostConn.InvokeAsync("JoinRoom", code);
        await guestConn.InvokeAsync("JoinRoom", code);
        return (code, hostConn, guestConn, guestJwt, guestId);
    }

    private static async Task<T> WaitFor<T>(TaskCompletionSource<T> tcs, string what, int seconds = 15)
    {
        Task done = await Task.WhenAny(tcs.Task, Task.Delay(TimeSpan.FromSeconds(seconds)));
        Assert.True(done == tcs.Task, $"timeout esperando {what}");
        return await tcs.Task;
    }

    [Fact]
    public async Task Lobby_Disconnect_Removes_Player()
    {
        (string code, HubConnection hostConn, HubConnection guestConn, _, _) =
            await RoomWithTwo("L1", "L2");

        var backToOne = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        hostConn.On<JsonElement>(LobbyHub.RoomStateEvent, s =>
        {
            if (s.GetProperty("players").GetArrayLength() == 1) backToOne.TrySetResult(true);
        });

        await guestConn.DisposeAsync();          // queda abrupta no lobby
        await WaitFor(backToOne, "sala voltar a 1 jogador");
        await hostConn.DisposeAsync();
    }

    [Fact]
    public async Task Tournament_Disconnect_Marks_Ai_And_Finishes_And_Rejoin_Restores()
    {
        (string code, HubConnection hostConn, HubConnection guestConn, string guestJwt, Guid guestId) =
            await RoomWithTwo("T1", "T2");

        var aiSeen = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var finished = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        hostConn.On<JsonElement>(LobbyHub.RoomStateEvent, s =>
        {
            foreach (JsonElement p in s.GetProperty("players").EnumerateArray())
                if (p.GetProperty("userId").GetGuid() == guestId && p.GetProperty("presence").GetString() == "ia")
                    aiSeen.TrySetResult(true);
        });
        hostConn.On<JsonElement>(TournamentOrchestrator.TournamentFinishedEvent, f => finished.TrySetResult(f));

        await hostConn.InvokeAsync("StartDraft", code);
        await hostConn.InvokeAsync("SubmitTeam", code, ValidTeam(0));
        await guestConn.InvokeAsync("SubmitTeam", code, ValidTeam(3));

        // convidado cai no meio do torneio → IA assume, sala não trava
        await guestConn.DisposeAsync();
        await WaitFor(aiSeen, "presença 'ia' do convidado");
        await WaitFor(finished, "torneio terminar mesmo com jogador fora");

        // reconexão: novo socket, rejoin restaura presença e resync entrega snapshot
        HubConnection back = _host.Hub("/hubs/lobby", guestJwt);
        var snapshot = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        var restored = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        back.On<JsonElement>(TournamentOrchestrator.TournamentStateEvent, s => snapshot.TrySetResult(s));
        back.On<JsonElement>(LobbyHub.RoomStateEvent, s =>
        {
            foreach (JsonElement p in s.GetProperty("players").EnumerateArray())
                if (p.GetProperty("userId").GetGuid() == guestId && p.GetProperty("presence").GetString() == "conectado")
                    restored.TrySetResult(true);
        });
        await back.StartAsync();
        await back.InvokeAsync("JoinRoom", code);
        await back.InvokeAsync("GetTournament", code);

        await WaitFor(restored, "presença restaurada");
        JsonElement snap = await WaitFor(snapshot, "snapshot de resync");
        Assert.Equal("encerrada", snap.GetProperty("phase").GetString());

        await back.DisposeAsync();
        await hostConn.DisposeAsync();
    }
}
