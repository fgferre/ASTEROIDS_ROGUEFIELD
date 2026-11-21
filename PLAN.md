Controle de videogame (pendência 39), ramo `controle/videogame`, aberto em 20/11/2026.

## Passos

1. [x] Lote 0: retrato tela por tela com um controle imitado, costumes de console, propostas. Cartão
       `quadro/cartoes/controle-1.html` (fora do git), três perguntas de gosto: menus, esquema da partida, dash e escudo.
2. [ ] Lote 1, a partida: o esquema escolhido; a força do analógico e do gatilho vale; dicas da tela com os botões do
       controle quando ele está em uso. Curva e zona morta: mostrar os números, ele joga antes de travar.
3. [ ] Lote 2, os menus: tudo se alcança e se usa só com o controle, do jeito escolhido.

## O que o lote 0 mediu (Chrome sem tela, controle imitado; o Xbox de verdade só ele confere)

- Menu: o LAUNCH da Campaign nunca recebe o foco (`pickFocusTarget` em `src/modules/ui/gamepadNav.js` escolhe pela
  posição); o setor só por caminho torto; esquerda/direita na dificuldade mudam o valor e o foco cai no `body`;
  LB/RB e B não fazem nada no menu.
- Hangar: abas sem LB/RB. Settings: metade de Graphics e de Controls fora do alcance; A numa tecla de teclado prende o
  controle (a captura em `SettingsPanel.js` ignora o controle e não tem saída por ele).
- Créditos do final (`#end-credits-screen`) fora de `GAMEPAD_NAV_SCREENS`: o controle não sai.
- Funcionam: abertura, PRESS START, pilotos, Codex, cena da história, cartas, baú, Flight Computer, pausa, fim de
  partida.
- Partida: Classic liga e desliga em 0,45 do eixo (100% acima); Modern só usa a direção (100% acima de 0,2). A força
  não conta em nenhum dos dois.

## Decisões e cuidados para os lotes 1 e 2

- Nenhum pacote de fora: os problemas são deste jogo; estender `gamepadNav.js` e `UISystem.handleGamepadNav`.
- Força: o toque escreve nos mesmos campos `moveX/moveY` (`touchControls.merge`); o toque tem de continuar a 100%.
  As partidas gravadas guardam os analógicos (`src/core/replay.js`, versão 9): a força entra com versão nova e as
  gravações antigas tocam como antes.
- `InputSystem.js` está em 1.186 linhas (teto 1.200): tirar antes de pôr.
- Teclado, mouse e toque não mudam; os pilotos e a volta à tela inicial não mudam.

## Fora do escopo

Remapear o teclado; o toque; qualquer outro controle além do padrão (mapeamento "standard").
