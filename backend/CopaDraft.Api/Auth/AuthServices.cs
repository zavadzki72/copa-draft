using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using CopaDraft.Api.Data;
using Google.Apis.Auth;
using Microsoft.IdentityModel.Tokens;

namespace CopaDraft.Api.Auth;

/// <summary>Identity asserted by a validated Google ID token.</summary>
public sealed record GoogleIdentity(string Sub, string Name, string? Email, string? Picture);

/// <summary>Abstraction over Google ID-token validation (faked in tests).</summary>
public interface IGoogleTokenValidator
{
    Task<GoogleIdentity> ValidateAsync(string idToken, CancellationToken ct = default);
}

public sealed class GoogleTokenValidator(IConfiguration config) : IGoogleTokenValidator
{
    public async Task<GoogleIdentity> ValidateAsync(string idToken, CancellationToken ct = default)
    {
        var settings = new GoogleJsonWebSignature.ValidationSettings
        {
            Audience = new[] { config["Google:ClientId"] ?? throw new InvalidOperationException("Google:ClientId não configurado") },
        };
        GoogleJsonWebSignature.Payload payload = await GoogleJsonWebSignature.ValidateAsync(idToken, settings);
        return new GoogleIdentity(payload.Subject, payload.Name ?? payload.Email ?? "Jogador",
            payload.Email, payload.Picture);
    }
}

/// <summary>Upserts the user from a Google identity and issues the app JWT.</summary>
public sealed class AuthService(AppDbContext db, IGoogleTokenValidator google, IConfiguration config)
{
    public async Task<(string Token, User User)> LoginWithGoogleAsync(string idToken, CancellationToken ct = default)
    {
        GoogleIdentity id = await google.ValidateAsync(idToken, ct);

        User? user = db.Users.SingleOrDefault(u => u.GoogleSub == id.Sub);
        if (user is null)
        {
            user = new User
            {
                Id = Guid.NewGuid(), GoogleSub = id.Sub, Name = id.Name,
                Email = id.Email, AvatarUrl = id.Picture, CreatedAt = DateTimeOffset.UtcNow,
            };
            db.Users.Add(user);
        }
        else
        {
            user.Name = id.Name;
            user.Email = id.Email;
            user.AvatarUrl = id.Picture;
        }
        await db.SaveChangesAsync(ct);

        return (IssueJwt(user), user);
    }

    public string IssueJwt(User user)
    {
        SymmetricSecurityKey key = JwtOptions.SigningKey(config);
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: JwtOptions.Issuer(config),
            audience: JwtOptions.Issuer(config),
            claims: new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim("name", user.Name),
                new Claim("avatar", user.AvatarUrl ?? string.Empty),
            },
            expires: DateTime.UtcNow.AddDays(7),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public static class JwtOptions
{
    public const string DevFallbackKey = "dev-only-jwt-key-change-me-0123456789abcdef";

    public static string Issuer(IConfiguration c) => c["Jwt:Issuer"] ?? "copa-draft";

    public static SymmetricSecurityKey SigningKey(IConfiguration c) =>
        new(Encoding.UTF8.GetBytes(c["Jwt:Key"] ?? DevFallbackKey));

    public static Guid UserId(ClaimsPrincipal principal)
    {
        string? sub = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.Parse(sub ?? throw new UnauthorizedAccessException("token sem sub"));
    }
}
