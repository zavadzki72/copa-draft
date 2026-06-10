using CopaDraft.Api.Data;
using CopaDraft.Api.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CopaDraft.Engine.Tests;

public class RoomServiceTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;
    private readonly RoomService _svc;
    private readonly Guid _host = Guid.NewGuid();

    public RoomServiceTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
        _db.Users.Add(new User { Id = _host, GoogleSub = "host", Name = "Host", CreatedAt = DateTimeOffset.UtcNow });
        _db.SaveChanges();
        _svc = new RoomService(_db, Options.Create(new MpOptions()));
    }

    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    private Guid NewUser(string name)
    {
        var u = new User { Id = Guid.NewGuid(), GoogleSub = name, Name = name, CreatedAt = DateTimeOffset.UtcNow };
        _db.Users.Add(u);
        _db.SaveChanges();
        return u.Id;
    }

    [Fact]
    public async Task Create_Makes_Host_Participant_With_Code()
    {
        RoomStateDto room = await _svc.CreateAsync(_host);
        Assert.Equal(6, room.Code.Length);
        Assert.Equal("aguardando", room.State);
        Assert.Single(room.Players);
        Assert.True(room.Players[0].IsHost);
    }

    [Fact]
    public async Task Join_Adds_Player_And_Respects_Capacity()
    {
        RoomStateDto room = await _svc.CreateAsync(_host);
        for (int i = 0; i < 7; i++)
            await _svc.JoinAsync(room.Code, NewUser($"p{i}"));
        RoomStateDto full = await _svc.GetStateAsync(room.Code);
        Assert.Equal(8, full.Players.Count);
        await Assert.ThrowsAsync<RoomServiceException>(() => _svc.JoinAsync(full.Code, NewUser("late")));
    }

    [Fact]
    public async Task Rejoin_Is_Idempotent()
    {
        RoomStateDto room = await _svc.CreateAsync(_host);
        Guid u = NewUser("p");
        await _svc.JoinAsync(room.Code, u);
        RoomStateDto again = await _svc.JoinAsync(room.Code, u);
        Assert.Equal(2, again.Players.Count);
    }

    [Fact]
    public async Task Start_Requires_Host_And_Min_Players()
    {
        RoomStateDto room = await _svc.CreateAsync(_host);
        await Assert.ThrowsAsync<RoomServiceException>(() => _svc.StartDraftAsync(room.Code, _host)); // só 1 jogador
        Guid u = NewUser("p");
        await _svc.JoinAsync(room.Code, u);
        await Assert.ThrowsAsync<RoomServiceException>(() => _svc.StartDraftAsync(room.Code, u));     // não-host
        RoomStateDto started = await _svc.StartDraftAsync(room.Code, _host);
        Assert.Equal("draft", started.State);
        Assert.NotNull(started.DraftDeadline);
        // não inicia duas vezes
        await Assert.ThrowsAsync<RoomServiceException>(() => _svc.StartDraftAsync(room.Code, _host));
    }

    [Fact]
    public async Task Host_Leaving_Lobby_Transfers_Host()
    {
        RoomStateDto room = await _svc.CreateAsync(_host);
        Guid u = NewUser("p");
        await _svc.JoinAsync(room.Code, u);
        RoomStateDto? after = await _svc.LeaveAsync(room.Code, _host);
        Assert.NotNull(after);
        Assert.Single(after!.Players);
        Assert.True(after.Players[0].IsHost);
        Assert.Equal(u, after.HostUserId);
    }

    [Fact]
    public async Task Last_Player_Leaving_Removes_Room()
    {
        RoomStateDto room = await _svc.CreateAsync(_host);
        RoomStateDto? after = await _svc.LeaveAsync(room.Code, _host);
        Assert.Null(after);
        await Assert.ThrowsAsync<RoomServiceException>(() => _svc.GetStateAsync(room.Code));
    }

    [Fact]
    public async Task Leaving_During_Tournament_Marks_Left_Not_Removed()
    {
        RoomStateDto room = await _svc.CreateAsync(_host);
        Guid u = NewUser("p");
        await _svc.JoinAsync(room.Code, u);
        await _svc.StartDraftAsync(room.Code, _host);
        RoomStateDto? after = await _svc.LeaveAsync(room.Code, u);
        Assert.NotNull(after);
        Assert.Equal(2, after!.Players.Count);
        Assert.Equal("saiu", after.Players.Single(p => p.UserId == u).Presence);
    }

    [Fact]
    public async Task Ready_Toggles_And_Blocks_After_Start()
    {
        RoomStateDto room = await _svc.CreateAsync(_host);
        Guid u = NewUser("p");
        await _svc.JoinAsync(room.Code, u);
        RoomStateDto state = await _svc.SetReadyAsync(room.Code, u, true);
        Assert.True(state.Players.Single(p => p.UserId == u).Ready);
        await _svc.StartDraftAsync(room.Code, _host);
        await Assert.ThrowsAsync<RoomServiceException>(() => _svc.SetReadyAsync(room.Code, u, false));
    }
}
