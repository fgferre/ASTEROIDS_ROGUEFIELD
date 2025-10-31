# Godot Migration Guide: Upgrade System

**Status:** Draft
**System:** Upgrade System (Progressive Power-Ups)
**JavaScript Reference:** `src/modules/UpgradeSystem.js` (~886 lines)
**Target:** Godot 4.x (GDScript)

---

## 1. Visão Geral do Sistema

### Conceito
O sistema de upgrades oferece progressão horizontal (escolhas estratégicas) e vertical (power scaling) através de melhorias permanentes aplicadas à nave do jogador. Upgrades são organizados em **4 categorias** (Offense, Defense, Mobility, Utility) com **9 upgrades totais**, cada um possuindo **1-5 níveis progressivos** com efeitos cumulativos.

### Características Principais
- **9 Upgrades Totais:**
  - 3 Offense (plasma, multishot, targeting_suite)
  - 2 Defense (shield, deflector_shield)
  - 3 Mobility (propulsors, rcs_system, braking_system)
  - 1 Utility (magfield)

- **Selection Pool:** Ao level-up, sistema filtra upgrades elegíveis e sorteia 3 opções usando weighted random (Fisher-Yates shuffle com seeded RNG)

- **Prerequisites System:** Upgrades podem requerer player level mínimo ou outros upgrades específicos (global ou level-specific)

- **Effect System:** 2 tipos de efeitos:
  - **Event:** Emite signal que outros sistemas escutam (ex: `upgrade-damage-boost` → CombatSystem aplica multiplier)
  - **Progression:** Modifica XPOrbSystem diretamente (ex: `orbMagnetismRadius` multiply 1.4)

### Propósito no Gameplay
- **Escolhas Estratégicas:** Player seleciona entre 3 opções, criando builds únicos
- **Power Scaling:** Efeitos cumulativos aumentam poder conforme progressão
- **Dependency Chains:** Prerequisites forçam paths específicos (ex: deflector_shield → shield Lv.1)

---

## 2. Estrutura de Dados de Upgrade Definition

### Campos Principais

**Upgrade Definition Structure:**
- `id` (String): Identificador único (ex: "plasma", "multishot", "targeting_suite")
- `category` (String): Categoria ("offense", "defense", "mobility", "utility")
- `icon` (String): Emoji ou ícone (ex: "⚡", "🛡️", "🚀", "🧲")
- `themeColor` (String): Cor hex para UI (ex: "#F6C945")
- `unlockLevel` (int): Player level mínimo para desbloquear (ex: 1, 2, 3)
- `tags` (Array[String]): Tags descritivas (ex: ["dano", "armamento"])
- `prerequisites` (Array[Object]): Requirements globais aplicados a todos os níveis
- `text` (Object): Textos localizados (name, summary, lore, levels)
- `levels` (Array[Object]): Definições de cada nível (rank, effects, prerequisites)

### Text Structure (JavaScript Reference)
```javascript
{
    "name": "Arma de Plasma",
    "summary": "Condensa o canhão principal em plasma superaquecido...",
    "lore": "Tecnologia recuperada dos cascos devastados da frota Perseus...",
    "levels": [
        {
            "title": "Bobina de Fusão",
            "description": "Projéteis padrão causam imediatamente +25% de dano.",
            "highlights": ["Multiplicador aplicado diretamente ao dano base."]
        }
        // ... mais níveis
    ]
}
```

### Level Structure (JavaScript Reference)
```javascript
{
    "rank": 1,
    "effects": [
        {
            "type": "event",
            "event": "upgrade-damage-boost",
            "payload": {"multiplier": 1.25}
        }
    ],
    "prerequisites": []  // Opcional, apenas se houver requirements específicos deste nível
}
```

### Mapeamento GDScript (Resource)

**UpgradeDefinition.gd:**
```gdscript
class_name UpgradeDefinition
extends Resource

@export var id: String = ""
@export var category: String = "offense"
@export var icon: String = "✨"
@export var theme_color: Color = Color("#F6C945")
@export var unlock_level: int = 1
@export var tags: Array[String] = []
@export var prerequisites: Array[UpgradePrerequisite] = []
@export var text: UpgradeText
@export var levels: Array[UpgradeLevel] = []
```

**UpgradeText.gd:**
```gdscript
class_name UpgradeText
extends Resource

@export var name: String = ""
@export var summary: String = ""
@export var lore: String = ""
@export var levels: Array[UpgradeLevelText] = []
```

**UpgradeLevelText.gd:**
```gdscript
class_name UpgradeLevelText
extends Resource

@export var title: String = ""
@export var description: String = ""
@export var highlights: Array[String] = []
```

**UpgradeLevel.gd:**
```gdscript
class_name UpgradeLevel
extends Resource

@export var rank: int = 1
@export var effects: Array[UpgradeEffect] = []
@export var prerequisites: Array[UpgradePrerequisite] = []
```

**UpgradeEffect.gd:**
```gdscript
class_name UpgradeEffect
extends Resource

@export_enum("event", "progression") var type: String = "event"
@export var event: String = ""  # Para type = "event"
@export var property: String = ""  # Para type = "progression"
@export_enum("set", "add", "multiply") var operation: String = "set"  # Para type = "progression"
@export var value: float = 0.0  # Para type = "progression"
@export var payload: Dictionary = {}  # Para type = "event"
```

**UpgradePrerequisite.gd:**
```gdscript
class_name UpgradePrerequisite
extends Resource

@export_enum("player-level", "upgrade") var type: String = "player-level"
@export var level: int = 1  # Para type = "player-level"
@export var id: String = ""  # Para type = "upgrade"
@export var text: String = ""
```

---

## 3. Upgrade Categories (4 Categorias)

### Category Resource Structure

**UpgradeCategory.gd:**
```gdscript
class_name UpgradeCategory
extends Resource

@export var id: String = ""
@export var label: String = ""
@export var description: String = ""
@export var icon: String = "✨"
@export var theme_color: Color = Color("#3399FF")
```

### 3.1. Offense (Ofensiva)
- **ID:** `offense`
- **Label:** "Ofensiva"
- **Description:** "Potencializa o armamento principal e aumenta o dano por disparo."
- **Icon:** ✴️
- **Theme Color:** #F6C945 (amarelo dourado)
- **Upgrades:** plasma, multishot, targeting_suite

**Resource Example (res://data/upgrades/categories/offense.tres):**
```gdscript
[gd_resource type="Resource" script_class="UpgradeCategory"]

[resource]
id = "offense"
label = "Ofensiva"
description = "Potencializa o armamento principal e aumenta o dano por disparo."
icon = "✴️"
theme_color = Color(0.965, 0.788, 0.271, 1.0)  # #F6C945
```

### 3.2. Defense (Defensiva)
- **ID:** `defense`
- **Label:** "Defensiva"
- **Description:** "Fortalece o casco, reforça o escudo e amplia a sobrevivência."
- **Icon:** 🛡️
- **Theme Color:** #4ECDC4 (cyan)
- **Upgrades:** shield, deflector_shield

**Resource Example (res://data/upgrades/categories/defense.tres):**
```gdscript
[gd_resource type="Resource" script_class="UpgradeCategory"]

[resource]
id = "defense"
label = "Defensiva"
description = "Fortalece o casco, reforça o escudo e amplia a sobrevivência."
icon = "🛡️"
theme_color = Color(0.306, 0.804, 0.769, 1.0)  # #4ECDC4
```

### 3.3. Mobility (Mobilidade)
- **ID:** `mobility`
- **Label:** "Mobilidade"
- **Description:** "Aprimora propulsores, aceleração e controle da nave."
- **Icon:** 🛰️
- **Theme Color:** #5DADE2 (azul claro)
- **Upgrades:** propulsors, rcs_system, braking_system

**Resource Example (res://data/upgrades/categories/mobility.tres):**
```gdscript
[gd_resource type="Resource" script_class="UpgradeCategory"]

[resource]
id = "mobility"
label = "Mobilidade"
description = "Aprimora propulsores, aceleração e controle da nave."
icon = "🛰️"
theme_color = Color(0.365, 0.678, 0.886, 1.0)  # #5DADE2
```

### 3.4. Utility (Utilitária)
- **ID:** `utility`
- **Label:** "Utilitária"
- **Description:** "Otimiza coleta, magnetismo e suporte tático."
- **Icon:** 🧲
- **Theme Color:** #C08BFF (roxo claro)
- **Upgrades:** magfield

**Resource Example (res://data/upgrades/categories/utility.tres):**
```gdscript
[gd_resource type="Resource" script_class="UpgradeCategory"]

[resource]
id = "utility"
label = "Utilitária"
description = "Otimiza coleta, magnetismo e suporte tático."
icon = "🧲"
theme_color = Color(0.753, 0.545, 1.0, 1.0)  # #C08BFF
```

---

## 4. Upgrade Catalog (9 Upgrades Completos)

### Tabela Resumida

| ID | Nome | Categoria | Níveis | Unlock Lv | Prerequisites | Efeitos Principais |
|----|------|-----------|--------|-----------|---------------|--------------------|
| plasma | Arma de Plasma | Offense | 3 | 1 | - | Damage +25%→+50%→+70% |
| multishot | Tiro Múltiplo | Offense | 3 | 1 | - | Projectiles +1→+2→+3 |
| targeting_suite | Matriz de Mira | Offense | 3 | 3 | Tier 3: multishot Lv1 | Adaptive→Dynamic→Coordinated |
| shield | Escudo Energético | Defense | 3 | 1 | - | HP +50→+100→+175 |
| deflector_shield | Matriz de Deflexão | Defense | 5 | 2 | shield Lv1 | Active shield 3→4→5 hits |
| propulsors | Propulsores Principais | Mobility | 5 | 1 | - | Speed/Accel boost, Tier 5: ion trail |
| rcs_system | Sistema RCS | Mobility | 5 | 2 | propulsors Lv1 | Rotation boost, Tier 5: strafe |
| braking_system | Sistema de Frenagem | Mobility | 3 | 3 | rcs_system Lv2 | Damping boost, Tier 3: emergency brake |
| magfield | Campo Magnético | Utility | 3 | 1 | - | Magnetism radius +40%→+75%→+105% |

---

### 4.1. Plasma (Arma de Plasma)

**Categoria:** Offense
**Icon:** ⚡
**Unlock Level:** 1
**Max Levels:** 3
**Prerequisites:** Nenhum
**Reference:** `src/data/upgrades/offense.js` (plasma definition)

**Progressão:**

#### Nível 1 - Bobina de Fusão
- **Effect:** Damage +25% (multiplier: 1.25)
- **Event:** `upgrade-damage-boost` com `{multiplier: 1.25}`
- **Highlight:** "Multiplicador aplicado diretamente ao dano base."

#### Nível 2 - Condensadores Geminados
- **Effect:** Damage +50% acumulado (multiplier: 1.2 sobre atual)
- **Event:** `upgrade-damage-boost` com `{multiplier: 1.2}`
- **Cálculo:** 1.25 × 1.2 = 1.5 (total +50%)
- **Highlight:** "Aplica 20% adicionais sobre o dano atual."

#### Nível 3 - Matriz Harmônica
- **Effect:** Damage +70% acumulado (multiplier: 1.15 sobre atual)
- **Event:** `upgrade-damage-boost` com `{multiplier: 1.15}`
- **Cálculo:** 1.5 × 1.15 = 1.725 (total +72.5%, arredondado para +70%)
- **Highlight:** "Fornece multiplicador extra de 15% sobre o valor vigente."

**Lore:** "Tecnologia recuperada dos cascos devastados da frota Perseus. Requer monitoramento constante de temperatura."

**Tags:** ["dano", "armamento"]

---

### 4.2. Multishot (Tiro Múltiplo)

**Categoria:** Offense
**Icon:** 💥
**Unlock Level:** 1
**Max Levels:** 3
**Prerequisites:** Nenhum
**Reference:** `src/data/upgrades/offense.js` (multishot definition)

**Progressão:**

#### Nível 1 - Duas Saídas
- **Effect:** +1 projectile (total: 2)
- **Event:** `upgrade-multishot` com `{bonus: 1}`
- **Highlight:** "Aumenta o volume de fogo instantâneo."

#### Nível 2 - Grade Triangular
- **Effect:** +1 projectile (total: 3)
- **Event:** `upgrade-multishot` com `{bonus: 1}`
- **Highlight:** "Cobre área maior diante da nave."

#### Nível 3 - Barragem Sincronizada
- **Effect:** +1 projectile (total: 4)
- **Event:** `upgrade-multishot` com `{bonus: 1}`
- **Highlight:** "Maximiza saturação em curtas distâncias."

**Lore:** "Módulos reutilizáveis recuperados de satélites militares desativados."

**Tags:** ["projectiles", "armamento"]

---

### 4.3. Targeting Suite (Matriz de Mira)

**Categoria:** Offense
**Icon:** 🎯
**Unlock Level:** 3
**Max Levels:** 3
**Prerequisites:**
- **Global:** Nenhum
- **Nível 3:** multishot (Lv. 1)
**Reference:** `src/data/upgrades/offense.js` (targeting_suite definition)

**Progressão:**

#### Nível 1 - Aquisição Adaptativa
- **Effect:** Ativa danger scoring
- **Event:** `upgrade-aiming-suite` com `{resetWeights: true}`
- **Comportamento:** Prioriza variantes perseguidoras (parasite: 240) e explosivas (volatile: 200)
- **Visual:** Linha de mira pulsa ao fixar novo alvo prioritário
- **Highlight:** "Classifica os inimigos por comportamento, recompensa e direção relativa ao jogador."

#### Nível 2 - Predição Dinâmica
- **Effect:** Ativa ballistic prediction
- **Event:** `upgrade-aiming-suite` com `{dynamicPrediction: {minLeadTime: 0.05, maxLeadTime: 1, fallbackLeadTime: 0.32}}`
- **Comportamento:** Calcula ponto de interceptação usando equação quadrática
- **Visual:** Marca visualmente o ponto previsto de impacto
- **Audio:** Modula levemente o timbre do disparo
- **Highlight:** "Calcula interceptações com base na velocidade real do projétil."

#### Nível 3 - Travas Coordenadas
- **Effect:** Ativa multi-lock (4 canhões)
- **Event:** `upgrade-aiming-suite` com `{multiLockTargets: 4, cooldownMultiplier: 0.92}`
- **Prerequisite:** multishot (Lv. 1)
- **Comportamento:** Coordena até 4 travas, pode concentrar fogo em alvo iminente
- **Visual:** Múltiplos indicadores de lock, offsets paralelos visíveis
- **Audio:** Pitch/sustain escalam com número de canhões ativos
- **Cooldown:** Reduzido para 0.276s (0.3s × 0.92)
- **Highlight:** "Disponível apenas com Tiro Múltiplo instalado (Nv. 1+)."

**Lore:** "Firmware experimental extraído de drones de escolta, calibrado para leitura instantânea de perigo em cenários caóticos."

**Tags:** ["targeting", "ai"]

---

### 4.4. Shield (Escudo Energético)

**Categoria:** Defense
**Icon:** 🛡️
**Unlock Level:** 1
**Max Levels:** 3
**Prerequisites:** Nenhum
**Reference:** `src/data/upgrades/defense.js` (shield definition)

**Progressão:**

#### Nível 1 - Reservas Auxiliares
- **Effect:** HP +50
- **Event:** `upgrade-health-boost` com `{bonus: 50}`
- **Highlight:** "Aplica bônus direto de +50 HP e cura imediata equivalente."

#### Nível 2 - Camada de Grafeno
- **Effect:** HP +50 (total: +100)
- **Event:** `upgrade-health-boost` com `{bonus: 50}`
- **Highlight:** "Bônus cumulativo, totalizando +100 HP adicionais."

#### Nível 3 - Matriz Autorreparadora
- **Effect:** HP +75 (total: +175)
- **Event:** `upgrade-health-boost` com `{bonus: 75}`
- **Highlight:** "Total de +175 HP extras após o terceiro nível."

**Lore:** "Sistema adaptado dos cargueiros Typhon. Opera em paralelo ao escudo defletor ativável."

**Tags:** ["hp", "defesa"]

---

### 4.5. Deflector Shield (Matriz de Deflexão)

**Categoria:** Defense
**Icon:** 💠
**Unlock Level:** 2
**Max Levels:** 5
**Prerequisites:** shield (Lv. 1)
**Reference:** `src/data/upgrades/defense.js` (deflector_shield definition)

**Progressão:**

#### Nível 1 - Campo Inicial
- **Effect:** Active shield 3 hits
- **Event:** `upgrade-deflector-shield` com `{level: 1}`
- **Highlight:** "Libera a habilidade na tecla configurada (padrão: E)."

#### Nível 2 - Placas Reforçadas
- **Effect:** Active shield 4 hits
- **Event:** `upgrade-deflector-shield` com `{level: 2}`
- **Highlight:** "Ideal para aguentar ondas médias sem recarga imediata."

#### Nível 3 - Resfriamento Otimizado
- **Effect:** Cooldown -5s
- **Event:** `upgrade-deflector-shield` com `{level: 3}`
- **Highlight:** "Permite reativações mais frequentes em lutas prolongadas."

#### Nível 4 - Matriz Avançada
- **Effect:** Active shield 5 hits
- **Event:** `upgrade-deflector-shield` com `{level: 4}`
- **Highlight:** "Sustenta confrontos contra enxames agressivos."

#### Nível 5 - Sobrecarga Defletora
- **Effect:** Cooldown reduction adicional
- **Event:** `upgrade-deflector-shield` com `{level: 5}`
- **Highlight:** "Libera recarga rápida para contra-ataques sucessivos."

**Lore:** "Sistema experimental que redistribui energia do reator para um campo direcional rápido."

**Tags:** ["shield", "active", "defesa"]

---

### 4.6. Propulsors (Propulsores Principais)

**Categoria:** Mobility
**Icon:** 🚀
**Unlock Level:** 1
**Max Levels:** 5
**Prerequisites:** Nenhum
**Reference:** `src/data/upgrades/mobility.js` (propulsors definition)

**Progressão:**

#### Nível 1 - Bicos Otimizados
- **Effects:** Accel +12%, Speed +10%
- **Events:**
  - `upgrade-acceleration-boost` com `{multiplier: 1.12}`
  - `upgrade-speed-boost` com `{multiplier: 1.10}`
  - `upgrade-thruster-visual` com `{level: 1}`

#### Nível 2 - Queima Estável
- **Effects:** Accel +25%, Speed +22% (acumulado)
- **Events:**
  - `upgrade-acceleration-boost` com `{multiplier: 1.116}` (total: 1.25)
  - `upgrade-speed-boost` com `{multiplier: 1.109}` (total: 1.22)
  - `upgrade-thruster-visual` com `{level: 2}`

#### Nível 3 - Injeção Dupla
- **Effects:** Accel +45%, Speed +38% (acumulado)
- **Events:**
  - `upgrade-acceleration-boost` com `{multiplier: 1.16}` (total: 1.45)
  - `upgrade-speed-boost` com `{multiplier: 1.131}` (total: 1.38)
  - `upgrade-thruster-visual` com `{level: 3}`

#### Nível 4 - Plasma Superaquecido
- **Effects:** Accel +75%, Speed +60% (acumulado)
- **Events:**
  - `upgrade-acceleration-boost` com `{multiplier: 1.207}` (total: 1.75)
  - `upgrade-speed-boost` com `{multiplier: 1.159}` (total: 1.60)
  - `upgrade-thruster-visual` com `{level: 4}`
- **Visual:** "Chamas brancas visíveis."

#### Nível 5 - Sobrecarga Vetorial
- **Effects:** Accel +110%, Speed +85% (acumulado)
- **Events:**
  - `upgrade-acceleration-boost` com `{multiplier: 1.2}` (total: 2.10)
  - `upgrade-speed-boost` com `{multiplier: 1.156}` (total: 1.85)
  - `upgrade-thruster-visual` com `{level: 5}`
  - `upgrade-ion-trail` com `{enabled: true}`
- **Special:** "Rastro de íons danifica inimigos."

**Lore:** "Sistema modular de propulsão que evolui de bicos calibrados até sobrecarga vetorial de plasma."

**Tags:** ["speed", "acceleration", "mobilidade"]

---

### 4.7. RCS System (Sistema RCS)

**Categoria:** Mobility
**Icon:** 🛰️
**Unlock Level:** 2
**Max Levels:** 5
**Prerequisites:** propulsors (Lv. 1)
**Reference:** `src/data/upgrades/mobility.js` (rcs_system definition)

**Progressão:**

#### Nível 1 - RCS Básico
- **Effects:** Rotation +15%
- **Events:**
  - `upgrade-rotation-boost` com `{multiplier: 1.15}`
  - `upgrade-rcs-visual` com `{level: 1}`

#### Nível 2 - RCS Ativado
- **Effects:** Rotation +32%, Angular Damping -12%
- **Events:**
  - `upgrade-rotation-boost` com `{multiplier: 1.148}` (total: 1.32)
  - `upgrade-angular-damping` com `{multiplier: 0.88}`
  - `upgrade-rcs-visual` com `{level: 2}`

#### Nível 3 - RCS Aprimorado
- **Effects:** Rotation +55%, Angular Damping -25%
- **Events:**
  - `upgrade-rotation-boost` com `{multiplier: 1.174}` (total: 1.55)
  - `upgrade-angular-damping` com `{multiplier: 0.852}` (total: 0.75)
  - `upgrade-rcs-visual` com `{level: 3}`

#### Nível 4 - RCS Vetorial
- **Effects:** Rotation +90%, Angular Damping -40%
- **Events:**
  - `upgrade-rotation-boost` com `{multiplier: 1.226}` (total: 1.90)
  - `upgrade-angular-damping` com `{multiplier: 0.8}` (total: 0.60)
  - `upgrade-rcs-visual` com `{level: 4}`

#### Nível 5 - RCS Omni-direcional
- **Effects:** Rotation +130%, Strafe movement
- **Events:**
  - `upgrade-rotation-boost` com `{multiplier: 1.211}` (total: 2.30)
  - `upgrade-angular-damping` com `{multiplier: 1.0}` (total: 0.60)
  - `upgrade-rcs-visual` com `{level: 5}`
  - `upgrade-strafe-movement` com `{enabled: true}`
- **Special:** "Movimento independente da orientação."

**Lore:** "Sistema de Controle de Reação recuperado de estações espaciais abandonadas. Permite manobras impossíveis para naves convencionais."

**Tags:** ["rotation", "control", "mobilidade"]

---

### 4.8. Braking System (Sistema de Frenagem)

**Categoria:** Mobility
**Icon:** ⚙️
**Unlock Level:** 3
**Max Levels:** 3
**Prerequisites:** rcs_system (Lv. 2)
**Reference:** `src/data/upgrades/mobility.js` (braking_system definition)

**Progressão:**

#### Nível 1 - Freios Inerciais
- **Effects:** Linear Damping +30%
- **Events:**
  - `upgrade-linear-damping` com `{multiplier: 1.3}`
  - `upgrade-braking-visual` com `{level: 1}`

#### Nível 2 - Retroimpulsores
- **Effects:** Linear Damping +60%
- **Events:**
  - `upgrade-linear-damping` com `{multiplier: 1.231}` (total: 1.60)
  - `upgrade-braking-visual` com `{level: 2}`

#### Nível 3 - Freio de Emergência
- **Effects:** Linear Damping +100%, Emergency brake ability
- **Events:**
  - `upgrade-linear-damping` com `{multiplier: 1.25}` (total: 2.00)
  - `upgrade-braking-visual` com `{level: 3}`
  - `upgrade-emergency-brake` com `{enabled: true}`
- **Special:** "Tecla dedicada (Shift) para parada instantânea com onda de choque."

**Lore:** "Tecnologia de mineração adaptada para combate. Permite paradas impossíveis e mudanças bruscas de direção."

**Tags:** ["damping", "brake", "mobilidade"]

---

### 4.9. Magfield (Campo Magnético)

**Categoria:** Utility
**Icon:** 🧲
**Unlock Level:** 1
**Max Levels:** 3
**Prerequisites:** Nenhum
**Reference:** `src/data/upgrades/utility.js` (magfield definition)

**Progressão:**

#### Nível 1 - Lentes de Fluxo
- **Effects:** Magnetism radius +40%, force +35%
- **Effects (type: 'progression'):**
  - `orbMagnetismRadius` multiply 1.4
  - `magnetismForce` multiply 1.35
- **Event:** `upgrade-magnetism` com `{multiplier: 1.4}`

#### Nível 2 - Catalisador Duplo
- **Effects:** Magnetism radius +75%, force +68% (acumulado)
- **Effects (type: 'progression'):**
  - `orbMagnetismRadius` multiply 1.25 (total: 1.75)
  - `magnetismForce` multiply 1.25 (total: 1.69)
- **Event:** `upgrade-magnetism` com `{multiplier: 1.25}`

#### Nível 3 - Trama de Harmonia
- **Effects:** Magnetism radius +105%, force +94% (acumulado)
- **Effects (type: 'progression'):**
  - `orbMagnetismRadius` multiply 1.15 (total: 2.01)
  - `magnetismForce` multiply 1.15 (total: 1.94)
- **Event:** `upgrade-magnetism` com `{multiplier: 1.15}`

**Lore:** "Bobinas recalibradas com ligas leves permitem magnetismo estável mesmo durante manobras bruscas."

**Tags:** ["magnetism", "coleta"]

**Nota sobre Progression Effects:**
Este é o único upgrade que usa `type: 'progression'` para modificar diretamente o XPOrbSystem. Todos os outros usam `type: 'event'` para emitir signals.

---

## 5. Effect System (Sistema de Efeitos)

### Conceito
Upgrades executam **effects** ao serem aplicados. Existem 2 tipos de effects:
- **Event:** Emite signal que outros sistemas escutam
- **Progression:** Modifica XPOrbSystem diretamente

Effects são executados em ordem sequencial, e cada effect tem payload específico que sistemas consumidores interpretam.

**Reference:** `src/modules/UpgradeSystem.js` linhas 783-811 (`applyUpgradeEffects`)

---

### 5.1. Event Effects (Tipo: 'event')

**Estrutura:**
```javascript
{
    "type": "event",
    "event": "upgrade-damage-boost",
    "payload": {"multiplier": 1.25}
}
```

**Comportamento:**
1. Valida se `effect.event` é string válida
2. Merge payload com metadata do upgrade (upgradeId, level, category)
3. Emite signal via EventBus: `EventBus.emit_signal(effect.event, payload)`
4. Sistemas específicos escutam e aplicam efeito

**Pseudocódigo GDScript:**
```gdscript
func apply_upgrade_effects(definition: UpgradeDefinition, level_definition: UpgradeLevel, new_level: int) -> void:
    for effect in level_definition.effects:
        if not effect:
            continue

        var effect_type = effect.type if effect.type else "event"

        if effect_type == "progression":
            apply_progression_effect(effect)
            continue

        if effect_type == "event" and effect.event:
            var payload = effect.payload.duplicate() if effect.payload else {}
            payload["upgradeId"] = definition.id
            payload["level"] = new_level
            payload["category"] = definition.category

            EventBus.emit_signal(effect.event, payload)
            continue

        push_warning("Unknown upgrade effect type: %s" % effect_type)
```

**Eventos Emitidos (Catalog):**

| Event Name | Payload | Sistema Consumidor | Efeito |
|------------|---------|-------------------|--------|
| `upgrade-damage-boost` | `{multiplier: float}` | CombatSystem | Multiplica damage base |
| `upgrade-multishot` | `{bonus: int}` | CombatSystem | Adiciona projectiles |
| `upgrade-aiming-suite` | `{resetWeights?, dynamicPrediction?, multiLockTargets?, cooldownMultiplier?}` | CombatSystem | Configura targeting system |
| `upgrade-health-boost` | `{bonus: int}` | PlayerSystem | Aumenta max HP + cura |
| `upgrade-deflector-shield` | `{level: int}` | PlayerSystem | Configura active shield |
| `upgrade-acceleration-boost` | `{multiplier: float}` | PlayerSystem | Multiplica acceleration |
| `upgrade-speed-boost` | `{multiplier: float}` | PlayerSystem | Multiplica max speed |
| `upgrade-rotation-boost` | `{multiplier: float}` | PlayerSystem | Multiplica rotation speed |
| `upgrade-angular-damping` | `{multiplier: float}` | PlayerSystem | Multiplica angular damping |
| `upgrade-linear-damping` | `{multiplier: float}` | PlayerSystem | Multiplica linear damping |
| `upgrade-thruster-visual` | `{level: int}` | EffectsSystem | Atualiza visual de thruster |
| `upgrade-rcs-visual` | `{level: int}` | EffectsSystem | Atualiza visual de RCS |
| `upgrade-braking-visual` | `{level: int}` | EffectsSystem | Atualiza visual de braking |
| `upgrade-ion-trail` | `{enabled: bool}` | EffectsSystem | Ativa ion trail damage |
| `upgrade-strafe-movement` | `{enabled: bool}` | PlayerSystem | Ativa movimento lateral |
| `upgrade-emergency-brake` | `{enabled: bool}` | PlayerSystem | Ativa emergency brake |
| `upgrade-magnetism` | `{multiplier: float}` | XPOrbSystem | Multiplica magnetism (redundante com progression) |

---

### 5.2. Progression Effects (Tipo: 'progression')

**Estrutura:**
```javascript
{
    "type": "progression",
    "property": "orbMagnetismRadius",
    "operation": "multiply",
    "value": 1.4
}
```

**Comportamento:**
1. Valida `property` e `value`
2. Resolve XPOrbSystem via service injection
3. Aplica operação (set, add, multiply) na propriedade
4. Chama setter method se disponível (ex: `setMagnetismRadius()`)

**Operações Suportadas:**
- **set:** `property = value`
- **add:** `property = current + value`
- **multiply:** `property = current × value`

**Propriedades Suportadas:**
- `orbMagnetismRadius`: Raio de atração de XP orbs
- `magnetismForce`: Força de atração de XP orbs

**Pseudocódigo GDScript:**
```gdscript
func apply_progression_effect(effect: UpgradeEffect) -> void:
    if not effect or not effect.property:
        return

    var property = effect.property
    var value = effect.value
    if not is_finite(value):
        return

    var operation = effect.operation if effect.operation else "set"
    var xp_system = get_node("/root/XPOrbManager")  # Ou via ServiceLocator

    if not xp_system:
        return

    # Aplica operação
    var apply_numeric_operation = func(current: float, modifier: float) -> float:
        match operation:
            "multiply":
                return current * modifier
            "add":
                return current + modifier
            "set", _:
                return modifier

    if property == "orbMagnetismRadius":
        var current = xp_system.get_magnetism_radius() if xp_system.has_method("get_magnetism_radius") else xp_system.orb_magnetism_radius
        var next_radius = apply_numeric_operation.call(current, value)
        if xp_system.has_method("set_magnetism_radius"):
            xp_system.set_magnetism_radius(next_radius)
        return

    if property == "magnetismForce":
        var current = xp_system.get_magnetism_force() if xp_system.has_method("get_magnetism_force") else xp_system.magnetism_force
        var next_force = apply_numeric_operation.call(current, value)
        if xp_system.has_method("set_magnetism_force"):
            xp_system.set_magnetism_force(next_force)
        return

    push_warning("Unknown progression property: %s" % property)
```

**Implementação Godot:**
- Usar `type: 'progression'` apenas para propriedades de XPOrbSystem
- Preferir `type: 'event'` para todos os outros casos (mais desacoplado)
- Validar property name antes de aplicar

---

## 6. Prerequisites System (Sistema de Pré-requisitos)

### Conceito
Prerequisites podem ser **globais** (aplicados a todos os níveis) ou **level-specific** (apenas para aquele nível). Existem 2 tipos:
- **player-level:** Requer level mínimo
- **upgrade:** Requer outro upgrade no nível especificado

Validação em cascata: unlock level → global prerequisites → level prerequisites. Upgrade só é elegível se TODAS as validações passarem.

**Reference:** `src/modules/UpgradeSystem.js` linhas 189-320

---

### 6.1. Tipos de Prerequisites

**Player-Level:**
```javascript
{
    "type": "player-level",
    "level": 3,
    "text": "Disponível a partir do level 3."
}
```

**Upgrade:**
```javascript
{
    "type": "upgrade",
    "id": "multishot",
    "level": 1,
    "text": "Requer Tiro Múltiplo instalado (Nv. 1)."
}
```

---

### 6.2. Normalize Prerequisite

**Algoritmo:**
1. Se prerequisite é string: converte para `{type: 'upgrade', id: string, level: 1}`
2. Se prerequisite é object:
   - Detecta type: 'player-level', 'playerlevel', 'level' → normaliza para 'player-level'
   - Detecta type: 'upgrade' (default)
   - Extrai level de múltiplos campos (level, value, minLevel)
   - Extrai id de múltiplos campos (id, upgradeId, key)
3. Retorna prerequisite normalizado ou null se inválido

**Pseudocódigo GDScript:**
```gdscript
func normalize_prerequisite(prerequisite: Variant) -> Dictionary:
    if not prerequisite:
        return {}

    # String shorthand: "multishot" → {type: "upgrade", id: "multishot", level: 1}
    if prerequisite is String:
        return {
            "type": "upgrade",
            "id": prerequisite,
            "level": 1,
            "text": ""
        }

    if not prerequisite is Dictionary:
        return {}

    var raw_type = prerequisite.get("type", "upgrade").to_lower()

    # Player-level prerequisite
    if raw_type in ["player-level", "playerlevel", "level"]:
        var level_value = prerequisite.get("level", prerequisite.get("value", prerequisite.get("minLevel", 1)))
        var level = max(1, int(floor(level_value))) if is_finite(level_value) else 1
        return {
            "type": "player-level",
            "level": level,
            "text": prerequisite.get("text", prerequisite.get("description", ""))
        }

    # Upgrade prerequisite
    var id = prerequisite.get("id", prerequisite.get("upgradeId", prerequisite.get("key", "")))
    if not id:
        return {}

    var level_value = prerequisite.get("level", prerequisite.get("minLevel", prerequisite.get("value", 1)))
    var level = max(1, int(floor(level_value))) if is_finite(level_value) else 1

    return {
        "type": "upgrade",
        "id": id,
        "level": level,
        "text": prerequisite.get("text", prerequisite.get("description", ""))
    }
```

---

### 6.3. Evaluate Prerequisite

**Algoritmo:**
1. Se prerequisite é null/empty: retorna true (sem requirement)
2. Se type == 'player-level': valida `currentLevel >= prerequisite.level`
3. Se type == 'upgrade': valida `getUpgradeCount(prerequisite.id) >= prerequisite.level`
4. Caso contrário: retorna true (unknown type = assume met)

**Pseudocódigo GDScript:**
```gdscript
func evaluate_prerequisite(prerequisite: Dictionary) -> bool:
    if not prerequisite or prerequisite.is_empty():
        return true

    if prerequisite.type == "player-level":
        return level >= prerequisite.get("level", 1)

    if prerequisite.type == "upgrade":
        var required_level = prerequisite.get("level", 1)
        return get_upgrade_count(prerequisite.id) >= required_level

    return true

func get_upgrade_count(upgrade_id: String) -> int:
    return applied_upgrades.get(upgrade_id, 0)
```

---

### 6.4. Collect Prerequisites

**Algoritmo:**
1. **Global Prerequisites:** Extrai de `definition.prerequisites`
2. **Level Prerequisites:** Extrai de `definition.levels[currentLevel].prerequisites`
3. Normaliza cada entry
4. Retorna array de prerequisites normalizados

**Pseudocódigo GDScript:**
```gdscript
func collect_raw_prerequisites(definition: UpgradeDefinition, options: Dictionary = {}) -> Array:
    if not definition:
        return []

    var include_unlock = options.get("includeUnlock", false)
    var result = []

    # Unlock level como prerequisite
    if include_unlock and is_finite(definition.unlock_level) and definition.unlock_level > 1:
        result.append({
            "type": "player-level",
            "level": max(1, int(floor(definition.unlock_level))),
            "text": "Disponível a partir do level %d." % definition.unlock_level
        })

    # Global prerequisites
    for entry in definition.prerequisites:
        var normalized = normalize_prerequisite(entry)
        if normalized and not normalized.is_empty():
            result.append(normalized)

    return result

func collect_level_prerequisites(definition: UpgradeDefinition, level_index: int) -> Array:
    if not definition:
        return []

    var next_level_index = max(0, int(floor(level_index))) if is_finite(level_index) else 0

    if next_level_index >= definition.levels.size():
        return []

    var level_definition = definition.levels[next_level_index]
    if not level_definition or not level_definition.prerequisites:
        return []

    var result = []
    for entry in level_definition.prerequisites:
        var normalized = normalize_prerequisite(entry)
        if normalized and not normalized.is_empty():
            result.append(normalized)

    return result
```

**Implementação Godot:**
- Usar `Array[UpgradePrerequisite]` para type safety
- Validar prerequisites antes de exibir upgrade option
- Renderizar prerequisites não atendidos em vermelho na UI

---

## 7. Selection Algorithm (Algoritmo de Seleção)

### Conceito
Ao level-up, sistema prepara N opções de upgrade (padrão: 3). Filtra upgrades elegíveis (não maxados, prerequisites atendidos), shuffles lista usando Fisher-Yates com seeded RNG (determinístico), seleciona top N da lista shuffled, e mapeia para `buildUpgradeOption()` (adiciona metadata).

**Reference:** `src/modules/UpgradeSystem.js` linhas 95-143 (`prepareUpgradeOptions`)

**Algoritmo:**
1. Filtra `upgradeDefinitions` usando `isUpgradeSelectable()`
2. Se pool vazio, retorna `{options: [], poolSize: 0}`
3. Valida count (default: 3, clamps em pool size)
4. Shuffles pool usando Fisher-Yates com seeded RNG
5. Seleciona top N
6. Mapeia para `buildUpgradeOption()` (adiciona currentLevel, nextLevel, prerequisites)
7. Armazena em `pendingUpgradeOptions`
8. Retorna `{options, poolSize, totalDefinitions}`

**Pseudocódigo GDScript:**
```gdscript
func prepare_upgrade_options(count: int = 3) -> Dictionary:
    # Filtra elegíveis
    var eligible = []
    for definition in upgrade_definitions:
        if is_upgrade_selectable(definition):
            eligible.append(definition)

    var fallback_count = 3
    var requested = max(0, int(count)) if is_finite(count) else fallback_count
    var desired = requested if requested > 0 else fallback_count
    var capped_count = min(desired, eligible.size())

    if eligible.is_empty() or capped_count == 0:
        pending_upgrade_options = []
        return {
            "options": [],
            "poolSize": 0,
            "totalDefinitions": upgrade_definitions.size()
        }

    # Shuffles com seeded RNG (Fisher-Yates)
    var rng = random_service.get_fork("upgrades.selection")
    var pool = eligible.duplicate()

    for i in range(pool.size() - 1, 0, -1):
        var swap_index = rng.randi_range(0, i)
        var temp = pool[i]
        pool[i] = pool[swap_index]
        pool[swap_index] = temp

    # Seleciona top N
    var selection = pool.slice(0, capped_count)
    var options = []
    for definition in selection:
        var option = build_upgrade_option(definition)
        if option:
            options.append(option)

    pending_upgrade_options = options

    return {
        "options": options,
        "poolSize": eligible.size(),
        "totalDefinitions": upgrade_definitions.size()
    }
```

**Fisher-Yates Shuffle:**
- Algoritmo in-place que garante distribuição uniforme
- Usa seeded RNG para determinismo (mesma seed = mesma ordem)
- Complexidade: O(n)

**Implementação Godot:**
- Usar `RandomNumberGenerator` com seed para RNG
- Ou usar `random_service.get_fork("upgrades.selection")` (ver `docs/godot-migration/mechanics-random.md`)
- Cachear eligible pool para evitar recalcular

---

## 8. Is Upgrade Selectable (Validação de Elegibilidade)

### Conceito
Valida se upgrade pode ser selecionado no level-up atual. 5 camadas de validação (early return se qualquer falhar):
1. Definition válido
2. Não maxado (currentLevel < maxLevel)
3. Unlock level atingido (playerLevel >= unlockLevel)
4. Global prerequisites atendidos
5. Level prerequisites atendidos

**Reference:** `src/modules/UpgradeSystem.js` linhas 150-187 (`isUpgradeSelectable`)

**Pseudocódigo GDScript:**
```gdscript
func is_upgrade_selectable(definition: UpgradeDefinition) -> bool:
    if not definition:
        return false

    # 1. Verifica se maxado
    var max_level = definition.levels.size()
    var current_level = get_upgrade_count(definition.id)

    if max_level > 0 and current_level >= max_level:
        return false

    # 2. Verifica unlock level
    if is_finite(definition.unlock_level) and level < definition.unlock_level:
        return false

    # 3. Valida global prerequisites
    var prerequisites = collect_raw_prerequisites(definition)
    for requirement in prerequisites:
        if not evaluate_prerequisite(requirement):
            return false

    # 4. Valida level prerequisites
    var level_requirements = collect_level_prerequisites(definition, current_level)
    for requirement in level_requirements:
        if not evaluate_prerequisite(requirement):
            return false

    return true
```

**Exemplo de Validação (targeting_suite Tier 3):**
1. Definition válido? ✅
2. currentLevel (2) < maxLevel (3)? ✅
3. playerLevel (5) >= unlockLevel (3)? ✅
4. Global prerequisites: Nenhum ✅
5. Level prerequisites: multishot (Lv. 1)?
   - getUpgradeCount("multishot") >= 1?
   - Se sim: ✅ Elegível
   - Se não: ❌ Não elegível

**Implementação Godot:**
- Executar validação ao preparar upgrade options
- Cachear resultado para evitar recalcular
- Exibir prerequisites não atendidos na UI (tooltip ou card footer)

---

## 9. Build Upgrade Option (Construção de Opção)

### Conceito
Constrói objeto de opção com metadata completo para UI. Inclui: name, summary, lore, icon, themeColor, category, currentLevel, maxLevel, nextLevel (title, description, highlights), prerequisites. Usado para renderizar upgrade cards na UI.

**Reference:** `src/modules/UpgradeSystem.js` linhas 409-461 (`buildUpgradeOption`)

**Pseudocódigo GDScript:**
```gdscript
func build_upgrade_option(definition: UpgradeDefinition) -> Dictionary:
    if not definition:
        return {}

    var current_level = get_upgrade_count(definition.id)
    var max_level = definition.levels.size()
    var category = resolve_upgrade_category(definition.category)
    var text = definition.text if definition.text else {}
    var level_texts = text.get("levels", [])
    var has_next_level = current_level < max_level
    var next_level_definition = definition.levels[current_level] if has_next_level else null
    var next_level_text = level_texts[current_level] if has_next_level and current_level < level_texts.size() else {}

    var global_prereqs = describe_prerequisites(definition)
    var level_prereqs = describe_level_prerequisites(definition, current_level)

    return {
        "id": definition.id,
        "name": text.get("name", definition.id),
        "summary": text.get("summary", ""),
        "lore": text.get("lore", ""),
        "icon": definition.icon,
        "themeColor": definition.theme_color,
        "category": category,
        "tags": definition.tags,
        "currentLevel": current_level,
        "maxLevel": max_level,
        "unlockLevel": definition.unlock_level,
        "isMaxed": not has_next_level,
        "nextLevel": {
            "rank": next_level_definition.rank if next_level_definition else current_level + 1,
            "title": next_level_text.get("title", "Nível %d" % (current_level + 1)),
            "description": next_level_text.get("description", ""),
            "highlights": next_level_text.get("highlights", [])
        } if has_next_level else null,
        "prerequisites": global_prereqs + level_prereqs
    }

func describe_prerequisites(definition: UpgradeDefinition, options: Dictionary = {}) -> Array:
    var include_unlock = options.get("includeUnlock", true)
    var entries = []

    # Unlock level
    if include_unlock and is_finite(definition.unlock_level) and definition.unlock_level > 1:
        var unlock_entry = {
            "type": "player-level",
            "level": max(1, int(floor(definition.unlock_level))),
            "text": options.get("unlockText", "")
        }
        var label = unlock_entry.text if unlock_entry.text else generate_prerequisite_label(unlock_entry)
        entries.append({
            "type": unlock_entry.type,
            "level": unlock_entry.level,
            "met": evaluate_prerequisite(unlock_entry),
            "label": label,
            "description": label
        })

    # Global prerequisites
    for entry in collect_raw_prerequisites(definition):
        var label = entry.text if entry.text else generate_prerequisite_label(entry)
        entries.append({
            "type": entry.type,
            "id": entry.get("id", ""),
            "level": entry.get("level", 1),
            "met": evaluate_prerequisite(entry),
            "label": label,
            "description": label
        })

    return entries

func generate_prerequisite_label(prerequisite: Dictionary) -> String:
    if not prerequisite:
        return ""

    if prerequisite.type == "player-level":
        return "Level do piloto %d+" % prerequisite.get("level", 1)

    if prerequisite.type == "upgrade":
        var reference = upgrade_lookup.get(prerequisite.id)
        var name = reference.text.name if reference and reference.text else prerequisite.id
        var level_label = "Nv. %d" % prerequisite.get("level", 1)
        return "%s (%s)" % [name, level_label]

    return ""
```

**Implementação Godot:**
- Usar para renderizar prerequisites na UI
- Exibir checkmark (✅) se met, cross (❌) se not met
- Tooltip com descrição completa

---

## 10. Apply Upgrade (Aplicação de Upgrade)

### Conceito
Valida upgrade (exists, not maxed, prerequisites met), incrementa level em `appliedUpgrades` Map, executa effects do nível atual, emite eventos `upgrade:purchased` e `upgrade-applied`, limpa `pendingUpgradeOptions`.

**Reference:** `src/modules/UpgradeSystem.js` linhas 702-781 (`applyUpgrade`)

**Pseudocódigo GDScript:**
```gdscript
func apply_upgrade(upgrade_id: String) -> bool:
    var definition = upgrade_lookup.get(upgrade_id)

    if not definition:
        push_error("Upgrade not found: %s" % upgrade_id)
        return false

    var max_level = definition.levels.size()
    var current_level = get_upgrade_count(upgrade_id)

    # Valida se maxado
    if max_level > 0 and current_level >= max_level:
        push_warning("Upgrade already at max level: %s" % upgrade_id)
        return false

    # Valida unlock level
    if is_finite(definition.unlock_level) and level < definition.unlock_level:
        push_warning("Upgrade locked by level: %s" % upgrade_id)
        return false

    # Valida prerequisites
    if not is_upgrade_selectable(definition):
        push_warning("Upgrade prerequisites not met: %s" % upgrade_id)
        return false

    var level_definition = definition.levels[current_level]
    if not level_definition:
        push_error("Missing level definition for upgrade: %s" % upgrade_id)
        return false

    # Incrementa level
    var new_level = current_level + 1
    applied_upgrades[upgrade_id] = new_level

    # Executa effects
    apply_upgrade_effects(definition, level_definition, new_level)

    # Constrói summary
    var summary = build_applied_upgrade_summary(definition, current_level)
    var effects = clone_effects(level_definition.effects)
    var prerequisites = describe_prerequisites(definition)

    # Emite eventos
    EventBus.upgrade_purchased.emit({
        "upgradeId": upgrade_id,
        "level": new_level,
        "previousLevel": current_level,
        "maxLevel": max_level,
        "summary": summary,
        "effects": effects,
        "prerequisites": prerequisites
    })

    EventBus.upgrade_applied.emit({
        "upgradeId": upgrade_id,
        "level": new_level,
        "previousLevel": current_level,
        "maxLevel": max_level,
        "summary": summary,
        "effects": effects,
        "prerequisites": prerequisites
    })

    print("Applied upgrade: %s → nível %d" % [summary.name, new_level])

    pending_upgrade_options = []
    return true
```

**Implementação Godot:**
- Conectar UI button click para `apply_upgrade()`
- Emitir signals para VFX/SFX (level-up animation, sound)
- Pausar jogo após aplicar upgrade

---

## 11. Implementação Godot: Estrutura de Cena

### Scene: UpgradeManager.tscn
```
UpgradeManager (Node)
└─ (script: UpgradeManager.gd)
```

### Script: UpgradeManager.gd
```gdscript
class_name UpgradeManager
extends Node

signal upgrade_purchased(data: Dictionary)
signal upgrade_applied(data: Dictionary)
signal upgrade_options_ready(new_level: int, options: Array, pool_size: int, total_definitions: int)

# State
var applied_upgrades: Dictionary = {}  # upgrade_id -> level
var pending_upgrade_options: Array = []
var upgrade_definitions: Array[UpgradeDefinition] = []
var upgrade_lookup: Dictionary = {}  # upgrade_id -> UpgradeDefinition
var upgrade_category_map: Dictionary = {}  # category_id -> UpgradeCategory

# Services
var progression_system: ProgressionSystem
var player: Player
var xp_orb_manager: XPOrbManager
var random_service: RandomService
var level: int = 1

func _ready() -> void:
    load_upgrade_definitions()
    load_upgrade_categories()
    setup_event_listeners()

func load_upgrade_definitions() -> void:
    # Carrega todos os .tres files de res://data/upgrades/
    var offense = load_upgrades_from_directory("res://data/upgrades/offense/")
    var defense = load_upgrades_from_directory("res://data/upgrades/defense/")
    var mobility = load_upgrades_from_directory("res://data/upgrades/mobility/")
    var utility = load_upgrades_from_directory("res://data/upgrades/utility/")

    upgrade_definitions = offense + defense + mobility + utility

    # Constrói lookup
    for definition in upgrade_definitions:
        upgrade_lookup[definition.id] = definition

func load_upgrades_from_directory(path: String) -> Array[UpgradeDefinition]:
    var result: Array[UpgradeDefinition] = []
    var dir = DirAccess.open(path)
    if dir:
        dir.list_dir_begin()
        var file_name = dir.get_next()
        while file_name != "":
            if file_name.ends_with(".tres"):
                var resource = load(path + file_name)
                if resource is UpgradeDefinition:
                    result.append(resource)
            file_name = dir.get_next()
    return result

func load_upgrade_categories() -> void:
    var categories_path = "res://data/upgrades/categories/"
    var dir = DirAccess.open(categories_path)
    if dir:
        dir.list_dir_begin()
        var file_name = dir.get_next()
        while file_name != "":
            if file_name.ends_with(".tres"):
                var resource = load(categories_path + file_name)
                if resource is UpgradeCategory:
                    upgrade_category_map[resource.id] = resource
            file_name = dir.get_next()

func setup_event_listeners() -> void:
    EventBus.player_leveled_up.connect(_on_player_leveled_up)
    EventBus.progression_reset.connect(_on_progression_reset)

func _on_player_leveled_up(new_level: int, previous_requirement: int, next_requirement: int) -> void:
    level = new_level
    # Prepara opções de upgrade
    var context = prepare_upgrade_options(3)
    upgrade_options_ready.emit(
        new_level,
        context.options,
        context.poolSize,
        context.totalDefinitions
    )

func _on_progression_reset() -> void:
    applied_upgrades.clear()
    pending_upgrade_options.clear()
    level = 1

# Implementar funções descritas nas seções anteriores:
# - prepare_upgrade_options()
# - is_upgrade_selectable()
# - build_upgrade_option()
# - apply_upgrade()
# - apply_upgrade_effects()
# - apply_progression_effect()
# - normalize_prerequisite()
# - evaluate_prerequisite()
# - collect_raw_prerequisites()
# - collect_level_prerequisites()
# - describe_prerequisites()
# - generate_prerequisite_label()
# - get_upgrade_count()
# - resolve_upgrade_category()
```

### Resource Files Structure
```
res://data/upgrades/
├─ categories/
│  ├─ offense.tres
│  ├─ defense.tres
│  ├─ mobility.tres
│  └─ utility.tres
├─ offense/
│  ├─ plasma.tres
│  ├─ multishot.tres
│  └─ targeting_suite.tres
├─ defense/
│  ├─ shield.tres
│  └─ deflector_shield.tres
├─ mobility/
│  ├─ propulsors.tres
│  ├─ rcs_system.tres
│  └─ braking_system.tres
└─ utility/
   └─ magfield.tres
```

---

## 12. Tabela de Parâmetros Configuráveis

| Parâmetro | Tipo | Valor Padrão | Descrição | Referência JS |
|-----------|------|--------------|-----------|---------------|
| `PROGRESSION_UPGRADE_ROLL_COUNT` | int | 3 | Número de opções de upgrade exibidas ao level-up | UpgradeSystem.js:11 |
| `PROGRESSION_UPGRADE_FALLBACK_COUNT` | int | 3 | Fallback se roll count inválido | UpgradeSystem.js:12 |
| Plasma Damage Tier 1 | float | 1.25 | Multiplicador de dano (Nível 1) | offense.js:18 |
| Plasma Damage Tier 2 | float | 1.2 | Multiplicador de dano (Nível 2, cumulativo) | offense.js:27 |
| Plasma Damage Tier 3 | float | 1.15 | Multiplicador de dano (Nível 3, cumulativo) | offense.js:36 |
| Multishot Bonus (all tiers) | int | 1 | Projectiles adicionados por nível | offense.js:60,68,76 |
| Targeting Suite Parasite Weight | int | 240 | Peso de danger scoring para parasites | offense.js:105 |
| Targeting Suite Volatile Weight | int | 200 | Peso de danger scoring para volatiles | offense.js:106 |
| Targeting Suite Min Lead Time | float | 0.05 | Tempo mínimo de predição balística | offense.js:119 |
| Targeting Suite Max Lead Time | float | 1.0 | Tempo máximo de predição balística | offense.js:120 |
| Targeting Suite Fallback Lead | float | 0.32 | Tempo de predição padrão | offense.js:121 |
| Targeting Suite Multi Lock | int | 4 | Número de alvos simultâneos (Tier 3) | offense.js:134 |
| Targeting Suite Cooldown Mult | float | 0.92 | Multiplicador de cooldown (Tier 3) | offense.js:135 |
| Shield HP Tier 1 | int | 50 | HP bônus (Nível 1) | defense.js:17 |
| Shield HP Tier 2 | int | 50 | HP bônus (Nível 2) | defense.js:26 |
| Shield HP Tier 3 | int | 75 | HP bônus (Nível 3) | defense.js:35 |
| Deflector Shield Hits (Tiers 1-5) | int | 3, 4, 4, 5, 5 | Hits absorvidos por nível | defense.js:58-100 |
| Propulsors Accel Multipliers | float | 1.12, 1.116, 1.16, 1.207, 1.2 | Multiplicadores de aceleração por tier | mobility.js:19,31,43,55,67 |
| Propulsors Speed Multipliers | float | 1.10, 1.109, 1.131, 1.159, 1.156 | Multiplicadores de velocidade por tier | mobility.js:24,36,48,60,72 |
| RCS Rotation Multipliers | float | 1.15, 1.148, 1.174, 1.226, 1.211 | Multiplicadores de rotação por tier | mobility.js:109,122,135,148,161 |
| RCS Angular Damping Multipliers | float | 1.0, 0.88, 0.852, 0.8, 1.0 | Multiplicadores de damping angular por tier | mobility.js:-,127,140,153,166 |
| Braking Linear Damping Multipliers | float | 1.3, 1.231, 1.25 | Multiplicadores de damping linear por tier | mobility.js:203,216,229 |
| Magfield Radius Multipliers | float | 1.4, 1.25, 1.15 | Multiplicadores de raio de magnetismo por tier | utility.js:19,30,41 |
| Magfield Force Multipliers | float | 1.35, 1.25, 1.15 | Multiplicadores de força de magnetismo por tier | utility.js:24,35,46 |

**Implementação Godot:**
- Definir constantes em `UpgradeConstants.gd` (autoload)
- Ou armazenar diretamente nos Resource files (.tres)
- Preferir Resource files para facilitar balanceamento via editor

---

## 13. Diagramas de Fluxo

### 13.1. Fluxo de Selection (prepareUpgradeOptions)

```
┌─────────────────────────────────────┐
│ Player Level Up                     │
└───────────┬─────────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│ prepareUpgradeOptions(count = 3)    │
└───────────┬─────────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│ Filter Eligible Upgrades            │
│ ─────────────────────────────       │
│ For each definition:                │
│   • isUpgradeSelectable()           │
│     ├─ Not maxed?                   │
│     ├─ Unlock level met?            │
│     ├─ Global prerequisites met?    │
│     └─ Level prerequisites met?     │
└───────────┬─────────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│ eligible.size() == 0?               │
└───────────┬─────────────────────────┘
            │
     ┌──────┴──────┐
     │ Yes         │ No
     ▼             ▼
┌─────────┐  ┌─────────────────────────┐
│ Return  │  │ Fisher-Yates Shuffle    │
│ Empty   │  │ ─────────────────────   │
│ Options │  │ • Get RNG fork          │
└─────────┘  │   ("upgrades.selection")│
             │ • Shuffle in-place      │
             └───────────┬─────────────┘
                         │
                         ▼
             ┌─────────────────────────┐
             │ Select Top N            │
             │ ─────────────────────   │
             │ • Slice(0, count)       │
             │ • Map to                │
             │   buildUpgradeOption()  │
             └───────────┬─────────────┘
                         │
                         ▼
             ┌─────────────────────────┐
             │ Store in                │
             │ pendingUpgradeOptions   │
             └───────────┬─────────────┘
                         │
                         ▼
             ┌─────────────────────────┐
             │ Emit                    │
             │ upgrade_options_ready   │
             └─────────────────────────┘
```

---

### 13.2. Fluxo de Application (applyUpgrade)

```
┌─────────────────────────────────────┐
│ UI: Player Selects Upgrade          │
└───────────┬─────────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│ applyUpgrade(upgradeId)             │
└───────────┬─────────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│ Validate Definition                 │
│ ─────────────────────────────       │
│ • Definition exists?                │
│ • Not maxed?                        │
│ • Unlock level met?                 │
│ • Prerequisites met?                │
└───────────┬─────────────────────────┘
            │
     ┌──────┴──────┐
     │ Valid?      │
     ▼             ▼
┌─────────┐  ┌─────────────────────────┐
│ Return  │  │ Increment Level         │
│ false   │  │ ─────────────────────   │
└─────────┘  │ appliedUpgrades[id] =   │
             │   currentLevel + 1      │
             └───────────┬─────────────┘
                         │
                         ▼
             ┌─────────────────────────┐
             │ Apply Effects           │
             │ ─────────────────────   │
             │ For each effect:        │
             │   • type == "event"?    │
             │     → Emit signal       │
             │   • type == "progression"?│
             │     → Modify XPOrbSystem│
             └───────────┬─────────────┘
                         │
                         ▼
             ┌─────────────────────────┐
             │ Emit Events             │
             │ ─────────────────────   │
             │ • upgrade_purchased     │
             │ • upgrade_applied       │
             └───────────┬─────────────┘
                         │
                         ▼
             ┌─────────────────────────┐
             │ Clear                   │
             │ pendingUpgradeOptions   │
             └───────────┬─────────────┘
                         │
                         ▼
             ┌─────────────────────────┐
             │ Return true             │
             └─────────────────────────┘
```

---

### 13.3. Fluxo de Prerequisite Validation

```
┌─────────────────────────────────────┐
│ isUpgradeSelectable(definition)     │
└───────────┬─────────────────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│ 1. Definition valid?                │
└───────────┬─────────────────────────┘
            │ Yes
            ▼
┌─────────────────────────────────────┐
│ 2. Not maxed?                       │
│    currentLevel < maxLevel          │
└───────────┬─────────────────────────┘
            │ Yes
            ▼
┌─────────────────────────────────────┐
│ 3. Unlock level met?                │
│    playerLevel >= unlockLevel       │
└───────────┬─────────────────────────┘
            │ Yes
            ▼
┌─────────────────────────────────────┐
│ 4. Global prerequisites met?        │
│    For each prerequisite:           │
│      • evaluatePrerequisite()       │
│        ├─ type == "player-level"?   │
│        │  → Check player level      │
│        └─ type == "upgrade"?        │
│           → Check upgrade level     │
└───────────┬─────────────────────────┘
            │ All met
            ▼
┌─────────────────────────────────────┐
│ 5. Level prerequisites met?         │
│    For each prerequisite:           │
│      • evaluatePrerequisite()       │
└───────────┬─────────────────────────┘
            │ All met
            ▼
┌─────────────────────────────────────┐
│ Return true (Selectable)            │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Any validation fails                │
│   ↓                                 │
│ Return false (Not Selectable)       │
└─────────────────────────────────────┘
```

---

## 14. Prerequisite Dependency Graph

```
                ┌─────────────┐
                │   OFFENSE   │
                └─────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
  ┌────────┐     ┌──────────┐   ┌──────────────┐
  │ plasma │     │multishot │   │targeting_suite│
  │  (3)   │     │   (3)    │   │     (3)      │
  └────────┘     └─────┬────┘   └──────────────┘
                       │               │
                       │               │ Tier 3
                       └───────────────┘
                      requires multishot Lv.1


                ┌─────────────┐
                │   DEFENSE   │
                └─────────────┘
                       │
       ┌───────────────┴───────────────┐
       │                               │
       ▼                               ▼
  ┌────────┐                  ┌────────────────┐
  │ shield │                  │deflector_shield│
  │  (3)   │──────────────────│      (5)       │
  └────────┘ requires          └────────────────┘
              shield Lv.1


                ┌─────────────┐
                │  MOBILITY   │
                └─────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
  ┌──────────┐   ┌──────────┐   ┌─────────────┐
  │propulsors│   │rcs_system│   │braking_system│
  │   (5)    │───│   (5)    │───│     (3)     │
  └──────────┘   └──────────┘   └─────────────┘
    requires       requires
    propulsors     rcs_system
      Lv.1           Lv.2


                ┌─────────────┐
                │   UTILITY   │
                └─────────────┘
                       │
                       ▼
                  ┌─────────┐
                  │magfield │
                  │   (3)   │
                  └─────────┘
```

**Dependency Chains:**
1. **Mobility Chain:** propulsors → rcs_system → braking_system
2. **Defense Chain:** shield → deflector_shield
3. **Offense Chain:** multishot → targeting_suite (Tier 3 only)
4. **Independent:** plasma, magfield (no prerequisites)

---

## 15. Integration Points

### 15.1. ProgressionSystem
**Events Consumed:**
- `player_leveled_up(new_level, previous_requirement, next_requirement)` → Triggers `prepareUpgradeOptions()`

**Events Emitted:**
- `upgrade_options_ready(new_level, options, pool_size, total_definitions)` → UI exibe upgrade cards

**State Shared:**
- `level` (int): Player level atual para validação de prerequisites

---

### 15.2. Player (PlayerSystem)
**Events Consumed:**
- `upgrade-health-boost` → Aumenta max HP e cura player
- `upgrade-acceleration-boost` → Multiplica acceleration
- `upgrade-speed-boost` → Multiplica max speed
- `upgrade-rotation-boost` → Multiplica rotation speed
- `upgrade-angular-damping` → Multiplica angular damping
- `upgrade-linear-damping` → Multiplica linear damping
- `upgrade-strafe-movement` → Ativa movimento lateral
- `upgrade-emergency-brake` → Ativa emergency brake ability

**Implementation Pattern:**
```gdscript
func _ready() -> void:
    EventBus.upgrade_health_boost.connect(_on_upgrade_health_boost)
    EventBus.upgrade_acceleration_boost.connect(_on_upgrade_acceleration_boost)
    # ... conectar outros eventos

func _on_upgrade_health_boost(payload: Dictionary) -> void:
    var bonus = payload.get("bonus", 0)
    max_health += bonus
    current_health = min(current_health + bonus, max_health)  # Cura equivalente

func _on_upgrade_acceleration_boost(payload: Dictionary) -> void:
    var multiplier = payload.get("multiplier", 1.0)
    acceleration *= multiplier
```

---

### 15.3. CombatSystem
**Events Consumed:**
- `upgrade-damage-boost` → Multiplica damage base
- `upgrade-multishot` → Adiciona projectiles
- `upgrade-aiming-suite` → Configura targeting system (danger scoring, ballistic prediction, multi-lock)

**Implementation Pattern:**
```gdscript
func _on_upgrade_damage_boost(payload: Dictionary) -> void:
    var multiplier = payload.get("multiplier", 1.0)
    base_damage *= multiplier

func _on_upgrade_multishot(payload: Dictionary) -> void:
    var bonus = payload.get("bonus", 0)
    projectile_count += bonus

func _on_upgrade_aiming_suite(payload: Dictionary) -> void:
    if payload.has("resetWeights"):
        targeting_weights = DEFAULT_TARGETING_WEIGHTS.duplicate()
    if payload.has("dynamicPrediction"):
        enable_ballistic_prediction(payload.dynamicPrediction)
    if payload.has("multiLockTargets"):
        enable_multi_lock(payload.multiLockTargets, payload.get("cooldownMultiplier", 1.0))
```

---

### 15.4. XPOrbSystem (XPOrbManager)
**Events Consumed:**
- `upgrade-magnetism` (opcional, redundante com progression effects)

**Direct Modification (Progression Effects):**
- `orbMagnetismRadius` → Raio de atração de orbs
- `magnetismForce` → Força de atração de orbs

**Implementation Pattern:**
```gdscript
# Via progression effects (preferido)
func set_magnetism_radius(new_radius: float) -> void:
    orb_magnetism_radius = new_radius
    update_magnetism_area()

func set_magnetism_force(new_force: float) -> void:
    magnetism_force = new_force
```

---

### 15.5. EffectsSystem (Visual/Audio)
**Events Consumed:**
- `upgrade-thruster-visual` → Atualiza visual de thruster (5 níveis)
- `upgrade-rcs-visual` → Atualiza visual de RCS (5 níveis)
- `upgrade-braking-visual` → Atualiza visual de braking (3 níveis)
- `upgrade-ion-trail` → Ativa ion trail damage

**Implementation Pattern:**
```gdscript
func _on_upgrade_thruster_visual(payload: Dictionary) -> void:
    var level = payload.get("level", 1)
    match level:
        1: thruster_particle.color = Color.BLUE
        2: thruster_particle.color = Color.CYAN
        3: thruster_particle.color = Color.YELLOW
        4: thruster_particle.color = Color.WHITE
        5:
            thruster_particle.color = Color.VIOLET
            thruster_particle.amount *= 1.5

func _on_upgrade_ion_trail(payload: Dictionary) -> void:
    if payload.get("enabled", false):
        spawn_ion_trail_damager()
```

---

### 15.6. UI System
**Events Consumed:**
- `upgrade_options_ready(new_level, options, pool_size, total_definitions)` → Renderiza upgrade cards

**Events Emitted:**
- `upgrade_selected(upgrade_id)` → Chama `UpgradeManager.apply_upgrade(upgrade_id)`

**Implementation Pattern:**
```gdscript
func _on_upgrade_options_ready(new_level: int, options: Array, pool_size: int, total_definitions: int) -> void:
    clear_upgrade_cards()
    for option in options:
        var card = UPGRADE_CARD_SCENE.instantiate()
        card.set_data(option)
        card.selected.connect(_on_card_selected)
        upgrade_cards_container.add_child(card)
    show_upgrade_screen()

func _on_card_selected(upgrade_id: String) -> void:
    EventBus.upgrade_selected.emit(upgrade_id)
    hide_upgrade_screen()
```

---

## 16. Referências

### Arquivos JavaScript Analisados

| Arquivo | Linhas | Descrição |
|---------|--------|-----------|
| `src/modules/UpgradeSystem.js` | ~886 | Sistema base de upgrades (selection, validation, application) |
| `src/data/upgrades/offense.js` | ~160 | Definições de upgrades ofensivos (plasma, multishot, targeting_suite) |
| `src/data/upgrades/defense.js` | ~110 | Definições de upgrades defensivos (shield, deflector_shield) |
| `src/data/upgrades/mobility.js` | ~240 | Definições de upgrades de mobilidade (propulsors, rcs_system, braking_system) |
| `src/data/upgrades/utility.js` | ~60 | Definições de upgrades utilitários (magfield) |
| `src/data/upgrades/index.js` | ~15 | Agregador de upgrade definitions |
| `src/data/upgrades/categories.js` | ~45 | Definições de 4 categorias (offense, defense, mobility, utility) |

### Funções-Chave (UpgradeSystem.js)

| Função | Linhas | Descrição |
|--------|--------|-----------|
| `prepareUpgradeOptions` | 95-143 | Filtra elegíveis, shuffles com Fisher-Yates, seleciona top N |
| `isUpgradeSelectable` | 150-187 | Valida elegibilidade (maxed, unlock level, prerequisites) |
| `collectRawPrerequisites` | 189-240 | Extrai global prerequisites de definition |
| `collectLevelPrerequisites` | 242-273 | Extrai level-specific prerequisites |
| `normalizePrerequisite` | 275-320 | Normaliza prerequisite para formato padrão |
| `evaluatePrerequisite` | 322-347 | Valida se prerequisite está atendido |
| `buildUpgradeOption` | 409-461 | Constrói objeto de opção com metadata completo |
| `applyUpgrade` | 702-781 | Valida, incrementa level, executa effects, emite eventos |
| `applyUpgradeEffects` | 783-811 | Executa effects (event ou progression) |

### Eventos Principais

| Evento | Payload | Emitido Por | Consumido Por |
|--------|---------|-------------|---------------|
| `player_leveled_up` | `{new_level, previous_requirement, next_requirement}` | ProgressionSystem | UpgradeManager |
| `upgrade_options_ready` | `{new_level, options, pool_size, total_definitions}` | UpgradeManager | UI System |
| `upgrade_selected` | `{upgrade_id}` | UI System | UpgradeManager |
| `upgrade_purchased` | `{upgradeId, level, summary, effects, prerequisites}` | UpgradeManager | Analytics, UI |
| `upgrade_applied` | `{upgradeId, level, summary, effects, prerequisites}` | UpgradeManager | All Systems |
| `upgrade-*` (14 types) | Varies | UpgradeManager (via effects) | Player, Combat, XPOrbs, Effects |

### Constantes Importantes

| Constante | Valor | Descrição |
|-----------|-------|-----------|
| `PROGRESSION_UPGRADE_ROLL_COUNT` | 3 | Número de opções de upgrade no level-up |
| `PROGRESSION_UPGRADE_FALLBACK_COUNT` | 3 | Fallback se roll count inválido |

---

## Notas Finais

Este documento serve como referência definitiva para implementar o sistema de upgrades em Godot 3D. Todos os algoritmos principais estão descritos em pseudocódigo GDScript, e todos os 9 upgrades estão completamente documentados com progressões, effects e prerequisites.

**Próximos Passos:**
1. Criar Resource classes (UpgradeDefinition, UpgradeLevel, UpgradeEffect, UpgradePrerequisite, UpgradeCategory)
2. Implementar UpgradeManager.gd com todos os algoritmos descritos
3. Criar .tres files para todos os upgrades e categorias
4. Implementar event listeners nos sistemas consumidores (Player, Combat, XPOrbs, Effects)
5. Criar UI para exibir upgrade cards e processar seleção
6. Testar dependency chains (targeting_suite → multishot, deflector_shield → shield, etc.)

**Referências Externas:**
- Ver `docs/godot-migration/mechanics-progression.md` para integração com XP system
- Ver `docs/godot-migration/mechanics-random.md` para implementação de seeded RNG
- Ver `docs/godot-migration/mechanics-combat-targeting.md` para detalhes de targeting_suite integration
