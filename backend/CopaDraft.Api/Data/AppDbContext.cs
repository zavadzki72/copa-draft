using Microsoft.EntityFrameworkCore;

namespace CopaDraft.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<Participant> Participants => Set<Participant>();
    public DbSet<SubmittedTeam> Teams => Set<SubmittedTeam>();
    public DbSet<TournamentRecord> Tournaments => Set<TournamentRecord>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.HasIndex(x => x.GoogleSub).IsUnique();
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.GoogleSub).HasMaxLength(64);
        });

        b.Entity<Room>(e =>
        {
            e.HasIndex(x => x.Code).IsUnique();
            e.Property(x => x.Code).HasMaxLength(8);
            e.HasMany(x => x.Participants).WithOne(p => p.Room!).HasForeignKey(p => p.RoomId);
        });

        b.Entity<Participant>(e =>
        {
            e.HasIndex(x => new { x.RoomId, x.UserId }).IsUnique();
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
            e.HasOne(x => x.Team).WithOne(t => t!.Participant!)
                .HasForeignKey<SubmittedTeam>(t => t.ParticipantId);
        });

        b.Entity<TournamentRecord>(e => e.HasIndex(x => x.RoomId).IsUnique());
    }
}
