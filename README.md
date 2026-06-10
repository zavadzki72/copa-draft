# ⚽ Copa Draft

> Monte o time dos sonhos no dado e ganhe a Copa.

Um jogo de Copa do Mundo estilo Brasfoot, jogável direto no navegador. A cada vaga do
elenco você rola o dado, recebe uma seleção histórica e escala um craque dela — juntando
ídolos de várias Copas num só time. Depois é disputar o mata-mata numa simulação minuto a
minuto, com narração em português.

**Mono-repo:** `frontend/` (HTML + JavaScript puro, React via CDN — sem build) e
`backend/` (.NET 10 — API + SignalR para o **modo Multiplayer Online**).
O modo solo continua 100% no navegador: abra o `frontend/index.html` e jogue.

---

## 🎮 Como jogar

1. **Draft no dado** — para cada posição, role o dado: uma seleção é sorteada e você
   escolhe um jogador dela. Ou clique em **🎲 Time aleatório** para montar tudo de uma vez.
2. **Revisão** — ajuste titulares ↔ reservas, defina o capitão e confirme.
3. **Campanha** — encare oitavas, quartas, semi e final. Vença para avançar.
4. **Vença 7 a 0** para desbloquear a conquista lendária.

### Modos
- **Clássico** — notas e atributos visíveis, com 2 re-rolagens por vaga.
- **De Almanaque** — draft às cegas (sem notas), revelação da média do elenco no fim.

### Sistemas
- **Motor de partida** puro e determinístico (minuto a minuto, com narração PT-BR).
- **Atributos** estilo FIFA derivados de overall + posição + arquétipo.
- **Fadiga** por idade e **substituições** (rodízio de elenco entre os jogos).
- **Pênaltis interativos** — você cobra (escolhe o canto) e defende (escolhe o lado).
- **Pressão da juventude** (sub-23), reduzida por um líder em campo.
- **Conquistas**, persistência da campanha, efeitos sonoros e **share-card** em PNG.

---

## 🚀 Rodando localmente

### Solo (só o frontend)

```bash
cd frontend
python3 -m http.server 8000    # ou: npx serve
```

Depois abra `http://localhost:8000` no navegador.

### Stack completa (com Multiplayer Online)

```bash
cp .env.example .env           # preencha JWT_KEY e GOOGLE_CLIENT_ID
docker compose up --build -d   # front + API .NET + PostgreSQL
```

Abra `http://localhost:8090`. O backend roda em `backend/` (testes: `dotnet test backend/CopaDraft.slnx`).

---

## 📁 Estrutura

```
frontend/             # o jogo (SPA sem build)
  index.html          # ponto de entrada (carrega tudo)
  config.js           # TODAS as constantes de balanceamento (+ seção MP)
  game.css            # estilos do jogo (sobre o design system)
  app.jsx             # máquina de estados / telas
  lib/                # rng, derive, engine (puro/determinístico), team, store,
                      # sound, sharecard, mp-auth/mp-api/mp-realtime (multiplayer)
  ui/                 # telas (home, draft, match, post, group, mp...)
  data/squads.js      # elencos históricos
  styles/             # tokens e estilos do design system
  tests/              # testes do engine (node frontend/tests/engine.test.js)

backend/              # Multiplayer Online (.NET 10)
  CopaDraft.Engine/        # porte C# do engine (paridade validada por seed)
  CopaDraft.Api/           # REST + SignalR + EF Core (salas, draft, torneio)
  CopaDraft.Engine.Tests/  # testes, incl. vetores-ouro JS↔C#

squads.json           # pool de elencos compartilhado (gerado de data/squads.js)
tools/                # geradores (squads.json, narração, vetores-ouro)
docker-compose.yml    # front + api + postgres
```

### Ajuste de balanceamento
Quase tudo que afeta o jogo (gols esperados, fadiga, pressão, formações, conquistas,
probabilidades dos pênaltis) está em **`config.js`** — dá pra tunar sem tocar na lógica.

### Adicionar seleções
Edite **`data/squads.js`**: cada elenco é uma lista compacta de jogadores
`[nome, posição, idade, overall, arquétipo, líder?]`. O resto do jogo lê só esse array.

---

## 🎨 Design

Construído sobre o **Marccu's Copa Design System** — visual dark dev-aesthetic recolorido
com a paleta da Seleção (verde vibrante, amarelo, azul de apoio), tipografia Archivo e a
assinatura dos rótulos em code-token.

---

Feito com ⚽ e ☕.
