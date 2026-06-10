using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;

namespace CopaDraft.Api.Auth;

/// <summary>Maps SignalR user ids to the JWT 'sub' (our User.Id), so the
/// orchestrator can target Clients.User(userId).</summary>
public sealed class SubUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection)
        => connection.User?.FindFirstValue("sub")
           ?? connection.User?.FindFirstValue(ClaimTypes.NameIdentifier);
}
