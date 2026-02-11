namespace HabitTracker.Reminders.Dtos;

public record NotificationDto(
    int Id,
    int HabitId,
    string Message,
    string ScheduledLocal,
    DateTime CreatedUtc,
    DateTime? ReadAtUtc
);
