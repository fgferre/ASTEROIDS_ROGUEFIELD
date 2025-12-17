# Migration Plan (Fase 6+)

## 1. Visão Geral

- Objetivo: migrar gradualmente da estrutura atual para a proposta ideal (engine/game/data, componentes reutilizáveis, dados separados).
- Estratégia: execuções incrementais, preservando funcionalidade a cada fase.
- Integração: complementa `docs/plans/architecture-master-plan.md`, que cobre Fases 1–5 (DI, Random, Session, CommandQueue).
- Pré-condição: concluir Fases 1–5 antes de iniciar esta migração.

## 2. Matriz de Comparação (Atual vs Ideal)

| Aspecto                    | Atual                             | Ideal                                 | Gap   | Prioridade |
| -------------------------- | --------------------------------- | ------------------------------------- | ----- | ---------- |
| Separação Engine/Game/Data | Tudo em `modules/`                | `engine/`, `game/`, `data/` distintos | Alto  | 🔴 Alta    |
| Componentes Reutilizáveis  | Apenas Asteroid possui            | Todos os inimigos compartilham        | Alto  | 🔴 Alta    |
| Data-Driven Configs        | Parcial (`GameConstants`)         | Separado por feature                  | Médio | 🟡 Média   |
| Tamanho dos Arquivos       | `EnemySystem` 4.593 linhas        | Sistemas < 500 linhas                 | Alto  | 🔴 Alta    |
| Fragmentação               | Acoplada a `Asteroid.js`          | Sistema reutilizável                  | Médio | 🟡 Média   |
| Adição de Inimigos         | Requer classe + lógica inline     | Apenas criar config                   | Alto  | 🔴 Alta    |
| Consistência Arquitetural  | Padrões diferentes por inimigo    | Padrão único                          | Alto  | 🔴 Alta    |
| Organização de Dados       | `GameConstants` concentrando tudo | Pastas específicas                    | Médio | 🟡 Média   |
| Upgrades                   | 939 linhas em `upgrades.js`       | Arquivos por categoria                | Baixo | 🟢 Baixa   |
| DI/EventBus/Pooling        | Bem implementados                 | Manter                                | -     | -          |
| Debug Logging              | Robusto                           | Manter                                | -     | -          |

## 3. Gaps e Impacto

### 🔴 Gaps Críticos

- `EnemySystem.js` monolítico dificulta manutenção e evolução.
- Inconsistência arquitetural entre Asteroid e demais inimigos.
- Falta separação entre engine, gameplay e dados.
- Processo de adicionar inimigos exige alterações em múltiplos arquivos críticos.

### 🟡 Gaps Médios

- `Asteroid.js` contém lógica procedural e fragmentação acoplada.
- `GameConstants.js` mistura dados de múltiplos domínios.
- Fragmentação não pode ser reutilizada por outros inimigos.

### 🟢 Gaps Baixos

- `data/upgrades.js` único arquivo grande dificulta navegação.

## 4. Fases de Migração

### FASE 6.1 — Reorganizar Upgrades (Baixo Risco)

- Criar `data/upgrades/` com arquivos por categoria (offense, defense, mobility, utility).
- Mover conteúdo de `upgrades.js` mantendo export agregador (`index.js`).
- Atualizar imports em `ProgressionSystem` e correlatos.
- Benefício: organização melhorada; risco baixo.

### FASE 6.2 — Estruturar Configs de Inimigos (Baixo Risco)

- Criar `data/enemies/` com configs por tipo.
- Extrair constantes de `GameConstants.js` e classes de inimigos.
- Manter classes lendo dados novos para compatibilidade.
- Documentar schema de configuração.

### FASE 6.3 — Componentização Unificada (Médio Risco)

- Criar `game/components/` genéricos (Movement, Weapon, Render, Collision, Health).
- Migrar Asteroid, Drone, Boss, Hunter, Mine para usar componentes compartilhados.
- Garantir que `EnemyFactory` injete componentes conforme configuração.

### FASE 6.4 — FragmentationSystem (Médio Risco)

- Extrair lógica de fragmentação para `game/systems/FragmentationSystem.js`.
- Permitir configuração data-driven.
- Reutilização para inimigos que fragmentam.

### FASE 6.5 — Desacoplar EnemySystem (Alto Risco)

- Criar sub-sistemas (`EnemySpawnSystem`, `EnemyDamageSystem`, `EnemyUpdateSystem`, `EnemyRenderSystem`).
- Manter `EnemySystem` como façade temporária que delega.
- Migrar responsabilidades gradualmente.

### FASE 6.6 — Separação Engine/Game/Data (Alto Risco)

- Reorganizar estrutura conforme proposta ideal.
- Atualizar imports e manifesto progressivamente.
- Validar análise de dependências a cada etapa.

### FASE 6.7 — Simplificar Asteroid (Médio Risco)

- Extrair `CrackGenerationService` e `AsteroidVariantBehaviors`.
- Reduzir `Asteroid.js` para foco em orquestração.

## 5. Ordem Recomendada

1. FASE 6.1 — Upgrades.
2. FASE 6.2 — Enemy configs.
3. FASE 6.3 — Componentização.
4. FASE 6.4 — Fragmentação.
5. FASE 6.7 — Simplificar Asteroid.
6. FASE 6.5 — Quebrar EnemySystem.
7. FASE 6.6 — Reorganização final (engine/game/data).

## 6. Critérios de Aceite por Fase

- Jogo permanece funcional (gameplay idêntico, 60 FPS).
- `npm run analyze:deps` sem ciclos novos.
- Debug logging (`GameDebugLogger`) continua disponível.
- Documentação atualizada (este plano, `agents.md`, `CURRENT_STRUCTURE.md`).
- Checklists de validação cumpridos (`docs/validation/test-checklist.md`).

## 7. Riscos e Mitigações

- **Quebra funcional**: realizar fases pequenas, testar manualmente, revisar logs.
- **Imports quebrados**: utilizar busca/substituição controlada, rodar análise de dependências.
- **Performance degradada**: manter pooling e medir FPS após cada fase.
- **Conflitos com Fases 1–5**: iniciar somente após confirmação de conclusão das fases anteriores.

## 8. Integração com Planos Existentes

- `docs/plans/architecture-master-plan.md` — este documento adiciona Fase 6+.
- `docs/architecture/DEPENDENCY_GRAPH.md` — usar após cada fase para inspecionar hubs/ciclos.
- `agents.md` — seção 10 documenta diretrizes de evolução.

## 9. Checklist Pré-Migração

- [ ] Fases 1–5 completas.
- [ ] DI consolidado (`DIContainer`, sem dependência de ServiceLocator direto).
- [ ] `RandomService` padrão em todos os sistemas.
- [ ] `GameSessionService` gerencia lifecycle.
- [ ] Command Queue integrada.
- [ ] Análise de dependências sem alertas críticos.
- [ ] Debug logging funcional.
- [ ] Baseline de performance estabelecida.

## 10. Próximos Passos

1. Revisar e aprovar este plano.
2. Validar conclusão das Fases 1–5.
3. Executar FASE 6.1 como piloto de reorganização.
4. Ajustar abordagem conforme aprendizados iniciais.
5. Prosseguir com FASES 6.2–6.7 na ordem recomendada.

## 11. Referências

- `docs/architecture/CURRENT_STRUCTURE.md`.
- `docs/architecture/IDEAL_STRUCTURE.md`.
- `docs/plans/architecture-master-plan.md`.
- `docs/architecture/DEPENDENCY_GRAPH.md`.
- `agents.md`.
- Arquivos críticos: `src/modules/EnemySystem.js`, `src/modules/enemies/types/Asteroid.js`, `src/data/upgrades.js`.
