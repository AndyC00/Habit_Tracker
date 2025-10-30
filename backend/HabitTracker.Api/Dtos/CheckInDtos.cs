namespace HabitTracker.Api.Dtos;

public record CheckInUpsertDto(
    string LocalDate,
    int? DurationMinutes,
    string? UserTimeZoneIana
);

public record CalendarDayDto(
    string Date,
    bool Checked,
    int? DurationMinutes
);

public record StatsDto(
    int CompletedThisMonth,
    int CompletedTotal,
    int LongestStreak,
    int TotalDurationMinutes,
    int DurationThisMonth,
    bool HasTodayCheckIn,
    int? TodayDurationMinutes
);

public record CheckInPointDto(
    string Date,
    int Minutes
);
