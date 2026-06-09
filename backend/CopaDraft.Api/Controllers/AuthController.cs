using CopaDraft.Api.Auth;
using Microsoft.AspNetCore.Mvc;

namespace CopaDraft.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AuthService auth) : ControllerBase
{
    public sealed record GoogleLoginRequest(string IdToken);

    /// <summary>Exchanges a Google ID token for the app JWT + user profile.</summary>
    [HttpPost("google")]
    public async Task<IActionResult> GoogleLogin([FromBody] GoogleLoginRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.IdToken))
            return BadRequest(new { error = "idToken obrigatório" });
        try
        {
            (string token, Data.User user) = await auth.LoginWithGoogleAsync(req.IdToken, ct);
            return Ok(new
            {
                token,
                user = new { id = user.Id, name = user.Name, avatar = user.AvatarUrl },
            });
        }
        catch (Exception e) when (e is Google.Apis.Auth.InvalidJwtException or InvalidOperationException)
        {
            return Unauthorized(new { error = "Token Google inválido" });
        }
    }
}
