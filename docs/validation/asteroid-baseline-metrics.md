# Asteroid Baseline Metrics

## Introdução

Este documento registra as métricas "golden" do sistema legado de asteroides
(`EnemySystem`) para garantir paridade funcional durante a migração para o
`WaveManager`. Os dados foram capturados em 2024-06-11 utilizando a suíte de
testes `src/__tests__/legacy/asteroid-baseline-metrics.test.js` com seed
fixa `123456`.

## Wave Spawn Rate (Waves 1-10)

| Wave | Total Asteroids | Fórmula                                |
|------|-----------------|-----------------------------------------|
| 1    | 4               | 4 × 1.3^0 = 4                           |
| 2    | 5               | 4 × 1.3^1 = 5.2 → floor = 5             |
| 3    | 6               | 4 × 1.3^2 = 6.76 → floor = 6            |
| 4    | 8               | 4 × 1.3^3 = 8.79 → floor = 8            |
| 5    | 9               | 4 × 1.3^4 = 9.05 → floor = 9            |
| 6    | 14              | 4 × 1.3^5 = 14.85 → floor = 14          |
| 7    | 19              | 4 × 1.3^6 = 19.30 → floor = 19          |
| 8    | 25              | 4 × 1.3^7 = 25.10 → clamp = 25          |
| 9    | 25              | 4 × 1.3^8 = 32.63 → clamp = 25          |
| 10   | 25              | 4 × 1.3^9 = 42.41 → clamp = 25          |

> Nota: valores calculados com `Math.floor` e limitados pelo teto
> interno de 25 asteroides por wave no legado.

## Size Distribution

- **Large:** 50% (`rand < 0.5`)
- **Medium:** 30% (`0.5 ≤ rand < 0.8`)
- **Small:** 20% (`rand ≥ 0.8`)
- Tolerância estatística: ±5% em amostras de 1000 asteroides

## Variant Distribution by Size and Wave

### Wave 1 (baseline)

| Size  | Base Chance | Iron  | Dense Core | Volatile | Parasite | Gold  | Crystal |
|-------|-------------|-------|------------|----------|----------|-------|---------|
| Large | 35%         | 9.45% | 10.50%     | 7.70%    | 5.60%    | 0%    | 1.75%   |
| Medium| 25%         | 7.50% | 5.00%      | 6.25%    | 3.75%    | 0.50% | 2.00%   |
| Small | 15%         | 5.25% | –          | 4.50%    | 3.00%    | 0.30% | 1.95%   |

### Wave Scaling

- `computeVariantWaveBonus(wave)`
  - `wave < 4` → 0
  - `wave ≥ 4` → +0.025 por wave
  - Máximo acumulado: +0.15 (wave 10)
- Exemplo: wave 7 → baseChance + 0.075

## Fragmentation Rules by Variant

| Variant   | Large       | Medium      | Small |
|-----------|-------------|-------------|-------|
| default   | [3, 4]      | [2, 3]      | [0, 0]|
| denseCore | [2, 3]      | [2, 2]      | [0, 0]|
| volatile  | [3, 4]      | [3, 4]      | [0, 0]|
| parasite  | [3, 4]      | [3, 3]      | [0, 0]|
| crystal   | [4, 4]      | [3, 4]      | [0, 0]|

- Velocidade herdada: `inheritVelocity` aplicado sobre `vx/vy` do asteroide pai
- `radialDistanceRange` e `speedMultiplierBySize` definem o envelope das
  velocidades residuais após remover a contribuição herdada

## Wave State Counters Behavior

1. **Início da wave**: `isActive = true`, `asteroidsSpawned = 0`, `asteroidsKilled = 0`
2. **Durante a wave**: `asteroidsSpawned` incrementa a cada spawn (inclui
   fragmentos), `asteroidsKilled` soma após destruição
3. **Fragmentação**: `totalAsteroids` e `asteroidsSpawned` aumentam pelo número
   de fragmentos
4. **Conclusão**: wave encerra quando `asteroidsKilled ≥ totalAsteroids` e não
   restam inimigos ativos (`getActiveEnemyCount() === 0`)

## Special Variant Behaviors

- **Volatile:** explosão em área (radius 85, damage 35)
- **Parasite:** comportamento de perseguição (disponível a partir da wave 4)
- **Gold:** ~0.4-0.5%, baixa vida (0.4×) e alta velocidade (1.8×)
- **Dense Core:** chance de aparecer em fragmentos de large (30% + wave bonus)

## Determinism Guarantees

- Seeds fixas via `ServiceRegistry.createTestContainer({ randomSeed })`
- Escopos dedicados: `spawn`, `variants`, `fragments`
- `reset()` e `reseedRandomScopes()` restauram sequências determinísticas

## Referências

- `src/modules/EnemySystem.js`
- `src/core/GameConstants.js`
- `src/__tests__/legacy/asteroid-baseline-metrics.test.js`
