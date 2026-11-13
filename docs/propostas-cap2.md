# Capítulo II — The Dense Core: o que mudei e o que proponho (12/11/2026)

Furnace Drift, Crystal Choir, Resonance Chamber. Tudo é proposta: o piloto de teste é sonda; o dono julga jogando.

## O que mudei e por quê

1. **Rachaduras de luz fria nos três lugares.** A virada do capítulo ("os Wardens seguravam uma coisa") só existia
   em duas falas de viagem. Agora há rachaduras finas ao fundo; quando o chefe cai, na cena de vitória, elas se abrem
   e acendem, cada fase mais forte que a anterior.
2. **Falas.** Três falavam de "três vozes" (chegada ao Crystal Choir, Prism Crown e Choir) e as de vitória não
   contavam a virada. Kiln derrotado: `Heat released: all of it. Seams: one, opening.` Crystal Choir: `Nine voices
sang this seam shut. Six are crystal now.` Prism derrotada: `The note has stopped. The seam has not.` A câmara
   ganhou chegada própria (`Voices: three of nine. Seams held: all of them. For now.`). Choir derrotado: `We were
not guarding it. We were holding it shut.`
3. **Furnace Drift.** Fase 4 com um Caster por vez (eram dois). Menos pedras na fase do Herald (de 4–5 min para 2 min), na fase 4 e na luta.
   Kiln: mais aviso antes do fogo (1,2 → 1,6 s), janela aberta maior (3 → 3,6 s), casco fechado deixa passar 40 %.
4. **Crystal Choir.** Uma camada a menos de pedras em todas as fases (é a fase das linhas de tiro). Fase 3 mais
   leve (Hunters sem elite, dois Weavers em vez de três). Prism: descanso maior (3 → 3,4 s), núcleo fechado 40 %.
5. **Resonance Chamber.** Só o lugar e as falas. Testei trocar a fase do Herald por Aegis + Hunters e desfiz: o
   piloto foi pior (uma fase de 5 min, nenhuma vitória em 2).

Arquivo compartilhado tocado: só `places/pieces.js` (peças novas `crack` e `seams`; nada existente mudou).

## Números (piloto de teste, sementes 1–3; poucas partidas: indício, não prova)

| Fase          | Antes                                       | Depois                                              |
| ------------- | ------------------------------------------- | --------------------------------------------------- |
| Furnace Drift | bom 0 de 3, médio 0 de 1; nunca viu o chefe | bom 1 de 3 (9:39; Kiln em 136 s), médio 0 de 1      |
| Crystal Choir | bom 1 de 3, médio 0 de 2; vitória em 14:58  | bom 2 de 3, médio 1 de 1; vitórias em 10:30 e 11:08 |
| — Prism Crown | 135 s (medição anterior: 222 s)             | 175–194 s (não encurtou)                            |
| Resonance Ch. | bom 2 de 3 (≈10 min; Choir em 148–156 s)    | igual (o jogo não mudou)                            |

- **Caster: é do jogo, não do piloto.** A explosão tem raio 110, a mira segue a nave por 0,5 s e sobra 1,1 s; a
  nave voa 70–95 nesse tempo. Só o dash salva. Dois Casters pedem um dash a cada 1,6 s, a recarga inteira do dash.
- **Fase de 25 minutos: é do piloto.** Ele fica parado longe das últimas pedras, puxado por XP do outro lado da
  borda. Um jogador não faria isso.

## Propostas para fora do meu capítulo (não mexi)

- **Caster**: travar a mira quando o anel aparece e reduzir o raio para 85–90. Hoje a dica do Codex só vale com dash.
- **Piloto de teste**: medir o XP em linha reta, não através da borda; aceitar dash cedo para sair de explosão.
- **Dano de pedra**: uma batida tira 35 de ~110 de casco; três matam. Rever para os capítulos II e III.
- **Viagens 4→5 e 5→6**: iguais às outras. A fala "the cracks got wider" pede rachaduras acesas no Anel na viagem.
- **Herald of Heat aparece duas vezes no capítulo**, com as mesmas falas. Deixá-lo só em Furnace Drift e desenhar
  para a câmara uma fase que ensine o Choir (um alvo que importa entre vários).

## O que olhar ao jogar

- Mate o Kiln e olhe o fundo na vitória: dá para entender que apagar a fornalha abriu algo? Na câmara o clarão
  ficou forte demais? Durante a fase, as rachaduras atrapalham ler tiros? (Devem ser quase invisíveis.)
- Furnace Drift, fase 4: um Caster por vez ainda é injusto? O fogo do Kiln dá tempo de sair?
- As lutas cansam (Kiln ≈ 2 min 15 s, Prism ≈ 3 min)? Crystal Choir com menos pedras ficou vazio?
- Ainda fraco: Furnace Drift segue a mais dura: o piloto bom ainda morre cedo em 2 de 3 (Caster na fase 2, Drones na 3).
- A luta da Prism não encurtou no piloto (ele foge dos raios e bate pouco). A câmara repete o Herald.

## Capturas (pasta `capturas-cap2/`, fora do git)

`1-fornalha-lugar` (estrela, face do Anel, rachaduras finas) · `2-kiln-luta` (fatias de fogo) · `3-fornalha-vitoria-rachaduras`
(Kiln morto, rachaduras abertas, fala nova) · `4-cristal-lugar` (fenda e cristais) · `5-prisma-luta` (raios) · `6-cristal-vitoria-fenda`
(a fenda abrindo) · `7-camara-lugar` (costelas, rachaduras discretas) · `8-camara-vitoria-rachaduras` (piso escancarado).
