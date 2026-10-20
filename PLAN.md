# Modernização do Asteroid Roguefield — plano (17/10/2026; Rodadas 0, 14 e as frentes 1–4 da 15 na `main`)

Tarefa que atravessa sessões. Quem pegar este arquivo lê tudo antes de mexer; marca a etapa feita aqui; o que fecha
sai daqui (a história fica no git: `git log --oneline --merges main`). Decisões de produto são do dono, por imagem e
jogando — nunca por teste.

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
