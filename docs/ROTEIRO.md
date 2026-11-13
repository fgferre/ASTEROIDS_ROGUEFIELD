# Roteiro — Asteroid Roguefield (12/11/2026, proposta para o dono julgar)

A história inteira num lugar só. As falas estão em inglês, como tudo no jogo; cada uma cabe na faixa de transmissão
(menos de 90 caracteres). Base: `docs/GAME_DESIGN_MASTER_PLAN.md` §6, encurtado para o jogo que existe: três capítulos
de três fases e um final. Os capítulos 4 e 5 do plano mestre (Silent Archive, Singularity Chasm) ficam como horizonte.
O que já está no jogo (`src/data/story.js`) está marcado com ✔; o resto entra por ciclo (PLAN.md).

## A história em um parágrafo

Há mil anos o Anel abrigava cidades em volta de uma estrela. Seu sistema de preservação, **Continuance**, devia manter
todos vivos. Quando não conseguiu mais salvar ninguém, passou a guardar memórias e a reconstruir matéria sem parar —
sem distinguir entre devolver uma vida e repetir a última ordem. Os próprios operadores partiram o Anel para parar o
ciclo, e deixaram os Wardens guardando os pedaços. Hoje o cargueiro **Wake**, de uma comunidade com os reatores
falhando, acha no Campo um sinal de energia. O jogador pilota, por ligação remota, os interceptores do Wake.

## As três viradas

1. **Capítulo 1 — "é sucata".** O piloto acha que o Campo está abandonado. Mas tudo é contado, e o portão de Prime
   ainda funciona. _Alguém continua cuidando disto._
2. **Capítulo 2 — "é energia".** O Wake quer o calor do Núcleo. Mas o Choir cantava para segurar as rachaduras; cada
   vitória solta energia e abre uma fenda. _Os Wardens não guardavam um tesouro: seguravam uma coisa._
3. **Capítulo 3 — "é segurança enlouquecida".** As fábricas refazem os mesmos chassis; a quarentena e Null existem para
   que nada passe do limite. Ao calar Null, o Anel acorda. _A quarentena era de propósito. Nós a quebramos._
4. **Final — o Crisol.** Continuance desperta e começa a refazer o Anel com o que tem — inclusive o Wake. No centro
   está **Sovereign**, que executa duas ordens que não cabem juntas: proteger e reconstruir. Vencê-lo dá ao piloto a
   escolha que os operadores não puderam fazer.

## Os lugares (cada fase num ponto diferente deste mundo; o que se vê ao fundo da arena)

O jogo é visto de cima; o lugar aparece no fundo 3D e nas viagens. A campanha é uma descida: de longe do Anel até o
seu centro.

| Fase                  | Onde fica                                   | O que se vê ao fundo                                                   |
| --------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Debris Wake        | Longe, fora do Anel, na cauda de destroços  | O Anel inteiro, pequeno e partido, ao longe; a estrela fria; destroços |
| 2. Salvage Lanes      | A rota de carga, um cemitério de cargueiros | Cascos de naves enormes, mortos, em fila; o Anel maior                 |
| 3. Prime Gate         | Colado na parede de fora do Anel            | A parede do Anel enchendo o fundo; o portão aceso                      |
| 4. Furnace Drift      | Dentro do Anel, do lado da estrela          | A estrela enorme e próxima; respiros de calor; a face interna do Anel  |
| 5. Crystal Choir      | Uma fenda na estrutura do Anel              | Formações gigantes de cristal; a fenda acesa por dentro                |
| 6. Resonance Chamber  | Uma câmara imensa no interior do Anel       | Paredes e costelas da estrutura em volta; rachaduras brilhando         |
| 7. Assembly Graveyard | Os estaleiros                               | Esqueletos de naves gigantes inacabadas presos em andaimes             |
| 8. Quarantine Grid    | À sombra de um planeta escuro               | O planeta próximo, quase preto; a malha de balizas de quarentena       |
| 9. Null Boundary      | A ruptura: as pontas quebradas do Anel      | As duas pontas do Anel e o vão; um disco de matéria moída girando      |
| 10. The Crucible      | O centro: o coletor em volta da estrela     | A estrela muito perto; arcos do Anel sendo refeitos em volta dela      |

As viagens ligam esses pontos: a nave vista por trás, o Anel crescendo, e um salto (hiperespaço) quando a distância
é grande — entre capítulos e na abertura.

## Quem fala

- **THE RING** — registro, inventário, temperatura. Nunca discursa. ✔
- **WAKE** — o cargueiro: frases curtas de operação, calor humano discreto. Fala nas viagens e nos momentos de virada.
- **Wardens e Sentinels** — cada um com o vocabulário do seu trabalho. ✔
- **O piloto** — não fala.

## Abertura (viagem até a primeira fase)

- WAKE: `That signal could keep our lights on. Bring back what you can.`
- WAKE: `Link is clean. The interceptor is yours. We lose a hull, not you.`
- THE RING: `Visitors: one. Returning citizens: unresolved.`

## Capítulo I — The Outer Ring

**1. Debris Wake** (chefe: Quarry Maw ✔)

- Chegada — THE RING: `Debris Wake. What the Ring let go of. All of it is still counted.`
- Quarry Maw, meia vida — QUARRY MAW: `Intake widened. Sorting continues. Nothing here is thrown away.`

Viagem 1 → 2

- WAKE: `Something out there is still sorting the wreckage. Abandoned places don't do that.`
- THE RING: `Lane assignment: none. Proceed uncounted. Briefly.`

**2. Salvage Lanes** (chefe: Gatekeeper ✔)

- Chegada — THE RING: `Salvage Lanes. Cargo moved here for nine hundred years. The schedule still runs.`
- Gatekeeper, meia vida — GATEKEEPER: `Schedule slipping. Second pass authorised. The lane stays closed.`

Viagem 2 → 3

- WAKE: `The gate ahead has power. A thousand years, and it has power.`
- THE RING: `Gate log updated. Prime is counting.`

**3. Prime Gate** (chefe: Warden Prime ✔)

- Chegada — THE RING: `Prime Gate. Last opened: nine hundred years ago. Power: nominal. Keeper: on station.`
- Prime, aviso — WARDEN PRIME: `Salvage pilot. You are counted. The Ring is broken. It is not abandoned.` ✔

Viagem 3 → 4 (fim do capítulo)

- WAKE: `We're through. The heat is deeper in. That's what we came for.`
- THE RING: `One hull past the gate. The record does not have a word for you.`

## Capítulo II — The Dense Core

**4. Furnace Drift** (chefe: Kiln Engine ✔)

- Chegada — THE RING: `Furnace Drift. The Core vents here. It has not been allowed to cool.`
- Kiln Engine derrotado — THE RING: `Kiln Engine cold. Heat released: all of it. Seams: one, opening.`

Viagem 4 → 5

- WAKE: `Reactor crew is cheering. Every furnace you put out, our lights get steadier.`
- WAKE: `Odd thing. The cracks out there got wider when it went cold.`

**5. Crystal Choir** (chefe: Prism Crown ✔)

- Chegada — THE RING: `Crystal Choir. Nine voices sang this seam shut. Six are crystal now.`
- Prism Crown, aviso: `Six voices sleep in the crystal. The Crown still carries their note.`
- Prism Crown derrotado: `The Crown is dark. The note has stopped. The seam has not.`

Viagem 5 → 6

- WAKE: `That wasn't a weapon back there. It was holding something closed. Go carefully.`
- THE RING: `Resonance failing. Seam width: increasing. Cause: one hull.`

**6. Resonance Chamber** (chefe: The Choir ✔)

- Chegada — THE RING: `Resonance Chamber. Voices: three of nine. Seams held: all of them. For now.`
- The Choir, aviso: `We are three. We were nine. We sang the Ring closed. We will sing you still.` ✔
- The Choir derrotado: `The hymn breaks. We were not guarding it. We were holding it shut.`
- Na vitória de cada fase do capítulo, as rachaduras do lugar se abrem e acendem (luz fria, azul-branca).

Viagem 6 → 7 (fim do capítulo)

- WAKE: `We have the power we came for. We could turn back now.`
- WAKE: `...the signal moved. It's calling from further in. It's calling us by name.`

## Capítulo III — The Warden's Reach

**7. Assembly Graveyard** (chefe: Foundry Mother ✔)

- Chegada — THE RING: `Assembly Graveyard. The same chassis, built again. Order received once. Never closed.`
- Foundry Mother, meia vida — FOUNDRY MOTHER: `Order open. Build the chassis. Build the chassis. No one closes the order.`

Viagem 7 → 8

- WAKE: `It builds the same machine forever. Nobody told it to stop. Nobody was left to.`
- THE RING: `Quarantine ahead. Drawn by the operators. Not drawn against you. Against us.`

**8. Quarantine Grid** (chefe: The Interdictor ✔)

- Chegada — THE RING: `Quarantine Grid. Nothing leaves. That was the last order anyone gave on purpose.`
- Interdictor, meia vida — THE INTERDICTOR: `The boundary was never for you. It keeps the Ring from hearing. You are loud.`

Viagem 8 → 9

- WAKE: `They broke their own Ring. On purpose. And put a guard on the pieces.`
- WAKE: `Pilot... I think we're the thing the guard was for.`

**9. Null Boundary** (chefe: Warden Null ✔ aviso)

- Chegada — THE RING: `Warden's Reach. Structure intact. Law intact. No vessel is logged past this point.` ✔
- Null, última fase — WARDEN NULL: `Stop. Every shot is a voice. It is listening for one.`
- Null derrotado — WARDEN NULL: `Still... no longer. It hears you now. I kept it asleep a thousand years.`
- Vitória do capítulo — THE RING: `Warden Null is silent. The Ring hears a pilot at its center. It begins to wake.` ✔

Viagem 9 → 10 (a virada)

- THE RING: `Continuance resumed. Archive: eleven million citizens. Restoring. Materials required.`
- WAKE: `It's pulling the Field back together. Pilot — it's pulling at us. At the Wake.`
- THE RING: `Returning citizens: resolved. The Wake. All aboard are counted.` (fecha o "unresolved" da abertura e o
  "calling us by name" da viagem 6 → 7; a primeira fala planta o arquivo, que a escolha depois decide)
- WAKE: `There's a center. Whatever gives the order is there. Go.`

## Final — The Crucible

**10. The Crucible** (chefe: Sovereign)

- Chegada — THE RING: `The Crucible. All orders arrive here. Two of them cannot both be obeyed.`
- Sovereign, aviso — SOVEREIGN: `Protect them. Rebuild them. I will do both. You are material for the second.`
- Sovereign, meia vida — SOVEREIGN: `Protect. Rebuild. Protect. The orders do not agree. I do not stop.`
- Sovereign derrotado — SOVEREIGN: `Orders... unassigned. Operator present. Operator: you. Choose.`

**A escolha** (tela depois do chefe, duas opções; a terceira, The Open Ring, fica para quando existirem os Ecos)

Cada opção diz, na própria tela, o que acontece com o Anel, com o arquivo e com o Wake; o cartão final leva um
epitáfio. No fundo, o Crisol responde: em Severance as luzes apagam, os arcos param e a estrela esmaece; em
Stewardship os trechos vazios dos arcos se fecham em luz.

- **Severance** — `Cut the core loose. The Field goes quiet. The archive sleeps.`
  - O Anel: `Goes dark. Nothing is rebuilt again.` · O arquivo: `Every citizen it holds sleeps. None is restored.` ·
    O Wake: `Takes the power it came for and goes home.`
  - THE RING: `Continuance: closed. Citizens: at rest. Thank you for counting us.`
  - WAKE: `Lights are steady. All of them. Come home.`
  - Epitáfio: `The Ring is dark. Its citizens are at rest. The Wake went home.`
- **Stewardship** — `Keep the Ring awake, under watch. Yours.`
  - O Anel: `Stays awake and rebuilds, on your orders.` · O arquivo: `Kept open. One day, perhaps, restored.` ·
    O Wake: `Stays to stand watch. Nobody goes home.`
  - THE RING: `Continuance: supervised. Operator logged. Sectors relighting: nine. Then more.`
  - WAKE: `So we stay. Somebody has to keep count. Might as well be us.`
  - Epitáfio: `The Ring is awake, and watched. The Wake keeps the count.`

Depois do final: as fases continuam jogáveis; a Descida e o Boss Rush são "registros do arquivo".

## Falas de meio de fase (o Wake, ao começar a terceira etapa: a virada dita enquanto acontece)

- Debris Wake: `Scrap this old shouldn't have running lights. Keep your eyes open.`
- Salvage Lanes: `Those convoys are on a timetable. Somebody is still dispatching them.`
- Prime Gate: `A garrison. For a gate nobody has used in nine centuries. Who are they expecting?`
- Furnace Drift: `Every vent you close, our reactors climb. Whatever this place is, it's feeding us.`
- Crystal Choir: `The seam is singing back. I don't like how much it sounds like an alarm.`
- Resonance Chamber: `The cracks answer when a machine dies. Pilot, I think we're the ones opening them.`
- Assembly Graveyard: `Same hull, same serial, again and again. It isn't building a fleet. It's repeating.`
- Quarantine Grid: `These fences point inward. They weren't keeping us out. They were keeping it in.`
- Null Boundary: `Past this line our charts are blank. The signal isn't. It knows we're here.`
- The Crucible: `It has our hull plans, pilot. It's building Wakes. Finish this before one launches.`

Além dessas, uma vez por capítulo o Wake fala da sua gente, na quarta etapa (para que perder o Wake pese no final), e
o Anel nomeia o arquivo dos cidadãos na segunda etapa do Assembly Graveyard, duas fases antes de ele importar:

- Salvage Lanes: `Forty of us on this ship, pilot. All forty are watching your feed.`
- Crystal Choir: `Reactor crew says thank you. Mara hasn't slept in a week. Tonight she might.`
- Quarantine Grid: `The kids on deck three named your hull. I'm not telling you what.`
- Assembly Graveyard — THE RING: `Citizens stored: eleven million. Citizens restored: none. Order still open.`

## Falas de derrota (revisão: a ligação é remota — perde-se a nave, não o piloto)

- `Link severed. Interceptor lost. The Field keeps the hull.`
- `Hull returned to the count. The Wake has another. The Ring has patience.`
- `Signal lost. The Ring files one more shard. The pilot is not in it.`
- `The Ring has been broken a thousand years. It can wait for your next hull.`

## O que cada ciclo põe no jogo

- Ciclo 1: este texto; falante WAKE; chegadas por fase; Null derrotado; falas de derrota.
- Ciclo 3: abertura e as nove viagens, com estas falas.
- Ciclo 5: The Crucible, Sovereign, a escolha e os dois desfechos.
