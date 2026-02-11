using HabitTracker.Reminders.Data;
using HabitTracker.Reminders.Models;
using Microsoft.EntityFrameworkCore;

namespace HabitTracker.Reminders.Services;

public class ReminderWorker(IServiceProvider provider, ILogger<ReminderWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // small delay to let app boot
        await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Tick(stoppingToken);
            }
            catch (OperationCanceledException) { }
            catch (Exception ex)
            {
                logger.LogError(ex, "Reminder worker tick failed");
            }

            try
            {
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
            catch (OperationCanceledException) { }
        }
    }

    private async Task Tick(CancellationToken ct)
    {
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var now = DateTime.UtcNow;
        var due = await db.Reminders
            .Where(r => r.Enabled && r.NextRunUtc <= now)
            .ToListAsync(ct);

        if (due.Count == 0) return;

        foreach (var r in due)
        {
            var scheduledLocal = ReminderCalculator.BuildScheduledLocal(r, now);
            var notif = new Notification
            {
                HabitId = r.HabitId,
                Message = $"Reminder: {r.HabitName}",
                ScheduledLocal = scheduledLocal,
                CreatedUtc = now
            };
            db.Notifications.Add(notif);

            r.LastSentUtc = now;
            r.NextRunUtc = ReminderCalculator.ComputeNextRunUtc(r, now);
            r.UpdatedUtc = now;
        }

        await db.SaveChangesAsync(ct);
    }
}
