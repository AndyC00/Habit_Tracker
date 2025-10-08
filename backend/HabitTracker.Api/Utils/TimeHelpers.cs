using System.Globalization;

namespace HabitTracker.Api.Utils;

public static class TimeHelpers
{
    private static readonly Dictionary<string, string> IanaToWindows = new()
    {
        { "Pacific/Auckland", "New Zealand Standard Time" }
    };

    public static TimeZoneInfo GetTimeZoneInfo(string? ianaOrWindows)
    {
        if (string.IsNullOrWhiteSpace(ianaOrWindows))
            return TimeZoneInfo.Local;

        try { return TimeZoneInfo.FindSystemTimeZoneById(ianaOrWindows); }
        catch { /* ignore */ }

        if (IanaToWindows.TryGetValue(ianaOrWindows, out var win))
            return TimeZoneInfo.FindSystemTimeZoneById(win);

        return TimeZoneInfo.Local;
    }

    public static DateOnly LocalToday(string? ianaOrWindows)
    {
        var tz = GetTimeZoneInfo(ianaOrWindows);
        var nowLocal = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, tz);
        return DateOnly.FromDateTime(nowLocal.DateTime);
    }

    public static bool TryParseLocalDate(string yyyyMmDd, out DateOnly date)
        => DateOnly.TryParseExact(yyyyMmDd, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
}
