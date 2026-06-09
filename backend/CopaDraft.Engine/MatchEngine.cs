using CopaDraft.Engine.Models;

namespace CopaDraft.Engine;

/// <summary>
/// Faithful C# port of lib/engine.js — the PURE minute-by-minute match engine.
/// Same sides + config + seed ⇒ same log as the JS reference (asserted by the
/// golden vectors in CopaDraft.Engine.Tests).
///
/// PARITY RULES (do not break):
///  • Every rng.* call happens in EXACTLY the same order as the JS engine.
///  • Narration variants come from rng.Pick over arrays with the SAME lengths
///    as lib/i18n.js (see Narration / narration-pt.json).
///  • Event sorting must be STABLE (JS Array.sort) — we use OrderBy.
/// </summary>
public static class MatchEngine
{
    private static readonly string[] Sides = { "home", "away" };
    private static readonly string[] PosOrder = { "GOL", "ZAG", "LAT", "MEI", "ATA" };

    // ---- prepared (mutable) runtime structures ----
    private sealed class P
    {
        public required EnginePlayer Src { get; init; }
        public required Attrs Attrs { get; init; }
        public double Eff { get; init; }
        public string Id => Src.Id;
        public string Name => Src.Name;
        public string Pos => Src.Pos;
    }

    private sealed class SideState
    {
        public required string Key { get; init; }
        public required string Name { get; init; }
        public string? Code { get; init; }
        public int Cup { get; init; }
        public bool Dream { get; init; }
        public required string Formation { get; init; }
        public required List<P> Starters { get; init; }
        public required List<P> Bench { get; init; }
        public int SubsLeft { get; set; }
        public required Dictionary<string, List<P>> G { get; init; }
    }

    private static Dictionary<string, List<P>> Group(IEnumerable<P> starters)
    {
        var g = new Dictionary<string, List<P>>
        {
            ["GOL"] = new(), ["ZAG"] = new(), ["LAT"] = new(), ["MEI"] = new(), ["ATA"] = new(),
        };
        foreach (P p in starters)
            (g.TryGetValue(p.Pos, out List<P>? bucket) ? bucket : g["MEI"]).Add(p);
        return g;
    }

    private static double Avg(IReadOnlyList<P> arr)
    {
        if (arr.Count == 0) return 70;
        double s = 0;
        foreach (P p in arr) s += p.Eff;
        return s / arr.Count;
    }

    // effective overall — mirror of effective(p, ctx) in engine.js
    private static double Effective(EnginePlayer p, GameConfig c, EngineOptions o, bool hasLeader, EnginePlayer? captain)
    {
        double v = p.Overall;
        if (o.Pressure && p.Age < c.PRESSURE_U_AGE)
        {
            double pen = o.RoundN * (double)c.PRESSURE_PER_ROUND;
            if (hasLeader && c.LEADER_HALVES_PRESSURE) pen /= 2;
            v -= pen;
        }
        if (o.Fatigue && p.Fatigue != 0)
            v -= Math.Min(c.FATIGUE_PENALTY_MAX, p.Fatigue);
        if (captain is not null)
        {
            if (p.Id == captain.Id) v += c.CAPTAIN_OVR_BOOST;
            else if (p.Team == captain.Team && p.Cup == captain.Cup) v += c.CHEMISTRY_OVR_BOOST;
        }
        return v;
    }

    // weighted pools — bucket iteration order mirrors the JS push order exactly
    private static List<(P Item, double W)> ScorerWeights(Dictionary<string, List<P>> g)
    {
        var w = new List<(P, double)>();
        void Push(List<P> arr, double b) { foreach (P p in arr) w.Add((p, b * (p.Attrs.Shooting / 80.0))); }
        Push(g["ATA"], 5.0); Push(g["MEI"], 2.4); Push(g["LAT"], 0.8); Push(g["ZAG"], 0.6); Push(g["GOL"], 0.02);
        return w;
    }

    private static List<(P Item, double W)> AssistWeights(Dictionary<string, List<P>> g, P exclude)
    {
        var w = new List<(P, double)>();
        void Push(List<P> arr, double b)
        {
            foreach (P p in arr) { if (ReferenceEquals(p, exclude)) continue; w.Add((p, b * (p.Attrs.Passing / 80.0))); }
        }
        Push(g["MEI"], 3.0); Push(g["ATA"], 2.2); Push(g["LAT"], 1.6); Push(g["ZAG"], 0.4); Push(g["GOL"], 0.05);
        return w;
    }

    private static List<(P Item, double W)> FoulWeights(Dictionary<string, List<P>> g)
    {
        var w = new List<(P, double)>();
        void Push(List<P> arr, double b) { foreach (P p in arr) w.Add((p, b)); }
        Push(g["MEI"], 2.4); Push(g["ZAG"], 2.2); Push(g["LAT"], 2.0); Push(g["ATA"], 1.0); Push(g["GOL"], 0.1);
        return w;
    }

    /// <summary>Mirror of expectedGoals().</summary>
    public static double ExpectedGoals(double atk, double def, double day, GameConfig c, double scale)
        => c.BASE_LAMBDA * Math.Pow((atk * day) / def, c.LAMBDA_EXP) * scale;

    private static string GkName(P? gk) => gk is not null ? gk.Name : Narration.Pt.T("gkFallback");

    private static Dictionary<string, object?> Vars(params (string K, object? V)[] kv)
    {
        var d = new Dictionary<string, object?>();
        foreach ((string k, object? v) in kv) d[k] = v;
        return d;
    }

    // ---- one continuous period (regulation or ET) — mirror of runPeriod ----
    private sealed class MatchState
    {
        public required Rng Rng { get; init; }
        public required Dictionary<string, SideState> Sides { get; init; }
        public required Dictionary<string, double> BaseAtk { get; init; }
        public required Dictionary<string, double> BaseDef { get; init; }
        public required Dictionary<string, double> Day { get; init; }
        public required Dictionary<string, int> ManDown { get; init; }
        public required GameConfig C { get; init; }
        public required Score Score { get; init; }
        public required List<MatchEvent> Events { get; init; }
        public required Dictionary<string, PlayerStats> Stats { get; init; }
        public required List<CardEntry> Cards { get; init; }
        public required List<SentOffEntry> SentOff { get; init; }
        public required List<InjuryEntry> Injuries { get; init; }
        public required List<MatchPen> MatchPens { get; init; }
    }

    private static void RunPeriod(MatchState s, double scale, int periodLen, int minuteStart, int minuteEnd, bool etTag)
    {
        Rng rng = s.Rng;
        GameConfig c = s.C;
        Narration n = Narration.Pt;

        for (int m = minuteStart; m <= minuteEnd; m++)
        {
            // ---- goals ----
            foreach (string side in Sides)
            {
                string opp = side == "home" ? "away" : "home";
                double curAtk = s.BaseAtk[side] * Math.Pow(c.MAN_DOWN_ATK, s.ManDown[side]);
                double curDef = s.BaseDef[opp] * Math.Pow(c.MAN_DOWN_DEF, s.ManDown[opp]);
                double rate = ExpectedGoals(curAtk, curDef, s.Day[side], c, scale) / periodLen;
                if (!rng.Chance(rate)) continue;

                Dictionary<string, List<P>> g = s.Sides[side].G;
                List<(P, double)> sw = ScorerWeights(g);
                if (sw.Count == 0) continue;
                P scorer = rng.Weighted(sw);
                bool hasAssist = rng.Chance(0.72);
                P? assist = hasAssist ? rng.Weighted(AssistWeights(g, scorer)) : null;
                if (side == "home") s.Score.Home++; else s.Score.Away++;
                s.Stats[scorer.Id].Goals++;
                if (assist is not null) s.Stats[assist.Id].Assists++;
                string text = n.Fill(rng.Pick(n.Arr("goal")), Vars(
                    ("player", scorer.Name), ("team", s.Sides[side].Name), ("TEAM", s.Sides[side].Name.ToUpperInvariant())));
                if (assist is not null)
                    text += n.Fill(rng.Pick(n.Arr("assist")), Vars(("assist", assist.Name)));
                s.Events.Add(new MatchEvent
                {
                    Minute = m, Type = "goal", Side = side, EtTag = etTag, Text = text,
                    Score = s.Score.Clone(),
                    Players = assist is not null ? new[] { scorer.Id, assist.Id } : new[] { scorer.Id },
                });
            }

            // ---- fouls / cards (causal) ----
            foreach (string side in Sides)
            {
                if (!rng.Chance(c.FOUL_PM)) continue;
                Dictionary<string, List<P>> g = s.Sides[side].G;
                List<(P, double)> fw = FoulWeights(g);
                if (fw.Count == 0) continue;
                P off = rng.Weighted(fw);
                string teamName = s.Sides[side].Name;
                bool red = false, second = false, yellow = false;
                if (rng.Chance(c.FOUL_RED_P))
                {
                    red = true;
                }
                else if (rng.Chance(c.FOUL_YELLOW_P))
                {
                    yellow = true;
                    s.Stats[off.Id].Yellows++;
                    if (s.Stats[off.Id].Yellows >= 2) { red = true; second = true; }
                }
                if (red)
                {
                    s.ManDown[side]++;
                    s.Stats[off.Id].Reds = 1;
                    List<P> arr = g[off.Pos];
                    int ix = arr.IndexOf(off);
                    if (ix >= 0) arr.RemoveAt(ix);
                    s.SentOff.Add(new SentOffEntry(off.Id, side, m, second));
                    s.Cards.Add(new CardEntry(off.Id, side, m, "red", second));
                    string[] tplArr = second ? n.Arr("red2") : n.Arr("red");
                    s.Events.Add(new MatchEvent
                    {
                        Minute = m, Type = "red", Side = side, EtTag = etTag,
                        Text = n.Fill(rng.Pick(tplArr), Vars(("player", off.Name), ("team", teamName))),
                        Players = new[] { off.Id },
                    });
                }
                else if (yellow)
                {
                    s.Cards.Add(new CardEntry(off.Id, side, m, "yellow", false));
                    s.Events.Add(new MatchEvent
                    {
                        Minute = m, Type = "yellow", Side = side, EtTag = etTag,
                        Text = n.Fill(rng.Pick(n.Arr("yellow")), Vars(("player", off.Name), ("team", teamName))),
                        Players = new[] { off.Id },
                    });
                }
                else
                {
                    s.Events.Add(new MatchEvent
                    {
                        Minute = m, Type = "foul", Side = side, EtTag = etTag,
                        Text = n.Fill(rng.Pick(n.Arr("foul")), Vars(("player", off.Name), ("team", teamName))),
                        Players = new[] { off.Id },
                    });
                }
            }

            // ---- injuries (rare) ----
            foreach (string side in Sides)
            {
                if (!rng.Chance(c.INJURY_PM)) continue;
                SideState S = s.Sides[side];
                Dictionary<string, List<P>> g = S.G;
                var pool = new List<P>();
                foreach (string pos in PosOrder) pool.AddRange(g[pos]);
                if (pool.Count == 0) continue;
                P hurt = rng.Pick(pool);
                List<P> arr = g[hurt.Pos];
                int ix = arr.IndexOf(hurt);
                if (ix >= 0) arr.RemoveAt(ix);

                P? reserve = null;
                if (S.SubsLeft > 0)
                {
                    int bi = S.Bench.FindIndex(p => p.Pos == hurt.Pos);
                    if (bi >= 0)
                    {
                        reserve = S.Bench[bi];
                        S.Bench.RemoveAt(bi);
                        arr.Add(reserve);
                        S.SubsLeft--;
                    }
                }
                if (reserve is null) s.ManDown[side]++;

                s.Injuries.Add(new InjuryEntry(hurt.Id, side, m, reserve?.Id));
                string text = n.Fill(rng.Pick(n.Arr("injury")), Vars(("player", hurt.Name)));
                text += reserve is not null
                    ? n.T("injSub", Vars(("player", reserve.Name)))
                    : n.T("injDown", Vars(("team", S.Name)));
                s.Events.Add(new MatchEvent
                {
                    Minute = m, Type = "injury", Side = side, EtTag = etTag, Text = text,
                    Players = reserve is not null ? new[] { hurt.Id, reserve.Id } : new[] { hurt.Id },
                });
            }

            // ---- in-match penalties (seeded outcome) ----
            foreach (string side in Sides)
            {
                if (!rng.Chance(c.PENALTY_PM)) continue;
                string opp = side == "home" ? "away" : "home";
                Dictionary<string, List<P>> g = s.Sides[side].G;
                var takerPool = new List<P>();
                takerPool.AddRange(g["ATA"]); takerPool.AddRange(g["MEI"]); takerPool.AddRange(g["LAT"]); takerPool.AddRange(g["ZAG"]);
                if (takerPool.Count == 0) continue;
                P taker = takerPool[0];
                foreach (P p in takerPool) if (p.Attrs.Shooting > taker.Attrs.Shooting) taker = p;
                P? gk = s.Sides[opp].G["GOL"].Count > 0 ? s.Sides[opp].G["GOL"][0] : null;
                double gkOvr = gk?.Src.Overall ?? 75;
                string teamName = s.Sides[side].Name;

                double pConv = c.PEN_CONVERT_BASE + (taker.Attrs.Shooting - 80) * 0.004 - (gkOvr - 80) * 0.005;
                pConv = Math.Max(0.35, Math.Min(0.95, pConv));
                bool scored = rng.Chance(pConv);
                string outcome;
                if (scored) outcome = "goal";
                else outcome = rng.Chance(Math.Max(0.3, Math.Min(0.8, 0.55 + (gkOvr - 80) * 0.01))) ? "save" : "miss";

                string penId = "pk" + (s.MatchPens.Count + 1);
                if (outcome == "goal")
                {
                    if (side == "home") s.Score.Home++; else s.Score.Away++;
                    s.Stats[taker.Id].Goals++;
                    s.Events.Add(new MatchEvent
                    {
                        Minute = m, Type = "goal", Side = side, EtTag = etTag, Pen = true, PenId = penId,
                        Text = n.Fill(rng.Pick(n.Arr("penGoal")), Vars(("player", taker.Name), ("team", teamName))),
                        Score = s.Score.Clone(), Players = new[] { taker.Id },
                    });
                }
                else if (outcome == "save")
                {
                    if (gk is not null) s.Stats[gk.Id].Saves++;
                    s.Events.Add(new MatchEvent
                    {
                        Minute = m, Type = "penalty", Side = side, EtTag = etTag, PenId = penId, Outcome = outcome,
                        Text = n.Fill(rng.Pick(n.Arr("penSave")), Vars(("player", taker.Name), ("team", teamName), ("gk", GkName(gk)))),
                        Players = gk is not null ? new[] { gk.Id, taker.Id } : new[] { taker.Id },
                    });
                }
                else
                {
                    s.Events.Add(new MatchEvent
                    {
                        Minute = m, Type = "penalty", Side = side, EtTag = etTag, PenId = penId, Outcome = outcome,
                        Text = n.Fill(rng.Pick(n.Arr("penMiss")), Vars(("player", taker.Name), ("team", teamName))),
                        Players = new[] { taker.Id },
                    });
                }
                s.MatchPens.Add(new MatchPen
                {
                    PenId = penId, Side = side, Minute = m, Taker = taker.Id, TakerName = taker.Name,
                    Gk = gk?.Id, Outcome = outcome, Scored = scored,
                });
            }
        }
    }

    /// <summary>Mirror of simulateMatch(homeSide, awaySide, config, seed, opts).</summary>
    public static MatchLog SimulateMatch(SideInput homeSide, SideInput awaySide, GameConfig c, uint seed, EngineOptions? options = null)
    {
        EngineOptions o = options ?? new EngineOptions();
        var rng = new Rng(seed);
        Narration n = Narration.Pt;

        SideState Prep(SideInput side, string key)
        {
            bool hasLeader = side.Starters.Any(p => p.Leader);
            EnginePlayer? captain = side.CaptainId is not null
                ? side.Starters.FirstOrDefault(p => p.Id == side.CaptainId)
                : null;
            P PrepP(EnginePlayer p) => new()
            {
                Src = p,
                Attrs = Derive.DeriveAttrs(ToPlayer(p), c),
                Eff = Effective(p, c, o, hasLeader, captain),
            };
            var starters = side.Starters.Select(PrepP).ToList();
            var bench = side.Bench.Select(PrepP).ToList();
            return new SideState
            {
                Key = key, Name = side.Name, Code = side.Code, Cup = side.Cup, Dream = side.Dream,
                Formation = side.Formation, Starters = starters, Bench = bench,
                SubsLeft = side.SubsLeft, G = Group(starters),
            };
        }

        SideState H = Prep(homeSide, "home");
        SideState A = Prep(awaySide, "away");

        var baseAtk = new Dictionary<string, double>
        {
            ["home"] = Avg(Concat(H.G["MEI"], H.G["ATA"])),
            ["away"] = Avg(Concat(A.G["MEI"], A.G["ATA"])),
        };
        var baseDef = new Dictionary<string, double>
        {
            ["home"] = Avg(Concat(H.G["GOL"], H.G["ZAG"], H.G["LAT"])),
            ["away"] = Avg(Concat(A.G["GOL"], A.G["ZAG"], A.G["LAT"])),
        };

        var day = new Dictionary<string, double>
        {
            ["home"] = 1 + rng.Range(-c.ZEBRA_Z, c.ZEBRA_Z),
            ["away"] = 1 + rng.Range(-c.ZEBRA_Z, c.ZEBRA_Z),
        };

        var score = new Score();
        var events = new List<MatchEvent>();
        var stats = new Dictionary<string, PlayerStats>();
        var cards = new List<CardEntry>();
        var sentOff = new List<SentOffEntry>();
        var injuries = new List<InjuryEntry>();
        var matchPens = new List<MatchPen>();
        var manDown = new Dictionary<string, int> { ["home"] = 0, ["away"] = 0 };
        bool needsShootout = false;
        foreach (P p in H.Starters.Concat(H.Bench).Concat(A.Starters).Concat(A.Bench))
            stats[p.Id] = new PlayerStats();

        var sides = new Dictionary<string, SideState> { ["home"] = H, ["away"] = A };

        events.Add(new MatchEvent
        {
            Minute = 0, Type = "kickoff", Key = "kickoff",
            Text = n.T("kickoff", Vars(("home", H.Name), ("away", A.Name))),
        });

        var state = new MatchState
        {
            Rng = rng, Sides = sides, BaseAtk = baseAtk, BaseDef = baseDef, Day = day,
            ManDown = manDown, C = c, Score = score, Events = events, Stats = stats,
            Cards = cards, SentOff = sentOff, Injuries = injuries, MatchPens = matchPens,
        };

        // regulation
        RunPeriod(state, scale: 1, periodLen: c.MINUTES, minuteStart: 1, minuteEnd: c.MINUTES, etTag: false);

        // non-goal flavour events
        int nEvents = rng.NextInt(c.EVENTS_MIN, c.EVENTS_MAX);
        for (int i = 0; i < nEvents; i++)
        {
            int minute = rng.NextInt(3, c.MINUTES - 1);
            string side = rng.Chance(0.5) ? "home" : "away";
            string oppKey = side == "home" ? "away" : "home";
            string type = rng.Weighted(new (string, double)[]
            {
                ("bigchance", 3), ("save", 3), ("woodwork", 1.2), ("counter", 2),
            });
            Dictionary<string, List<P>> g = sides[side].G;
            List<(P, double)> sw = ScorerWeights(g);
            if (sw.Count == 0) continue;
            P? oppGk = sides[oppKey].G["GOL"].Count > 0 ? sides[oppKey].G["GOL"][0] : null;
            P attacker = rng.Weighted(sw);
            var vars = Vars(("team", sides[side].Name), ("player", attacker.Name), ("gk", GkName(oppGk)));
            if (type == "save" && oppGk is not null) { stats[oppGk.Id].Saves++; stats[attacker.Id].BigChances++; }
            if (type is "bigchance" or "woodwork" or "counter") stats[attacker.Id].BigChances++;
            string text = n.Fill(rng.Pick(n.Arr(type)), vars);
            events.Add(new MatchEvent
            {
                Minute = minute, Type = type, Side = side, Text = text,
                Players = type == "save" && oppGk is not null ? new[] { oppGk.Id, attacker.Id } : new[] { attacker.Id },
            });
        }

        events.Add(new MatchEvent { Minute = 45, Type = "half", Key = "halfTime", Text = n.T("halfTime") });

        // knockout draw -> extra time, then auto shootout
        bool extraTime = false;
        Score? penalties = null;
        if (o.Knockout && score.Home == score.Away)
        {
            extraTime = true;
            events.Add(new MatchEvent { Minute = c.MINUTES, Type = "half", Key = "etStart", Text = n.T("etStart") });
            RunPeriod(state, scale: c.ET_LAMBDA_SCALE, periodLen: c.ET_MINUTES,
                minuteStart: c.MINUTES + 1, minuteEnd: c.MINUTES + c.ET_MINUTES, etTag: true);

            if (score.Home == score.Away)
            {
                events.Add(new MatchEvent
                {
                    Minute = c.MINUTES + c.ET_MINUTES, Type = "half", Key = "pensDecision",
                    Text = n.T("pensDecision"),
                });
                if (o.InteractiveShootout)
                {
                    needsShootout = true;
                }
                else
                {
                    Score pk = AutoShootout(rng, sides);
                    penalties = pk;
                    events.Add(new MatchEvent
                    {
                        Minute = c.MINUTES + c.ET_MINUTES, Type = "pens", Key = "pens",
                        Text = n.T("pensLine", Vars(("home", H.Name), ("hs", pk.Home), ("away", A.Name), ("as", pk.Away))),
                    });
                }
            }
        }

        events.Add(new MatchEvent { Minute = 90, Type = "full", Key = "fullTime", Text = n.T("fullTime") });
        // JS Array.sort is stable — OrderBy preserves push order within a minute.
        List<MatchEvent> sorted = events.OrderBy(e => e.Minute).ToList();

        string result;
        if (score.Home > score.Away) result = "home";
        else if (score.Away > score.Home) result = "away";
        else if (penalties is not null) result = penalties.Home > penalties.Away ? "home" : "away";
        else if (needsShootout) result = "pending";
        else result = "draw";

        return new MatchLog
        {
            Home = Summary(H), Away = Summary(A),
            Score = score, Events = sorted, Stats = stats,
            Conceded = new Score { Home = score.Away, Away = score.Home },
            Result = result, ExtraTime = extraTime, Penalties = penalties, NeedsShootout = needsShootout,
            Cards = cards, SentOff = sentOff, Injuries = injuries, MatchPens = matchPens,
            ManDown = manDown, Seed = seed,
        };
    }

    private static SideSummary Summary(SideState s) => new(
        s.Name, s.Code, s.Cup, s.Dream, s.Formation,
        s.Starters.Select(p => new StarterRef(p.Id, p.Name, p.Pos)).ToList());

    private static Player ToPlayer(EnginePlayer p) => new()
    {
        Id = p.Id, Name = p.Name, Pos = p.Pos, Age = p.Age, Overall = p.Overall,
        Archetype = p.Archetype, Leader = p.Leader, Team = p.Team, Code = p.Code, Cup = p.Cup,
    };

    private static List<P> Concat(params List<P>[] lists)
    {
        var all = new List<P>();
        foreach (List<P> l in lists) all.AddRange(l);
        return all;
    }

    // mirror of autoShootout(rng, sides, def)
    private static Score AutoShootout(Rng rng, Dictionary<string, SideState> sides)
    {
        var score = new Score();
        var takers = new Dictionary<string, List<P>>
        {
            // JS [...starters].sort((a,b)=>b.shooting-a.shooting) is stable -> OrderByDescending
            ["home"] = sides["home"].Starters.OrderByDescending(p => p.Attrs.Shooting).ToList(),
            ["away"] = sides["away"].Starters.OrderByDescending(p => p.Attrs.Shooting).ToList(),
        };
        var gkOvr = new Dictionary<string, double>
        {
            ["home"] = GkOvr(sides["home"]),
            ["away"] = GkOvr(sides["away"]),
        };
        for (int i = 0; i < 5; i++)
        {
            foreach (string side in Sides)
            {
                string opp = side == "home" ? "away" : "home";
                P taker = takers[side][i % takers[side].Count];
                double p = 0.75 + (taker.Attrs.Shooting - 80) / 200.0 - (gkOvr[opp] - 80) / 300.0;
                if (rng.Chance(Math.Max(0.45, Math.Min(0.92, p))))
                {
                    if (side == "home") score.Home++; else score.Away++;
                }
            }
        }
        int guard = 0;
        while (score.Home == score.Away && guard < 10)
        {
            foreach (string side in Sides)
            {
                if (rng.Chance(0.72)) { if (side == "home") score.Home++; else score.Away++; }
            }
            guard++;
        }
        if (score.Home == score.Away)
        {
            if (rng.Chance(0.5)) score.Home++; else score.Away++;
        }
        return score;

        static double GkOvr(SideState s)
        {
            // JS: (g.GOL[0]?.overall) || 75 — 0 is falsy, but overall is never 0.
            List<P> gol = s.G["GOL"];
            return gol.Count > 0 ? gol[0].Src.Overall : 75;
        }
    }
}
