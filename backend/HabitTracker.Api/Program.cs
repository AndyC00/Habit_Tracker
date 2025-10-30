using HabitTracker.Api.Dtos;
using HabitTracker.Api.Services;
using HabitTracker.Api.Utils;
using Google.Cloud.Firestore;
using Google.Apis.Auth.OAuth2;
using System.Text.Json.Serialization;

// --------------------- Preliminary setup ---------------------
var builder = WebApplication.CreateBuilder(args);

// JSON options
builder.Services.ConfigureHttpJsonOptions(opt =>
{
    opt.SerializerOptions.Converters.Add(new DateOnlyJsonConverter());
    opt.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

// Swagger + CORS
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(opt =>
{
    opt.AddDefaultPolicy(p => p
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowAnyOrigin());
});

// Firestore
builder.Services.AddSingleton(provider =>
{
    var projectId = builder.Configuration["FIREBASE_PROJECT_ID"] ?? Environment.GetEnvironmentVariable("FIREBASE_PROJECT_ID") ?? "habittracker-database";
    var credPath = builder.Configuration["GOOGLE_APPLICATION_CREDENTIALS"] ?? Environment.GetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS");

    var builderDb = new FirestoreDbBuilder { ProjectId = projectId };
    if (!string.IsNullOrWhiteSpace(credPath) && File.Exists(credPath))
    {
        // Load explicit credentials from JSON file when provided
        builderDb.Credential = GoogleCredential.FromFile(credPath);
    }
    // Otherwise rely on ADC (gcloud auth application-default login, or platform identity)
    return builderDb.Build();
});
builder.Services.AddSingleton<IFirestoreRepo, FirestoreRepo>();

// build app and middleware pipeline
var app = builder.Build();

app.UseCors();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapGet("/ping", () => Results.Ok(new { ok = true })).WithTags("Health");

// --------------------- CRUD ---------------------
app.MapGet("/api/habits", async (IFirestoreRepo repo, bool? includeArchived) =>
{
    var list = await repo.ListHabitsAsync(includeArchived == true);
    return Results.Ok(list);
});

app.MapPost("/api/habits", async (IFirestoreRepo repo, HabitCreateDto dto) =>
{
    if (string.IsNullOrWhiteSpace(dto.Name)) return Results.BadRequest("Name is required.");
    var habit = await repo.CreateHabitAsync(dto);
    return Results.Created($"/api/habits/{habit.Id}", habit);
});

app.MapPut("/api/habits/{id:int}", async (IFirestoreRepo repo, int id, HabitUpdateDto dto) =>
{
    if (string.IsNullOrWhiteSpace(dto.Name)) return Results.BadRequest("Name is required.");
    var updated = await repo.UpdateHabitAsync(id, dto);
    return updated is null ? Results.NotFound() : Results.Ok(updated);
});

app.MapPost("/api/habits/{id:int}/archive", async (IFirestoreRepo repo, int id) =>
{
    var list = await repo.ListHabitsAsync(true);
    var h = list.FirstOrDefault(x => x.Id == id);
    if (h is null) return Results.NotFound();
    var updated = await repo.UpdateHabitAsync(id, new HabitUpdateDto(h.Name, h.Description, h.ColorHex, h.IconKey, true));
    return updated is null ? Results.NotFound() : Results.NoContent();
});

app.MapPost("/api/habits/{id:int}/unarchive", async (IFirestoreRepo repo, int id) =>
{
    var list = await repo.ListHabitsAsync(true);
    var h = list.FirstOrDefault(x => x.Id == id);
    if (h is null) return Results.NotFound();
    var updated = await repo.UpdateHabitAsync(id, new HabitUpdateDto(h.Name, h.Description, h.ColorHex, h.IconKey, false));
    return updated is null ? Results.NotFound() : Results.NoContent();
});

// --------------------- Check-ins ---------------------
app.MapPost("/api/habits/{id:int}/checkins", async (IFirestoreRepo repo, int id, CheckInUpsertDto dto) =>
{
    try
    {
        var check = await repo.UpsertCheckInAsync(id, dto);
        return Results.Ok(check);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(ex.Message);
    }
});

app.MapDelete("/api/habits/{id:int}/checkins/{localDate}", async (IFirestoreRepo repo, int id, string localDate) =>
{
    var ok = await repo.DeleteCheckInAsync(id, localDate);
    return ok ? Results.NoContent() : Results.NotFound();
});

app.MapGet("/api/habits/{id:int}/checkins", async (IFirestoreRepo repo, int id) =>
{
    var all = await repo.ListCheckinsAsync(id);
    return Results.Ok(all);
}).WithTags("CheckIns");

// --------------------- Calendar & Stats ---------------------
app.MapGet("/api/habits/{id:int}/calendar", async (IFirestoreRepo repo, int id, string month) =>
{
    try
    {
        var result = await repo.GetCalendarAsync(id, month);
        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(ex.Message);
    }
});

app.MapGet("/api/habits/{id:int}/stats", async (IFirestoreRepo repo, int id, string? month, string? tz) =>
{
    var stats = await repo.GetStatsAsync(id, month, tz);
    return stats is null ? Results.NotFound() : Results.Ok(stats);
});

app.Run();
