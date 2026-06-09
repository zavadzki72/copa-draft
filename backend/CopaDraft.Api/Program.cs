using CopaDraft.Api.Auth;
using CopaDraft.Api.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
IConfiguration config = builder.Configuration;

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(config.GetConnectionString("Default")
        ?? "Host=localhost;Database=copadraft;Username=copadraft;Password=copadraft"));

builder.Services.AddControllers();
builder.Services.AddSignalR();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<IGoogleTokenValidator, GoogleTokenValidator>();
builder.Services.AddScoped<CopaDraft.Api.Services.RoomService>();
builder.Services.AddScoped<CopaDraft.Api.Services.DraftService>();
builder.Services.AddSingleton<CopaDraft.Api.Services.PresenceTracker>();
builder.Services.AddSingleton<CopaDraft.Api.Services.TournamentOrchestrator>();
builder.Services.AddHostedService<CopaDraft.Api.Services.DraftDeadlineWorker>();
builder.Services.AddSingleton<Microsoft.AspNetCore.SignalR.IUserIdProvider, CopaDraft.Api.Auth.SubUserIdProvider>();
builder.Services.Configure<CopaDraft.Api.Services.MpOptions>(
    config.GetSection(CopaDraft.Api.Services.MpOptions.Section));

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = JwtOptions.Issuer(config),
            ValidAudience = JwtOptions.Issuer(config),
            IssuerSigningKey = JwtOptions.SigningKey(config),
            ValidateIssuerSigningKey = true,
        };
        // SignalR sends the JWT via query string on the WebSocket connect
        o.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                string? token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) && ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                    ctx.Token = token;
                return Task.CompletedTask;
            },
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(config.GetSection("Cors:Origins").Get<string[]>() ?? new[] { "http://localhost:8000" })
    .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();

// apply migrations on start (skippable for tooling/tests)
if (!app.Configuration.GetValue<bool>("SKIP_MIGRATIONS"))
{
    using IServiceScope scope = app.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { ok = true }));
app.MapControllers();
app.MapHub<CopaDraft.Api.Hubs.LobbyHub>("/hubs/lobby");

app.Run();

public partial class Program;
