# Modernização do Asteroid Roguefield — plano (12/11/2026)

Tarefa que atravessa sessões. Quem pegar este arquivo lê tudo antes de mexer; marca a etapa feita aqui; o que fecha
sai daqui (a história fica no git: `git log --oneline --merges main`). Decisões de produto são do dono, por imagem e
jogando — nunca por teste.

## O caminho até pronto (12/11, ordem do dono: _"continuar a melhoria… até ele estar realmente pronto, balanceado, sem bugs, bem acabado, história completa, fases em diferentes localizações desse universo 3D, deslocamentos em 3D entre uma fase e outra… depois pensamos em publicar"_)

Nada vai para a `main` até ele dizer. Ramo de trabalho: `campanha/ajustes` (PR #305 aberta, não incorporar). Ciclos, em
ordem; cada ciclo fecha com `npm run done`, piloto (`npm run playtest`), captura no navegador e um commit por tarefa.

1. **Roteiro** (`docs/ROTEIRO.md`): história inteira, com os lugares; todas as falas estão em `src/data/story.js`
   (chegadas, viagens, chefes, final). [x]
2. **Lugares**: cor/névoa/luz por fase e um cenário 3D por fase atrás da arena (`render3d/places/`, dez cenários;
   item 24 dele). [x] Ainda fracos, ele julga: planeta da Quarantine Grid, creme do Crisol.
3. **Viagem 3D entre fases** (`render3d/travelScene.js`): nave por trás ao longo do Anel, falas do roteiro, salto
   entre capítulos, pulável; abre a campanha. [x] O Anel visto de perto ganhou cidade no convés (canais com luzes,
   quadras, torres, muros com janelas; só nos níveis de perto, o jogo não muda). Fraco: tudo em caixas; custo da
   viagem nunca medido em máquina fraca.
4. **Equilíbrio**: etapas próprias nas duas fases antigas [x]; em andamento nas quatro sessões de refino. [ ]
5. **Final**: décima fase The Crucible, chefe Sovereign (ordens PROTECT/REBUILD, modelo claro e polido — itens 25 e
   26 dele), escolha Severance/Stewardship, dois desfechos, marca no mapa. [x] Sovereign fácil demais para o piloto.
6. **Acabamento**: seis defeitos corrigidos (cartas perdidas na vitória, contagem sob as telas, Esc nas cenas, erro
   ao carregar, dica do impulso, fala de chegada). Falta: BACKLOG restante, sons dos chefes novos (audição pronta em `src/exported-assets/audicao-chefes/`, fora do git: três opções para o ataque de cada um dos sete; ele escolhe ouvindo, nada ligado ao jogo), brilho/polido em
   outros modelos (item 26). [ ]
7. **Refino por parte do roteiro** (pedido dele, 12/11): quatro sessões, uma por capítulo e uma para o final e o
   arco; os quatro ramos estão juntos em `campanha/ajustes` e a bateria inteira passa. [x] Das propostas delas, feito:
   granada do Caster justa, Wake fala no meio da fase e da sua gente, arquivo nomeado no Assembly Graveyard, "equipar
   por mim", cartas de partida nas fases 2 e 3, fala repetida cortada, nome certo do chefe no cartão final, viagem
   refeita (escala, destino à frente, salto). Em aberto, para depois de ele jogar: dano de pedra nos
   capítulos II e III. (A proposta "Prime com mais vida" caiu: em doze sementes a luta do Prime dura 68–333 s, mais
   que a do Quarry Maw, 73–138 s, e a do Gatekeeper, 53–111 s; o capítulo I vence 10, 10 e 8.)
8. **Curva da campanha** (medidas abaixo, doze sementes): o capítulo II deixou de ser degrau (Furnace Drift 1 → 7,
   Resonance Chamber 5 → 8) e o Crisol virou a fase mais dura (12 → 6), com a luta do Sovereign a mais longa (219–299
   s, acima da Null). [x] Assembly Graveyard e Quarantine Grid venciam 11 de 12 sem levar um golpe dos chefes: a
   jaula do Interdictor agora fecha (e o feixe dói mais) e os braços da Foundry Mother alcançam a nave; o piloto perde
   casco na maioria das lutas. A Mother ganhou braços que se esticam até um pouco além da nave quando o aviso começa
   (ela continua parada, linha de montagem; decisão minha, ele pode trocar jogando): 10 de 12, com perda real de
   casco; o alcance é sensível (curto 11, longo 6 com luta de vinte minutos). Interdictor 10 de 12; a jaula fechando
   foi vista em captura. Em aberto, ele julga jogando: as duas ainda acima da meta de 8–9; na Mother só se desvia
   para fora e há uma faixa segura bem longe.
9. **Unidade** (dúvida dele, 12/11: cada sessão pode ter feito do seu jeito): revisão do conjunto e correção. Feito: o
   Anel tem mil anos em toda fala; falas de chefe numa tabela só, por tipo (`STORY.boss`), com fala de última etapa
   para os dez; Null Boundary com chegada própria; no Crisol quem fala na morte é o Anel; Herald of Heat uma vez só;
   a viagem lê capítulo e distância de onde já estavam (`PLACE_SETS.offRing`); roteiro igual ao jogo; fichas de fase e
   de chefe na mesma forma; deriva e puxão de pedras dos chefes num lugar só (`enemies/boss/drift.js`, `rockPull.js`),
   com dez voos gravados do piloto repetidos idênticos. [x] Em seguida, das fotos: o cenário das dez
   fases responde à queda do chefe (faltavam cinco); o Anel só acorda na vitória onde a história o acorda
   (`PLACE_SETS.wakes`: Null Boundary e o Crisol; antes acendia em toda fase); na viagem final os destroços correm
   para o Crisol; o destino da viagem segura seu lugar no mundo em vez de andar com a câmera; a moldura da tela some
   sob as barras (o clarão do salto fica branco inteiro). Não feito: rachaduras acesas nas viagens 4→5 e 5→6 — o
   lugar deixado nunca aparece na viagem. Deixado para ele julgar: "Interdictor"/"THE INTERDICTOR" e "Warden
   Choir"/"THE CHOIR" (já eram assim na `main`); a reação da Debris Wake é a mais discreta. A pedra do Sovereign virou lapidação brilhante (lia como lanterna de lado). Verificado e não era defeito: o jogo fica parado durante as falas do final (o que roda são os 6 s de espólio); a chegada do chefe não se pula (roda na simulação), Esc pausa.

Lição de 12/11: com quatro sessões e seus ajudantes a máquina passa de carga 100 e os testes estouram o tempo; não
gravar nada sem teste verde — rodar só os testes do que tocou, com `--testTimeout` longo, e a bateria inteira depois.

Feito neste caminho: passagem de fase (espólio com contagem, nave segue com o build e com as cartas devidas), segunda
etapa do Quarry Maw, brilho das cores claras — itens 21–23 dele, conferidos no navegador.

## Estado (12/11)

A campanha de nove fases (três capítulos de três; seis Sentinels e três Wardens) entrou na `main` pela PR #303 (12/11)
e está publicada; a décima fase e tudo o mais de 12/11 à tarde estão só em `campanha/ajustes`. A história (`docs/ROTEIRO.md`): três capítulos e um final, o Crisol, com o chefe Sovereign e dois
finais; falantes THE RING e WAKE; o piloto voa por ligação remota. O jogo tem 7 armas, 16 inimigos e 3 cascos. A
Descent e o Boss Rush continuam existindo. As fases estão inline em `src/content/sectors`; uma fase pode ter
`stages`, `boss` e `headStart`. Modelos de chefe e de nave foram feitos pela conversa principal; modelos 3D novos vão
para um `worker` em opus (CLAUDE.md). SFX: AudioLDM (`SOUND.md`). Visão de horizonte: `docs/GAME_DESIGN_MASTER_PLAN.md`
(22/10), que perde para o roteiro, este plano e o código quando divergem.

## Medidas do piloto (12/11, `npm run playtest`; sem tela, nave mortal; propostas, o dono julga jogando)

- Duração por capítulo (golden trace sem mira): capítulo 1 4,5–5,5 min (chefes 66–109 s); capítulo 2 7,5–11,5 min
  (Kiln 196 s, Prism 222 s, Choir 102 s); capítulo 3 8,9–11,6 min (Foundry 174 s, Interdictor 223 s, Null 125 s).
- Cinco sementes, piloto bom: Resonance Chamber 5/5 mortes até 02:56; Null Boundary 5/5 mortes até 03:27; Assembly
  Graveyard 4 vitórias (11–14 min) e 1 estouro de 25 min. Mortes na segunda camada, sobretudo granada do Caster.
- Achado: essas duas fases antigas jogam as camadas globais densas da Descent; as fases novas têm 2–4 máquinas por etapa.
- Etapas próprias em Resonance Chamber e Null Boundary (12/11, proposta): perigos um por vez; piloto bom vence 3 de 5
  sementes em cada (antes 0 de 5), o mediano chega à etapa 4–5. `npm run playtest -- <fase> <piloto> <semente>` agora
  varia o mundo. Com o mundo variando: Crystal Choir 2/5, Furnace Drift 0/5, quase sempre granada do Caster — o piloto
  desvia mal dela (uma só o matou em 42 s); antes de mexer no Caster, o dono joga. Cinco sementes ainda é ruído.

- Campanha inteira com os quatro ramos de refino juntos (12/11 à noite, cópia de teste; piloto bom, sementes 1–3,
  vitórias e tempo de uma vitória): Debris Wake 3/3 (6 min) · Salvage Lanes 2/3 (5) · Prime Gate 3/3 (6–8) · Furnace
  Drift 1/3 (16) · Crystal Choir 2/3 (10–19) · Resonance Chamber 0/3 (morre no Choir) · Assembly Graveyard 3/3 (6–9) ·
  Quarantine Grid 2/3 (9; um estouro de 25 min) · Null Boundary 2/3 (11–12) · The Crucible 3/3 (10–13, chefe 220–390 s).
  O degrau é o capítulo II. Granada do Caster (mira fixa, raio 90): em 12 sementes, Furnace Drift 0 → 2 vitórias e
  chega ao chefe 1 → 9 vezes; Resonance Chamber igual (4 de 12). Uma semente vira com qualquer mudança: três sementes
  é pouco, doze é o mínimo para comparar.
- Curva (12/11 à noite, piloto bom, doze sementes, vitórias; estouro de 25 min não conta como morte): Debris Wake 10 ·
  Salvage Lanes 10 · Prime Gate 8 · Furnace Drift 7 (era 1) · Crystal Choir 7 · Resonance Chamber 8 (era 5) · Assembly
  Graveyard 11 · Quarantine Grid 11 · Null Boundary 6 · The Crucible 6 (era 12). Com doze sementes, ±1–2 é ruído: "cada
  fase um pouco mais dura que a anterior" não se resolve com o piloto. O piloto mediano (seis sementes) vence 1–2 no
  capítulo II e 0 no Crisol. Mudado: Kiln (vida 65 → 55 % do Choir, queimadura 0,15 → 0,10), surto e anel da etapa 4 da
  Furnace, 28 pedras no Choir da Resonance Chamber, Sovereign (vida 0,48 → 0,55, etapas em 88 % e 62 %, barreira 0,3 → 0,6).
- Medida de referência (13/11, jogo em e6ae532, piloto que pega o item da borda; piloto bom em doze sementes,
  vitórias · mediano em seis; nenhum estouro de 25 min em 180 partidas): Debris Wake 10 · 6 | Salvage Lanes 12 · 3 |
  Prime Gate 10 · 3 | Furnace Drift 5 · 1 | Crystal Choir 7 · 2 | Resonance Chamber 7 · 2 | Assembly Graveyard 9 · 3 |
  Quarantine Grid 11 · 2 | Null Boundary 9 · 2 | The Crucible 2 · 0. Lutas vencidas: 44–157 s no capítulo I, 124–250 s
  no II, 101–244 s no III (uma de 445 s na Quarantine Grid), 245–266 s no Sovereign.
- Lição de 13/11: doze sementes têm erro de ±2 vitórias, e cada mudança no piloto embaralha todas as partidas — o
  Crisol deu 6, 4, 7 e 2 em quatro medidas do mesmo jogo. Para decidir, somar medidas ou usar 24 sementes. Somando as
  quatro medidas de 12–13/11 (48 partidas por fase; a Assembly Graveyard só a última, depois de mexida): Debris Wake
  85 % · Salvage Lanes 87 % · Prime Gate 71 % | Furnace Drift 54 % · Crystal Choir 62 % · Resonance Chamber 54 % |
  Assembly Graveyard 75 % · Quarantine Grid 81 % · Null Boundary 62 % | The Crucible 40 %. Fora do desenho: a
  Quarantine Grid, mais fácil que todo o capítulo II. No Crisol quase toda morte é da barreira giratória do Sovereign
  (220–355 de dano por luta), e o piloto não enxerga cerca em movimento: para ele a barreira pesa mais do que pesará
  para quem joga olhando — ele julga jogando antes de mexer.
- Quarantine Grid em 24 sementes (13/11): 23 vitórias antes; com cerca 0,4 → 0,55 e feixe 0,3 → 0,45, 19 (guardado).
  Bater mais forte ou mais vezes não baixou além disso (21 e 22 de 24). O piloto chega a todo chefe com o casco
  cheio e se cura durante a luta: os corações de vida (pedra grande 5 %, média 2 %, cada um devolve 25 % do casco)
  apagam o que as etapas tiram. É por isso que mexer em etapas quase não muda as fases — só mata dentro da etapa.
  Pergunta de desenho para ele, jogando: a cura está generosa demais do capítulo II em diante? Não mexi (é global e
  já está publicado). Resta no piloto: às vezes se esconde num canto fora do alcance da própria arma (uma luta de
  962 s na Quarantine Grid, semente 5); um humano não faz isso.

## Rodada 15 — frentes ainda abertas (as 1–4 estão na `main`; veredito dele em `docs/PENDENCIAS.md`)

5. **Conteúdo.** Armas (hoje 7 → 12+, cada uma com evolução, Apex e som), inimigos (16 → 30+, com formações), mini-chefes,
   biomas com segredos, cascos com habilidade ativa. Duração por fase: o dono julga jogando.
6. **Meta que atravessa dias.** Árvore de desbloqueios, desafios diários/semanais, seleção de fase, perfil exportável.
7. **Ritmo e dificuldade.** Curva do chefe, surtos com Elite, objetivos de meio de run, curva de perigo visível.
8. **Cerimônias e cenas.** Evolução e Apex com cerimônia; cena viva de morte e vitória; final conforme
   `docs/ROTEIRO.md`; Anel partido modelado (item 15).

**Guardas:** golden trace verde; teto de 1.200 linhas; conteúdo só pelo `CONTENT.md`; nada de medir desempenho por
iniciativa própria; maquete antes de código em interface e câmera; audição antes de código no som.

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
