using HabitTracker.Api.Data;
using HabitTracker.Api.Dtos;
using HabitTracker.Api.Models;
using HabitTracker.Api.Utils;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

// --------------------- Preliminary setup ---------------------
var builder = WebApplication.CreateBuilder(args);

// using EFcore + SQLite for data storage
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlite(builder.Configuration.GetConnectionString("Default")
        ?? "Data Source=habittracker.db"));

// JSON support for DateOnly
builder.Services.ConfigureHttpJsonOptions(opt =>
{
    opt.SerializerOptions.Converters.Add(new DateOnlyJsonConverter());
    opt.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

// for testing use
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(opt =>
{
    opt.AddDefaultPolicy(p => p
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowAnyOrigin()); // for MVP only, need to be more restrictive in production version
});

// build app and middleware pipeline
var app = builder.Build();

app.UseCors();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
app.MapGet("/ping", () => Results.Ok(new { ok = true })).WithTags("Health");


// --------------------- using Minimal API for Create, Read, Update, Delete (CRUD) ---------------------
app.MapGet("/api/habits", async (AppDbContext db, bool? includeArchived) =>
{
    var q = db.Habits.AsNoTracking().Where(h => h.UserId == 1); // only get userId=1 for MVP
    if (includeArchived != true) q = q.Where(h => !h.IsArchived);
    var list = await q.OrderBy(h => h.IsArchived).ThenBy(h => h.Id).ToListAsync();
    return Results.Ok(list);
});

app.MapPost("/api/habits", async (AppDbContext db, HabitCreateDto dto) =>
{
    if (string.IsNullOrWhiteSpace(dto.Name))
        return Results.BadRequest("Name is required.");

    var habit = new Habit
    {
        Name = dto.Name.Trim(),
        Description = dto.Description,
        ColorHex = dto.ColorHex,
        IconKey = dto.IconKey,
        UserId = 1
    };
    db.Habits.Add(habit);
    await db.SaveChangesAsync();
    return Results.Created($"/api/habits/{habit.Id}", habit);
});

app.MapPut("/api/habits/{id:int}", async (AppDbContext db, int id, HabitUpdateDto dto) =>
{
    var habit = await db.Habits.FindAsync(id);
    if (habit is null || habit.UserId != 1)     // only userId=1 for MVP
        return Results.NotFound();

    if (string.IsNullOrWhiteSpace(dto.Name)) 
        return Results.BadRequest("Name is required.");

    habit.Name = dto.Name.Trim();
    habit.Description = dto.Description;
    habit.ColorHex = dto.ColorHex;
    habit.IconKey = dto.IconKey;
    habit.IsArchived = dto.IsArchived;

    await db.SaveChangesAsync();
    return Results.Ok(habit);
});

app.MapPost("/api/habits/{id:int}/archive", async (AppDbContext db, int id) =>
{
    var habit = await db.Habits.FindAsync(id);
    if (habit is null || habit.UserId != 1)     // only userId=1 for MVP
        return Results.NotFound();

    habit.IsArchived = true;
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.MapPost("/api/habits/{id:int}/unarchive", async (AppDbContext db, int id) =>
{
    var habit = await db.Habits.FindAsync(id);
    if (habit is null || habit.UserId != 1)     // only userId=1 for MVP
        return Results.NotFound();

    habit.IsArchived = false;
    await db.SaveChangesAsync();
    return Results.NoContent();
});


// --------------------- logics for check-ins ---------------------
app.MapPost("/api/habits/{id:int}/checkins", async (AppDbContext db, int id, CheckInUpsertDto dto) =>
{
    var habit = await db.Habits.FindAsync(id);
    if (habit is null || habit.UserId != 1)     // only userId=1 for MVP
        return Results.NotFound();

    if (!TimeHelpers.TryParseLocalDate(dto.LocalDate, out var localDate))
        return Results.BadRequest("Invalid LocalDate. Use yyyy-MM-dd.");

    var todayLocal = TimeHelpers.LocalToday(dto.UserTimeZoneIana ?? "Pacific/Auckland");
    if (localDate < todayLocal.AddDays(-7) || localDate > todayLocal)   // get last 7 days available for checkin only
        return Results.BadRequest($"Only last 7 days allowed (including today). Today={todayLocal:yyyy-MM-dd}");

    var check = await db.HabitCheckIns
        .FirstOrDefaultAsync(c => c.HabitId == id && c.LocalDate == localDate);

    if (check is null)
    {
        check = new HabitCheckIn
        {
            HabitId = id,
            LocalDate = localDate,
            DurationMinutes = dto.DurationMinutes
        };
        db.HabitCheckIns.Add(check);
    }
    else
    {
        // update duration if already exists
        check.DurationMinutes = dto.DurationMinutes;
    }

    await db.SaveChangesAsync();
    return Results.Ok(check);
});

app.MapDelete("/api/habits/{id:int}/checkins/{localDate}", async (AppDbContext db, int id, string localDate) =>
{
    var habit = await db.Habits.FindAsync(id);
    if (habit is null || habit.UserId != 1) return Results.NotFound();

    if (!TimeHelpers.TryParseLocalDate(localDate, out var d))
        return Results.BadRequest("Invalid LocalDate. Use yyyy-MM-dd.");

    var check = await db.HabitCheckIns.FirstOrDefaultAsync(c => c.HabitId == id && c.LocalDate == d);
    if (check is null) return Results.NotFound();

    db.HabitCheckIns.Remove(check);
    await db.SaveChangesAsync();
    return Results.NoContent();
});


// --------------------- logics for calendar & stats ---------------------
app.MapGet("/api/habits/{id:int}/calendar", async (AppDbContext db, int id, string month /* yyyy-MM */) =>
{
    var habit = await db.Habits.AsNoTracking().FirstOrDefaultAsync(h => h.Id == id && h.UserId == 1);
    if (habit is null) return Results.NotFound();

    if (month?.Length != 7 || !int.TryParse(month[..4], out var y) || !int.TryParse(month[5..], out var m))
        return Results.BadRequest("month must be yyyy-MM");

    var first = new DateOnly(y, m, 1);
    var days = DateTime.DaysInMonth(y, m);
    var last = new DateOnly(y, m, days);

    var checks = await db.HabitCheckIns.AsNoTracking()
        .Where(c => c.HabitId == id && c.LocalDate >= first && c.LocalDate <= last)
        .ToListAsync();

    var dict = checks.ToDictionary(c => c.LocalDate, c => c);
    var result = new List<CalendarDayDto>(days);
    for (int d = 1; d <= days; d++)
    {
        var date = new DateOnly(y, m, d);
        if (dict.TryGetValue(date, out var c))
            result.Add(new CalendarDayDto(date.ToString("yyyy-MM-dd"), true, c.DurationMinutes));
        else
            result.Add(new CalendarDayDto(date.ToString("yyyy-MM-dd"), false, null));
    }
    return Results.Ok(result);
});

app.MapGet("/api/habits/{id:int}/stats", async (AppDbContext db, int id, string? month, string? tz) =>
{
    var habit = await db.Habits.AsNoTracking()
        .FirstOrDefaultAsync(h => h.Id == id && h.UserId == 1);
    if (habit is null) return Results.NotFound();

    // take all check-ins for this habit
    var all = await db.HabitCheckIns.AsNoTracking()
        .Where(c => c.HabitId == id)
        .OrderBy(c => c.LocalDate)
        .Select(c => new { c.LocalDate, c.DurationMinutes })
        .ToListAsync();

    int completedTotal = all.Count;

    // completedThisMonth & durationThisMonth
    int completedThisMonth = 0;
    int durationThisMonth = 0;
    int y = 0, m = 0;
    if (!string.IsNullOrWhiteSpace(month) && month.Length == 7 &&
        int.TryParse(month[..4], out y) && int.TryParse(month[5..], out m))
    {
        foreach (var x in all)
        {
            if (x.LocalDate.Year == y && x.LocalDate.Month == m)
            {
                completedThisMonth++;
                durationThisMonth += x.DurationMinutes ?? 0;
            }
        }
    }

    // the longest streak
    int longest = 0, current = 0;
    DateOnly? prev = null;
    foreach (var x in all)
    {
        var d = x.LocalDate;
        if (prev is null || d == prev.Value.AddDays(1))
            current++;
        else if (d == prev)
            continue;
        else
            current = 1;

        longest = Math.Max(longest, current);
        prev = d;
    }

    // total duration mins
    int totalDurationMinutes = all.Sum(x => x.DurationMinutes ?? 0);

    // does user have check-in for today
    var todayLocal = HabitTracker.Api.Utils.TimeHelpers.LocalToday(tz ?? "Pacific/Auckland");
    var todayRec = all.FirstOrDefault(x => x.LocalDate == todayLocal);
    bool hasToday = todayRec is not null;
    int? todayMinutes = todayRec?.DurationMinutes;

    return Results.Ok(new StatsDto(
        CompletedThisMonth: completedThisMonth,
        CompletedTotal: completedTotal,
        LongestStreak: longest,
        TotalDurationMinutes: totalDurationMinutes,
        DurationThisMonth: durationThisMonth,
        HasTodayCheckIn: hasToday,
        TodayDurationMinutes: todayMinutes
    ));
});

app.Run();