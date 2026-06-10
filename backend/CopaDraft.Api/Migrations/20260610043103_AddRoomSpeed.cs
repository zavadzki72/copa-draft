using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CopaDraft.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRoomSpeed : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Speed",
                table: "Rooms",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Speed",
                table: "Rooms");
        }
    }
}
