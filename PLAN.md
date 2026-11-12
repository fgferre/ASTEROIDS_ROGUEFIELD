# Modernização do Asteroid Roguefield — plano (12/11/2026)

Tarefa que atravessa sessões. Quem pegar este arquivo lê tudo antes de mexer; marca a etapa feita aqui; o que fecha
sai daqui (a história fica no git: `git log --oneline --merges main`). Decisões de produto são do dono, por imagem e
jogando — nunca por teste.

## O caminho até pronto (12/11, ordem do dono: _"continuar a melhoria… até ele estar realmente pronto, balanceado, sem bugs, bem acabado, história completa, fases em diferentes localizações desse universo 3D, deslocamentos em 3D entre uma fase e outra… depois pensamos em publicar"_)

Nada vai para a `main` até ele dizer. Ramo de trabalho: `campanha/ajustes` (PR #305 aberta, não incorporar). Ciclos, em
ordem; cada ciclo fecha com `npm run done`, piloto (`npm run playtest`), captura no navegador e um commit por tarefa.

1. **Roteiro** (`docs/ROTEIRO.md`): história inteira em texto — premissa, virada, uma fala por fase e por viagem, final.
   Falantes THE RING e WAKE. Feito: o roteiro existe e suas primeiras falas estão em `src/data/story.js`. [x]
2. **Nove lugares**: hoje três biomas servem três fases cada; cada fase ganha o seu lugar (cor, névoa, veios, luz,
   detritos) por um `look` da fase sobre o bioma. Prancha das nove. [ ]
3. **Viagem 3D entre fases**: ao vencer e seguir, a nave é vista por trás voando ao longo do Anel até o lugar seguinte,
   com a fala da viagem; pulável; a mesma cena abre a campanha. [ ]
4. **Equilíbrio**: as duas fases antigas ganharam etapas próprias [x]; falta: capítulo 1 dura ~5 min; 16 escolhas de
   carta de uma vez; Furnace Drift e o Caster contra o piloto. [ ]
5. **Final e capítulos seguintes**: o que o roteiro pedir além das nove fases (chefe final, cena final). [ ]
6. **Acabamento**: BACKLOG de cima a baixo (bugs primeiro), sons dos chefes novos, textos, telas. [ ]

Feito neste caminho: passagem de fase (espólio com contagem, nave segue com o build), segunda etapa do Quarry Maw,
brilho das cores claras — itens 21–23 dele, conferidos no navegador.

## Estado (12/11)

A campanha de nove fases (três capítulos de três; seis Sentinels e três Wardens) entrou na `main` pela PR #303 (12/11)
e está publicada. A história (`docs/ROTEIRO.md`): três capítulos e um final, o Crisol, com o chefe Sovereign e dois
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
