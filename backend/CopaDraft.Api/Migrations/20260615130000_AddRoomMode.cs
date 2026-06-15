using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CopaDraft.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRoomMode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Mode",
                table: "Rooms",
                type: "text",
                nullable: false,
                defaultValue: "classico");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Mode",
                table: "Rooms");
        }
    }
}
