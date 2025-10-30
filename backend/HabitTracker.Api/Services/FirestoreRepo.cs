using Google.Cloud.Firestore;
using HabitTracker.Api.Dtos;
using HabitTracker.Api.Models;

namespace HabitTracker.Api.Services;

public interface IFirestoreRepo
{
    Task<List<Habit>> ListHabitsAsync(bool includeArchived);
    Task<Habit> CreateHabitAsync(HabitCreateDto dto);
    Task<Habit?> UpdateHabitAsync(int id, HabitUpdateDto dto);
    Task<HabitCheckIn> UpsertCheckInAsync(int habitId, CheckInUpsertDto dto);
    Task<bool> DeleteCheckInAsync(int habitId, string localDate);
    Task<List<CheckInPointDto>> ListCheckinsAsync(int habitId);
    Task<List<CalendarDayDto>> GetCalendarAsync(int habitId, string month);
    Task<StatsDto?> GetStatsAsync(int habitId, string? month, string? tz);
}

[FirestoreData]
public class HabitDoc
{
    [FirestoreProperty] public int Id { get; set; }
    [FirestoreProperty] public int UserId { get; set; }
    [FirestoreProperty] public string Name { get; set; } = default!;
    [FirestoreProperty] public string? Description { get; set; }
    [FirestoreProperty] public string? ColorHex { get; set; }
    [FirestoreProperty] public string? IconKey { get; set; }
    [FirestoreProperty] public bool IsArchived { get; set; }
    [FirestoreProperty] public DateTime CreatedUtc { get; set; }
}

[FirestoreData]
public class CheckInDoc
{
    [FirestoreProperty] public int Id { get; set; }
    [FirestoreProperty] public int HabitId { get; set; }
    [FirestoreProperty] public string LocalDate { get; set; } = default!; // yyyy-MM-dd
    [FirestoreProperty] public int? DurationMinutes { get; set; }
    [FirestoreProperty] public DateTime CreatedUtc { get; set; }
}

public class FirestoreRepo(FirestoreDb db) : IFirestoreRepo
{
    private const int UserId = 1; // MVP single user

    private CollectionReference HabitsCol => db.Collection("habits");
    private CollectionReference CheckinsCol => db.Collection("habitCheckins");

    public async Task<List<Habit>> ListHabitsAsync(bool includeArchived)
    {
        var snap = await HabitsCol.GetSnapshotAsync();
        var list = snap.Documents.Select(d => d.ConvertTo<HabitDoc>())
            .Where(h => h.UserId == UserId)
            .Where(h => includeArchived || !h.IsArchived)
            .OrderBy(h => h.IsArchived).ThenBy(h => h.Id)
            .Select(ToHabit)
            .ToList();
        return list;
    }

    public async Task<Habit> CreateHabitAsync(HabitCreateDto dto)
    {
        var snap = await HabitsCol.GetSnapshotAsync();
        var ids = snap.Documents.Select(d => d.ConvertTo<HabitDoc>().Id).ToList();
        var nextId = ids.Count == 0 ? 1 : ids.Max() + 1;

        var doc = new HabitDoc
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
        await HabitsCol.Document(doc.Id.ToString()).SetAsync(doc);
        return ToHabit(doc);
    }

    public async Task<Habit?> UpdateHabitAsync(int id, HabitUpdateDto dto)
    {
        var refDoc = HabitsCol.Document(id.ToString());
        var snap = await refDoc.GetSnapshotAsync();
        if (!snap.Exists) return null;
        var h = snap.ConvertTo<HabitDoc>();
        if (h.UserId != UserId) return null;

        h.Name = dto.Name.Trim();
        h.Description = dto.Description;
        h.ColorHex = dto.ColorHex;
        h.IconKey = dto.IconKey;
        h.IsArchived = dto.IsArchived;

        await refDoc.SetAsync(h, SetOptions.Overwrite);
        return ToHabit(h);
    }

    public async Task<HabitCheckIn> UpsertCheckInAsync(int habitId, CheckInUpsertDto dto)
    {
        // ensure habit exists
        var habitSnap = await HabitsCol.Document(habitId.ToString()).GetSnapshotAsync();
        if (!habitSnap.Exists) throw new InvalidOperationException("Habit not found");

        if (!TryParseLocalDate(dto.LocalDate, out var localDate))
            throw new InvalidOperationException("Invalid LocalDate. Use yyyy-MM-dd.");

        var todayLocal = LocalToday(dto.UserTimeZoneIana ?? "Pacific/Auckland");
        if (localDate < todayLocal.AddDays(-7) || localDate > todayLocal)
            throw new InvalidOperationException($"Only last 7 days allowed (including today). Today={todayLocal:yyyy-MM-dd}");

        var checkId = $"{habitId}_{dto.LocalDate}";
        var refDoc = CheckinsCol.Document(checkId);
        var snap = await refDoc.GetSnapshotAsync();

        CheckInDoc doc;
        if (snap.Exists)
        {
            doc = snap.ConvertTo<CheckInDoc>();
            doc.DurationMinutes = dto.DurationMinutes;
        }
        else
        {
            doc = new CheckInDoc
            {
                Id = int.Parse($"{habitId}{dto.LocalDate.Replace("-", "")}"),
                HabitId = habitId,
                LocalDate = dto.LocalDate,
                DurationMinutes = dto.DurationMinutes,
                CreatedUtc = DateTime.UtcNow,
            };
        }
        await refDoc.SetAsync(doc, SetOptions.Overwrite);
        return ToModel(doc);
    }

    public async Task<bool> DeleteCheckInAsync(int habitId, string localDate)
    {
        var refDoc = CheckinsCol.Document($"{habitId}_{localDate}");
        var snap = await refDoc.GetSnapshotAsync();
        if (!snap.Exists) return false;
        await refDoc.DeleteAsync();
        return true;
    }

    public async Task<List<CheckInPointDto>> ListCheckinsAsync(int habitId)
    {
        var snap = await CheckinsCol.WhereEqualTo(nameof(CheckInDoc.HabitId), habitId).GetSnapshotAsync();
        return snap.Documents
            .Select(d => d.ConvertTo<CheckInDoc>())
            .OrderBy(c => c.LocalDate)
            .Select(c => new CheckInPointDto(c.LocalDate, c.DurationMinutes ?? 0))
            .ToList();
    }

    public async Task<List<CalendarDayDto>> GetCalendarAsync(int habitId, string month)
    {
        if (month?.Length != 7 || !int.TryParse(month[..4], out var y) || !int.TryParse(month[5..], out var m))
            throw new InvalidOperationException("month must be yyyy-MM");

        var first = new DateOnly(y, m, 1);
        var days = DateTime.DaysInMonth(y, m);
        var last = new DateOnly(y, m, days);

        var snap = await CheckinsCol.WhereEqualTo(nameof(CheckInDoc.HabitId), habitId).GetSnapshotAsync();
        var all = snap.Documents.Select(d => d.ConvertTo<CheckInDoc>()).ToList();
        var checks = all.Where(c => string.Compare(c.LocalDate, month) >= 0 && c.LocalDate.StartsWith(month)).ToList();

        var dict = checks.ToDictionary(c => c.LocalDate, c => c);
        var result = new List<CalendarDayDto>(days);
        for (int d = 1; d <= days; d++)
        {
            var date = new DateOnly(y, m, d).ToString("yyyy-MM-dd");
            if (dict.TryGetValue(date, out var c))
                result.Add(new CalendarDayDto(date, true, c.DurationMinutes));
            else
                result.Add(new CalendarDayDto(date, false, null));
        }
        return result;
    }

    public async Task<StatsDto?> GetStatsAsync(int habitId, string? month, string? tz)
    {
        var habitSnap = await HabitsCol.Document(habitId.ToString()).GetSnapshotAsync();
        if (!habitSnap.Exists) return null;

        var snap = await CheckinsCol.WhereEqualTo(nameof(CheckInDoc.HabitId), habitId).GetSnapshotAsync();
        var all = snap.Documents.Select(d => d.ConvertTo<CheckInDoc>())
            .OrderBy(c => c.LocalDate)
            .Select(c => new { c.LocalDate, c.DurationMinutes })
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

        return new StatsDto(
            CompletedThisMonth: completedThisMonth,
            CompletedTotal: completedTotal,
            LongestStreak: longest,
            TotalDurationMinutes: totalDurationMinutes,
            DurationThisMonth: durationThisMonth,
            HasTodayCheckIn: hasToday,
            TodayDurationMinutes: todayMinutes
        );
    }

    private static Habit ToHabit(HabitDoc d) => new()
    {
        Id = d.Id,
        UserId = d.UserId,
        Name = d.Name,
        Description = d.Description,
        ColorHex = d.ColorHex,
        IconKey = d.IconKey,
        IsArchived = d.IsArchived,
        CreatedUtc = d.CreatedUtc,
    };

    private static HabitCheckIn ToModel(CheckInDoc d) => new()
    {
        Id = d.Id,
        HabitId = d.HabitId,
        LocalDate = DateOnly.Parse(d.LocalDate),
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

