using HabitTracker.Reminders.Models;
using TimeZoneConverter;

namespace HabitTracker.Reminders.Services;

public static class ReminderCalculator
{
    public static DateTime ComputeNextRunUtc(Reminder reminder, DateTime utcNow)
    {
        var tz = GetTimeZone(reminder.TimeZone);
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(utcNow, tz);

        var nextLocal = reminder.Frequency switch
        {
            ReminderFrequency.Daily => NextDaily(nowLocal, reminder.TimeOfDay),
            ReminderFrequency.Weekly => NextWeekly(nowLocal, reminder.TimeOfDay, ParseDays(reminder.DaysOfWeekCsv)),
            _ => throw new ArgumentOutOfRangeException(nameof(reminder.Frequency))
        };

        var nextUtc = TimeZoneInfo.ConvertTimeToUtc(nextLocal, tz);
        return nextUtc;
    }

    public static string BuildScheduledLocal(Reminder reminder, DateTime utcNow)
    {
        var tz = GetTimeZone(reminder.TimeZone);
        var local = TimeZoneInfo.ConvertTimeFromUtc(utcNow, tz);
        return local.ToString("yyyy-MM-dd HH:mm");
    }

    public static string JoinDays(int[]? days) =>
        days is null ? string.Empty : string.Join(',', days.Distinct().OrderBy(x => x));

    public static int[] ParseDays(string? csv)
    {
        if (string.IsNullOrWhiteSpace(csv)) return Array.Empty<int>();
        return csv.Split(',', StringSplitOptions.RemoveEmptyEntries)
                  .Select(s => int.TryParse(s, out var v) ? v : -1)
                  .Where(v => v >= 0 && v <= 6)
                  .Distinct()
                  .OrderBy(v => v)
                  .ToArray();
    }

    private static DateTime NextDaily(DateTime nowLocal, string timeOfDay)
    {
        var todayTarget = BuildLocalDate(nowLocal, timeOfDay);
        return nowLocal < todayTarget ? todayTarget : todayTarget.AddDays(1);
    }

    private static DateTime NextWeekly(DateTime nowLocal, string timeOfDay, int[] days)
    {
        if (days.Length == 0) return NextDaily(nowLocal, timeOfDay);

        var today = (int)nowLocal.DayOfWeek; // Sunday=0
        var todayTarget = BuildLocalDate(nowLocal, timeOfDay);
        if (days.Contains(today) && nowLocal < todayTarget) return todayTarget;

        for (int i = 1; i <= 7; i++)
        {
            var candidateDay = (today + i) % 7;
            if (!days.Contains(candidateDay)) continue;
            var date = nowLocal.Date.AddDays(i);
            var target = BuildLocalDate(date, timeOfDay);
            return target;
        }

        // fallback should never hit
        return BuildLocalDate(nowLocal.AddDays(1), timeOfDay);
    }

    private static DateTime BuildLocalDate(DateTime localDate, string timeOfDay)
    {
        if (!TimeOnly.TryParse(timeOfDay, out var t))
            throw new InvalidOperationException("Invalid timeOfDay format. Use HH:mm");
        return new DateTime(localDate.Year, localDate.Month, localDate.Day, t.Hour, t.Minute, 0, DateTimeKind.Unspecified);
    }

    private static TimeZoneInfo GetTimeZone(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return TimeZoneInfo.Utc;
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id);
        }
        catch
        {
            try { return TZConvert.GetTimeZoneInfo(id); }
            catch { return TimeZoneInfo.Utc; }
        }
    }
}
