using System.Collections.Concurrent;

namespace CopaDraft.Api.Services;

/// <summary>
/// In-memory map of live hub connections → (user, room). A user may hold more
/// than one connection (extra tab); AI takeover only kicks in when the LAST
/// connection of a user drops.
/// </summary>
public sealed class PresenceTracker
{
    private readonly ConcurrentDictionary<string, (Guid UserId, string RoomCode)> _connections = new();

    public void Track(string connectionId, Guid userId, string roomCode)
        => _connections[connectionId] = (userId, roomCode);

    /// <summary>Removes the connection; returns its (user, room) if it was the
    /// user's last connection in that room.</summary>
    public (Guid UserId, string RoomCode)? Drop(string connectionId)
    {
        if (!_connections.TryRemove(connectionId, out (Guid UserId, string RoomCode) info)) return null;
        bool stillConnected = _connections.Values.Any(v => v.UserId == info.UserId && v.RoomCode == info.RoomCode);
        return stillConnected ? null : info;
    }

    public bool IsOnline(string roomCode, Guid userId)
        => _connections.Values.Any(v => v.UserId == userId && v.RoomCode == roomCode);
}
