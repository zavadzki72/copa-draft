using CopaDraft.Api.Auth;
using CopaDraft.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CopaDraft.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/rooms")]
public class RoomsController(RoomService rooms) : ControllerBase
{
    private Guid UserId => JwtOptions.UserId(User);

    [HttpPost]
    public async Task<IActionResult> Create(CancellationToken ct)
    {
        // convidados (apelido) só entram em salas existentes — criar exige Google
        if (User.HasClaim(Auth.AuthService.GuestClaim, "1"))
            return StatusCode(403, new { error = "Entre com o Google para criar salas." });
        return Ok(await rooms.CreateAsync(UserId, ct));
    }

    [HttpGet("{code}")]
    public async Task<IActionResult> Get(string code, CancellationToken ct)
    {
        try { return Ok(await rooms.GetStateAsync(code.ToUpperInvariant(), ct)); }
        catch (RoomServiceException e) { return NotFound(new { error = e.Message }); }
    }

    [HttpPost("{code}/join")]
    public async Task<IActionResult> Join(string code, CancellationToken ct)
    {
        try { return Ok(await rooms.JoinAsync(code.ToUpperInvariant(), UserId, ct)); }
        catch (RoomServiceException e) { return Conflict(new { error = e.Message }); }
    }
}
