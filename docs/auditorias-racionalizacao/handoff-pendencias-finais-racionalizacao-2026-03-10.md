# Handoff — Pendencias Finais da Racionalizacao

**Repositorio:** ASTEROIDS_ROGUEFIELD  
**Data:** 2026-03-10  
**Escopo deste handoff:** fechar apenas as pendencias remanescentes apos a implementacao principal da racionalizacao.

## Base obrigatoria

Usar como contexto principal, nesta ordem:

1. `docs/auditorias-racionalizacao/racionalizacao-codigo-consenso-codex-opus-2026-03-10.md`
2. `docs/auditorias-racionalizacao/PLAN.md`
3. este handoff

## O que ja foi concluido

- `validate:deps` foi saneado e voltou a passar.
- `test:validate-optimizations` foi rebaixado para advisory.
- `gsap.min.js` foi removido.
- `Stats.min.js` ficou apenas em dev mode.
- boilerplate global de debug do bootstrap foi removido.
- `gameLoop()` foi simplificado para snapshot unico por frame.
- `hudLayout.js` foi reduzido ao contrato real de layout unico.
- `video.hudLayout` saiu do estado derivado.
- `selectedHull` passou a derivar do catalogo canonico em `shipModels.js`.
- `src/data/enemies/schema.js` foi rebaixado para referencia/documentacao.
- a suite duplicada `tests/balance/asteroid-metrics/feature-flags.test.js` foi removida.
- extracoes de baixo risco ja feitas:
  - `src/modules/EffectEntities.js`
  - `src/modules/ThrusterLoopManager.js`

## Validacao atual

Passando:

- `npm run validate:deps`
- `npm run test:validate-optimizations`
- `npx vitest run tests/integration/wavemanager/feature-flags.test.js`
- `npm test`
- `npm run build`
- smoke manual em preview de producao:
  - sem `window.stats`/`window.Stats`
  - sem comandos globais de debug
  - menu/settings sobem
  - persistencia de `selectedHull` confirmada

Falhando:

- `npm run format:check`
  - estado atual: 83 arquivos reportados pelo Prettier
  - o problema mistura:
    - docs historicos/arquivados
    - libs vendorizadas em `src/public/libs/`
    - assets de referencia
    - arquivos vivos de codigo/teste

## Pendencias reais

### 1. Fechar o tema de formatacao sem explodir o diff

Este e o ponto principal que ainda impede dizer que todos os gates ficaram verdes.

### Recomendacao de abordagem

Nao sair formatando o repositorio inteiro.

Ordem sugerida:

1. decidir a superficie oficial de `format:check`;
2. excluir da checagem automatica o que nao deveria entrar no gate:
   - `docs/archive/**`
   - `src/public/libs/**`
   - assets de referencia que nao sao runtime
   - docs de auditoria/handoff usados como contexto historico, se o time quiser preserva-los fora do gate
3. rerodar `npm run format:check`;
4. so depois atacar os arquivos vivos que ainda sobrarem no resultado.

### Motivo

Formatar vendor, archive e material de referencia gera ruido grande, baixo valor e risco de diff desnecessario.

## 2. Fechar a limpeza periferica restante do PR4

Itens ainda presentes e sem decisao final registrada:

- `assets/procedural/Criando Asteroides Procedurais Realistas em WebGL2.pdf`
- `src/styles/`
- `src/modules/graphics/`
- `exported-assets/`

### Regras para essa frente

- nao tocar nos 3 HTMLs abaixo; eles foram explicitamente preservados pelo usuario como referencia futura:
  - `assets/ui/HUD_layout_mockup.html`
  - `assets/starfield_tela_abertura_estudo/nasa-starfield.html`
  - `assets/procedural/asteroid_generator_study.html`
- se o PDF tambem for referencia futura, documentar isso explicitamente antes de qualquer tentativa de remocao;
- diretórios vazios so devem sair se estiver confirmado que estao realmente sem uso e sem referencia viva.

## Nao objetivos

- nao reabrir a racionalizacao principal;
- nao mexer de novo em gameplay/runtime sem necessidade direta;
- nao alterar contratos de settings/save;
- nao mexer no fallback legacy de waves;
- nao reanalisar o repositorio inteiro do zero.

## Arquivos mais provaveis para a proxima conversa

- `package.json`
- config do Prettier, se existir ou precisar ser criada
- possivel `.prettierignore`, se a estrategia escolhida for restringir a superficie do gate
- `docs/repo-health-audit-2026-03-10.md`

## Cautelas

- `docs/auditorias-racionalizacao/PLAN.md` esta **untracked** e e arquivo do usuario; nao editar nem formatar sem pedido explicito.
- os 3 HTMLs de estudo acima sao intencionais; nao reabrir a discussao de delecao.
- se a estrategia for criar `.prettierignore`, manter a lista minima e defensavel; nao usar isso para esconder codigo vivo problemático.

## Definicao de pronto para esta conversa futura

Pode ser considerado concluido quando:

1. houver decisao clara e implementada para a superficie de `format:check`;
2. `npm run format:check` passar, ou ficar bloqueado apenas por algo explicitamente aceito e documentado;
3. os residuos perifericos restantes tiverem destino definido:
   - removidos por estarem mortos; ou
   - documentados como referencia intencional.

## Comandos minimos para revalidar

- `npm run format:check`
- `npm run validate:deps`
- `npm run test:validate-optimizations`
- `npm test`

## Julgamento executivo

O trabalho principal de racionalizacao esta essencialmente fechado. O proximo contexto deve tratar isso como **fase final de fechamento de gate e de limpeza periferica**, nao como nova auditoria estrutural.
