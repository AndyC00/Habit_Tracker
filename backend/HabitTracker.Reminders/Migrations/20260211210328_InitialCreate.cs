using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HabitTracker.Reminders.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Notifications",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    HabitId = table.Column<int>(type: "INTEGER", nullable: false),
                    Message = table.Column<string>(type: "TEXT", maxLength: 240, nullable: false),
                    ScheduledLocal = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ReadAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Notifications", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Reminders",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    HabitId = table.Column<int>(type: "INTEGER", nullable: false),
                    HabitName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Enabled = table.Column<bool>(type: "INTEGER", nullable: false),
                    Frequency = table.Column<int>(type: "INTEGER", nullable: false),
                    TimeOfDay = table.Column<string>(type: "TEXT", maxLength: 5, nullable: false),
                    DaysOfWeekCsv = table.Column<string>(type: "TEXT", maxLength: 50, nullable: true),
                    TimeZone = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    NextRunUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    LastSentUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Reminders", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_CreatedUtc",
                table: "Notifications",
                column: "CreatedUtc");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_ReadAtUtc",
                table: "Notifications",
                column: "ReadAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_Reminders_HabitId",
                table: "Reminders",
                column: "HabitId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Reminders_NextRunUtc",
                table: "Reminders",
                column: "NextRunUtc");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Notifications");

            migrationBuilder.DropTable(
                name: "Reminders");
        }
    }
}
