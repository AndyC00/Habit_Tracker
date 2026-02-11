using System.ComponentModel.DataAnnotations;

namespace HabitTracker.Reminders.Models;

public class Reminder
{
    public int Id { get; set; }

    [Required]
    public int HabitId { get; set; }

    [Required]
    [MaxLength(200)]
    public string HabitName { get; set; } = default!;

    public bool Enabled { get; set; } = true;

    public ReminderFrequency Frequency { get; set; } = ReminderFrequency.Daily;

    // HH:mm (24h) in user's local time
    [Required]
    [MaxLength(5)]
    public string TimeOfDay { get; set; } = "09:00";

    // Comma-separated list of ints 0-6 (Sunday=0) when weekly
    [MaxLength(50)]
    public string? DaysOfWeekCsv { get; set; }

    // IANA or Windows timezone id
    [MaxLength(100)]
    public string TimeZone { get; set; } = "UTC";

    public DateTime NextRunUtc { get; set; }
    public DateTime? LastSentUtc { get; set; }

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedUtc { get; set; } = DateTime.UtcNow;
}
