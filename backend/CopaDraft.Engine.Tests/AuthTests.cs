using System.IdentityModel.Tokens.Jwt;
using CopaDraft.Api.Auth;
using CopaDraft.Api.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CopaDraft.Engine.Tests;

public class AuthTests : IDisposable
{
    private sealed class FakeGoogle(GoogleIdentity? identity) : IGoogleTokenValidator
    {
        public Task<GoogleIdentity> ValidateAsync(string idToken, CancellationToken ct = default)
            => identity is null
                ? throw new InvalidOperationException("invalid")
                : Task.FromResult(identity);
    }

    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;

    public AuthTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
        _config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = "unit-test-signing-key-0123456789abcdef-extra",
            ["Jwt:Issuer"] = "copa-draft-tests",
        }).Build();
    }

    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    private AuthService Service(GoogleIdentity id) => new(_db, new FakeGoogle(id), _config);

    [Fact]
    public async Task First_Login_Creates_User_And_Issues_Jwt()
    {
        var svc = Service(new GoogleIdentity("g-sub-1", "Marcus", "m@x.com", "http://pic"));
        (string token, User user) = await svc.LoginWithGoogleAsync("any");

        Assert.Single(_db.Users);
        Assert.Equal("g-sub-1", user.GoogleSub);

        JwtSecurityToken jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.Equal(user.Id.ToString(), jwt.Claims.Single(c => c.Type == "sub").Value);
        Assert.Equal("Marcus", jwt.Claims.Single(c => c.Type == "name").Value);
        Assert.Equal("copa-draft-tests", jwt.Issuer);
    }

    [Fact]
    public async Task Second_Login_Upserts_Profile_Without_Duplicating()
    {
        var first = Service(new GoogleIdentity("g-sub-2", "Old Name", null, null));
        await first.LoginWithGoogleAsync("any");
        var second = Service(new GoogleIdentity("g-sub-2", "New Name", "new@x.com", "pic2"));
        (_, User user) = await second.LoginWithGoogleAsync("any");

        Assert.Single(_db.Users);
        Assert.Equal("New Name", user.Name);
        Assert.Equal("new@x.com", user.Email);
    }

    [Fact]
    public async Task Invalid_Google_Token_Throws()
    {
        var svc = new AuthService(_db, new FakeGoogle(null), _config);
        await Assert.ThrowsAsync<InvalidOperationException>(() => svc.LoginWithGoogleAsync("bad"));
        Assert.Empty(_db.Users);
    }
}
