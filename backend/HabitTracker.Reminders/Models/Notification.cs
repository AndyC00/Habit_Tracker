using System.ComponentModel.DataAnnotations;

namespace HabitTracker.Reminders.Models;

public class Notification
{
    public int Id { get; set; }
    public int HabitId { get; set; }

    [Required]
    [MaxLength(240)]
    public string Message { get; set; } = default!;

    // Local date-time string for display (yyyy-MM-dd HH:mm)
    [MaxLength(32)]
    public string ScheduledLocal { get; set; } = default!;

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAtUtc { get; set; }
}
