using System.Text.Json;
using CopaDraft.Api.Services;
using CopaDraft.Engine;

namespace CopaDraft.Engine.Tests;

/// <summary>
/// Disputa de pênaltis interativa (server-authoritative). Cobre o que é SAGRADO:
/// determinismo da máquina e replay fiel das cobranças persistidas — para que um
/// restart do servidor no meio (ou depois) de uma disputa NÃO troque o vencedor
/// da fase. As regras (melhor-de-5 + morte súbita) espelham ui/penalty.jsx.
/// </summary>
public class ShootoutTests
{
    private static readonly GameConfig Cfg = GameConfig.Default;

    private static List<ShootoutEngine.Taker> Takers(string prefix, params double[] shooting)
        => shooting.Select((s, i) => new ShootoutEngine.Taker($"{prefix}{i}", $"{prefix}{i}", s)).ToList();

    private static readonly List<ShootoutEngine.Taker> Home = Takers("h", 88, 84, 82, 80, 78);
    private static readonly List<ShootoutEngine.Taker> Away = Takers("a", 86, 83, 81, 79, 77);

    [Fact]
    public void PlayAuto_Is_Deterministic_For_Same_Seed()
    {
        ShootoutProgress a = ShootoutEngine.PlayAuto(12345u, Home, 84, Away, 82, Cfg);
        ShootoutProgress b = ShootoutEngine.PlayAuto(12345u, Home, 84, Away, 82, Cfg);

        Assert.NotNull(a.Winner);
        Assert.Equal(a.Winner, b.Winner);
        Assert.Equal(a.ScoreHome, b.ScoreHome);
        Assert.Equal(a.ScoreAway, b.ScoreAway);
        Assert.Equal(a.Kicks.Count, b.Kicks.Count);
        for (int i = 0; i < a.Kicks.Count; i++) Assert.Equal(a.Kicks[i], b.Kicks[i]);
    }

    [Fact]
    public void PlayAuto_Always_Produces_A_Valid_Winner()
    {
        // varre vários seeds: a disputa sempre termina com um vencedor coerente
        for (uint seed = 1; seed <= 200; seed++)
        {
            ShootoutProgress p = ShootoutEngine.PlayAuto(seed, Home, 84, Away, 82, Cfg);
            Assert.True(p.Winner is "home" or "away", $"seed {seed}: sem vencedor");
            Assert.NotEqual(p.ScoreHome, p.ScoreAway);
            Assert.Equal(p.Winner == "home", p.ScoreHome > p.ScoreAway);
        }
    }

    [Fact]
    public void Replay_Then_Continue_Reproduces_The_Same_Disputa()
    {
        // simula um crash no MEIO da disputa: replay das cobranças persistidas +
        // continuação devolve EXATAMENTE a mesma disputa (mesmas cobranças, mesmo
        // vencedor) — RNG seedado por cobrança, independente da ordem de execução.
        ShootoutProgress full = ShootoutEngine.PlayAuto(0xC0FFEEu, Home, 84, Away, 82, Cfg);
        int cut = full.Kicks.Count / 2;

        var partial = new ShootoutProgress();
        foreach (ShootoutKick k in full.Kicks.Take(cut)) partial.ApplyAndCheck(k, Cfg.PK_ROUNDS);
        ShootoutProgress resumed = ShootoutEngine.ContinueAuto(partial, 0xC0FFEEu, Home, 84, Away, 82, Cfg);

        Assert.Equal(full.Kicks.Count, resumed.Kicks.Count);
        for (int i = 0; i < full.Kicks.Count; i++) Assert.Equal(full.Kicks[i], resumed.Kicks[i]);
        Assert.Equal(full.Winner, resumed.Winner);
    }

    [Fact]
    public void Replay_Of_A_Decided_Sequence_Keeps_The_Persisted_Winner()
    {
        // a essência do resume: o VENCEDOR vem das cobranças persistidas, não de
        // uma re-simulação pelo seed. Construímos uma disputa onde o AWAY ganha
        // (cobra tudo, casa erra tudo) e o replay a reaplica fielmente.
        var prog = new ShootoutProgress();
        int idx = 0;
        while (prog.Winner is null)
        {
            string side = prog.NextSide;
            bool scored = side == "away";   // away converte, home erra
            prog.ApplyAndCheck(new ShootoutKick(idx, side, side, side,
                "meio", scored ? "esq" : "meio", scored ? "goal" : "save", scored), Cfg.PK_ROUNDS);
            idx++;
            Assert.True(idx < 30, "disputa deveria ter decidido");
        }
        Assert.Equal("away", prog.Winner);

        // reaplica a sequência persistida → mesmo vencedor, sem novas cobranças
        var replay = new ShootoutProgress();
        foreach (ShootoutKick k in prog.Kicks) replay.ApplyAndCheck(k, Cfg.PK_ROUNDS);
        Assert.Equal("away", replay.Winner);
        ShootoutProgress cont = ShootoutEngine.ContinueAuto(replay, 999u, Home, 84, Away, 82, Cfg);
        Assert.Equal(prog.Kicks.Count, cont.Kicks.Count);   // nada a continuar: já decidida
    }

    [Fact]
    public void Decided_Best_Of_Five_Clinches_Early()
    {
        // 3 a 0 com 3x3 cobranças: away só pode chegar a 2 (2 restantes) < 3 → decide.
        Assert.Equal("home", ShootoutEngine.Decided(sh: 3, sa: 0, kh: 3, ka: 3, sudden: false, rounds: 5));
        // 3 a 0 com 3x2: away ainda tem 3 cobranças (pode empatar) → indefinido.
        Assert.Null(ShootoutEngine.Decided(sh: 3, sa: 0, kh: 3, ka: 2, sudden: false, rounds: 5));
        // 1 a 0 no começo ainda não decide
        Assert.Null(ShootoutEngine.Decided(sh: 1, sa: 0, kh: 1, ka: 1, sudden: false, rounds: 5));
        // 5 a 4 ao fim das 5 cobranças decide
        Assert.Equal("home", ShootoutEngine.Decided(sh: 5, sa: 4, kh: 5, ka: 5, sudden: false, rounds: 5));
    }

    [Fact]
    public void Decided_Sudden_Death_Only_On_Equal_Kicks()
    {
        // morte súbita: 1 a 0 mas away ainda vai cobrar (cobranças desiguais) → indefinido
        Assert.Null(ShootoutEngine.Decided(sh: 6, sa: 5, kh: 6, ka: 5, sudden: true, rounds: 5));
        // cobranças iguais e placar diferente → decide
        Assert.Equal("home", ShootoutEngine.Decided(sh: 6, sa: 5, kh: 6, ka: 6, sudden: true, rounds: 5));
        // empate em cobranças iguais → segue
        Assert.Null(ShootoutEngine.Decided(sh: 6, sa: 6, kh: 6, ka: 6, sudden: true, rounds: 5));
    }

    [Fact]
    public void Kicks_Survive_Json_Round_Trip()
    {
        // a sequência é persistida como JSON (KicksJson) e reaplicada no resume
        ShootoutProgress p = ShootoutEngine.PlayAuto(7u, Home, 84, Away, 82, Cfg);
        string json = JsonSerializer.Serialize(p.Kicks);
        List<ShootoutKick>? back = JsonSerializer.Deserialize<List<ShootoutKick>>(json);

        Assert.NotNull(back);
        Assert.Equal(p.Kicks.Count, back!.Count);
        for (int i = 0; i < p.Kicks.Count; i++) Assert.Equal(p.Kicks[i], back[i]);
    }
}
