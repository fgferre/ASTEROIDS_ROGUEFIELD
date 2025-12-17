# Plano de Execução – Fase 1 (Centralização do Bootstrap e DI real)

## 1. Objetivos da fase

- Substituir a cadeia de `new ...System()` em `app.js` por um orquestrador único que instancia os serviços através do `DIContainer`, mantendo o `gameServices` apenas como ponte legada durante a transição.【F:src/app.js†L426-L491】
- Converter o `ServiceRegistry` de placeholders para um manifesto de fábricas reais, capaz de validar dependências e preparar a migração para injeção por construtor.【F:src/core/ServiceRegistry.js†L29-L95】
- Preparar cada sistema para receber dependências explicitamente (com fallback ao Service Locator), eliminando duplicidades de bootstrap e deixando claros os pré-requisitos entre módulos.
- Registrar infraestrutura compartilhada (`GamePools`, `GarbageCollectionManager`, `event-bus`) no mesmo fluxo para que nenhum módulo precise inicializar recursos críticos por conta própria.【F:src/app.js†L431-L456】【F:src/core/GamePools.js†L18-L120】【F:src/core/GarbageCollectionManager.js†L7-L152】

## 2. Diagnóstico atual (evidências)

1. **Instanciação manual e ordem implícita.** Toda a sequência de sistemas é criada dentro de `init()`, inclusive com dependências passadas “na mão” (`new EffectsSystem(audioSystem)`), o que dificulta reordenar ou testar serviços isoladamente.【F:src/app.js†L426-L476】【F:src/modules/EffectsSystem.js†L138-L160】
2. **DI container apenas como espelho.** O `ServiceRegistry` registra closures que devolvem `gameServices.get(...)`, sem conhecer as dependências reais, portanto não há validação nem possibilidade de inversão de controle.【F:src/core/ServiceRegistry.js†L29-L95】
3. **Dependências ocultas via cache.** Sistemas como `EnemySystem`, `PhysicsSystem`, `ProgressionSystem`, `WorldSystem`, `MenuBackgroundSystem` e `AudioSystem` fazem lookup tardio de outros serviços, tornando difícil saber a ordem mínima de inicialização e gerando cache inválido após reset.【F:src/modules/EnemySystem.js†L15-L151】【F:src/modules/PhysicsSystem.js†L4-L136】【F:src/modules/ProgressionSystem.js†L14-L118】【F:src/modules/WorldSystem.js†L1-L154】【F:src/modules/MenuBackgroundSystem.js†L266-L320】【F:src/modules/MenuBackgroundSystem.js†L532-L580】【F:src/modules/AudioSystem.js†L44-L55】
4. **Infraestrutura fora da DI.** Pools e coletor de lixo são configurados diretamente em `app.js`, o que impede testes ou reuso desses serviços fora do bootstrap atual.【F:src/app.js†L431-L456】【F:src/core/GamePools.js†L18-L120】【F:src/core/GarbageCollectionManager.js†L7-L152】

## 3. Estratégia geral

- Criar um **manifesto único** (`src/bootstrap/serviceManifest.js`) descrevendo cada serviço com: nome, fábrica, dependências, ciclo de vida (singleton/transiente) e instruções de registro legado (`gameServices`). Esse arquivo substituirá o array fixo do `ServiceRegistry`.
- Estender `ServiceRegistry.setupServices()` para consumir o manifesto, registrar cada fábrica no `DIContainer` e gerar validações (ex.: detectar ciclos antes de instanciar). O registro passa a conhecer dependências explícitas.
- Implementar `bootstrapServices(diContainer)` em `src/bootstrap/bootstrapServices.js` para resolver serviços conforme a ordem topológica do manifesto, inicializando também infraestrutura não modular (pools, garbage manager, event bus) antes dos sistemas de gameplay.
- Refatorar `init()` em `app.js` para delegar a inicialização a `bootstrapServices()` e expor apenas ganchos de estado/sessão. O retorno do bootstrap deve disponibilizar instâncias principais para o restante do fluxo (ex.: UI).
- Adaptar cada sistema para aceitar dependências opcionais via construtor (ex.: `constructor({ settings, audio })`), com fallback ao `gameServices` quando a dependência não for passada. Isso permite uma transição incremental sem quebrar comportamento atual.
- Criar adaptadores simples para ciclos inevitáveis: por exemplo, permitir que `PhysicsSystem` receba `enemies` via setter após ambos serem construídos, ou registrar proxies no manifesto quando necessário.

## 4. Sequenciamento detalhado

| Ordem | Passo                       | Descrição                                                                                                                                                                                                                                                               | Pré-requisito | Critério de aceite                                                                                                                                                   |
| ----- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Inventário de serviços      | Montar tabela com `name → factory → deps` a partir da leitura dos sistemas e caches (`gameServices.get`). Documentar no manifesto novo.                                                                                                                                 | —             | Arquivo `serviceManifest.js` cobre todos os serviços que hoje aparecem no array do `ServiceRegistry` + `game-state`, `game-pools`, `garbage-collector`, `event-bus`. |
| 2     | Atualizar ServiceRegistry   | Substituir a lógica de placeholders por iteração no manifesto, registrando cada serviço com dependências reais e flags de singleton. Incluir validação de nomes duplicados e detecção prévia de dependências inexistentes.                                              | Passo 1       | `ServiceRegistry.setupServices()` não faz mais `gameServices.get` direto e falha cedo se uma dependência não estiver listada.                                        |
| 3     | Bootstrap de infraestrutura | Extrair configuração de `GamePools` e `GarbageCollectionManager` para fábricas dedicadas no manifesto. Garantir que ambos sejam instanciados antes dos sistemas que os usam.                                                                                            | Passo 2       | Chamadas de bootstrap saem de `app.js` e passam a ocorrer via `diContainer.resolve('game-pools')`/`resolve('garbage-collector')`.                                    |
| 4     | Construtores compatíveis    | Para cada sistema, aceitar objeto de dependências como primeiro argumento (`constructor({ audio, settings } = {})`) e usar fallback somente se a dependência não for fornecida. Registrar explicitamente as dependências reais no manifesto.                            | Passo 2       | Sistemas continuam funcionando quando instanciados pelo manifesto e em testes diretos. Nenhum quebra o uso atual porque o fallback permanece.                        |
| 5     | Resolução de ciclos         | Identificar pares com dependência mútua (ex.: `enemies` ↔ `physics`). Introduzir setters ou dividir responsabilidades (ex.: inicializar `PhysicsSystem` sem referência e chamar `physics.attachEnemies(enemies)` após ambos existirem).                                | Passo 4       | Manifesto consegue ser resolvido sem recursão infinita; `bootstrapServices()` conclui com todas as dependências preenchidas.                                         |
| 6     | Novo bootstrap              | Criar `bootstrapServices()` que resolve serviços na ordem correta, atualiza o `ServiceLocatorAdapter` com as instâncias e retorna um objeto com referências principais (UI, player, progression). Substituir bloco de `new` em `init()` por chamada única ao bootstrap. | Passos 1–5    | `app.js` deixa de instanciar sistemas diretamente e passa a lidar apenas com sessão, loop e UI.                                                                      |
| 7     | Validação e telemetria      | Usar `diContainer.validate()` (já disponível) para emitir log final com dependências resolvidas; adicionar testes manuais focados em reset/retry para garantir que caches baseados em DI funcionam.                                                                     | Passo 6       | Log final mostra todos os serviços instanciados uma única vez; fluxo de retry, pausa e menus opera sem regressões visíveis.                                          |

## 5. Ajustes específicos por serviço

- **AudioSystem:** injetar `settings` no construtor e remover acesso direto no bootstrap (continuar observando eventos).【F:src/modules/AudioSystem.js†L44-L55】
- **EffectsSystem:** aceitar `{ audio }` e remover dependência de parâmetro posicional. Garante compatibilidade com DI e fallback em caso de ausência.【F:src/modules/EffectsSystem.js†L138-L160】
- **EnemySystem / PhysicsSystem / WorldSystem / CombatSystem:** expor métodos `attachDependencies()` ou aceitar objeto com referências opcionais. Garantir que caches (`resolveCachedServices`) reconheçam instâncias fornecidas para evitar buscas repetidas.【F:src/modules/EnemySystem.js†L15-L151】【F:src/modules/PhysicsSystem.js†L4-L136】【F:src/modules/WorldSystem.js†L1-L154】【F:src/modules/CombatSystem.js†L4-L118】
- **ProgressionSystem / UISystem / MenuBackgroundSystem:** injetar `settings`, `effects`, `ui` conforme necessário para remover dependências silenciosas. Conferir integração com eventos após o bootstrap.【F:src/modules/ProgressionSystem.js†L14-L118】【F:src/modules/UISystem.js†L21-L120】【F:src/modules/MenuBackgroundSystem.js†L266-L320】【F:src/modules/MenuBackgroundSystem.js†L532-L580】
- **XPOrbSystem, HealthHeartSystem, PlayerSystem:** revisar se dependem implicitamente de outros serviços (ex.: `PlayerSystem` usa `InputSystem` em `handleInput`) e documentar isso no manifesto para manter ordem correta.【F:src/modules/PlayerSystem.js†L1-L120】【F:src/modules/XPOrbSystem.js†L143-L173】【F:src/modules/collectibles/HealthHeartSystem.js†L1-L120】

## 6. Riscos e mitigação

- **Ciclos DI inadvertidos:** Resolver com inicialização em duas etapas (fábrica + `attach`). Testar especificamente `physics ↔ enemies ↔ world ↔ combat` após migração.
- **Fallback legado mascarando erros:** Habilitar modo verbose do `DIContainer` em desenvolvimento até concluir a fase, garantindo que qualquer dependência não resolvida gere log explícito.
- **Diferenças de inicialização assíncrona:** Alguns sistemas (ex.: `MenuBackgroundSystem`) dependem de recursos WebGL. Garantir que fábricas tratem indisponibilidade e registrem serviço mesmo em fallback para manter compatibilidade atual.【F:src/modules/MenuBackgroundSystem.js†L60-L134】

## 7. Checklist de saída da Fase 1

- [x] `ServiceRegistry` depende exclusivamente do manifesto e conhece todas as dependências diretas.
- [x] `bootstrapServices()` substitui o bloco manual em `init()` e publica snapshot no console com validação do container.
- [x] Todos os sistemas aceitam injeção explícita e funcionam com `gameServices` desabilitado (exceto pelo adaptador legado que continuará ativo até a fase 2).
- [x] `GamePools`, `GarbageCollectionManager` e `event-bus` são resolvidos via DI.
- [x] Fluxos de reset/retry e tela de menu continuam operando sem regressões visíveis.
