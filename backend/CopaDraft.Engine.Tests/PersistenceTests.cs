using CopaDraft.Api.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace CopaDraft.Engine.Tests;

/// <summary>
/// Model-level persistence checks over Sqlite in-memory (schema generated via
/// EnsureCreated). The real Npgsql migration was applied + rolled back against
/// PostgreSQL 17 in Docker during ETAPA 9.
/// </summary>
public class PersistenceTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;

    public PersistenceTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
    }

    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    [Fact]
    public void Room_With_Participants_And_Team_Round_Trips()
    {
        var user = new User { Id = Guid.NewGuid(), GoogleSub = "sub-1", Name = "Marcus", CreatedAt = DateTimeOffset.UtcNow };
        var room = new Room { Id = Guid.NewGuid(), Code = "ABC123", HostUserId = user.Id, State = RoomState.Waiting, Seed = 42, MaxPlayers = 8, CreatedAt = DateTimeOffset.UtcNow };
        var part = new Participant { Id = Guid.NewGuid(), RoomId = room.Id, UserId = user.Id, IsHost = true, JoinOrder = 0, JoinedAt = DateTimeOffset.UtcNow };
        _db.AddRange(user, room, part);
        _db.SaveChanges();

        _db.Teams.Add(new SubmittedTeam
        {
            Id = Guid.NewGuid(), ParticipantId = part.Id, Formation = "4-3-3",
            StartersJson = "[\"a\",\"b\"]", BenchJson = "[]", SubmittedAt = DateTimeOffset.UtcNow,
        });
        _db.SaveChanges();

        Room loaded = _db.Rooms.Include(r => r.Participants).ThenInclude(p => p.Team).Single();
        Assert.Single(loaded.Participants);
        Assert.True(loaded.Participants[0].IsHost);
        Assert.Equal("4-3-3", loaded.Participants[0].Team!.Formation);
    }

    [Fact]
    public void Duplicate_Room_Code_Is_Rejected()
    {
        _db.Rooms.Add(new Room { Id = Guid.NewGuid(), Code = "DUP111", HostUserId = Guid.NewGuid(), CreatedAt = DateTimeOffset.UtcNow });
        _db.SaveChanges();
        _db.Rooms.Add(new Room { Id = Guid.NewGuid(), Code = "DUP111", HostUserId = Guid.NewGuid(), CreatedAt = DateTimeOffset.UtcNow });
        Assert.ThrowsAny<DbUpdateException>(() => _db.SaveChanges());
    }

    [Fact]
    public void Same_User_Cannot_Join_Room_Twice()
    {
        var room = new Room { Id = Guid.NewGuid(), Code = "RM0001", HostUserId = Guid.NewGuid(), CreatedAt = DateTimeOffset.UtcNow };
        var user = new User { Id = Guid.NewGuid(), GoogleSub = "sub-2", Name = "Z", CreatedAt = DateTimeOffset.UtcNow };
        _db.AddRange(room, user);
        _db.SaveChanges();
        _db.Participants.Add(new Participant { Id = Guid.NewGuid(), RoomId = room.Id, UserId = user.Id, JoinedAt = DateTimeOffset.UtcNow });
        _db.SaveChanges();
        _db.Participants.Add(new Participant { Id = Guid.NewGuid(), RoomId = room.Id, UserId = user.Id, JoinedAt = DateTimeOffset.UtcNow });
        Assert.ThrowsAny<DbUpdateException>(() => _db.SaveChanges());
    }
}
