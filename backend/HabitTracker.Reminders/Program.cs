using HabitTracker.Reminders.Data;
using HabitTracker.Reminders.Dtos;
using HabitTracker.Reminders.Models;
using HabitTracker.Reminders.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Db path & folder
var dbPath = Environment.GetEnvironmentVariable("REMINDER_DB_PATH");
dbPath ??= Path.Combine(builder.Environment.ContentRootPath, "data", "reminders.db");
Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);

builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlite($"Data Source={dbPath}"));

builder.Services.ConfigureHttpJsonOptions(opt =>
{
    opt.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddHostedService<ReminderWorker>();

builder.Services.AddCors(opt =>
{
    opt.AddDefaultPolicy(p => p
        .AllowAnyOrigin()
        .AllowAnyHeader()
        .AllowAnyMethod());
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "HabitTracker Reminders", Version = "v1" });
});

var app = builder.Build();

// migrate db
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

app.UseCors();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapGet("/api/health", () => Results.Ok(new { ok = true, service = "reminders" }));

// Reminder endpoints
app.MapPost("/api/reminders", async (AppDbContext db, ReminderUpsertDto dto) =>
{
    if (string.IsNullOrWhiteSpace(dto.HabitName)) return Results.BadRequest("HabitName is required.");
    if (string.IsNullOrWhiteSpace(dto.TimeOfDay)) return Results.BadRequest("TimeOfDay is required.");

    if (await db.Reminders.AnyAsync(r => r.HabitId == dto.HabitId))
        return Results.Conflict("Reminder already exists for this habit. Use PUT to update.");

    var reminder = MapReminder(dto);
    reminder.NextRunUtc = ReminderCalculator.ComputeNextRunUtc(reminder, DateTime.UtcNow);

    db.Reminders.Add(reminder);
    await db.SaveChangesAsync();
    return Results.Created($"/api/reminders/{reminder.Id}", ToDto(reminder));
});

app.MapGet("/api/reminders/{id:int}", async (AppDbContext db, int id) =>
{
    var r = await db.Reminders.FindAsync(id);
    return r is null ? Results.NotFound() : Results.Ok(ToDto(r));
});

app.MapGet("/api/reminders", async (AppDbContext db, int? habitId) =>
{
    if (habitId is null)
    {
        var list = await db.Reminders.ToListAsync();
        return Results.Ok(list.Select(ToDto));
    }
    var r = await db.Reminders.FirstOrDefaultAsync(x => x.HabitId == habitId);
    return r is null ? Results.NotFound() : Results.Ok(ToDto(r));
});

app.MapPut("/api/reminders/{id:int}", async (AppDbContext db, int id, ReminderUpsertDto dto) =>
{
    var r = await db.Reminders.FindAsync(id);
    if (r is null) return Results.NotFound();

    UpdateReminder(r, dto);
    r.NextRunUtc = ReminderCalculator.ComputeNextRunUtc(r, DateTime.UtcNow);
    r.UpdatedUtc = DateTime.UtcNow;

    await db.SaveChangesAsync();
    return Results.Ok(ToDto(r));
});

app.MapDelete("/api/reminders/{id:int}", async (AppDbContext db, int id) =>
{
    var r = await db.Reminders.FindAsync(id);
    if (r is null) return Results.NotFound();
    db.Reminders.Remove(r);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

// Notifications
app.MapGet("/api/notifications", async (AppDbContext db, string? status) =>
{
    var q = db.Notifications.AsQueryable();
    if (string.Equals(status, "unread", StringComparison.OrdinalIgnoreCase))
        q = q.Where(n => n.ReadAtUtc == null);
    var list = await q.OrderByDescending(n => n.CreatedUtc)
        .Take(100)
        .Select(n => new NotificationDto(n.Id, n.HabitId, n.Message, n.ScheduledLocal, n.CreatedUtc, n.ReadAtUtc))
        .ToListAsync();
    return Results.Ok(list);
});

app.MapPost("/api/notifications/{id:int}/read", async (AppDbContext db, int id) =>
{
    var n = await db.Notifications.FindAsync(id);
    if (n is null) return Results.NotFound();
    n.ReadAtUtc ??= DateTime.UtcNow;
    await db.SaveChangesAsync();
    return Results.NoContent();
});

app.Run();

// --------------- helpers -----------------
static Reminder MapReminder(ReminderUpsertDto dto) => new()
{
    HabitId = dto.HabitId,
    HabitName = dto.HabitName.Trim(),
    Enabled = dto.Enabled,
    Frequency = dto.Frequency,
    TimeOfDay = dto.TimeOfDay,
    DaysOfWeekCsv = ReminderCalculator.JoinDays(dto.DaysOfWeek),
    TimeZone = dto.TimeZone,
    CreatedUtc = DateTime.UtcNow,
    UpdatedUtc = DateTime.UtcNow
};

static void UpdateReminder(Reminder r, ReminderUpsertDto dto)
{
    r.HabitName = dto.HabitName.Trim();
    r.Enabled = dto.Enabled;
    r.Frequency = dto.Frequency;
    r.TimeOfDay = dto.TimeOfDay;
    r.DaysOfWeekCsv = ReminderCalculator.JoinDays(dto.DaysOfWeek);
    r.TimeZone = dto.TimeZone;
}

static ReminderDto ToDto(Reminder r) => new(
    r.Id,
    r.HabitId,
    r.HabitName,
    r.Enabled,
    r.Frequency,
    r.TimeOfDay,
    ReminderCalculator.ParseDays(r.DaysOfWeekCsv),
    r.TimeZone,
    r.NextRunUtc,
    r.LastSentUtc
);
