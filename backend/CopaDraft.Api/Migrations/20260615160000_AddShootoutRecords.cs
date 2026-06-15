using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CopaDraft.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddShootoutRecords : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Shootouts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RoomId = table.Column<Guid>(type: "uuid", nullable: false),
                    TieId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    KicksJson = table.Column<string>(type: "text", nullable: false),
                    Decided = table.Column<bool>(type: "boolean", nullable: false),
                    PensHome = table.Column<int>(type: "integer", nullable: false),
                    PensAway = table.Column<int>(type: "integer", nullable: false),
                    WinnerId = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Shootouts", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Shootouts_RoomId_TieId",
                table: "Shootouts",
                columns: new[] { "RoomId", "TieId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Shootouts");
        }
    }
}
