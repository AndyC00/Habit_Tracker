# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS base
WORKDIR /app
EXPOSE 6060

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY ["backend/HabitTracker.Reminders/HabitTracker.Reminders.csproj", "backend/HabitTracker.Reminders/"]
RUN dotnet restore "backend/HabitTracker.Reminders/HabitTracker.Reminders.csproj"
COPY . .
WORKDIR "/src/backend/HabitTracker.Reminders"
RUN dotnet publish "HabitTracker.Reminders.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:6060
ENV REMINDER_DB_PATH=/data/reminders.db
ENTRYPOINT ["dotnet", "HabitTracker.Reminders.dll"]
