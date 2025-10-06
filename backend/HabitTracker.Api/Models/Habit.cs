namespace HabitTracker.Api.Models;

public class Habit
{
    public int Id { get; set; }
    public int UserId { get; set; } = 1; // single user for now
    public string Name { get; set; } = default!;
    public string? Description { get; set; }
    public string? ColorHex { get; set; }
    public string? IconKey { get; set; }
    public bool IsArchived { get; set; } = false;
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

    public ICollection<HabitCheckIn> CheckIns { get; set; } = new List<HabitCheckIn>();
}
