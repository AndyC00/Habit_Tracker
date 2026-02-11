using HabitTracker.Reminders.Models;
using Microsoft.EntityFrameworkCore;

namespace HabitTracker.Reminders.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Reminder> Reminders => Set<Reminder>();
    public DbSet<Notification> Notifications => Set<Notification>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Reminder>()
            .HasIndex(r => r.HabitId)
            .IsUnique();

        modelBuilder.Entity<Reminder>()
            .HasIndex(r => r.NextRunUtc);

        modelBuilder.Entity<Notification>()
            .HasIndex(n => n.ReadAtUtc);

        modelBuilder.Entity<Notification>()
            .HasIndex(n => n.CreatedUtc);
    }
}
