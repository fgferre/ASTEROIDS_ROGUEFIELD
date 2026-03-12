# Frente 3 - Fechar o Contrato de `schema.js`

## Objetivo

Fixar `src/data/enemies/schema.js` como contrato autoral e documental para
naming e shape canonicos de configs de inimigos, sem sugerir que o modulo faz
validacao de runtime.

## Diagnostico Confirmado

- Equivalentes encontrados antes de criar este arquivo:
  `docs/plans/`, `docs/archive/2026-health-cleanup/plans/` e
  `docs/archive/2025-plan/plans/`.
- A pasta
  `docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/` ja existia
  no worktree com as frentes 1 e 2, entao nao precisou ser recriada.
- `src/data/enemies/schema.js` ja se declarava modulo de referencia/tipos e
  explicitava que nao era validator de runtime.
- `validateEnemyConfig()` era exportada por `schema.js`, mas a busca no repo
  mostrou zero consumidores em `src/` e `tests/`.
- As referencias reais a `schema.js` no dominio de dados sao apenas de
  manutencao:
  - `@typedef {import('./schema.js').EnemyConfigSchema}` em
    `src/data/enemies/drone.js`,
    `src/data/enemies/hunter.js`,
    `src/data/enemies/mine.js` e
    `src/data/enemies/boss.js`;
  - referencia textual de convencoes em
    `src/data/enemies/asteroid-configs.js`.
- O runtime nao importa `schema.js`; ele consome `*_COMPONENTS` por
  `src/modules/EnemySystem.js`,
  `src/modules/enemies/base/EnemyFactory.js` e pelas classes de inimigo.
- A compatibilidade legada continua distribuida em consumers concretos:
  `MovementComponent.js` faz `maxSpeed ?? speed` e `WeaponComponent.js` faz
  fallback de `cooldown` para campos legados.
- `EnemyFactory.validate()` existe, mas valida apenas o registro da factory;
  nao valida o schema de `components`.

## Distincao de Papeis

### Contrato Publico

- `EnemyConfigSchema`
- `MOVEMENT_SCHEMA`
- `WEAPON_SCHEMA`
- `RENDER_SCHEMA`
- `COLLISION_SCHEMA`
- `HEALTH_SCHEMA`
- `ENEMY_CONFIG_SCHEMA`

Esses exports permanecem como referencia publica para autores de dados e para
JSDoc/types locais.

### Helper de Manutencao

- Nenhum helper deve permanecer exportado por `schema.js` ao final desta
  frente.
- Revisao manual de campos deprecated nao faz parte do contrato publico do
  modulo.

### Validacao de Runtime

- Inexistente nesta frente.
- Continua fora de escopo adicionar validator central em `EnemySystem`,
  `EnemyFactory` ou components.
- O runtime segue operando pelos defaults e fallback chains ja existentes.

## Escopo

- Registrar este plano da frente 3.
- Ajustar apenas `src/data/enemies/schema.js`.
- Remover `validateEnemyConfig()` da superficie publica do modulo.
- Reforcar no cabecalho/JSDoc de `schema.js` que o arquivo e contrato de
  referencia, nao validator de runtime.

## Nao-Objetivos

- Nao criar novo script, novo modulo ou nova API de validacao.
- Nao promover `schema.js` a fluxo de validacao executado pelo jogo.
- Nao editar consumidores reais de runtime.
- Nao migrar configs existentes nem alterar fallback chains legadas.
- Nao tocar no modelo de asteroides fora da constatacao documental.

## Arquivos-Alvo

- `docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/03-contrato-schema-enemies.md`
- `src/data/enemies/schema.js`
- Leitura de confirmacao:
  - `src/data/enemies/drone.js`
  - `src/data/enemies/hunter.js`
  - `src/data/enemies/mine.js`
  - `src/data/enemies/boss.js`
  - `src/data/enemies/asteroid-configs.js`
  - `src/modules/EnemySystem.js`
  - `src/modules/enemies/base/EnemyFactory.js`
  - `src/modules/enemies/components/MovementComponent.js`
  - `src/modules/enemies/components/WeaponComponent.js`

## Riscos

- Pode existir consumidor manual fora do repositorio para
  `validateEnemyConfig()`.
- Manter helper advisory exportado perpetua falsa expectativa de validacao em
  runtime.
- Confundir `EnemyFactory.validate()` com validacao de schema manteria a
  ambiguidade arquitetural aberta.

## Criterios de Aceite

- `schema.js` passa a declarar de forma explicita que e contrato de referencia
  e nao validacao de runtime.
- `validateEnemyConfig()` deixa de existir na superficie publica do modulo.
- A busca por `validateEnemyConfig` em `src/` e `tests/` nao encontra
  consumidores.
- A busca por import real de `schema.js` em `src/` e `tests/` nao encontra
  consumidores de runtime.
- Nenhum arquivo de codigo fora de `src/data/enemies/schema.js` entra na
  implementacao desta frente.

## Validacao Minima

- `rg -n --fixed-strings "validateEnemyConfig" src tests`
- `rg -n "^import .*schema\\.js|from ['\\\"].*schema\\.js['\\\"]" src tests`
- `npm run format:check`
- `npm test`
- `npm run validate:deps`

## Sequencia Executada

1. Confirmar equivalentes documentais antes da gravacao deste plano.
2. Verificar que a pasta da auditoria ja existia no worktree e reutiliza-la.
3. Confirmar consumidores reais de manutencao e ausencia de consumidores de
   runtime para `schema.js`.
4. Registrar este plano em
   `docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/03-contrato-schema-enemies.md`.
5. Ajustar `src/data/enemies/schema.js` para remover a falsa superficie de
   validacao e explicitar a fronteira correta do modulo.
6. Reexecutar a validacao minima sem expandir escopo.
