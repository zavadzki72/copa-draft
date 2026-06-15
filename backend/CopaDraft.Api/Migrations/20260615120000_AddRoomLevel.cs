using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CopaDraft.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRoomLevel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Level",
                table: "Rooms",
                type: "text",
                nullable: false,
                defaultValue: "normal");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Level",
                table: "Rooms");
        }
    }
}
