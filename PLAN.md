# Modernização do Asteroid Roguefield — plano (17/10/2026; Rodadas 0, 14 e as frentes 1–4 da 15 na `main`)

Tarefa que atravessa sessões. Quem pegar este arquivo lê tudo antes de mexer; marca a etapa feita aqui; o que fecha
sai daqui (a história fica no git: `git log --oneline --merges main`). Decisões de produto são do dono, por imagem e
jogando — nunca por teste.

**Visão proposta em 22/10:** [plano mestre de design](docs/GAME_DESIGN_MASTER_PLAN.md), solicitado pelo dono:
diagnóstico do conteúdo atual, campanha, roteiro, builds, inimigos, chefes, desbloqueios e etapas de produção.
Em 12/11 ele entregou o projeto ("é seu, decida") e essa direção virou a base do trabalho. O documento distingue
estado atual, propostas e horizonte; os números continuam sendo propostas que ele julga jogando.

**Campanha, primeiro esqueleto (12/11, ramo `campanha/setores`, fora da `main`):** o dono disse "o projeto é seu, decida";
a direção do plano mestre foi tomada como base. Feito: botão Campaign → mapa The Ring → cada capítulo (os três biomas
atuais, 5 layers cada) é uma partida própria, vencida no seu Warden, que abre o próximo; capítulos 2 e 3 começam com
4 e 8 escolhas de carta (`headStart`, proposta); layers numeradas dentro do capítulo; telas de vitória e derrota do
capítulo; recordes `sectorsWon`/`sectorTimes`. A descida de 15 layers continua no botão Descent. Falta: ele jogar e
julgar (mapa, head start, duração). Depois (12/11): o capítulo 1 virou três fases com camadas próprias — Debris Wake
(Sentinel Quarry Maw), Salvage Lanes (Sentinel Gatekeeper), Prime Gate (Warden Prime); um setor pode ter `stages` e
`boss`; Sentinel = chefe de fase (`tier: 'sentinel'`, lista de arquivos no CONTENT.md). Ele achou fraco o primeiro
modelo feito por ajudante: modelos de chefe e de nave são feitos pela conversa principal (`sentinels.js`, placas com
os painéis do casco). Falta: ele jogar as três fases; as fases A/B dos capítulos 2 e 3; as naves do jogador (item 20).
Medido sem tela (12/11, piloto do golden trace que não mira nem desvia, nave que não morre, primeira carta sempre;
uma amostra por fase): as nove fases chegam à vitória, sem erro. Duração: capítulo 1 4,5–5,5 min (chefes 66–109 s);
capítulo 2 7,5–11,5 min (Kiln 196 s, Prism 222 s, Choir 102 s); capítulo 3 8,9–11,6 min (Foundry 174 s, Interdictor
223 s, Null 125 s). Nível ao chegar no chefe: 9–10, 19–21 e 24–30. Golpes concentrados nas camadas do meio e no chefe.
O Quarry Maw engoliu só 4 rochas em 12 sucções e o Foundry Mother nunca teve a montagem interrompida (o piloto não
mira). O plano mestre pede 14–18 min por fase: alongar o capítulo 1 é decisão dele, jogando.
Capítulo 2 (12/11): primeira fase nova, Furnace Drift (camadas 6–10, Herald of Heat, Sentinel Kiln Engine: fatias
quentes em rodízio, escória que vira poça, aletas abertas = janela de dano); a fase do Choir virou Resonance Chamber
(código C); a fase do meio é Crystal Choir (Sentinel Prism Crown: mostra o caminho dos feixes, que saem do núcleo e
refletem nos espelhos, e fica exposto com os espelhos afastados). Os dois vistos lutando dentro das fases. O capítulo 2
tem as três fases. Capítulo 3: Assembly Graveyard (Sentinel Foundry Mother: monta escolta limitada, que dano forte
interrompe; varre com dois braços; exposto com as baias abertas ou os braços pendentes) e Null Boundary (Warden Null);
a fase do meio é Quarantine Grid (Sentinel Interdictor: gaiola de cercas com um lado aberto em volta da nave, feixe
que mira, trava e queima; exposto quando a gaiola cai). Os três capítulos têm três fases cada (nove partidas, seis
Sentinels novos); ele não jogou nenhuma. As vistas dos Sentinels são um arquivo por chefe em `render3d/enemies/sentinels/`. Reavaliação dos modelos antigos (12/11, pranchas): fracos e a
refazer em placas — drone, caster, anvil, bulwark, husk, leech, twain, mine, sower, weaver e o Herald Dust (proposto
como conversa paralela, esperando ele iniciar).
Naves (item 20, 12/11): os três cascos são construídos em placas por `render3d/hullSlabModel.js`, lendo os mesmos
dados de casco (painéis de asa e flap, bocais, cabine, `form.body`); o caminho antigo, arredondado, saiu de
`hullModel.js`. Falta ele julgar as três jogando; se rejeitar, a volta é reverter os dois commits das naves.

## Rodada 15 (decidida 20/10 com ele) — melhorar o projeto de todas as formas, na ordem do que o jogador sente

Dele (20/10): _"tudo está rodando liso, não precisa medir nada. Temos que agora focar em melhorar o projeto de todas as
formas possíveis: falta conteúdo, problemas de HUD, layout, UX, lógica dos upgrades, oportunidades que melhorem a
experiência, problemas de lógica nos upgrade paths, no sistema de orbes, loot, etc."_ / _"O som do jogo (SFX) precisa
renascer do zero praticamente, tudo muito ruim também."_ Esta rodada absorve o resto da 14 (HUD 14.3–14.7 e a cena viva
de morte/vitória). Frentes em ordem de impacto sentido; 1 e 2 correm em paralelo (arquivos disjuntos). Cada fatia = um
commit, golden trace verde, captura (ou audição), e veredito curto dele quando for gosto. Até quatro ajudantes ao
mesmo tempo (limite do app), em arquivos disjuntos.

**Frentes 1–4: feitas e na `main` (PR #299, 20/10).** Ele jogou (20/10); falta o veredito dele, frente por frente
(lista no BASTÃO de `docs/PENDENCIAS.md`). Economia (curva 120 + 40·(n−2)^1.7, ~45 cartas, arma nos níveis 3 e 7,
raridade por carta, Warden com vida fixa); SFX em amostras escolhidas por ele (`SOUND.md`; a skill `/sfx-generator`
roda AudioLDM, não TangoFlux, e Kenney CC0 cobre o que ela faz mal) e o motor da nave em camadas; baús, pickups e
orbes; HUD de instrumento com encaixes, presets e editor (`HUD.md`). Falta a segunda audição (sons das armas, pickups,
baú e formações novos) e o mix com ele jogando.

5. **Conteúdo (a fábrica já paga por isso).** Armas primeiro (hoje 7 → 12+, cada uma com evolução e Apex próprios e som
   próprio), depois inimigos (hoje 16 → 30+, com papéis e **formações de onda**; as 4 primeiras já existem: anel que
   fecha, linha que varre, enxame, parede), mini-chefes entre Wardens, biomas (3 → 6) com segredos, eventos e chefe próprio; cascos com habilidade
   ativa única (hoje só stats); runs de 20–30 min com centenas de inimigos; infinito que escala.
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
