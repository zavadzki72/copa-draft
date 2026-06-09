using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CopaDraft.Api.Auth;
using CopaDraft.Api.Data;
using CopaDraft.Api.Hubs;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CopaDraft.Engine.Tests;

/// <summary>Convidados (só apelido): entram em salas existentes com o mesmo
/// JWT (claim "guest"), mas não criam salas.</summary>
public class GuestAuthTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;
    private readonly AuthService _svc;

    public GuestAuthTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
        IConfiguration config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = "unit-test-signing-key-0123456789abcdef-extra",
            ["Jwt:Issuer"] = "copa-draft-tests",
        }).Build();
        _svc = new AuthService(_db, null!, config);
    }

    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    [Fact]
    public async Task Guest_Login_Creates_User_With_Guest_Claim()
    {
        (string token, User user) = await _svc.LoginAsGuestAsync("  Maria  ");
        Assert.Equal("Maria", user.Name);
        Assert.StartsWith(AuthService.GuestSubPrefix, user.GoogleSub);
        Assert.True(AuthService.IsGuest(user));

        JwtSecurityToken jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.Equal("1", jwt.Claims.Single(c => c.Type == AuthService.GuestClaim).Value);
    }

    [Fact]
    public async Task Google_User_Jwt_Has_No_Guest_Claim()
    {
        var user = new User { Id = Guid.NewGuid(), GoogleSub = "g-sub", Name = "Z", CreatedAt = DateTimeOffset.UtcNow };
        JwtSecurityToken jwt = new JwtSecurityTokenHandler().ReadJwtToken(_svc.IssueJwt(user));
        Assert.DoesNotContain(jwt.Claims, c => c.Type == AuthService.GuestClaim);
    }

    [Theory]
    [InlineData("")]
    [InlineData("a")]
    [InlineData("nome-absurdamente-longo-que-passa-de-trinta-chars")]
    public async Task Invalid_Guest_Name_Rejected(string name)
        => await Assert.ThrowsAsync<ArgumentException>(() => _svc.LoginAsGuestAsync(name));
}

public class GuestIntegrationTests : IClassFixture<ApiTestHost>
{
    private readonly ApiTestHost _host;

    public GuestIntegrationTests(ApiTestHost host) => _host = host;

    private async Task<(string Jwt, Guid Id)> GuestLoginAsync(string name)
    {
        HttpClient anon = _host.Factory.CreateClient();
        HttpResponseMessage resp = await anon.PostAsJsonAsync("/api/auth/guest", new { name });
        resp.EnsureSuccessStatusCode();
        JsonElement body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("user").GetProperty("guest").GetBoolean());
        return (body.GetProperty("token").GetString()!, body.GetProperty("user").GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Guest_Cannot_Create_Room()
    {
        (string jwt, _) = await GuestLoginAsync("Penetra");
        HttpResponseMessage resp = await _host.Client(jwt).PostAsync("/api/rooms", null);
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task Guest_Joins_Existing_Room_Via_Hub()
    {
        // anfitrião com Google cria a sala
        (_, string hostJwt) = _host.NewUser("Anfitrião G");
        HttpResponseMessage created = await _host.Client(hostJwt).PostAsync("/api/rooms", null);
        created.EnsureSuccessStatusCode();
        string code = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString()!;

        // convidado entra só com o apelido
        (string guestJwt, Guid guestId) = await GuestLoginAsync("Convidada");
        await using HubConnection hostConn = _host.Hub("/hubs/lobby", hostJwt);
        await using HubConnection guestConn = _host.Hub("/hubs/lobby", guestJwt);

        var guestSeen = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        hostConn.On<JsonElement>(LobbyHub.RoomStateEvent, s =>
        {
            foreach (JsonElement p in s.GetProperty("players").EnumerateArray())
                if (p.GetProperty("userId").GetGuid() == guestId) guestSeen.TrySetResult(s);
        });

        await hostConn.StartAsync();
        await guestConn.StartAsync();
        await hostConn.InvokeAsync("JoinRoom", code);
        await guestConn.InvokeAsync("JoinRoom", code);

        Task done = await Task.WhenAny(guestSeen.Task, Task.Delay(TimeSpan.FromSeconds(10)));
        Assert.True(done == guestSeen.Task, "anfitrião deveria ver o convidado entrar");
        JsonElement state = await guestSeen.Task;
        JsonElement guest = state.GetProperty("players").EnumerateArray()
            .Single(p => p.GetProperty("userId").GetGuid() == guestId);
        Assert.Equal("Convidada", guest.GetProperty("name").GetString());
        Assert.False(guest.GetProperty("isHost").GetBoolean());
    }
}
