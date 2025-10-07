namespace HabitTracker.Api.Dtos;

public record HabitCreateDto(string Name, string? Description, string? ColorHex, string? IconKey);
public record HabitUpdateDto(string Name, string? Description, string? ColorHex, string? IconKey, bool IsArchived);