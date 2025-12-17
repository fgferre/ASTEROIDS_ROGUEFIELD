# Asteroid Baseline Metrics

## Introdução

Este documento registra as métricas "golden" do sistema legado de asteroides
(`EnemySystem`) para garantir paridade funcional durante a migração para o
`WaveManager`. Os dados foram capturados em 2024-06-11 utilizando a suíte de
testes `src/__tests__/legacy/asteroid-baseline-metrics.test.js` com seed
fixa `123456`.

## Wave Spawn Rate (Waves 1-10)

| Wave | Total Asteroids | Fórmula                                |
| ---- | --------------- | -------------------------------------- |
| 1    | 4               | 4 × 1.3^0 = 4                          |
| 2    | 5               | 4 × 1.3^1 = 5.20 → floor = 5           |
| 3    | 6               | 4 × 1.3^2 = 6.76 → floor = 6           |
| 4    | 8               | 4 × 1.3^3 = 8.79 → floor = 8           |
| 5    | 11              | 4 × 1.3^4 = 11.43 → floor = 11         |
| 6    | 14              | 4 × 1.3^5 = 14.85 → floor = 14         |
| 7    | 19              | 4 × 1.3^6 = 19.31 → floor = 19         |
| 8    | 25              | 4 × 1.3^7 = 25.10 → floor = 25 → clamp |
| 9    | 25              | 4 × 1.3^8 = 32.63 → floor = 32 → clamp |
| 10   | 25              | 4 × 1.3^9 = 42.41 → floor = 42 → clamp |

> Nota: valores calculados com `Math.floor` e limitados pelo teto
> interno de 25 asteroides por wave no legado.

## Size Distribution

- **Large:** 50% (`rand < 0.5`)
- **Medium:** 30% (`0.5 ≤ rand < 0.8`)
- **Small:** 20% (`rand ≥ 0.8`)
- Tolerância estatística: ±2% em amostras de 1000 asteroides determinísticas

## Variant Distribution by Size and Wave

### Wave 1 (baseline, Parasite bloqueado)

| Size   | Special Chance | Common | Iron   | Dense Core | Volatile | Gold  | Crystal |
| ------ | -------------- | ------ | ------ | ---------- | -------- | ----- | ------- |
| Large  | 35%            | 65.00% | 11.25% | 12.50%     | 9.17%    | 0%    | 2.08%   |
| Medium | 25%            | 75.00% | 8.82%  | 5.88%      | 7.35%    | 0.59% | 2.35%   |
| Small  | 15%            | 85.00% | 6.56%  | –          | 5.62%    | 0.38% | 2.44%   |

### Wave Scaling

- `computeVariantWaveBonus(wave)`
  - `wave < 4` → 0
  - `wave ≥ 4` → +0.025 por wave
  - Máximo acumulado: +0.15 (wave 10)
- Exemplo: wave 7 → baseChance + 0.075

### Wave 4 (Parasite habilitado, +0.025 de bônus)

| Size   | Special Chance | Common | Iron   | Dense Core | Volatile | Parasite | Gold  | Crystal |
| ------ | -------------- | ------ | ------ | ---------- | -------- | -------- | ----- | ------- |
| Large  | 37.5%          | 62.50% | 10.13% | 11.25%     | 8.25%    | 6.00%    | 0%    | 1.88%   |
| Medium | 27.5%          | 72.50% | 8.25%  | 5.50%      | 6.88%    | 4.13%    | 0.55% | 2.20%   |
| Small  | 17.5%          | 82.50% | 6.13%  | –          | 5.25%    | 3.50%    | 0.35% | 2.28%   |

## Fragmentation Rules by Variant

| Variant   | Large  | Medium | Small  |
| --------- | ------ | ------ | ------ |
| default   | [3, 4] | [2, 3] | [0, 0] |
| denseCore | [2, 3] | [2, 2] | [0, 0] |
| volatile  | [3, 4] | [3, 4] | [0, 0] |
| parasite  | [3, 4] | [3, 3] | [0, 0] |
| crystal   | [4, 4] | [3, 4] | [0, 0] |

- Velocidade herdada: `inheritVelocity` aplicado sobre `vx/vy` do asteroide pai
- `radialDistanceRange` e `speedMultiplierBySize` definem o envelope das
  velocidades residuais após remover a contribuição herdada

## Average Fragment Output

- Amostragem determinística com 800 destruições por tamanho (wave 6)
- Envelope teórico derivado de `ASTEROID_FRAGMENT_RULES` + distribuição de variantes:
  - **Large:** média esperada ≈ **3.38** fragmentos com intervalo **[2.89, 3.87]**
  - **Medium:** média esperada ≈ **2.61** fragmentos com intervalo **[2.16, 3.05]**
  - **Small:** média esperada = **0** fragmentos (sem fragmentação)
- As execuções baseline ficam dentro desses intervalos, com tolerância de ±0.25 sobre a média para acomodar ajustes mínimos nos pesos ou regras.

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

## Migração para WaveManager (WAVE-006)

### Flags de Compatibilidade

Para preservar comportamento baseline durante migração:

- `USE_WAVE_MANAGER = true` - Ativa WaveManager (WAVE-002)
- `WAVEMANAGER_HANDLES_ASTEROID_SPAWN = true` - WaveManager controla spawn de asteroides
- `PRESERVE_LEGACY_SIZE_DISTRIBUTION = true` - Usa distribuição 50/30/20 (não 30/40/30)
- `PRESERVE_LEGACY_POSITIONING = true` - Spawn nas 4 bordas (não safe distance)
- `STRICT_LEGACY_SPAWN_SEQUENCE = true` - Reutiliza o mesmo stream de randomização para posição e tamanho (paridade com legado)

### Comportamento Esperado

**Com todas as flags ativadas:**

- Taxa de spawn: idêntica ao baseline (4 × 1.3^(wave-1))
- Distribuição de tamanhos: 50/30/20 (large/medium/small)
- Variant decision: via `EnemySystem.decideVariant()` (preserva wave bonus, allowed sizes)
- Posicionamento: 4 bordas (top/right/bottom/left) com margin=80
- Ordem de spawn: posição e tamanho utilizam o mesmo stream `spawn`, preservando a sequência determinística por seed
- Fragmentação: contabilizada automaticamente por `WaveManager.onEnemyDestroyed()`
- Random scopes: `spawn`, `variants`, `fragments` (determinismo preservado)

**Divergências Intencionais (quando flags desativadas):**

- Distribuição 30/40/30: otimizada para mix com drones/mines/hunters
- Safe distance positioning: evita spawn muito próximo do player
- Variant decision simplificada: `WaveManager.selectRandomVariant()` (não recomendado)

### Validação

Executar testes baseline com flags ativadas:

```
# Ativar flags em GameConstants.js
USE_WAVE_MANAGER = true
WAVEMANAGER_HANDLES_ASTEROID_SPAWN = true
PRESERVE_LEGACY_SIZE_DISTRIBUTION = true
PRESERVE_LEGACY_POSITIONING = true
STRICT_LEGACY_SPAWN_SEQUENCE = true

# Executar testes
npm run test:baseline
```

**Critério de sucesso:** Todos os testes devem passar com métricas idênticas ao baseline.

### Próximos Passos

Após validação completa:

1. Manter flags ativadas por 1-2 semanas em produção
2. Monitorar telemetria e feedback de usuários
3. Considerar remoção de `handleSpawning()` legado
4. Atualizar flags para valores otimizados (30/40/30, safe distance)
5. Remover flags após estabilização

### Referências

- Plano de migração: `docs/plans/phase1-enemy-foundation-plan.md` (WAVE-006)
- Código WaveManager: `src/modules/enemies/managers/WaveManager.js`
- Código legado: `src/modules/EnemySystem.js` (handleSpawning linhas 1938-1955)
