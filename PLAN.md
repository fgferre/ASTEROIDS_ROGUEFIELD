# Modernização do Asteroid Roguefield — plano (17/10/2026; Rodadas 0 e 14 até a câmera na `main`; Rodada 15 decidida 20/10)

Tarefa que atravessa sessões. Quem pegar este arquivo lê tudo antes de mexer; marca a etapa feita aqui; o que fecha
sai daqui (a história fica no git: `git log --oneline --merges main`). Decisões de produto são do dono, por imagem e
jogando — nunca por teste.

## Rodada 15 (decidida 20/10 com ele) — melhorar o projeto de todas as formas, na ordem do que o jogador sente

Dele (20/10): _"tudo está rodando liso, não precisa medir nada. Temos que agora focar em melhorar o projeto de todas as
formas possíveis: falta conteúdo, problemas de HUD, layout, UX, lógica dos upgrades, oportunidades que melhorem a
experiência, problemas de lógica nos upgrade paths, no sistema de orbes, loot, etc."_ / _"O som do jogo (SFX) precisa
renascer do zero praticamente, tudo muito ruim também."_ Esta rodada absorve o resto da 14 (HUD 14.3–14.7 e a cena viva
de morte/vitória). Frentes em ordem de impacto sentido; 1 e 2 correm em paralelo (arquivos disjuntos). Cada fatia = um
commit, golden trace verde, captura (ou audição), e veredito curto dele quando for gosto. Até cinco ajudantes em
paralelo, em arquivos disjuntos.

1. **Economia da run e lógica dos upgrades.** Auditar a matemática: cartas por run (curva de XP × 15 camadas) contra
   o que uma build precisa (sinergia em 3, Apex em 5 — hoje poucas runs chegam ao Apex); ofertas que constroem
   identidade cedo (as três primeiras escolhas moldam a run); escolha de arma garantida (hoje a arma vem de carta
   aleatória, e uma run pode nunca ver uma); evoluções ligadas à arma, não só à família; raridades reais (comum/
   incomum/rara/épica) e pesos por camada; cartas que não entregam (conferir cada uma jogando a cena `?content=`);
   tela de level-up mostrando o que cada carta completa ("esta fecha Afterburn").
2. **SFX renascido.** Hoje todo efeito é sintetizado em código; impacto, tiro, explosão e interface assim nunca chegam a
   som de jogo profissional. Híbrido: **amostras de verdade** para todo evento (tiros, impactos, explosões, escudo,
   pickups, cartas, interface, vozes dos Wardens) — **gerados na máquina dele pela skill local `/sfx-generator`
   (modelo TangoFlux, texto → áudio; só a conversa local consegue invocá-la)**, com CC0 curado para o que o modelo faz
   mal (cliques de interface, por exemplo); licença e origem de cada arquivo em `docs/creditos-audio.md` (conferir a
   licença dos pesos do TangoFlux — há restrição a uso não comercial a verificar; o jogo é gratuito). Fluxo: `SOUND.md`
   define a paleta → 3–5 candidatos por evento com variações de prompt e semente, duração curta → pós-processo (cortar
   silêncio, normalizar loudness para um alvo único, fade, codificar em formato que Safari e Chrome tocam — mp3 ou
   m4a; ogg não toca no Safari) → página de audição → só o escolhido entra em `src/public/audio/sfx/`; 3–5 variações por evento, sorteio sem repetição, variação leve de tom e
   volume, prioridade e limite de vozes; a infraestrutura de mix existente (barramentos, limitador, reverb, ducking, pan
   e distância) fica. Procedural só no contínuo (propulsor, zumbidos) e na música (stems em arquivo se ele reclamar).
   `SOUND.md` de uma página (paleta por família, regras de mix, orçamento de vozes e de MB, carregados no warm-up).
   **Página de audição `?sound=`** com candidatos A/B/C por evento: só entra o que ele escolher. Mix final com ele
   jogando. Decisão dele (20/10): o jogo passa a carregar arquivos de áudio (a regra "sem assets externos" cai para o
   som).
3. **Loot e orbes como momentos.** Baús no campo (abrem com cerimônia; dão 1, 3 ou 5 cartas/evoluções como no Vampire
   Survivors); pickups com variedade (hoje 3) e frequência com curva; orbes com velocidade e peso (hoje caem em anel),
   ímã e fusão legíveis, valor por cor; moeda em jogo além do Salvage no fim; Leech e Caster já interagem com isso.
4. **HUD, layout e UX** (= 14.3–14.7): `HUD.md`, radar tático por maquete aprovada, recargas na nave, barras e chips com
   hierarquia e pulso, barra de chefe, feed; menu/Hangar/Códice/Settings na mesma linguagem; level-up e recap
   reescritos; legibilidade com 200 inimigos; guardas no gate (orçamento de quadro, capturas de referência).
5. **Conteúdo (a fábrica já paga por isso).** Armas primeiro (3 → 12+, cada uma com evolução e Apex próprios e som
   próprio), depois inimigos (10 → 30+, com papéis e **formações de onda**: anel que fecha, linha que varre, enxame,
   parede), mini-chefes entre Wardens, biomas (3 → 6) com segredos, eventos e chefe próprio; cascos com habilidade
   ativa única (hoje só stats); runs de 20–30 min com centenas de inimigos; infinito que escala. Antes de crescer o catálogo
   em volume, conferir as correções 3.1 (limites das receitas) e 3.2 (o mapa automático e o registro) de
   `docs/revisao-estrutura-ia-2026-10-19.md`; a 3.3 já foi feita no `CONTENT.md`.
6. **Meta que atravessa dias.** Árvore de desbloqueios (conquistas → armas, cascos, fases, modificadores), desafios
   diários/semanais com modificadores, seleção de fase/bioma, perfil exportável (hoje só localStorage).
7. **Ritmo e dificuldade.** Curva do chefe (item 2), surtos com Elite, objetivos de meio de run (sobreviver ao evento,
   destruir estrutura, escoltar), curva de perigo visível, presets conferidos jogando.
8. **Cerimônias e cenas.** Evolução e Apex com cerimônia (hoje um toast); cena viva de morte e vitória final
   (`run-won`; aprovada por ele em 19/10: câmera lenta forte, nave protegida e sem controle 2–3 s, câmera baixa que pode
   girar e sobe antes de devolver o controle — a mesma maquinaria das chegadas dos Wardens); três finais (Prime, Choir,
   Null) com fala e imagem próprias; Anel partido modelado (item 15). Roteiro com drama, surpresa, virada e endgame, e uma fase de viagem até o Anel com cena em terceira pessoa e diálogos (item 19), a partir de um texto que ele aprova.

**Pronto quando ele disser** que uma run inteira (20–30 min) prende do início ao fim, que o som e o painel estão à
altura do jogo, e que volta no dia seguinte para desbloquear mais. **Guardas:** golden trace verde; teto de 1.200
linhas; conteúdo só pelo `CONTENT.md`; nada de medir desempenho por iniciativa própria (ele disse que roda liso);
maquete antes de código em interface e câmera; audição antes de código no som.

## Frente 4 em detalhe (herdado da Rodada 14: o HUD de instrumento)

Feito da 14 e aprovado por ele (20/10): a janela inteira, a câmera de dois estados e as chegadas dos Wardens. Daqui
para baixo é o que ela deixou, e vale como a frente 4. O radar acompanha o zoom da câmera nova.

- **14.3 `HUD.md`.** Tokens (cores do Anel, tipografia, escalas, espaçamentos), regras de hierarquia (o que importa
  agora é grande; o resto some até ser preciso), regras de movimento (toda mudança de valor pulsa curto; painéis
  entram e saem com easing), estados (calmo, ameaça, chefe, morte). Uma página. Todo instrumento obedece.
- **14.4 Maquete antes de código.** Cada instrumento novo nasce como imagem (HTML estático sobre captura real),
  ele aprova, só então implementa. Começar pelo **radar tático**: anéis de distância em escala real, blips com
  forma por tipo (rocha, máquina, Elite, Warden, pickup/orbe), direção das ameaças rápidas, marcas de pouso do
  Caster, zoom acompanhando a câmera, bordas que apontam o que está fora. Em seguida: recargas (dash, escudo,
  arma) como anéis ancorados na nave; barras de casco/escudo/XP com hierarquia e pulso; chips de arma/mira/dash
  como ícones; barra de chefe com fases; feed de abates. Menos instrumentos, mais densos.
- **14.5 Menu, Hangar, Códice e Settings na mesma linguagem** do `HUD.md`, na janela inteira.
- **14.6 Legibilidade em horda.** Com 200 inimigos (`?content=drone&count=200`), telegrafias, silhuetas e cores de
  ameaça lidas em meio segundo; passe de contraste e de prioridade visual (ameaça > pickup > decoração).
- **14.7 Guardas no gate.** Orçamento de quadro por cena (`?content=` e hero: tempo de quadro medido em headless
  com limite; falha se estourar) e capturas de referência por cena (diferença acima do limite exige aprovação dele
  — o teste não passa sozinho). Golden trace segue verde em toda fatia.

**Pronto quando:** radar e instrumentos implementados a partir de maquetes que ele aprovou; menu/Hangar/Códice na
mesma linguagem; as duas guardas no gate; golden trace verde.

## Goal para a próxima conversa (redigido 20/10; colar no `/goal` depois de ela ler o bastão e este plano)

> Melhorar o Asteroid Roguefield de todas as formas que o jogador sente, seguindo a Rodada 15 do PLAN.md e o bastão de
> docs/PENDENCIAS.md, nesta ordem (1 e 2 em paralelo): economia da run e lógica dos upgrades (cartas por run,
> identidade cedo, arma garantida, evoluções por arma, raridades reais, cartas que não entregam); SFX renascido do zero
> com amostras geradas pela skill local /sfx-generator (TangoFlux) e CC0 onde o modelo falha, escolhidas pelo dono numa
> página de audição, SOUND.md e mix com ele jogando; loot e orbes
> como momentos (baús com cerimônia, pickups variados, orbes com peso, moeda em jogo); HUD, layout e UX (HUD.md, radar
> tático e instrumentos por maquete aprovada, menus na mesma linguagem, level-up e recap, legibilidade em horda,
> guardas no gate); conteúdo pela fábrica (12+ armas com evolução e som próprios, 30+ inimigos com formações de onda,
> mini-chefes, 6 biomas, cascos com habilidade ativa); meta que atravessa dias (árvore de desbloqueios, desafios,
> seleção de fase, perfil exportável); ritmo e dificuldade; cerimônias de evolução, cenas de morte e vitória, três
> finais, Anel modelado. Liberdade no como; guardas inegociáveis: golden trace verde, teto de linhas, conteúdo só pelo
> CONTENT.md, maquete antes de código em interface e câmera, audição antes de código no som, números como proposta e
> o dono julgando jogando; não medir desempenho por iniciativa própria.

## Decisões já tomadas

1. O menu em Three.js fica como está: é o alvo visual do jogo ("o jogo é continuação do menu", `docs/brand.md`).
2. Direção: `docs/NORTE.md` vale (casco fosco, neon só na informação, fundo com volume).
3. Cada etapa visual termina com captura antes × depois e com `npm run done` verde. Ele aprova pela imagem.
4. Balanceamento e sensação (XP, boss, shake, hit-stop) nunca fecham por harness: proposta com número, ele joga.
5. O 2D saiu do código (19/10); a versão original é peça de museu, gerada da tag `classic-2d`, link nos créditos.
6. Da fábrica (Rodada 0), de propósito: Wardens e Heralds continuam classes (só os dados viraram conteúdo); padrões de
   arma orbital/aura/cadeia nascem quando uma arma pedir; instancing de inimigos só se a medida pedir.

## Fora de escopo deste plano

Steam, mobile/touch, multiplayer, troca do framework de testes, monetização. (Narrativa entrou em 20/10, item 19: roteiro aprovado por ele antes de código.) Arquivos antigos de processo
(GSD, `.planning/`) ficam fora do repo; o histórico está no git.
