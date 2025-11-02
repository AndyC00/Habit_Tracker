using HabitTracker.Api.Dtos;
using HabitTracker.Api.Models;

namespace HabitTracker.Api.Services;

public class InMemoryRepo : IFirestoreRepo
{
    private static readonly object Gate = new();
    private static readonly List<Habit> Habits = new();
    private static readonly List<HabitCheckIn> Checkins = new();

    private const int UserId = 1; // single-user MVP

    public Task<List<Habit>> ListHabitsAsync(bool includeArchived)
    {
        lock (Gate)
        {
            var list = Habits
                .Where(h => h.UserId == UserId)
                .Where(h => includeArchived || !h.IsArchived)
                .OrderBy(h => h.IsArchived).ThenBy(h => h.Id)
                .Select(Clone)
                .ToList();
            return Task.FromResult(list);
        }
    }

    public Task<Habit> CreateHabitAsync(HabitCreateDto dto)
    {
        lock (Gate)
        {
            var nextId = Habits.Count == 0 ? 1 : Habits.Max(h => h.Id) + 1;
            var h = new Habit
            {
                Id = nextId,
                UserId = UserId,
                Name = dto.Name.Trim(),
                Description = dto.Description,
                ColorHex = dto.ColorHex,
                IconKey = dto.IconKey,
                IsArchived = false,
                CreatedUtc = DateTime.UtcNow,
            };
            Habits.Add(h);
            return Task.FromResult(Clone(h));
        }
    }

    public Task<Habit?> UpdateHabitAsync(int id, HabitUpdateDto dto)
    {
        lock (Gate)
        {
            var h = Habits.FirstOrDefault(x => x.Id == id && x.UserId == UserId);
            if (h is null) return Task.FromResult<Habit?>(null);
            h.Name = dto.Name.Trim();
            h.Description = dto.Description;
            h.ColorHex = dto.ColorHex;
            h.IconKey = dto.IconKey;
            h.IsArchived = dto.IsArchived;
            return Task.FromResult<Habit?>(Clone(h));
        }
    }

    public Task<HabitCheckIn> UpsertCheckInAsync(int habitId, CheckInUpsertDto dto)
    {
        lock (Gate)
        {
            var habit = Habits.FirstOrDefault(h => h.Id == habitId && h.UserId == UserId);
            if (habit is null) throw new InvalidOperationException("Habit not found");

            if (!TryParseLocalDate(dto.LocalDate, out var localDate))
                throw new InvalidOperationException("Invalid LocalDate. Use yyyy-MM-dd.");

            var todayLocal = LocalToday(dto.UserTimeZoneIana ?? "Pacific/Auckland");
            if (localDate < todayLocal.AddDays(-7) || localDate > todayLocal)
                throw new InvalidOperationException($"Only last 7 days allowed (including today). Today={todayLocal:yyyy-MM-dd}");

            var existing = Checkins.FirstOrDefault(c => c.HabitId == habitId && c.LocalDate.ToString("yyyy-MM-dd") == dto.LocalDate);
            if (existing is null)
            {
                existing = new HabitCheckIn
                {
                    Id = int.Parse($"{habitId}{dto.LocalDate.Replace("-", "")}"),
                    HabitId = habitId,
                    Habit = habit,
                    LocalDate = localDate,
                    DurationMinutes = dto.DurationMinutes,
                    CreatedUtc = DateTime.UtcNow,
                };
                Checkins.Add(existing);
            }
            else
            {
                existing.DurationMinutes = dto.DurationMinutes;
            }

            return Task.FromResult(Clone(existing));
        }
    }

    public Task<bool> DeleteCheckInAsync(int habitId, string localDate)
    {
        lock (Gate)
        {
            var idx = Checkins.FindIndex(c => c.HabitId == habitId && c.LocalDate.ToString("yyyy-MM-dd") == localDate);
            if (idx < 0) return Task.FromResult(false);
            Checkins.RemoveAt(idx);
            return Task.FromResult(true);
        }
    }

    public Task<List<CheckInPointDto>> ListCheckinsAsync(int habitId)
    {
        lock (Gate)
        {
            var list = Checkins
                .Where(c => c.HabitId == habitId)
                .OrderBy(c => c.LocalDate)
                .Select(c => new CheckInPointDto(c.LocalDate.ToString("yyyy-MM-dd"), c.DurationMinutes ?? 0))
                .ToList();
            return Task.FromResult(list);
        }
    }

    public Task<List<CalendarDayDto>> GetCalendarAsync(int habitId, string month)
    {
        if (month?.Length != 7 || !int.TryParse(month[..4], out var y) || !int.TryParse(month[5..], out var m))
            throw new InvalidOperationException("month must be yyyy-MM");

        lock (Gate)
        {
            var days = DateTime.DaysInMonth(y, m);
            var checks = Checkins
                .Where(c => c.HabitId == habitId && c.LocalDate.ToString("yyyy-MM").Equals(month))
                .ToDictionary(c => c.LocalDate.ToString("yyyy-MM-dd"));

            var result = new List<CalendarDayDto>(days);
            for (int d = 1; d <= days; d++)
            {
                var date = new DateOnly(y, m, d).ToString("yyyy-MM-dd");
                if (checks.TryGetValue(date, out var c))
                    result.Add(new CalendarDayDto(date, true, c.DurationMinutes));
                else
                    result.Add(new CalendarDayDto(date, false, null));
            }
            return Task.FromResult(result);
        }
    }

    public Task<StatsDto?> GetStatsAsync(int habitId, string? month, string? tz)
    {
        lock (Gate)
        {
            if (!Habits.Any(h => h.Id == habitId && h.UserId == UserId)) return Task.FromResult<StatsDto?>(null);

            var all = Checkins
                .Where(c => c.HabitId == habitId)
                .OrderBy(c => c.LocalDate)
                .Select(c => new { LocalDate = c.LocalDate.ToString("yyyy-MM-dd"), c.DurationMinutes })
                .ToList();

            int completedTotal = all.Count;
            int completedThisMonth = 0;
            int durationThisMonth = 0;
            if (!string.IsNullOrWhiteSpace(month) && month.Length == 7 &&
                int.TryParse(month[..4], out var y) && int.TryParse(month[5..], out var m))
            {
                foreach (var x in all)
                {
                    if (x.LocalDate.StartsWith(month))
                    {
                        completedThisMonth++;
                        durationThisMonth += x.DurationMinutes ?? 0;
                    }
                }
            }

            int longest = 0, current = 0;
            string? prev = null;
            foreach (var x in all)
            {
                var d = x.LocalDate;
                if (prev is null) current = 1;
                else if (d == prev) continue;
                else if (IsoToEpochDays(d) == IsoToEpochDays(prev) + 1) current++;
                else current = 1;
                longest = Math.Max(longest, current);
                prev = d;
            }

            int totalDurationMinutes = all.Sum(x => x.DurationMinutes ?? 0);

            var todayLocal = LocalToday(tz ?? "Pacific/Auckland").ToString("yyyy-MM-dd");
            var todayRec = all.FirstOrDefault(x => x.LocalDate == todayLocal);
            bool hasToday = todayRec is not null;
            int? todayMinutes = todayRec?.DurationMinutes;

            var stats = new StatsDto(
                CompletedThisMonth: completedThisMonth,
                CompletedTotal: completedTotal,
                LongestStreak: longest,
                TotalDurationMinutes: totalDurationMinutes,
                DurationThisMonth: durationThisMonth,
                HasTodayCheckIn: hasToday,
                TodayDurationMinutes: todayMinutes
            );
            return Task.FromResult<StatsDto?>(stats);
        }
    }

    private static Habit Clone(Habit h) => new()
    {
        Id = h.Id,
        UserId = h.UserId,
        Name = h.Name,
        Description = h.Description,
        ColorHex = h.ColorHex,
        IconKey = h.IconKey,
        IsArchived = h.IsArchived,
        CreatedUtc = h.CreatedUtc,
    };

    private static HabitCheckIn Clone(HabitCheckIn d) => new()
    {
        Id = d.Id,
        HabitId = d.HabitId,
        Habit = d.Habit,
        LocalDate = d.LocalDate,
        DurationMinutes = d.DurationMinutes,
        CreatedUtc = d.CreatedUtc,
    };

    private static bool TryParseLocalDate(string s, out DateOnly value)
    {
        try { value = DateOnly.ParseExact(s, "yyyy-MM-dd"); return true; }
        catch { value = default; return false; }
    }

    private static DateOnly LocalToday(string iana)
    {
        try
        {
            var tz = TimeZoneInfo.FindSystemTimeZoneById(iana);
            var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
            return DateOnly.FromDateTime(now);
        }
        catch
        {
            return DateOnly.FromDateTime(DateTime.UtcNow);
        }
    }

    private static int IsoToEpochDays(string iso)
    {
        var dt = DateTime.Parse(iso + "T00:00:00Z").ToUniversalTime();
        return (int)Math.Floor((dt - DateTime.UnixEpoch).TotalDays);
    }
}

