# Copa Draft — backend .NET 10 (API + SignalR + engine).
# Build a partir da RAIZ do repo (o engine embute ../../squads.json):
#   docker build -f backend/Dockerfile .
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY squads.json ./squads.json
COPY backend/ ./backend/
RUN dotnet publish backend/CopaDraft.Api/CopaDraft.Api.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://0.0.0.0:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "CopaDraft.Api.dll"]
