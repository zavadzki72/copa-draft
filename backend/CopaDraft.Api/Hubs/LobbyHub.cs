using CopaDraft.Api.Auth;
using CopaDraft.Api.Data;
using CopaDraft.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace CopaDraft.Api.Hubs;

/// <summary>
/// Real-time room channel: presence, ready-check and the host's start.
/// Clients first join via REST (POST /api/rooms/{code}/join), then attach
/// their connection here with JoinRoom(code).
/// </summary>
[Authorize]
public class LobbyHub(
    RoomService rooms, DraftService draft, PresenceTracker presence,
    TournamentOrchestrator orchestrator) : Hub
{
    public const string RoomStateEvent = "RoomState";
    public const string DraftStartedEvent = "DraftStarted";
    public const string DraftProgressEvent = "DraftProgress";
    public const string DraftCompleteEvent = "DraftComplete";
    public const string ErrorEvent = "LobbyError";

    private Guid UserId => JwtOptions.UserId(Context.User!);

    public async Task JoinRoom(string code)
    {
        code = code.ToUpperInvariant();
        RoomStateDto state;
        try
        {
            state = await rooms.JoinAsync(code, UserId);
        }
        catch (RoomServiceException e)
        {
            await Clients.Caller.SendAsync(ErrorEvent, e.Message);
            return;
        }
        presence.Track(Context.ConnectionId, UserId, code);
        await Groups.AddToGroupAsync(Context.ConnectionId, code);
        await Clients.Group(code).SendAsync(RoomStateEvent, state);
    }

    public async Task SetReady(string code, bool ready)
    {
        try
        {
            RoomStateDto state = await rooms.SetReadyAsync(code.ToUpperInvariant(), UserId, ready);
            await Clients.Group(code.ToUpperInvariant()).SendAsync(RoomStateEvent, state);
        }
        catch (RoomServiceException e)
        {
            await Clients.Caller.SendAsync(ErrorEvent, e.Message);
        }
    }

    public async Task StartDraft(string code)
    {
        code = code.ToUpperInvariant();
        try
        {
            RoomStateDto state = await rooms.StartDraftAsync(code, UserId);
            await Clients.Group(code).SendAsync(RoomStateEvent, state);
            await Clients.Group(code).SendAsync(DraftStartedEvent, new { deadline = state.DraftDeadline });
        }
        catch (RoomServiceException e)
        {
            await Clients.Caller.SendAsync(ErrorEvent, e.Message);
        }
    }

    /// <summary>Submits the caller's drafted team; broadcasts progress, and
    /// DraftComplete once every participant has a (submitted or autofilled) team.</summary>
    public async Task SubmitTeam(string code, SubmitTeamRequest team)
    {
        code = code.ToUpperInvariant();
        try
        {
            await draft.SubmitAsync(code, UserId, team);
            DraftProgressDto progress = await draft.ProgressAsync(code);
            await Clients.Group(code).SendAsync(DraftProgressEvent, progress);
            if (progress.Submitted == progress.Total)
            {
                await Clients.Group(code).SendAsync(DraftCompleteEvent);
                await orchestrator.TryStartAsync(code);
            }
        }
        catch (RoomServiceException e)
        {
            await Clients.Caller.SendAsync(ErrorEvent, e.Message);
        }
    }

    public const string WatchMatchEvent = "WatchMatch";

    /// <summary>"Iniciar partida" do pré-jogo: marca o jogador como pronto para a
    /// rodada; quando todos os exigidos clicam (ou o timeout vence) ela começa.</summary>
    public async Task ReadyForRound(string code)
    {
        code = code.ToUpperInvariant();
        (int Ready, int Total)? progress = orchestrator.MarkRoundReady(code, UserId);
        if (progress is not null)
            await Clients.Group(code).SendAsync(TournamentOrchestrator.RoundReadyProgressEvent, new
            {
                ready = progress.Value.Ready,
                total = progress.Value.Total,
            });
    }

    /// <summary>Velocidade do ticker (anfitrião, no lobby) — vale pro torneio todo.</summary>
    public async Task SetRoomSpeed(string code, string speed)
    {
        code = code.ToUpperInvariant();
        try
        {
            RoomStateDto state = await rooms.SetSpeedAsync(code, UserId, speed);
            await Clients.Group(code).SendAsync(RoomStateEvent, state);
        }
        catch (RoomServiceException e)
        {
            await Clients.Caller.SendAsync(ErrorEvent, e.Message);
        }
    }

    /// <summary>"Terminei de assistir" — quando todos os humanos da rodada
    /// terminam/pulam, o servidor resolve o resto da rodada na hora.</summary>
    public Task DoneWatching(string code)
    {
        orchestrator.MarkDoneWatching(code.ToUpperInvariant(), UserId);
        return Task.CompletedTask;
    }

    /// <summary>Revanche: o anfitrião reseta a sala encerrada de volta ao lobby
    /// (novos times, novo seed) sem ninguém precisar recriar/entrar de novo.</summary>
    public async Task PlayAgain(string code)
    {
        code = code.ToUpperInvariant();
        try
        {
            RoomStateDto state = await rooms.ResetForRematchAsync(code, UserId);
            await Clients.Group(code).SendAsync(RoomStateEvent, state);
        }
        catch (RoomServiceException e)
        {
            await Clients.Caller.SendAsync(ErrorEvent, e.Message);
        }
    }

    /// <summary>Modo espectador ("acompanhar campeonato"): devolve ao chamador o
    /// log de uma partida da rodada corrente — usado por eliminados para seguir
    /// um time humano ainda vivo.</summary>
    public async Task WatchFixture(string code, string fixtureId)
    {
        code = code.ToUpperInvariant();
        (string HomeId, string AwayId, Engine.Models.MatchLog Log)? entry =
            orchestrator.GetFixtureLog(code, fixtureId);
        if (entry is null)
        {
            await Clients.Caller.SendAsync(ErrorEvent, "Essa partida não está em andamento.");
            return;
        }
        await Clients.Caller.SendAsync(WatchMatchEvent, new
        {
            fixtureId,
            homeId = entry.Value.HomeId,
            awayId = entry.Value.AwayId,
            log = entry.Value.Log,
        });
    }

    /// <summary>Resync after (re)connecting mid-tournament: snapshot + your match.
    /// Falls back to the persisted snapshot for finished/evicted tournaments.</summary>
    public async Task GetTournament(string code)
    {
        code = code.ToUpperInvariant();
        TournamentSnapshotDto? snapshot = await orchestrator.SnapshotOrPersistedAsync(code);
        if (snapshot is not null)
            await Clients.Caller.SendAsync(TournamentOrchestrator.TournamentStateEvent, snapshot);
        YourMatchDto? mine = orchestrator.YourMatch(code, UserId);
        if (mine is not null)
            await Clients.Caller.SendAsync(TournamentOrchestrator.YourMatchEvent, mine);
    }

    public async Task LeaveRoom(string code)
    {
        code = code.ToUpperInvariant();
        RoomStateDto? state = await rooms.LeaveAsync(code, UserId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, code);
        if (state is not null)
            await Clients.Group(code).SendAsync(RoomStateEvent, state);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        (Guid UserId, string RoomCode)? dropped = presence.Drop(Context.ConnectionId);
        if (dropped is not null)
        {
            (Guid userId, string code) = dropped.Value;
            try
            {
                RoomStateDto before = await rooms.GetStateAsync(code);
                RoomStateDto? after;
                if (before.State == "aguardando")
                {
                    // lobby: dropping out = leaving (host transfers, empty room dies)
                    after = await rooms.LeaveAsync(code, userId);
                }
                else
                {
                    // draft/tournament: AI assume o time; sala nunca trava (RN11).
                    // O torneio é server-authoritative, então nada precisa pausar.
                    await rooms.SetPresenceAsync(code, userId, Presence.AiControlled);
                    after = await rooms.GetStateAsync(code);
                }
                if (after is not null)
                    await Clients.Group(code).SendAsync(RoomStateEvent, after);
            }
            catch (RoomServiceException) { /* sala removida */ }
        }
        await base.OnDisconnectedAsync(exception);
    }
}
