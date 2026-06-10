using CopaDraft.Api.Auth;
using CopaDraft.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace CopaDraft.Engine.Tests;

/// <summary>
/// Boots the real API in-memory (TestServer) over a shared Sqlite database, so
/// integration tests can exercise REST + SignalR with real JWTs.
/// </summary>
public sealed class ApiTestHost : IDisposable
{
    private readonly SqliteConnection _conn;
    public WebApplicationFactory<Program> Factory { get; }

    public ApiTestHost() : this(null) { }

    /// <param name="overrides">Config extra (ex.: ligar o ready-gate num teste específico).
    /// Internal: fixtures do xUnit só podem ter UM construtor público.</param>
    internal ApiTestHost(Dictionary<string, string?>? overrides)
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("SKIP_MIGRATIONS", "true");
            b.ConfigureAppConfiguration((_, cfg) =>
            {
                var settings = new Dictionary<string, string?>
                {
                    ["Jwt:Key"] = "integration-test-key-0123456789abcdef-extra",
                    ["Jwt:Issuer"] = "copa-draft-tests",
                    ["Mp:PaceMsPerMinute"] = "0",      // torneios instantâneos nos testes
                    ["Mp:Speeds:normal"] = "0",
                    ["Mp:Speeds:rapido"] = "0",
                    ["Mp:Speeds:super"] = "0",
                    ["Mp:InterRoundSeconds"] = "0",
                    ["Mp:RoundReadySeconds"] = "0",   // gate desligado nos testes de fluxo
                };
                if (overrides is not null)
                    foreach ((string k, string? v) in overrides) settings[k] = v;
                cfg.AddInMemoryCollection(settings);
            });
            b.ConfigureServices(services =>
            {
                ServiceDescriptor[] efDescriptors = services
                    .Where(d => d.ServiceType.Namespace?.StartsWith("Microsoft.EntityFrameworkCore") == true
                             || d.ServiceType == typeof(AppDbContext)
                             || d.ServiceType == typeof(DbContextOptions<AppDbContext>)
                             || d.ServiceType == typeof(DbContextOptions))
                    .ToArray();
                foreach (ServiceDescriptor d in efDescriptors) services.Remove(d);
                services.AddDbContext<AppDbContext>(o => o.UseSqlite(_conn));
            });
        });

        using IServiceScope scope = Factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
    }

    /// <summary>Creates a user directly and returns (userId, jwt).</summary>
    public (Guid Id, string Jwt) NewUser(string name)
    {
        using IServiceScope scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = new User { Id = Guid.NewGuid(), GoogleSub = "sub-" + name, Name = name, CreatedAt = DateTimeOffset.UtcNow };
        db.Users.Add(user);
        db.SaveChanges();
        var auth = new AuthService(db, null!, scope.ServiceProvider.GetRequiredService<IConfiguration>());
        return (user.Id, auth.IssueJwt(user));
    }

    public HttpClient Client(string jwt)
    {
        HttpClient c = Factory.CreateClient();
        c.DefaultRequestHeaders.Authorization = new("Bearer", jwt);
        return c;
    }

    /// <summary>SignalR connection through the TestServer (LongPolling + auth).</summary>
    public HubConnection Hub(string path, string jwt) => new HubConnectionBuilder()
        .WithUrl("http://localhost" + path, o =>
        {
            o.HttpMessageHandlerFactory = _ => Factory.Server.CreateHandler();
            o.Transports = HttpTransportType.LongPolling;
            o.AccessTokenProvider = () => Task.FromResult<string?>(jwt);
        })
        .Build();

    public void Dispose()
    {
        Factory.Dispose();
        _conn.Dispose();
    }
}
