# Decisão de Layout — HUD Tático Minimalista (Item 2.1.A)

**Data:** 2025-10-06  
**Responsáveis:** Equipe UI/UX (coordenação gpt-5-codex)

## 1. Contexto e objetivo

Este documento registra a escolha do layout oficial do HUD antes de qualquer
refatoração estrutural. As propostas anteriores — "Minimal Tactical HUD" e
"Sleek Tactical HUD" — já atacavam problemas reconhecidos nas revisões de UI
(cards ocupando cantos inteiros, duplicação de dados e excesso de rótulos). O
objetivo desta decisão é consolidar uma direção única, alinhada com o código já
existente, e preparar a implementação incremental dos itens subsequentes.

## 2. Avaliação do estado atual

### 2.1 Estrutura orientada por dados

O `UISystem` continua gerando o HUD a partir de `src/data/ui/hudLayout.js`, distribuindo os itens em regiões absolutas (`top-left`, `top-right`, `bottom-*`). A configuração atual mantém barras verticais individuais para saúde, escudo e XP no canto superior esquerdo, enquanto ondas, abates e tempo ficam espalhados entre agrupamentos diferentes.【F:src/data/ui/hudLayout.js†L1-L83】【F:src/modules/UISystem.js†L562-L651】

### 2.2 Comportamento visual vigente

Os grupos configurados como `status-progress` e `wave-status` ainda são renderizados em colunas independentes, reforçando o footprint alto observado nas propostas anteriores. A estilização com `.hud-group--status-progress` confirma colunas empilhadas e espaçamentos internos generosos, o que contraria a meta de um cabeçalho horizontal compacto.【F:src/style.css†L2722-L2762】

### 2.3 Indicadores redundantes

O painel de ondas continua apresentando temporizador, título e contagem empilhados, enquanto ícones de kills/tempo ainda dependem de rótulos legados. Além disso, o `UISystem.updateLevelDisplay` procura um item `level` dedicado, mas, como o layout atual não o fornece, o nível é exibido apenas como metadado da barra de XP — reforçando a necessidade de um slot próprio no cabeçalho compacto.【F:src/style.css†L3089-L3129】【F:src/modules/UISystem.js†L2033-L2101】

### 2.4 Tokens disponíveis

O arquivo `src/style.css` já expõe tokens de cor, espaçamento e raio suficientes para sustentar o visual translúcido com glow ciano sugerido nas propostas anteriores, evitando introduzir novos valores mágicos.【F:src/style.css†L1-L120】

## 3. Decisão consolidada

Adotar o **Minimal Tactical HUD** como base, preservando os ajustes de contraste e feedback da versão "Sleek". O layout final prioriza uma faixa superior única, removendo rótulos redundantes e isolando indicadores contextuais na base do canvas.

```
┌────────────────────────────────────────────────────────────┐
│ ❤️ 120/150   💠 •••   ⭐ LV 07                    🎯 042  ⏱ 07:45 │
└────────────────────────────────────────────────────────────┘
                         ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
                     XP ▓▓▓▓▓▓▓▓░░░░░  2 480 / 3 200
                     Setor 3 ▓▓▓▓▓▓░░░░  12 / 18
```

## 4. Especificações por componente

### 4.1 Faixa tática superior

- **Estrutura:** um contêiner horizontal (`top-middle`) englobando dois grupos flexíveis — vitais (esquerda) e sessão (direita).
- **Itens:**
  - `health` e `shield` permanecem barras com `layout: 'inline-progress'`, porém alinhadas lado a lado dentro do grupo de vitais.
  - Novo item `level` (layout `inline-value`) migra o texto "Level N" do metadado da barra de XP para o cabeçalho.
  - `kills` e `time` são convertidos para `layout: 'inline-value'` e agrupados no cluster direito, sem labels.
- **Tokens:** utilizar `--space-10/12`, `--radius-md` e gradientes já definidos para barras (`--hud-health-*`, `--hud-shield-*`).
- **Responsividade:** o contêiner deve escalar via `--hud-scale-effective` já calculado pelo `UISystem`.

### 4.2 Rodapé centrado — progresso do piloto

- `xp` passa para a região `bottom-center`, mantendo barra preenchível e exibindo a etiqueta "XP" alinhada à esquerda, valor total à direita.
- O metadado de nível deixa de ser exibido aqui; a animação de `level up` permanece vinculada tanto ao item `level` quanto à barra de XP para preservar feedback visual (`.is-levelup`).

### 4.3 Rodapé esquerdo — status da onda

- Painel `wave` torna-se cartão horizontal único com título curto ("Setor / Wave"), barra de progresso fina e contagem agregada `in-progress / total`.
- Temporizadores redundantes permanecem ocultos (`.wave-timer { display: none; }`) até que o WaveManager modular (item 4.1.B) exija telemetria adicional.

### 4.4 Microinterações e acessibilidade

- Manter `aria-live="polite"` em todos os indicadores numéricos.
- Preservar feedbacks visuais existentes (`.is-danger`, `.shield-fail`, `.is-levelup`).
- Validar contraste em modo padrão e `body.hud-high-contrast` conforme tokens atuais (`--color-primary`, `--color-card-border`).

## 5. Tokens confirmados

| Uso                 | Token                                    | Observações                                                                   |
| ------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| Fundo translúcido   | `--color-primary` + opacidades derivadas | Reutilizar gradientes definidos em `.hud-item--health` e `.hud-item--shield`. |
| Espaçamento interno | `--space-10`, `--space-12`               | Compatíveis com escala automática do HUD.                                     |
| Raio/forma          | `--radius-md`, `--radius-lg`             | Mantém coerência com menus.                                                   |
| Tipografia          | `--font-size-sm`, `--font-weight-bold`   | Já aplicados via classes `.hud-item__value`.                                  |

## 6. Arte de referência

- **Mockup:** `assets/ui/minimal-tactical-hud.svg` (wireframe vetorial simplificado preparado nesta etapa).

## 7. Próximos passos (itens 2.1.B e 2.1.C)

1. Atualizar `hudLayout.js` com novo posicionamento, incluindo item `level` e metadados atualizados.
2. Refatorar `UISystem.setupHudLayout`/CSS associados para suportar agrupamento horizontal da faixa superior e o reposicionamento das barras inferiores.
3. Revisar checklist de acessibilidade após implementação visual (item 2.1.C) garantindo contraste >= 4.5:1.

---

Esta decisão consolida a direção de UI com base nos dados atuais do código, evitando regressões no fluxo do `UISystem` e preparando terreno para ajustes incrementais sem reescrever a infraestrutura de HUD.
