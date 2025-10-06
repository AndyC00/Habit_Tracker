namespace HabitTracker.Api.Models;

public class HabitCheckIn
{
    public int Id { get; set; }
    public int HabitId { get; set; }
    public Habit Habit { get; set; } = default!;

    public DateOnly LocalDate { get; set; }
    
    public int? DurationMinutes { get; set; }

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}