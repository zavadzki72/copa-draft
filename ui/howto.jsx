/* ============================================================
   COPA DRAFT — ui/howto.jsx
   "Como Jogar?" — overlay que explica as mecânicas e os cálculos
   do jogo. TODOS os números são lidos de window.CONFIG / window.DERIVE
   em tempo de render, então o texto nunca desatualiza quando o
   balanceamento muda. Somente leitura — não altera estado de jogo.
   ============================================================ */
function HowToPlay({ onClose }) {
  const C = window.CONFIG;
  const D = window.DERIVE;

  // fecha com Esc; trava o scroll do fundo enquanto aberto
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // ---- valores derivados do CONFIG (sem hardcode) ----
  const formations = Object.keys(C.FORMATIONS).join(' · ');
  const attrs = D.KEYS.map(k => D.ATTR_FULL[k]).join(', ');
  const zebraPct = Math.round(C.ZEBRA_Z * 100);
  const oldStamina = C.STAMINA_PER_PT;
  const K = ({ children }) => <span className="howto-k">{children}</span>;

  return (
    <div className="howto-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Como jogar">
      <div className="howto-panel" onClick={(e) => e.stopPropagation()}>
        <div className="howto-head">
          <div>
            <span className="tok">como jogar?</span>
            <h2>Como o Copa Draft funciona</h2>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Fechar" title="Fechar (Esc)">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <p className="howto-intro">
          Você monta um <b>time dos sonhos</b> rolando o dado e disputa um mata-mata simulado minuto a
          minuto. A partida é decidida por um motor determinístico: mesma escalação e mesma sorte do dia
          produzem o mesmo jogo. Abaixo, o que dá pra configurar e como cada cálculo é feito.
        </p>

        <div className="howto-sec">
          <h3><span className="ic">🎲</span> O dado e o draft</h3>
          <p>A cada vaga do elenco o dado sorteia uma seleção histórica e você escala um craque dela.
            Primeiro os 11 titulares (pela formação), depois os reservas — no mínimo <K>{C.BENCH_MIN}</K>,
            um por setor.</p>
          <p>Formações disponíveis (cada uma soma 11): <span className="howto-f">{formations}</span>.</p>
          <p>Modos: <b>Clássico</b> (notas e atributos visíveis) e <b>De Almanaque</b> (draft às cegas,
            você escala de memória).</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">📊</span> Atributos</h3>
          <p>Os atributos nunca são escritos à mão: são derivados do <b>overall</b> + <b>posição</b> +
            <b> arquétipo</b> de cada jogador. São seis: {attrs}.</p>
          <p>Cada valor é limitado entre <K>{C.ATTR_MIN}</K> e <K>{C.ATTR_MAX}</K>.</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">⚔️</span> Força do time e gols esperados</h3>
          <p>O <b>ataque</b> é a média dos meias e atacantes; a <b>defesa</b> é a média de goleiro,
            zagueiros e laterais. A expectativa de gols de cada lado sai da fórmula:</p>
          <p className="howto-f">λ = {C.BASE_LAMBDA} × (ataque × dia / defesa)<sup>{C.LAMBDA_EXP}</sup></p>
          <p>Quanto maior seu ataque em relação à defesa adversária, mais gols você tende a fazer ao
            longo dos <K>{C.MINUTES}</K> minutos.</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">🍀</span> O "dia" (fator zebra)</h3>
          <p>Antes do apito, cada time recebe um <b>fator do dia</b> sorteado: <K>1 ± {C.ZEBRA_Z}</K>
            {' '}(até <b>{zebraPct}%</b> para mais ou para menos). É o que permite a zebra: um time inspirado
            pode superar um favorito num dia bom.</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">🔋</span> Fadiga (energia)</h3>
          <p>Cada jogo desgasta os titulares. Jogadores com <K>{C.FATIGUE_OLD_AGE}+</K> anos perdem
            {' '}<K>{C.FATIGUE_OLD}</K> de cansaço por partida; os mais novos, <K>{C.FATIGUE_YOUNG}</K>.
            Reservas não usados recuperam <K>{C.FATIGUE_REST_RECOVERY}</K> por rodada. Teto de cansaço:
            {' '}<K>{C.FATIGUE_MAX}</K>.</p>
          <p>Cada ponto de cansaço tira ~<K>{oldStamina}%</K> de energia exibida e reduz o overall
            efetivo. Você pode rodar até <K>{C.SUBS_MAX}</K> substituições por partida.</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">🎓</span> Pressão da garotada</h3>
          <p>No mata-mata, jovens com menos de <K>{C.PRESSURE_U_AGE}</K> anos sentem o peso: perdem
            {' '}<K>{C.PRESSURE_PER_ROUND}</K> de overall efetivo por rodada já disputada (a pressão cresce
            a cada fase).</p>
          {C.LEADER_HALVES_PRESSURE && (
            <p>Escalar um <b>líder</b> em campo reduz essa pressão pela metade.</p>
          )}
        </div>

        <div className="howto-sec">
          <h3><span className="ic">🟥</span> Cartões e o "um a menos"</h3>
          <p>Faltas duras podem gerar <b>cartão amarelo</b>; o <b>segundo amarelo</b> do mesmo jogador, ou
            um <b>vermelho direto</b>, resulta em <b>expulsão</b>.</p>
          <p>Com um jogador a menos, a força do time cai pelo resto da partida: o ataque perde cerca de
            {' '}<K>{Math.round((1 - C.MAN_DOWN_ATK) * 100)}%</K> e a defesa cerca de
            {' '}<K>{Math.round((1 - C.MAN_DOWN_DEF) * 100)}%</K> — ou seja, você passa a criar menos e a
            sofrer mais. É um evento que <b>muda a chance de vitória</b>, então jogar limpo importa.</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">🚑</span> Lesões</h3>
          <p>São <b>raras</b> — cerca de <K>{Math.round((1 - Math.pow(1 - C.INJURY_PM, C.MINUTES)) * 100)}%</K>
            {' '}de chance por time a cada partida. O lesionado deixa o campo; se houver <b>reserva da posição</b>
            {' '}e substituição disponível, ele entra na hora. Sem troca possível, o time segue com um a menos.</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">⏱️</span> Prorrogação e pênaltis</h3>
          <p>Empate no mata-mata leva a <K>{C.ET_MINUTES}</K> minutos de prorrogação. Persistindo o
            empate, vai para a disputa de pênaltis: melhor de <K>{C.PK_ROUNDS}</K> e, se preciso, morte
            súbita.</p>
          <p>A cobrança é interativa: você escolhe o canto ao bater e o lado ao defender. Finalização do
            cobrador e overall do goleiro pesam no resultado.</p>
          <p>Também pode sair <b>pênalti durante a partida</b>: a conversão parte de
            {' '}<K>~{Math.round(C.PEN_CONVERT_BASE * 100)}%</K> e varia com a finalização do cobrador e o
            goleiro adversário.</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">⭐</span> Notas e craque do jogo</h3>
          <p>Cada jogador começa com nota <K>{C.RATING_BASE}</K> e ganha bônus por atuação:</p>
          <ul>
            <li>Gol: <K>+{C.RATING_GOAL}</K> · Assistência: <K>+{C.RATING_ASSIST}</K></li>
            <li>Defesa (goleiro): <K>+{C.RATING_SAVE}</K> · Chance criada: <K>+{C.RATING_BIGCHANCE}</K></li>
            <li>Gol sofrido (defensores e goleiro): <K>{C.RATING_CONCEDE}</K> por gol</li>
          </ul>
          <p>A nota fica entre <K>{C.RATING_MIN}</K> e <K>{C.RATING_MAX}</K>. O <b>craque do jogo</b> é a
            maior nota da partida.</p>
        </div>

        <div className="howto-sec">
          <h3><span className="ic">🏆</span> Conquistas</h3>
          <p>Há <K>{window.ACHIEVEMENTS.LIST.length}</K> conquistas para desbloquear ao longo das suas
            campanhas — de vencer por 7 a 0 a ser campeão no modo De Almanaque.</p>
        </div>

        <div className="howto-foot">
          <button className="btn btn-green" onClick={onClose}>Entendi, bora jogar →</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HowToPlay });
