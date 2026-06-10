using CopaDraft.Engine.Models;

namespace CopaDraft.Engine;

/// <summary>
/// Cansaço entre rodadas no multiplayer — espelha a regra do solo
/// (lib/team.js updateFatigue): titulares acumulam +FATIGUE_OLD/+FATIGUE_YOUNG
/// por jogo conforme a idade (teto FATIGUE_MAX); reservas que ficam fora
/// descansam por inteiro (zera). O engine aplica a penalidade no overall
/// efetivo via EngineOptions.Fatigue (teto FATIGUE_PENALTY_MAX).
/// Puro e determinístico — resume pós-restart reproduz os mesmos valores.
/// </summary>
public static class MpFatigue
{
    /// <summary>Side com o cansaço acumulado aplicado aos jogadores.</summary>
    public static SideInput Apply(SideInput side, IReadOnlyDictionary<string, double> fatigue)
    {
        EnginePlayer With(EnginePlayer p) => fatigue.TryGetValue(p.Id, out double f) && f > 0
            ? new EnginePlayer
            {
                Id = p.Id, Name = p.Name, Pos = p.Pos, Age = p.Age, Overall = p.Overall,
                Archetype = p.Archetype, Leader = p.Leader, Team = p.Team, Code = p.Code,
                Cup = p.Cup, Fatigue = f,
            }
            : p;
        return new SideInput
        {
            Name = side.Name, Code = side.Code, Cup = side.Cup, Dream = side.Dream,
            Formation = side.Formation,
            Starters = side.Starters.Select(With).ToList(),
            Bench = side.Bench.Select(With).ToList(),
            SubsLeft = side.SubsLeft, CaptainId = side.CaptainId,
        };
    }

    /// <summary>Atualiza o mapa após a partida: titulares cansam, banco descansa.</summary>
    public static void UpdateAfterMatch(Dictionary<string, double> fatigue, SideInput side, GameConfig c)
    {
        foreach (EnginePlayer p in side.Starters)
        {
            double gain = p.Age >= c.FATIGUE_OLD_AGE ? c.FATIGUE_OLD : c.FATIGUE_YOUNG;
            fatigue[p.Id] = Math.Min(c.FATIGUE_MAX, fatigue.GetValueOrDefault(p.Id) + gain);
        }
        foreach (EnginePlayer p in side.Bench)
            fatigue[p.Id] = 0;   // descanso completo
    }
}
