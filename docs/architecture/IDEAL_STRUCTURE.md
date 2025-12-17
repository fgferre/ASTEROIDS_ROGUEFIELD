# Ideal Structure Proposal

## 1. Visão Geral

- Inspirações diretas: Brotato (Godot), Vampire Survivors (Unity) e padrões gerais de jogos bullet-heaven.
- Princípios: separação clara entre engine, gameplay e dados; componentes reutilizáveis; configuração orientada a dados; expansão segura de conteúdo.
- Objetivo: permitir adicionar inimigos, armas e mapas criando configurações, sem tocar em sistemas monolíticos.

## 2. Estrutura de Diretórios Proposta

```
src/
├── engine/
│   ├── core/
│   │   ├── EventBus.js
│   │   ├── DIContainer.js
│   │   ├── ObjectPool.js
│   │   ├── GamePools.js
│   │   └── RandomService.js
│   ├── physics/
│   │   ├── SpatialHash.js
│   │   ├── CollisionSystem.js
│   │   └── PhysicsUtils.js
│   ├── rendering/
│   │   ├── RenderBatch.js
│   │   ├── CanvasStateManager.js
│   │   └── GradientCache.js
│   ├── audio/
│   │   ├── AudioBatcher.js
│   │   ├── AudioCache.js
│   │   └── AudioPool.js
│   └── input/
│       └── InputSystem.js
├── game/
│   ├── systems/
│   │   ├── PlayerSystem.js
│   │   ├── CombatSystem.js
│   │   ├── EnemySpawnSystem.js
│   │   ├── WaveSystem.js
│   │   ├── ProgressionSystem.js
│   │   ├── WorldSystem.js
│   │   └── UISystem.js
│   ├── entities/
│   │   ├── BaseEnemy.js
│   │   ├── BaseWeapon.js
│   │   ├── BasePickup.js
│   │   └── BaseProjectile.js
│   ├── components/
│   │   ├── MovementComponent.js
│   │   ├── WeaponComponent.js
│   │   ├── BehaviorComponent.js
│   │   ├── RenderComponent.js
│   │   ├── CollisionComponent.js
│   │   └── HealthComponent.js
│   └── enemies/
│       ├── Asteroid.js
│       ├── Drone.js
│       ├── Boss.js
│       ├── Hunter.js
│       └── Mine.js
├── data/
│   ├── enemies/
│   │   ├── index.js
│   │   ├── asteroid.js
│   │   ├── drone.js
│   │   ├── boss.js
│   │   ├── hunter.js
│   │   └── mine.js
│   ├── weapons/
│   │   └── index.js
│   ├── upgrades/
│   │   ├── index.js
│   │   ├── categories.js
│   │   ├── offense.js
│   │   ├── defense.js
│   │   ├── mobility.js
│   │   └── utility.js
│   ├── waves/
│   │   ├── index.js
│   │   └── wave-configs.js
│   ├── constants/
│   │   ├── physics.js
│   │   ├── gameplay.js
│   │   └── visual.js
│   └── ui/
│       └── hudLayout.js
├── services/
│   ├── GameSessionService.js
│   └── CommandQueueService.js
├── bootstrap/
│   ├── serviceManifest.js
│   └── bootstrapServices.js
└── utils/
    ├── ScreenShake.js
    ├── PerformanceMonitor.js
    └── randomHelpers.js
```

## 3. Separação Engine/Game/Data

- **Engine**: serviços e sistemas genéricos reutilizáveis em qualquer jogo (eventos, DI, física, render, áudio, input, pooling).
- **Game**: lógica específica deste título (sistemas de gameplay, entidades base, inimigos concretos).
- **Data**: configurações data-driven (inimigos, armas, upgrades, waves, constantes, layout de UI).
- Benefícios: engine pode virar biblioteca independente; game foca em regras de gameplay; dados podem ser mantidos por game designers.

## 4. Sistema de Componentes Reutilizáveis

- **MovementComponent**: estratégias (`linear`, `tracking`, `patrol`, `orbit`, `zigzag`) configuradas por velocidade, aceleração, limites.
- **WeaponComponent**: padrões de disparo (`single`, `burst`, `spread`, `spiral`) com dano, velocidade de projétil, cooldown, spread.
- **BehaviorComponent**: comportamentos de IA (`aggressive`, `defensive`, `support`, `kamikaze`) com máquinas de estado.
- **RenderComponent**: estratégias (`sprite`, `procedural`, `particle`) com efeitos (`glow`, `pulse`, `trail`).
- **CollisionComponent**: formatos (`circle`, `polygon`, `compound`) com respostas (`bounce`, `damage`, `destroy`).
- **HealthComponent**: vida base, armadura, escudos, modificadores de dano, invulnerabilidade temporária.

## 5. Exemplo de Criação de Inimigo Data-Driven

```javascript
// data/enemies/drone.js
export default {
  id: 'drone',
  type: 'enemy',
  tags: ['hostile', 'ranged'],
  components: {
    movement: {
      type: 'tracking',
      speed: 180,
      acceleration: 220,
      maxSpeed: 200,
    },
    weapon: {
      pattern: 'single',
      damage: 15,
      speed: 340,
      cooldown: 2,
      spread: 0.1,
    },
    render: {
      type: 'procedural',
      shape: 'triangle',
      size: 12,
      colors: {
        body: '#5b6b7a',
        accent: '#a6e8ff',
      },
    },
    collision: {
      shape: 'circle',
      radius: 12,
      damage: 12,
    },
    health: {
      base: 30,
      scaling: 1.15,
    },
  },
  rewards: {
    xp: 10,
    dropChance: 0.15,
  },
};
```

## 6. Configuração Orientada a Dados

- Inimigos: cada tipo define componentes e recompensas em `data/enemies/*`.
- Armas: padrões de fogo, modificadores e evoluções em `data/weapons/*`.
- Upgrades: categorias e níveis em `data/upgrades/*`.
- Waves: composição, pacing e dificuldade em `data/waves/*`.
- Constantes: física, gameplay e visuais em `data/constants/*`.
- Benefício: balanceamento e ajustes sem alterações em código de sistemas.

## 7. Sistema de Fragmentação Reutilizável

- Extrair lógica de fragmentação para `game/systems/FragmentationSystem.js`.
- Configuração exemplo:

```javascript
fragmentation: {
  enabled: true,
  minFragments: 2,
  maxFragments: 4,
  sizeMultiplier: 0.5,
  velocityInherit: 0.7,
  velocitySpread: 50
}
```

- Permite que qualquer inimigo (não só asteroides) utilize fragmentação com parâmetros customizados.

## 8. Fluxo para Adicionar Novo Inimigo

1. Criar arquivo em `data/enemies/nome-do-inimigo.js` com componentes e recompensas.
2. Registrar configuração no índice de inimigos (`data/enemies/index.js`).
3. Registrar no `EnemyFactory` via manifesto para pooling.
4. Associar a waves (`data/waves/wave-configs.js`).
5. Nenhuma mudança em `EnemySystem` ou criação de novas classes é necessária.

## 9. Comparação com Jogos Similares

- **Brotato**
  - `singletons/` ↔ `engine/core/`.
  - `items/`, `weapons/` ↔ `data/weapons/`, `data/upgrades/`.
  - `entities/units/enemies/` ↔ `game/entities/`, `data/enemies/`.
- **Vampire Survivors**
  - ScriptableObjects ↔ arquivos JS de configuração.
  - Pooling pesado ↔ `engine/core/GamePools.js`.
  - Event/observer ↔ `engine/core/EventBus.js`.

## 10. Benefícios Esperados

- Escalabilidade: adicionar conteúdo com pouca fricção.
- Manutenibilidade: arquivos menores, responsabilidades claras.
- Reutilização: componentes e sistemas genéricos.
- Testabilidade: engine testável isoladamente; game foca em integrações.
- Balanceamento: ajustes via dados; designers podem iterar sem tocar em código.
- Colaboração: agentes e pessoas sabem exatamente onde trabalhar.

## 11. Referências

- Estrutura atual: `docs/architecture/CURRENT_STRUCTURE.md`.
- Arquivos base: `src/modules/enemies/types/Asteroid.js`, `src/modules/enemies/base/BaseEnemy.js`, `src/modules/enemies/base/EnemyFactory.js`, `src/data/upgrades.js`.
- Inspirações externas: Brotato Modding Notes, arquitetura de bullet-heaven, padrões observados em Vampire Survivors.
