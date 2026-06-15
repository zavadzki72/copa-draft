using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CopaDraft.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRoomCupRange : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CupFrom",
                table: "Rooms",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "CupTo",
                table: "Rooms",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "CupFrom", table: "Rooms");
            migrationBuilder.DropColumn(name: "CupTo", table: "Rooms");
        }
    }
}
