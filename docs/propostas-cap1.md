# Capítulo I — The Outer Ring: o que mudei e o que proponho (12/11/2026)

Fases 1 a 3, abertura e as duas viagens. Fotos em `capturas-cap1/` (fora do git), pastas `antes/` e `depois/`.

## O que mudou no jogo

1. **Prime Gate tem fases próprias.** Antes repetia as fases genéricas e o Herald of Dust da fase 1. Agora é a
   guarnição do portão, e cada etapa ensina um pedaço do Warden Prime: Drones em fila (tiros mirados), um Hunter
   que orbita e dispara rajadas, Rams investindo enquanto um anel de Drones fecha, e tudo junto atrás de uma parede.
2. **Prime Gate tem fala de chegada própria**: `Prime Gate. Last opened: nine hundred years ago. Power: nominal.
Keeper: on station.` A virada do capítulo ("alguém cuida disto") é dita ao chegar; o aviso do Prime fecha.
3. **Os dois primeiros chefes falam na meia vida** (antes ficavam mudos na luta). Quarry Maw: `Intake widened.
Sorting continues. Nothing here is thrown away.` Gatekeeper: `Schedule slipping. Second pass authorised. The
lane stays closed.` As duas preparam a virada: a sucata é separada, o horário é cumprido.
4. **Debris Wake, cenário.** A estrela era um borrão branco em cima da área de jogo; virou um ponto frio num
   canto. O Anel se lê como anel partido, com pedaços soltos. Os destroços, quase invisíveis, são 43 peças.
5. **Prime Gate, cenário.** O portão era um buraco escuro; agora está aceso: aro iluminado, lâmpadas, anéis de
   luz descendo o poço, luzes-guia na parede apontando para ele.
6. **Salvage Lanes, etapa 1**: um comboio de três Drones cruza a arena na sua pista ("the schedule still runs").
7. **Piloto de teste**: `PLAYTEST_CARRY=1` faz o piloto chegar com as cartas das fases anteriores (`tests/playtest/`).

## Números (piloto de teste; uma partida por semente, o ruído é grande)

| Fase                      | Antes                                    | Depois                                  |
| ------------------------- | ---------------------------------------- | --------------------------------------- |
| Prime Gate, piloto bom    | venceu em 5:36 (chefe 57 s)              | 5:49 (chefe 108 s); com as cartas, 5:00 |
| Prime Gate, piloto médio  | morreu nas etapas 3 e 4, sem ver o chefe | chegou ao Prime e morreu nele (2/2)     |
| Salvage Lanes, piloto bom | venceu em 4:51 e 5:21                    | venceu em 5:30 e 4:51; morreu 1 vez     |

- Salvage "depois" foi medido com vida extra no Gatekeeper e uma parede a mais na etapa 4. Sem ganho mensurável
  (idem baixar a vida do Quarry Maw: o piloto passou a morrer nele em 2 de 3), **desfiz os três**; fica o comboio.

## O que continua fraco

- **Ordem dos chefes.** O primeiro (Quarry Maw, 78–138 s) dura mais que o chefe do capítulo (Prime, 57–108 s)
  e é onde o piloto mais apanha. O Gatekeeper, com as cartas, cai em 48 s.
- **Duração.** Cada fase leva 4 a 6,5 min; o capítulo, uns 15. Com as cartas, as duas primeiras etapas de cada
  fase duram 25–30 s, sem risco. Alongar pede mais etapas por fase (hoje 5 fixas). O piloto médio não vence o Prime.

## Propostas para fora do meu pedaço

- **Viagens**: na abertura o Anel já aparece grande ao lado da nave; devia estar pequeno e longe. Na 2→3 o Wake
  diz "The gate ahead has power" e o portão não aparece. O lugar de destino só surge no último quarto.
- **Cartas levadas** rendem pouco (nível 10 → 12 → 15), não quebram o equilíbrio. Quem entra direto na fase 2
  ou 3 pelo mapa chega sem nada: proposta de `headStart` 2 e 5 nessas fases.
- **Chefes** (só depois do dono jogar): Prime com mais vida (1,0 → 1,2); pedras do Quarry Maw menos punitivas.
- **Fala no meio da fase**: hoje só há fala na chegada, no Herald e no chefe. Um gancho "ao começar a etapa N"
  deixaria o Wake comentar no meio, onde as viradas dos três capítulos caberiam melhor.

## O que olhar ao jogar

Prime Gate: o portão aceso distrai quando a luta passa por cima? A etapa 4 é demais? Debris Wake: os destroços
aparecem sem atrapalhar, as luzinhas âmbar parecem orbes? Dá tempo de ler as falas de meia vida no meio da luta?

## Fotos (`antes/sheet-journeys.png` e `antes/sheet-salvage-lanes.png`: as viagens e a fase 2 como estão)

- `antes/sheet-debris-wake.png` → `depois/debris-wake-place-1.png`: estrela, Anel e destroços.
- `antes/sheet-prime-gate.png` → `depois/prime-gate-place-1.png`: portão apagado e aceso.
- `depois/prime-gate-arrival.png`: fala nova de chegada. `depois/prime-gate-stage1.png`: Drones em fila.
- `depois/quarry-maw-phase2.png`, `depois/gatekeeper-phase2.png`: as falas de meia vida na tela.
