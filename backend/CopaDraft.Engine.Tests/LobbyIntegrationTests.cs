using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CopaDraft.Api.Hubs;
using Microsoft.AspNetCore.SignalR.Client;

namespace CopaDraft.Engine.Tests;

/// <summary>
/// End-to-end lobby flow over the real API: REST room creation + two SignalR
/// clients seeing presence/ready/start in real time.
/// </summary>
public class LobbyIntegrationTests : IClassFixture<ApiTestHost>
{
    private readonly ApiTestHost _host;

    public LobbyIntegrationTests(ApiTestHost host) => _host = host;

    private static async Task<T> WaitFor<T>(TaskCompletionSource<T> tcs, string what)
    {
        Task done = await Task.WhenAny(tcs.Task, Task.Delay(TimeSpan.FromSeconds(10)));
        Assert.True(done == tcs.Task, $"timeout esperando {what}");
        return await tcs.Task;
    }

    [Fact]
    public async Task Rest_Requires_Auth()
    {
        HttpClient anon = _host.Factory.CreateClient();
        HttpResponseMessage resp = await anon.PostAsync("/api/rooms", null);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Two_Players_See_Each_Other_Ready_And_Start()
    {
        (Guid hostId, string hostJwt) = _host.NewUser("Anfitrião");
        (Guid guestId, string guestJwt) = _host.NewUser("Convidado");

        // host creates the room via REST
        HttpClient hostClient = _host.Client(hostJwt);
        HttpResponseMessage created = await hostClient.PostAsync("/api/rooms", null);
        created.EnsureSuccessStatusCode();
        JsonElement room = await created.Content.ReadFromJsonAsync<JsonElement>();
        string code = room.GetProperty("code").GetString()!;

        // both connect to the hub
        await using HubConnection hostConn = _host.Hub("/hubs/lobby", hostJwt);
        await using HubConnection guestConn = _host.Hub("/hubs/lobby", guestJwt);

        var guestSeen = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        hostConn.On<JsonElement>(LobbyHub.RoomStateEvent, state =>
        {
            if (state.GetProperty("players").GetArrayLength() == 2) guestSeen.TrySetResult(state);
        });

        await hostConn.StartAsync();
        await guestConn.StartAsync();
        await hostConn.InvokeAsync("JoinRoom", code);
        await guestConn.InvokeAsync("JoinRoom", code);

        JsonElement twoPlayers = await WaitFor(guestSeen, "convidado entrar");
        Assert.Equal(2, twoPlayers.GetProperty("players").GetArrayLength());

        // guest readies — host sees it
        var readySeen = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        hostConn.On<JsonElement>(LobbyHub.RoomStateEvent, state =>
        {
            foreach (JsonElement p in state.GetProperty("players").EnumerateArray())
                if (p.GetProperty("userId").GetGuid() == guestId && p.GetProperty("ready").GetBoolean())
                    readySeen.TrySetResult(true);
        });
        await guestConn.InvokeAsync("SetReady", code, true);
        await WaitFor(readySeen, "ready do convidado");

        // non-host cannot start
        var errSeen = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        guestConn.On<string>(LobbyHub.ErrorEvent, e => errSeen.TrySetResult(e));
        await guestConn.InvokeAsync("StartDraft", code);
        string err = await WaitFor(errSeen, "erro de não-anfitrião");
        Assert.Contains("anfitrião", err);

        // host starts → both receive DraftStarted
        var draftStarted = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        guestConn.On<JsonElement>(LobbyHub.DraftStartedEvent, _ => draftStarted.TrySetResult(true));
        await hostConn.InvokeAsync("StartDraft", code);
        await WaitFor(draftStarted, "DraftStarted");
    }

    [Fact]
    public async Task Hub_Rejects_Anonymous_Connection()
    {
        HubConnection conn = new HubConnectionBuilder()
            .WithUrl("http://localhost/hubs/lobby", o =>
            {
                o.HttpMessageHandlerFactory = _ => _host.Factory.Server.CreateHandler();
                o.Transports = Microsoft.AspNetCore.Http.Connections.HttpTransportType.LongPolling;
            })
            .Build();
        await Assert.ThrowsAnyAsync<Exception>(() => conn.StartAsync());
    }
}
