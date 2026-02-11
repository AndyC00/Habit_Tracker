using HabitTracker.Reminders.Models;

namespace HabitTracker.Reminders.Dtos;

public record ReminderUpsertDto(
    int HabitId,
    string HabitName,
    bool Enabled,
    ReminderFrequency Frequency,
    string TimeOfDay,
    int[]? DaysOfWeek,
    string TimeZone
);

public record ReminderDto(
    int Id,
    int HabitId,
    string HabitName,
    bool Enabled,
    ReminderFrequency Frequency,
    string TimeOfDay,
    int[] DaysOfWeek,
    string TimeZone,
    DateTime NextRunUtc,
    DateTime? LastSentUtc
);
