# ⚽ Copa Draft

> Monte o time dos sonhos no dado e ganhe a Copa.

Um jogo de Copa do Mundo estilo Brasfoot, jogável direto no navegador. A cada vaga do
elenco você rola o dado, recebe uma seleção histórica e escala um craque dela — juntando
ídolos de várias Copas num só time. Depois é disputar o mata-mata numa simulação minuto a
minuto, com narração em português.

**HTML + JavaScript puro (React via CDN).** Sem build, sem dependências para instalar.
Abra o `index.html` e jogue.

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

Como é HTML estático, basta abrir o arquivo — mas alguns navegadores bloqueiam
`fetch` de arquivos locais, então o ideal é servir por HTTP:

```bash
# opção 1: Python
python3 -m http.server 8000

# opção 2: Node
npx serve
```

Depois abra `http://localhost:8000` no navegador.

---

## 📁 Estrutura

```
index.html            # ponto de entrada (carrega tudo)
config.js             # TODAS as constantes de balanceamento (ajuste à vontade)
game.css              # estilos do jogo (sobre o design system)
app.jsx               # máquina de estados / telas

lib/
  rng.js              # gerador aleatório com semente (determinístico)
  derive.js           # deriva os 6 atributos FIFA
  engine.js           # motor de partida puro: simulateMatch(sides, config, seed)
  ratings.js          # notas dos jogadores + craque do jogo
  team.js             # draft, formações, chaveamento, fadiga
  achievements.js     # catálogo de conquistas
  store.js            # persistência (localStorage)
  sound.js            # SFX sintetizados (WebAudio)
  sharecard.js        # gera o card PNG da campanha

ui/
  components.jsx      # componentes compartilhados (escudo, campo, barras...)
  home.jsx            # tela inicial + seleção de modo/formação
  draft.jsx           # draft no dado + revisão do elenco
  match.jsx           # pré-jogo (escalação/subs) + ticker ao vivo
  penalty.jsx         # mini-game de pênaltis
  post.jsx            # pós-jogo, chaveamento, fim de campanha

data/
  squads.js           # elencos históricos (4 seleções × 2 Copas)

styles/               # tokens e estilos do design system
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
