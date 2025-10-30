## 1. Visão Geral do Sistema
- Conceito: Sistema de mira automática que prioriza alvos por ameaça e permite múltiplos locks simultâneos
- 3 tiers de upgrade progressivos:
- **Tier 1 - Adaptive Acquisition**: Danger scoring com 7 componentes (variant, reward, direction, speed, size, distance, impact)
- **Tier 2 - Dynamic Prediction**: Predição balística com equação quadrática para interceptação
- **Tier 3 - Coordinated Locks**: Até 4 locks simultâneos com canhões independentes (offsets paralelos)
- Propósito: Priorizar ameaças críticas (parasites, volatiles) e maximizar eficiência de fogo em combate caótico

## 2. Estrutura de Dados do Sistema
Descrever estrutura completa baseada em \`CombatSystem.js\` linhas 48-131:

**Campos principais:**
- \`bullets\` (Array): Pool de projéteis do player
- \`enemyBullets\` (Array): Pool de projéteis inimigos
- \`currentTarget\` (Enemy): Alvo primário atual
- \`currentTargetLocks\` (Array[Enemy]): Lista de alvos travados (1-4)
- \`currentLockAssignments\` (Array[Object]): Assignments com predicted aim, fire offset, urgency
- \`targetingPriorityList\` (Array[Object]): Lista ordenada de candidatos com score
- \`predictedAimPoints\` (Array[Object]): Pontos preditivos para cada lock
- \`predictedAimPointsMap\` (Map): Mapa enemy.id → predicted position
- \`targetThreatCache\` (Map): Cache de threat breakdown por enemy.id
- \`targetUpdateTimer\` (float): Timer para refresh de targeting
- \`targetIndicatorPulse\` (float): Timer de animação de lock pulse
- \`lastKnownPlayerStats\` (Object): Cache de player stats (damage, multishot, etc.)

**Configurações:**
- \`targetingRange\` (float): Raio de detecção de alvos (padrão: 400px)
- \`shootCooldown\` (float): Intervalo entre disparos (padrão: 0.3s, reduzido para 0.276s com tier 3)
- \`bulletSpeed\` (float): Velocidade de projéteis (padrão: 450)
- \`bulletLifetime\` (float): Tempo de vida de projéteis (padrão: 1.8s)
- \`targetUpdateInterval\` (float): Intervalo de refresh de targeting (0.15s base → 0.1s multi-lock)
- \`linearPredictionTime\` (float): Lead time para predição linear (padrão: 0.5s)

**Danger Weights (configuráveis):**
- \`behavior\` (Map): Pesos por tipo de comportamento (parasite: 240, volatile: 200, default: 140)
- \`variantOverrides\` (Map): Pesos por variante (gold: 170, crystal: 160, common: 120)
- \`reward\` (float): Peso de recompensa (padrão: 30)
- \`direction\` (float): Peso de direção (padrão: 6)
- \`speed\` (float): Peso de velocidade (padrão: 4)
- \`size\` (Map): Pesos por tamanho (large: 3, medium: 2, small: 1)
- \`distance\` (float): Peso de distância (padrão: 0.75)
- \`impact\` (Object): Configuração de impact threat (distanceWeight: 18, timeWeight: 12, hpWeight: 8)

**Dynamic Prediction Settings:**
- \`minLeadTime\` (float): Tempo mínimo de lead (padrão: 0.05s)
- \`maxLeadTime\` (float): Tempo máximo de lead (padrão: 1.1s)
- \`fallbackLeadTime\` (float): Lead time para predição linear (padrão: 0.35s)

**Multi-Lock Settings:**
- \`multiLockTargets\` (int): Número máximo de locks (padrão: 4)
- \`parallelSpacing\` (float): Espaçamento entre canhões (padrão: 14px)
- \`parallelRadiusMultiplier\` (float): Multiplicador de raio para clamp (padrão: 0.55)

**Mapeamento GDScript:**
\`\`\`gdscript
class_name CombatTargetingSystem
extends Node3D

# Bullets
var bullets: Array[Bullet] = []
var enemy_bullets: Array[EnemyBullet] = []

# Targeting state
var current_target: Enemy = null
var current_target_locks: Array[Enemy] = []
var current_lock_assignments: Array[Dictionary] = []
var targeting_priority_list: Array[Dictionary] = []
var predicted_aim_points: Array[Dictionary] = []
var predicted_aim_points_map: Dictionary = {} # enemy_id -> Vector3
var target_threat_cache: Dictionary = {} # enemy_id -> threat_breakdown
var target_update_timer: float = 0.0
var target_indicator_pulse: float = 0.0
var last_known_player_stats: Dictionary = {}

# Configuration
var targeting_range: float = 400.0
var shoot_cooldown: float = 0.3
var bullet_speed: float = 450.0
var bullet_lifetime: float = 1.8
var target_update_interval: float = 0.15
var linear_prediction_time: float = 0.5

# Danger weights
var danger_weights: Dictionary = {
\"behavior\": {\"parasite\": 240, \"volatile\": 200, \"default\": 140},
\"variantOverrides\": {\"gold\": 170, \"crystal\": 160, \"common\": 120},
\"reward\": 30,
\"direction\": 6,
\"speed\": 4,
\"size\": {\"large\": 3, \"medium\": 2, \"small\": 1},
\"distance\": 0.75,
\"impact\": {
\"distanceWeight\": 18,
\"timeWeight\": 12,
\"hpWeight\": 8,
\"urgencyDistance\": 12,
\"urgencyTime\": 10,
\"stackMultiplier\": 1.35,
\"maxRecommended\": 4
}
}

# Dynamic prediction
var dynamic_prediction_settings: Dictionary = {
\"minLeadTime\": 0.05,
\"maxLeadTime\": 1.1,
\"fallbackLeadTime\": 0.35
}

# Multi-lock
var multi_lock_targets: int = 4
var parallel_spacing: float = 14.0
var parallel_radius_multiplier: float = 0.55

# Upgrade state
var targeting_upgrade_level: int = 0
var danger_score_enabled: bool = false
var dynamic_prediction_enabled: bool = false
\`\`\`

## 3. Sistema de Targeting (Seleção de Alvos)
Descrever algoritmo baseado em \`CombatSystem.js\` linhas 285-428.

**Conceito:**
- Escaneia inimigos dentro de \`targetingRange\` (padrão: 400px)
- Calcula danger score para cada candidato (quando tier 1+ ativo)
- Ordena por score (maior primeiro) ou distância (menor primeiro)
- Seleciona top N alvos baseado em \`computeLockCount()\`
- Atualiza a cada \`targetUpdateInterval\` (0.15s base → 0.1s multi-lock)

**Pseudocódigo GDScript:**
\`\`\`gdscript
func find_best_target() -> void:
var player_pos = player.global_position
var player_velocity = player.get_velocity() if player.has_method(\"get_velocity\") else Vector3.ZERO
var player_radius = player.get_shield_radius() if player.has_method(\"get_shield_radius\") else 24.0

var candidates = []
var scoring_enabled = danger_score_enabled
target_threat_cache.clear()

# Escaneia inimigos ativos
for enemy in enemy_manager.get_active_enemies():
if enemy.destroyed:
continue

var dx = enemy.global_position.x - player_pos.x
var dz = enemy.global_position.z - player_pos.z
var distance = sqrt(dx * dx + dz * dz)

if distance > targeting_range:
continue

var score = -distance # Fallback: prioriza mais próximo
if scoring_enabled:
var danger = calculate_danger_score(enemy, player_pos, distance, player_velocity, player_radius)
score = danger.total
target_threat_cache[enemy.id] = {
\"enemy\": enemy,
\"distance\": distance,
\"score\": score,
\"breakdown\": danger
}

candidates.append({
\"enemy\": enemy,
\"distance\": distance,
\"score\": score
})

if candidates.is_empty():
if current_target:
EventBus.emit_signal(\"combat_target_lock\", {\"lost\": true})
current_target = null
current_target_locks = []
targeting_priority_list = []
predicted_aim_points = []
predicted_aim_points_map.clear()
return

# Ordena por score (maior primeiro) ou distância (menor primeiro)
candidates.sort_custom(func(a, b):
if scoring_enabled and b.score != a.score:
return b.score > a.score
return a.distance < b.distance
)

targeting_priority_list = candidates

# Reconstrói lock set
var desired_locks = compute_lock_count(last_known_player_stats)
rebuild_lock_set(max(1, desired_locks))

current_target = current_target_locks[0] if not current_target_locks.is_empty() else null

# Emite evento de lock
if current_target:
var new_primary_id = current_target.id
if new_primary_id != last_primary_target_id:
target_indicator_pulse = target_pulse_duration
EventBus.emit_signal(\"combat_target_lock\", {
\"enemyId\": new_primary_id,
\"variant\": current_target.variant,
\"score\": candidates[0].score,
\"lockCount\": current_target_locks.size()
})
last_primary_target_id = new_primary_id
\`\`\`

**Validação de Alvo:**
\`\`\`gdscript
func is_valid_target(target: Enemy) -> bool:
if not target or target.destroyed:
return false

var player_pos = player.global_position
var dx = target.global_position.x - player_pos.x
var dz = target.global_position.z - player_pos.z
var distance = sqrt(dx * dx + dz * dz)

return distance <= targeting_range
\`\`\`

**Implementação Godot:**
- Usar \`Area3D\` com \`monitoring = true\` para detecção de inimigos
- Usar \`get_overlapping_bodies()\` filtrado por collision layer
- Timer node para \`target_update_interval\`
- Signal \`combat_target_lock\` para VFX/SFX

## 4. Danger Scoring (Pontuação de Ameaça)
Descrever algoritmo baseado em \`CombatSystem.js\` linhas 1377-1424.

**Conceito:**
- Calcula score de perigo baseado em 7 componentes ponderados:
1. **Variant Weight**: Peso especial para variantes (parasite: 240, volatile: 200, gold: 170)
2. **Reward Score**: Valor estimado de XP/recompensa normalizado
3. **Direction Score**: Quanto o inimigo está se movendo em direção ao player
4. **Speed Score**: Velocidade do inimigo relativa à velocidade de referência
5. **Size Score**: Peso baseado no tamanho (large: 3, medium: 2, small: 1)
6. **Distance Score**: Fator de proximidade (1 - distance/range)
7. **Impact Threat**: Cálculo complexo de trajetória de impacto (ver seção 5)

**Fórmula:**
\`\`\`
total = variantWeight + rewardScore + directionScore + speedScore + sizeScore + distanceScore + impactThreat.total
\`\`\`

**Pseudocódigo GDScript:**
\`\`\`gdscript
func calculate_danger_score(
enemy: Enemy,
player_pos: Vector3,
distance: float,
player_velocity: Vector3 = Vector3.ZERO,
player_radius: float = 24.0
) -> Dictionary:
var weights = danger_weights

# 1. Variant Weight
var variant_weight = resolve_variant_weight(enemy)

# 2. Reward Score
var reward_value = estimate_reward_value(enemy)
var reward_score = (reward_value / weights.rewardNormalization) * weights.reward

# 3. Direction Score
var direction_score = compute_direction_factor(enemy, player_pos) * weights.direction

# 4. Speed Score
var speed_score = compute_speed_factor(enemy) * weights.speed

# 5. Size Score
var size_score = weights.size.get(enemy.size, 0)

# 6. Distance Score
var distance_score = compute_distance_factor(distance) * weights.distance

# 7. Impact Threat
var impact_details = calculate_impact_threat(
enemy, player_pos, distance, player_velocity, player_radius
)

var total = (
variant_weight +
reward_score +
direction_score +
speed_score +
size_score +
distance_score +
impact_details.total
)

return {
\"total\": total,
\"variant\": variant_weight,
\"reward\": reward_score,
\"direction\": direction_score,
\"speed\": speed_score,
\"size\": size_score,
\"distance\": distance_score,
\"impact\": impact_details
}
\`\`\`

**Funções Auxiliares:**

\`\`\`gdscript
func resolve_variant_weight(enemy: Enemy) -> float:
var variant_key = enemy.variant if enemy.variant else \"common\"
var override = danger_weights.variantOverrides.get(variant_key)
if override != null:
return override

var behavior_type = enemy.behavior_type if enemy.has(\"behavior_type\") else \"default\"
var behavior_weight = danger_weights.behavior.get(behavior_type)
if behavior_weight != null:
return behavior_weight

return danger_weights.behavior.get(\"default\", 0)

func estimate_reward_value(enemy: Enemy) -> float:
# Estima valor de XP baseado em size, variant e configuração
var size = enemy.size if enemy.has(\"size\") else \"small\"
var base_orbs = {\"large\": 3, \"medium\": 2, \"small\": 1}.get(size, 1)
var size_factor = {\"large\": 2.0, \"medium\": 1.5, \"small\": 1.0}.get(size, 1.0)
var variant_config = enemy.get_variant_config() if enemy.has_method(\"get_variant_config\") else {}
var orb_multiplier = variant_config.get(\"orbMultiplier\", 1.0)
var orb_value = 5 # XP_ORB_BASE_VALUE

return base_orbs * size_factor * orb_multiplier * orb_value

func compute_direction_factor(enemy: Enemy, player_pos: Vector3) -> float:
var vx = enemy.velocity.x if enemy.has(\"velocity\") else 0.0
var vz = enemy.velocity.z if enemy.has(\"velocity\") else 0.0
var speed = sqrt(vx * vx + vz * vz)

if speed == 0:
return -abs(danger_weights.directionBias)

var dx = player_pos.x - enemy.global_position.x
var dz = player_pos.z - enemy.global_position.z
var distance = sqrt(dx * dx + dz * dz)

if distance == 0:
return 1.0

# Dot product normalizado: 1 = movendo em direção ao player, -1 = afastando
var dot = (vx * dx + vz * dz) / (speed * distance)
var bias = danger_weights.directionBias
return dot - bias

func compute_speed_factor(enemy: Enemy) -> float:
var vx = enemy.velocity.x if enemy.has(\"velocity\") else 0.0
var vz = enemy.velocity.z if enemy.has(\"velocity\") else 0.0
var speed = sqrt(vx * vx + vz * vz)
var reference = max(1.0, danger_weights.speedReference)
return min(1.0, speed / reference)

func compute_distance_factor(distance: float) -> float:
if not is_finite(distance):
return 0.0

var range_val = max(1.0, targeting_range)
var normalized = clamp(distance / range_val, 0.0, 1.0)
return 1.0 - normalized
\`\`\`

**Implementação Godot:**
- Usar \`Dictionary\` para danger weights (configurável via Resource)
- Cachear scores em \`target_threat_cache\` (Map)
- Recalcular apenas quando targeting refresh ocorre

## 5. Impact Threat (Ameaça de Impacto)
Descrever algoritmo baseado em \`CombatSystem.js\` linhas 1426-1553.

**Conceito:**
- Calcula **tempo até impacto** baseado em velocidade relativa (enemy - player)
- Calcula **distância projetada** no momento do impacto
- Calcula **urgência** baseada em proximidade temporal e espacial
- Calcula **recommended shots** para multi-lock (quantos canhões dedicar a este alvo)

**Componentes:**
1. **Time Component**: \`(1 - clampedTime / maxTime) * timeWeight\`
2. **Distance Component**: \`(1 - clampedDistance / distanceNormalization) * distanceWeight\`
3. **HP Component**: \`(remainingHP / hpNormalization) * hpWeight\`
4. **Urgency**: \`(urgencyDistance + urgencyTime) * (1 + hpUrgencyMultiplier * hpRatio)\`
5. **Recommended Shots**: \`round(1 + stackPressure)\` clamped to \`[1, maxRecommended]\`

**Pseudocódigo GDScript:**
\`\`\`gdscript
func calculate_impact_threat(
enemy: Enemy,
player_pos: Vector3,
distance: float,
player_velocity: Vector3 = Vector3.ZERO,
player_radius: float = 24.0
) -> Dictionary:
var weights = danger_weights.impact
if not weights:
return {
\"total\": 0,
\"distanceComponent\": 0,
\"timeComponent\": 0,
\"hpComponent\": 0,
\"timeToImpact\": INF,
\"projectedDistance\": distance,
\"urgency\": 0,
\"recommendedShots\": 1
}

# Velocidade relativa (enemy - player)
var vx = enemy.velocity.x if enemy.has(\"velocity\") else 0.0
var vz = enemy.velocity.z if enemy.has(\"velocity\") else 0.0
var player_vx = player_velocity.x
var player_vz = player_velocity.z

var rel_vx = vx - player_vx
var rel_vz = vz - player_vz
var rel_speed_sq = rel_vx * rel_vx + rel_vz * rel_vz

# Posição relativa
var dx = enemy.global_position.x - player_pos.x
var dz = enemy.global_position.z - player_pos.z
var base_distance = distance if is_finite(distance) else sqrt(dx * dx + dz * dz)

# Calcula tempo até impacto (projeção de velocidade relativa)
var time_to_impact = INF
if rel_speed_sq > 0.0001:
var projection = (dx * rel_vx + dz * rel_vz) / rel_speed_sq
time_to_impact = max(0.0, projection) if projection > 0 else 0.0

# Time Component
var max_time = max(0.1, weights.timeNormalization)
var clamped_time = min(time_to_impact, max_time)
var time_component = (1.0 - clamped_time / max_time) * weights.timeWeight

# Distância projetada no momento do impacto
var projected_distance = base_distance
if is_finite(time_to_impact) and time_to_impact != INF:
var future_dx = dx + rel_vx * time_to_impact
var future_dz = dz + rel_vz * time_to_impact
projected_distance = sqrt(future_dx * future_dx + future_dz * future_dz)

# Distance Component
var effective_radius = max(1.0, player_radius)
var distance_normalization = max(effective_radius * 2, weights.distanceNormalization)
var clamped_distance = min(projected_distance, distance_normalization)
var distance_component = (1.0 - clamped_distance / distance_normalization) * weights.distanceWeight

# HP Component
var remaining_health = max(0.0, enemy.health if enemy.has(\"health\") else 0.0)
var max_health = max(remaining_health, enemy.max_health if enemy.has(\"max_health\") else remaining_health)
var hp_normalization = max(1.0, weights.hpNormalization)
var hp_ratio = min(1.0, remaining_health / hp_normalization)
var hp_component = hp_ratio * weights.hpWeight

var total = distance_component + time_component + hp_component

# Urgency (para multi-lock prioritization)
var urgency_distance = weights.urgencyDistance * (distance_component / weights.distanceWeight if weights.distanceWeight > 0 else 0)
var urgency_time = weights.urgencyTime * (time_component / weights.timeWeight if weights.timeWeight > 0 else 0)
var urgency_base = urgency_distance + urgency_time
var hp_urgency_multiplier = max(0.0, weights.hpUrgencyMultiplier)
var urgency = urgency_base * (1.0 + hp_urgency_multiplier * hp_ratio)

# Recommended Shots (para multi-lock distribution)
var stack_multiplier = max(0.0, weights.stackMultiplier)
var stack_base = max(0.0, weights.stackBase)
var min_stack_score = max(0.0, weights.minStackScore)
var stack_pressure = urgency * stack_multiplier + stack_base * hp_ratio
if stack_pressure < min_stack_score:
stack_pressure = min_stack_score * hp_ratio

var max_recommended = max(1, weights.maxRecommended)
var recommended_shots = clamp(round(1 + stack_pressure), 1, max_recommended)

return {
\"total\": total,
\"distanceComponent\": distance_component,
\"timeComponent\": time_component,
\"hpComponent\": hp_component,
\"timeToImpact\": time_to_impact,
\"projectedDistance\": projected_distance,
\"urgency\": urgency,
\"hpRatio\": hp_ratio,
\"recommendedShots\": recommended_shots
}
\`\`\`

**Implementação Godot:**
- Usar \`Vector3\` para velocidades (projeção 2D→3D: \`y\` → \`z\`)
- Cachear impact breakdown em \`target_threat_cache\`
- Usar para priorizar alvos em multi-lock

## 6. Predição Balística (Linear vs Dynamic)
Descrever algoritmos baseados em \`CombatSystem.js\` linhas 617-699, 1633-1699.

**Conceito:**
- **Linear Prediction** (Tier 0-1): Extrapolação simples baseada em lead time fixo
- **Dynamic Intercept** (Tier 2+): Resolve equação quadrática para calcular ponto de interceptação considerando velocidade do projétil e do alvo

### 6.1. Linear Prediction

**Fórmula:**
\`\`\`
predicted = {
x: enemy.x + enemy.vx * leadTime,
y: enemy.y + enemy.vy * leadTime
}
\`\`\`

**Pseudocódigo GDScript:**
\`\`\`gdscript
func calculate_linear_prediction(origin: Vector3, enemy: Enemy) -> Vector3:
var lead_time = max(0.0, dynamic_prediction_settings.fallbackLeadTime)
var vx = enemy.velocity.x if enemy.has(\"velocity\") else 0.0
var vz = enemy.velocity.z if enemy.has(\"velocity\") else 0.0

return Vector3(
enemy.global_position.x + vx * lead_time,
0,
enemy.global_position.z + vz * lead_time
)
\`\`\`

### 6.2. Dynamic Intercept (Equação Quadrática)

**Conceito:**
- Resolve equação quadrática para encontrar tempo de interceptação
- Considera velocidade do projétil (\`bulletSpeed\`) e velocidade do alvo
- Clamps tempo entre \`minLeadTime\` e \`maxLeadTime\`

**Equação:**
\`\`\`
a*t² + b*t + c = 0

onde:
a = vx² + vz² - bulletSpeed²
b = 2(relX*vx + relZ*vz)
c = relX² + relZ²

relX = enemy.x - origin.x
relZ = enemy.z - origin.z
vx = enemy.velocity.x
vz = enemy.velocity.z
\`\`\`

**Solução:**
- Se \`|a| < 0.0001\`: Caso degenerado, \`t = -c / b\`
- Caso contrário: \`t = (-b ± sqrt(b² - 4ac)) / 2a\`
- Escolhe menor \`t > 0\`
- Clamps \`t\` entre \`minLeadTime\` e \`maxLeadTime\`

**Pseudocódigo GDScript:**
\`\`\`gdscript
func calculate_dynamic_intercept(origin: Vector3, enemy: Enemy) -> Vector3:
if bullet_speed <= 0:
return null

var rel_x = enemy.global_position.x - origin.x
var rel_z = enemy.global_position.z - origin.z
var vx = enemy.velocity.x if enemy.has(\"velocity\") else 0.0
var vz = enemy.velocity.z if enemy.has(\"velocity\") else 0.0

var a = vx * vx + vz * vz - bullet_speed * bullet_speed
var b = 2 * (rel_x * vx + rel_z * vz)
var c = rel_x * rel_x + rel_z * rel_z

var time = null

# Caso degenerado (a ≈ 0)
if abs(a) < 0.0001:
if abs(b) < 0.0001:
return null
time = -c / b
else:
# Fórmula quadrática
var discriminant = b * b - 4 * a * c
if discriminant < 0:
return null # Sem solução real

var sqrt_disc = sqrt(discriminant)
var t1 = (-b - sqrt_disc) / (2 * a)
var t2 = (-b + sqrt_disc) / (2 * a)

# Escolhe menor t > 0
var valid = []
if t1 > 0:
valid.append(t1)
if t2 > 0:
valid.append(t2)

if valid.is_empty():
return null

time = valid.min()

if not is_finite(time) or time <= 0:
return null

# Clamp entre min e max lead time
var min_lead = max(0.0, dynamic_prediction_settings.minLeadTime)
var max_lead = max(min_lead, dynamic_prediction_settings.maxLeadTime)
time = clamp(time, min_lead, max_lead)

# Retorna posição prevista
return Vector3(
enemy.global_position.x + vx * time,
0,
enemy.global_position.z + vz * time
)
\`\`\`

**Implementação Godot:**
- Usar \`calculate_dynamic_intercept()\` quando \`targeting_upgrade_level >= 2\`
- Fallback para \`calculate_linear_prediction()\` se dynamic falhar
- Renderizar marcador visual no ponto previsto (círculo pulsante)

## 7. Multi-Lock System (Distribuição de Locks)
Descrever algoritmo baseado em \`CombatSystem.js\` linhas 1009-1247.

**Conceito:**
- Tier 3 upgrade permite até 4 locks simultâneos
- Número de locks = \`min(multiLockTargets, multishot)\`
- Distribui locks baseado em **urgência** e **recommended shots**
- Pode empilhar múltiplos locks no mesmo alvo se urgência for alta

### 7.1. Compute Lock Count

\`\`\`gdscript
func compute_lock_count(player_stats: Dictionary) -> int:
if targeting_upgrade_level < 3:
return 1

var multishot = player_stats.get(\"multishot\", 1)
var shot_count = max(1, int(multishot))
var target_cap = max(1, int(multi_lock_targets))

return min(target_cap, shot_count)
\`\`\`

### 7.2. Build Lock Assignments

**Algoritmo:**
1. Filtra alvos válidos da \`targeting_priority_list\`
2. Extrai \`recommended_shots\` e \`urgency\` do threat breakdown
3. **Baseline assignment**: Aloca 1 shot para cada top priority target
4. **Distribui shots restantes**: Baseado em priority function \`urgency * (1 + stackMultiplier * 0.5 + remainingBias) + score * 0.01\`
5. **Preenche slots vazios**: Com top priority target
6. Ordena assignments por \`priorityIndex\`
7. Calcula \`duplicateIndex\` e \`duplicateCount\` para cada assignment

**Pseudocódigo GDScript:**
\`\`\`gdscript
func build_lock_assignments(desired_count: int) -> Array[Dictionary]:
var count = max(0, int(desired_count))
if count <= 0:
return []

# Filtra alvos válidos
var valid_entries = targeting_priority_list.filter(
func(entry): return entry.enemy and not entry.enemy.destroyed and is_valid_target(entry.enemy)
)

if valid_entries.is_empty():
return []

# Extrai stats de cada alvo
var stats = []
for i in range(valid_entries.size()):
var entry = valid_entries[i]
var enemy = entry.enemy
var threat = target_threat_cache.get(enemy.id, {})
var breakdown = threat.get(\"breakdown\", {})
var impact = breakdown.get(\"impact\", {})

var recommended = clamp(
int(impact.get(\"recommendedShots\", 1)),
1,
count
)
var urgency = impact.get(\"urgency\", entry.get(\"score\", 0))

stats.append({
\"enemy\": enemy,
\"index\": i,
\"threat\": threat,
\"breakdown\": breakdown,
\"recommended\": recommended,
\"urgency\": urgency,
\"score\": entry.get(\"score\", 0),
\"id\": enemy.id,
\"assigned\": 0,
\"remaining\": recommended
})

# Baseline assignment: 1 shot por top priority target
var counts = {}
var remaining = count
for i in range(min(stats.size(), remaining)):
var stat = stats[i]
counts[stat.id] = 1
stat.assigned = 1
stat.remaining = max(0, stat.recommended - 1)
remaining -= 1

# Distribui shots restantes baseado em priority
var compute_priority = func(stat):
if not stat:
return -INF
var urgency_val = stat.urgency if is_finite(stat.urgency) else 0.0
var stack_mult = max(0.0, danger_weights.impact.stackMultiplier)
var remaining_bias = max(0.0, stat.remaining)
var score_bias = stat.score if is_finite(stat.score) else 0.0
return urgency_val * (1.0 + stack_mult * 0.5 + remaining_bias) + score_bias * 0.01

while remaining > 0 and not stats.is_empty():
var best_stat = null
var best_value = -INF
for stat in stats:
var value = compute_priority.call(stat)
if value > best_value:
best_value = value
best_stat = stat

if not best_stat:
break

counts[best_stat.id] = counts.get(best_stat.id, 0) + 1
best_stat.assigned += 1
best_stat.remaining = max(0, best_stat.recommended - best_stat.assigned)
remaining -= 1

# Preenche slots vazios com top priority
var top_stat = stats[0] if not stats.is_empty() else null
while remaining > 0 and top_stat:
counts[top_stat.id] = counts.get(top_stat.id, 0) + 1
top_stat.assigned += 1
top_stat.remaining = max(0, top_stat.recommended - top_stat.assigned)
remaining -= 1

# Cria assignments
var assignments = []
for stat in stats:
var total_for_target = counts.get(stat.id, 0)
for i in range(total_for_target):
assignments.append({
\"enemy\": stat.enemy,
\"priorityIndex\": stat.index,
\"threat\": stat.threat,
\"breakdown\": stat.breakdown,
\"urgency\": stat.urgency
})

# Limita ao count desejado
if assignments.size() > count:
assignments.resize(count)

# Preenche se necessário
while assignments.size() < count and top_stat:
assignments.append({
\"enemy\": top_stat.enemy,
\"priorityIndex\": top_stat.index,
\"threat\": top_stat.threat,
\"breakdown\": top_stat.breakdown,
\"urgency\": top_stat.urgency
})

# Ordena por priorityIndex
assignments.sort_custom(func(a, b): return a.priorityIndex < b.priorityIndex)

# Calcula duplicateIndex e duplicateCount
var totals = {}
for assignment in assignments:
var id = assignment.enemy.id
totals[id] = totals.get(id, 0) + 1

var running = {}
for i in range(assignments.size()):
var assignment = assignments[i]
var id = assignment.enemy.id
var duplicate_index = running.get(id, 0)
assignment.index = i
assignment.duplicateIndex = duplicate_index
assignment.duplicateCount = totals.get(id, 1)
running[id] = duplicate_index + 1

return assignments
\`\`\`

**Implementação Godot:**
- Executar em \`rebuild_lock_set()\` quando lock count muda
- Cachear assignments em \`current_lock_assignments\`
- Usar para calcular parallel offsets (ver seção 8)

## 8. Parallel Cannon Offsets (Canhões Independentes)
Descrever algoritmo baseado em \`CombatSystem.js\` linhas 1334-1375.

**Conceito:**
- Tier 3 upgrade cria efeito de \"bateria de canhões\"
- Cada lock dispara de uma posição offset paralela ao vetor player→alvo
- Offsets são **perpendiculares** à linha de mira
- Magnitude baseada em \`parallelSpacing\` e clamped por \`parallelRadiusMultiplier * targetRadius\`

**Algoritmo:**
1. Calcula vetor player→aimPoint: \`(dx, dz)\`
2. Normaliza: \`(dx/distance, dz/distance)\`
3. Calcula slot center: \`(duplicateCount - 1) / 2\`
4. Calcula offset index: \`duplicateIndex - slotCenter\`
5. Calcula magnitude: \`offsetIndex * parallelSpacing\`
6. Clamps magnitude: \`max(-clampLimit, min(clampLimit, magnitude))\`
7. Calcula vetor perpendicular: \`(-dz/distance, dx/distance) * magnitude\`

**Pseudocódigo GDScript:**
\`\`\`gdscript
func compute_parallel_offset(
player_pos: Vector3,
aim_point: Vector3,
duplicate_index: int,
duplicate_count: int,
enemy: Enemy
) -> Vector3:
if duplicate_count <= 1:
return Vector3.ZERO

var dx = aim_point.x - player_pos.x
var dz = aim_point.z - player_pos.z
var distance = sqrt(dx * dx + dz * dz)

if distance == 0:
return Vector3.ZERO

# Calcula offset index centrado
var slot_center = (duplicate_count - 1) / 2.0
var offset_index = duplicate_index - slot_center

if abs(offset_index) < 0.0001:
return Vector3.ZERO

# Calcula magnitude
var spacing = parallel_spacing # Padrão: 14px
var magnitude = offset_index * spacing

# Clamp baseado no raio do alvo
var target_radius = enemy.radius if enemy.has(\"radius\") else 16.0
var clamp_limit = max(spacing, target_radius * parallel_radius_multiplier)
magnitude = clamp(magnitude, -clamp_limit, clamp_limit)

# Vetor perpendicular (rotação 90° no plano XZ)
var perp_x = (-dz / distance) * magnitude
var perp_z = (dx / distance) * magnitude

return Vector3(perp_x, 0, perp_z)
\`\`\`

**Exemplo:**
- \`duplicateCount = 4\`, \`parallelSpacing = 14\`
- Slot center = 1.5
- Offsets:
- Index 0: offsetIndex = -1.5, magnitude = -21px (esquerda)
- Index 1: offsetIndex = -0.5, magnitude = -7px (esquerda)
- Index 2: offsetIndex = +0.5, magnitude = +7px (direita)
- Index 3: offsetIndex = +1.5, magnitude = +21px (direita)

**Implementação Godot:**
- Aplicar offset tanto em \`fireOrigin\` quanto em \`aimPoint\`
- \`fireOrigin = playerPos + offset\`
- \`aimPoint = predictedPos + offset\`
- Renderizar múltiplos marcadores visuais (um por lock)

## 9. Shooting Logic (Lógica de Disparo)
Descrever algoritmo baseado em \`CombatSystem.js\` linhas 447-606.

**Conceito:**
- Dispara quando \`lastShotTime >= shootCooldown\` e há alvo válido
- Tier 0-2: Usa multishot spread (leque)
- Tier 3: Usa coordinated fire (canhões independentes com offsets)
- Cada shot cria bullet com \`fireOrigin\`, \`aimPoint\`, \`damage\`

**Pseudocódigo GDScript:**
\`\`\`gdscript
func handle_shooting(delta: float, player_stats: Dictionary) -> void:
last_shot_time += delta

if not can_shoot():
return

var player_pos = player.global_position
var lock_targets = current_target_locks if not current_target_locks.is_empty() else ([current_target] if current_target else [])

if lock_targets.is_empty():
return

var total_shots = max(1, int(player_stats.get(\"multishot\", 1)))
var using_advanced_battery = targeting_upgrade_level >= 3

# Prepara assignments
var assignments = []
if using_advanced_battery and not current_lock_assignments.is_empty():
assignments = current_lock_assignments
else:
# Fallback: cria assignments simples
for i in range(lock_targets.size()):
var enemy = lock_targets[i]
var predicted_aim = predicted_aim_points_map.get(enemy.id)
if not predicted_aim:
predicted_aim = get_predicted_target_position(enemy, player_pos)
if not predicted_aim:
predicted_aim = enemy.global_position

assignments.append({
\"enemy\": enemy,
\"predictedAim\": predicted_aim,
\"fireOrigin\": player_pos,
\"fireOffset\": Vector3.ZERO,
\"duplicateIndex\": i,
\"duplicateCount\": lock_targets.size(),
\"index\": i
})

if assignments.is_empty():
return

var multi_lock_active = using_advanced_battery and lock_targets.size() > 1
var fired_targets = []

# Dispara cada shot
for shot_index in range(total_shots):
var assignment = assignments[min(assignments.size() - 1, shot_index)] if using_advanced_battery else assignments[0]

if not assignment or not assignment.enemy:
continue

var duplicate_count = max(1, assignment.get(\"duplicateCount\", 1))
var duplicate_index = assignment.get(\"duplicateIndex\", 0)

var fire_origin = assignment.get(\"fireOrigin\", player_pos)
var aim_point = assignment.get(\"predictedAim\")

if not aim_point:
var predicted = get_predicted_target_position(assignment.enemy, player_pos)
if not predicted:
predicted = assignment.enemy.global_position

if using_advanced_battery:
var offset = compute_parallel_offset(
player_pos, predicted, duplicate_index, duplicate_count, assignment.enemy
)
fire_origin = player_pos + offset
aim_point = predicted + offset
else:
aim_point = predicted
fire_origin = player_pos

# Aplica offset se disponível
if using_advanced_battery and assignment.has(\"fireOffset\"):
fire_origin = player_pos + assignment.fireOffset
aim_point = assignment.predictedAim

# Aplica spread se não estiver usando advanced battery
if not using_advanced_battery and total_shots > 1:
var should_apply_spread = total_shots > assignments.size() or assignments.size() <= 1
if should_apply_spread:
aim_point = apply_multishot_spread(player_pos, aim_point, shot_index, total_shots)

# Cria bullet
create_bullet(fire_origin, aim_point, player_stats.get(\"damage\", 25))
fired_targets.append({
\"enemyId\": assignment.enemy.id,
\"position\": aim_point
})

last_shot_time = 0.0

# Emite evento
if not fired_targets.is_empty():
var first_target = fired_targets[0].position
EventBus.emit_signal(\"weapon_fired\", {
\"position\": player_pos,
\"target\": first_target,
\"weaponType\": \"basic\",
\"primaryTargetId\": current_target.id if current_target else null,
\"targeting\": {
\"dynamicPrediction\": using_dynamic_prediction(),
\"lockCount\": lock_targets.size(),
\"multiLockActive\": multi_lock_active,
\"predictedPoints\": fired_targets
}
})

func can_shoot() -> bool:
return (
last_shot_time >= shoot_cooldown and
current_target and
not current_target.destroyed and
is_valid_target(current_target)
)

func apply_multishot_spread(
player_pos: Vector3,
target_pos: Vector3,
shot_index: int,
total_shots: int
) -> Vector3:
var spread_step = 0.3 # COMBAT_MULTISHOT_SPREAD_STEP (radians)
var spread_angle = (shot_index - (total_shots - 1) / 2.0) * spread_step

var dx = target_pos.x - player_pos.x
var dz = target_pos.z - player_pos.z
var distance = sqrt(dx * dx + dz * dz)

if distance == 0:
return target_pos

var base_angle = atan2(dz, dx)
var final_angle = base_angle + spread_angle

return Vector3(
player_pos.x + cos(final_angle) * distance,
0,
player_pos.z + sin(final_angle) * distance
)
\`\`\`

**Implementação Godot:**
- Usar \`Timer\` node para \`shoot_cooldown\`
- Criar bullets via object pool (ver \`docs/godot-migration/mechanics-pooling.md\`)
- Emitir signal \`weapon_fired\` para VFX/SFX

## 10. Upgrade Progression (3 Tiers)
Descrever progressão baseada em \`offense.js\` linhas 138-231 e \`CombatSystem.js\` linhas 807-869.

**Tier 1 - Adaptive Acquisition (Aquisição Adaptativa)**
- **Unlock Level**: 1
- **Efeito**: Ativa danger scoring com matriz de periculosidade
- **Evento**: \`upgrade-aiming-suite\` com \`{resetWeights: true}\`
- **Comportamento**: Prioriza variantes perseguidoras (parasite: 240) e explosivas (volatile: 200)
- **Visual**: Linha de mira pulsa ao fixar novo alvo prioritário

**Tier 2 - Dynamic Prediction (Predição Dinâmica)**
- **Unlock Level**: 3
- **Prerequisite**: Tier 1
- **Efeito**: Ativa predição balística com equação quadrática
- **Evento**: \`upgrade-aiming-suite\` com \`{dynamicPrediction: {minLeadTime: 0.05, maxLeadTime: 1.1, fallbackLeadTime: 0.35}}\`
- **Comportamento**: Calcula ponto de interceptação considerando velocidade do projétil
- **Visual**: Marca visualmente o ponto previsto de impacto (círculo pulsante)
- **Audio**: Modula levemente o timbre do disparo

**Tier 3 - Coordinated Locks (Travas Coordenadas)**
- **Unlock Level**: 5
- **Prerequisite**: Tier 1 + Multishot Nível 1
- **Efeito**: Ativa bateria de 4 canhões independentes
- **Evento**: \`upgrade-aiming-suite\` com \`{multiLockTargets: 4, cooldownMultiplier: 0.92}\`
- **Comportamento**: Coordena até 4 travas, pode concentrar fogo em alvo iminente
- **Visual**: Múltiplos indicadores de lock, offsets paralelos visíveis
- **Audio**: Pitch/sustain escalam com número de canhões ativos
- **Cooldown**: Reduzido para 0.276s (0.3s * 0.92)

**Pseudocódigo GDScript (Apply Upgrade):**
\`\`\`gdscript
func apply_aiming_upgrade(data: Dictionary) -> void:
var level_value = data.get(\"level\")
if level_value != null and is_finite(level_value):
targeting_upgrade_level = max(targeting_upgrade_level, int(level_value))

# Reset weights se solicitado
if data.get(\"resetWeights\", false):
danger_weights = default_danger_weights.duplicate(true)

# Merge custom weights
if data.has(\"dangerWeights\"):
merge_danger_weights(data.dangerWeights)

# Update linear lead time
if data.has(\"linearLeadTime\") and is_finite(data.linearLeadTime):
linear_prediction_time = max(0.0, data.linearLeadTime)

# Update dynamic prediction settings
if data.has(\"dynamicPrediction\"):
update_dynamic_prediction_settings(data.dynamicPrediction)

# Enable danger scoring (Tier 1+)
if targeting_upgrade_level >= 1:
danger_score_enabled = true

# Enable dynamic prediction (Tier 2+)
if targeting_upgrade_level >= 2:
dynamic_prediction_enabled = true

# Enable multi-lock (Tier 3+)
if targeting_upgrade_level >= 3:
var target_count = data.get(\"multiLockTargets\")
if target_count != null and is_finite(target_count) and target_count > 0:
multi_lock_targets = max(1, int(target_count))

var cooldown_mult = data.get(\"cooldownMultiplier\")
if cooldown_mult != null and is_finite(cooldown_mult) and cooldown_mult > 0:
set_shoot_cooldown(base_shoot_cooldown * cooldown_mult)

# Update target update interval
if data.has(\"targetUpdateInterval\") and is_finite(data.targetUpdateInterval):
target_update_interval = max(0.05, data.targetUpdateInterval)
else:
target_update_interval = resolve_target_update_interval()

target_update_timer = min(target_update_timer, target_update_interval)

func resolve_target_update_interval() -> float:
# Tier 3: 0.1s, Tier 2: 0.12s, Tier 1: 0.14s, Base: 0.15s
if targeting_upgrade_level >= 3:
return 0.1
elif targeting_upgrade_level >= 2:
return 0.12
elif targeting_upgrade_level >= 1:
return 0.14
else:
return 0.15
\`\`\`

**Implementação Godot:**
- Conectar signal \`upgrade_aiming_suite\` do UpgradeManager
- Usar \`Resource\` files para upgrade definitions
- Validar prerequisites antes de aplicar tier 3

## 11. Implementação Godot: Estrutura de Cena

**Scene: CombatTargetingSystem.tscn**
\`\`\`
CombatTargetingSystem (Node3D)
├─ TargetingArea (Area3D)
│ ├─ CollisionShape3D (SphereShape3D, radius: 400)
│ └─ monitoring: true, monitorable: false
├─ TargetUpdateTimer (Timer)
│ ├─ wait_time: 0.15
│ ├─ autostart: true
│ └─ one_shot: false
├─ ShootCooldownTimer (Timer)
│ ├─ wait_time: 0.3
│ └─ one_shot: true
└─ BulletContainer (Node3D)
└─ (bullets spawned here)
\`\`\`

**Script: CombatTargetingSystem.gd**
\`\`\`gdscript
class_name CombatTargetingSystem
extends Node3D

signal target_locked(enemy_id: String, variant: String, score: float, lock_count: int)
signal target_lost
signal weapon_fired(data: Dictionary)

@onready var targeting_area: Area3D = \$TargetingArea
@onready var target_update_timer: Timer = \$TargetUpdateTimer
@onready var shoot_cooldown_timer: Timer = \$ShootCooldownTimer
@onready var bullet_container: Node3D = \$BulletContainer

# (campos declarados na seção 2)

func _ready() -> void:
target_update_timer.timeout.connect(_on_target_update_timeout)
shoot_cooldown_timer.timeout.connect(_on_shoot_cooldown_timeout)
EventBus.upgrade_aiming_suite.connect(apply_aiming_upgrade)
EventBus.player_reset.connect(_on_player_reset)
EventBus.player_died.connect(_on_player_died)

func _process(delta: float) -> void:
update_targeting(delta)
handle_shooting(delta, last_known_player_stats)
update_bullets(delta)
update_enemy_bullets(delta)

func _on_target_update_timeout() -> void:
find_best_target()

func _on_shoot_cooldown_timeout() -> void:
# Cooldown completo, pode disparar novamente
pass

func _on_player_reset() -> void:
current_target = null
current_target_locks.clear()
current_lock_assignments.clear()
targeting_priority_list.clear()
predicted_aim_points.clear()
predicted_aim_points_map.clear()
target_threat_cache.clear()
target_indicator_pulse = 0.0
clear_enemy_bullets()

func _on_player_died() -> void:
current_target = null
current_target_locks.clear()
current_lock_assignments.clear()
targeting_priority_list.clear()
predicted_aim_points.clear()
predicted_aim_points_map.clear()
target_threat_cache.clear()
target_indicator_pulse = 0.0
clear_enemy_bullets()

# (implementar funções descritas nas seções anteriores)
\`\`\`

**Nodes Sugeridos:**
- **Area3D**: Para detecção de inimigos dentro de \`targetingRange\`
- **Timer**: Para \`target_update_interval\` e \`shoot_cooldown\`
- **MultiMesh**: Para renderizar múltiplos bullets (ver \`docs/godot-migration/mechanics-pooling.md\`)
- **GPUParticles3D**: Para muzzle flash, bullet trails
- **Line2D** (em CanvasLayer): Para lock indicators, predicted markers

## 12. Tabela de Parâmetros Configuráveis

| Parâmetro | Valor Padrão | Descrição | Arquivo Origem |
|-----------|--------------|-----------|----------------|
| **Targeting** |
| \`COMBAT_TARGETING_RANGE\` | 400 | Raio de detecção de alvos (px) | \`gameplay.js:60\` |
| \`TARGET_UPDATE_INTERVAL\` | 0.15 | Intervalo base de refresh (s) | \`gameplay.js:64\` |
| \`targetUpdateIntervals.adaptive\` | 0.14 | Intervalo tier 1 (s) | \`gameplay.js:117\` |
| \`targetUpdateIntervals.dynamic\` | 0.12 | Intervalo tier 2 (s) | \`gameplay.js:118\` |
| \`targetUpdateIntervals.multiLock\` | 0.1 | Intervalo tier 3 (s) | \`gameplay.js:119\` |
| **Shooting** |
| \`COMBAT_SHOOT_COOLDOWN\` | 0.3 | Cooldown entre disparos (s) | \`gameplay.js:59\` |
| \`BULLET_SPEED\` | 450 | Velocidade de projéteis (px/s) | \`gameplay.js:6\` |
| \`COMBAT_BULLET_LIFETIME\` | 1.8 | Tempo de vida de projéteis (s) | \`gameplay.js:61\` |
| \`COMBAT_MULTISHOT_SPREAD_STEP\` | 0.3 | Ângulo de spread (rad) | \`gameplay.js:63\` |
| **Danger Weights** |
| \`behavior.parasite\` | 240 | Peso para parasites | \`gameplay.js:69\` |
| \`behavior.volatile\` | 200 | Peso para volatiles | \`gameplay.js:70\` |
| \`behavior.default\` | 140 | Peso padrão | \`gameplay.js:71\` |
| \`variantOverrides.gold\` | 170 | Peso para gold | \`gameplay.js:76\` |
| \`variantOverrides.crystal\` | 160 | Peso para crystal | \`gameplay.js:77\` |
| \`variantOverrides.common\` | 120 | Peso para common | \`gameplay.js:80\` |
| \`reward\` | 30 | Peso de recompensa | \`gameplay.js:82\` |
| \`rewardNormalization\` | 20 | Normalização de recompensa | \`gameplay.js:83\` |
| \`direction\` | 6 | Peso de direção | \`gameplay.js:84\` |
| \`directionBias\` | 0.12 | Bias de direção | \`gameplay.js:85\` |
| \`speed\` | 4 | Peso de velocidade | \`gameplay.js:86\` |
| \`speedReference\` | 180 | Velocidade de referência | \`gameplay.js:87\` |
| \`size.large\` | 3 | Peso para large | \`gameplay.js:89\` |
| \`size.medium\` | 2 | Peso para medium | \`gameplay.js:90\` |
| \`size.small\` | 1 | Peso para small | \`gameplay.js:91\` |
| \`distance\` | 0.75 | Peso de distância | \`gameplay.js:93\` |
| **Impact Threat** |
| \`impact.distanceWeight\` | 18 | Peso de distância projetada | \`gameplay.js:95\` |
| \`impact.distanceNormalization\` | 150 | Normalização de distância | \`gameplay.js:96\` |
| \`impact.timeWeight\` | 12 | Peso de tempo até impacto | \`gameplay.js:97\` |
| \`impact.timeNormalization\` | 1.25 | Normalização de tempo (s) | \`gameplay.js:98\` |
| \`impact.hpWeight\` | 8 | Peso de HP | \`gameplay.js:99\` |
| \`impact.hpNormalization\` | 180 | Normalização de HP | \`gameplay.js:100\` |
| \`impact.urgencyDistance\` | 12 | Urgência de distância | \`gameplay.js:101\` |
| \`impact.urgencyTime\` | 10 | Urgência de tempo | \`gameplay.js:102\` |
| \`impact.hpUrgencyMultiplier\` | 1.1 | Multiplicador de urgência HP | \`gameplay.js:103\` |
| \`impact.stackMultiplier\` | 1.35 | Multiplicador de stack | \`gameplay.js:104\` |
| \`impact.stackBase\` | 0.4 | Base de stack | \`gameplay.js:105\` |
| \`impact.minStackScore\` | 0.15 | Score mínimo de stack | \`gameplay.js:106\` |
| \`impact.maxRecommended\` | 4 | Máximo de shots recomendados | \`gameplay.js:107\` |
| **Dynamic Prediction** |
| \`dynamicPrediction.minLeadTime\` | 0.05 | Tempo mínimo de lead (s) | \`gameplay.js:111\` |
| \`dynamicPrediction.maxLeadTime\` | 1.1 | Tempo máximo de lead (s) | \`gameplay.js:112\` |
| \`dynamicPrediction.fallbackLeadTime\` | 0.35 | Lead time linear (s) | \`gameplay.js:113\` |
| **Multi-Lock** |
| \`multiLock.baseTargetCount\` | 4 | Número máximo de locks | \`gameplay.js:122\` |
| \`multiLock.cooldownMultiplier\` | 0.92 | Multiplicador de cooldown | \`gameplay.js:123\` |
| \`multiLock.parallelSpacing\` | 14 | Espaçamento entre canhões (px) | \`gameplay.js:124\` |
| \`multiLock.parallelRadiusMultiplier\` | 0.55 | Multiplicador de raio para clamp | \`gameplay.js:125\` |
| **Feedback** |
| \`feedback.lockPulseDuration\` | 0.4 | Duração do pulso de lock (s) | \`gameplay.js:128\` |
| \`feedback.lockLineAlpha\` | 0.35 | Alpha da linha de lock | \`gameplay.js:129\` |
| \`feedback.lockHighlightAlpha\` | 0.75 | Alpha do highlight de lock | \`gameplay.js:130\` |
| \`feedback.predictedMarkerRadius\` | 14 | Raio do marcador preditivo (px) | \`gameplay.js:131\` |

## 13. Diagramas de Fluxo

**Diagrama 1: Pipeline de Targeting**
\`\`\`mermaid
flowchart TD
A[Update Timer Expires] --> B[Scan Enemies in Range]
B --> C{Danger Scoring Enabled?}
C -->|Yes Tier 1+| D[Calculate Danger Score]
C -->|No| E[Use Distance Only]
D --> F[Sort by Score Descending]
E --> F
F --> G[Compute Lock Count]
G --> H[Build Lock Assignments]
H --> I[Refresh Predicted Aim Points]
I --> J[Update Current Target]
J --> K{New Primary Target?}
K -->|Yes| L[Emit Target Lock Event]
K -->|No| M[Continue]
L --> M
M --> N[Wait for Next Update]
\`\`\`

**Diagrama 2: Danger Scoring Components**
\`\`\`mermaid
flowchart LR
A[Enemy] --> B[Variant Weight]
A --> C[Reward Score]
A --> D[Direction Score]
A --> E[Speed Score]
A --> F[Size Score]
A --> G[Distance Score]
A --> H[Impact Threat]

H --> H1[Time Component]
H --> H2[Distance Component]
H --> H3[HP Component]
H --> H4[Urgency]
H --> H5[Recommended Shots]

B --> I[Total Score]
C --> I
D --> I
E --> I
F --> I
G --> I
H --> I

I --> J[Sort Candidates]
J --> K[Select Top N]
\`\`\`

**Diagrama 3: Ballistic Prediction Flow**
\`\`\`mermaid
flowchart TD
A[Get Predicted Position] --> B{Dynamic Prediction Enabled?}
B -->|Yes Tier 2+| C[Calculate Dynamic Intercept]
B -->|No| D[Calculate Linear Prediction]

C --> E{Quadratic Solution Valid?}
E -->|Yes| F[Clamp Time minLead-maxLead]
E -->|No| D

F --> G[Return Predicted Position]
D --> G

G --> H[Apply Parallel Offset if Tier 3]
H --> I[Store in Predicted Aim Points Map]
\`\`\`

**Diagrama 4: Multi-Lock Assignment**
\`\`\`mermaid
flowchart TD
A[Compute Lock Count] --> B[Filter Valid Targets]
B --> C[Extract Threat Breakdown]
C --> D[Baseline: 1 Shot per Top Target]
D --> E{Remaining Shots?}
E -->|Yes| F[Compute Priority Function]
F --> G[Select Best Stat]
G --> H[Assign Shot]
H --> E
E -->|No| I[Fill Empty Slots with Top Target]
I --> J[Sort by Priority Index]
J --> K[Calculate Duplicate Index/Count]
K --> L[Return Assignments]
\`\`\`

**Diagrama 5: Shooting Flow**
\`\`\`mermaid
sequenceDiagram
participant Player
participant Combat
participant Assignments
participant Bullets
participant VFX

Player->>Combat: Update (delta)
Combat->>Combat: Check Cooldown
Combat->>Combat: Get Player Stats
Combat->>Assignments: Get Lock Assignments

loop For Each Shot
Assignments->>Combat: Get Assignment
Combat->>Combat: Calculate Fire Origin
Combat->>Combat: Calculate Aim Point
alt Tier 3 Advanced Battery
Combat->>Combat: Apply Parallel Offset
else Tier 0-2 Multishot
Combat->>Combat: Apply Spread
end
Combat->>Bullets: Create Bullet
Bullets-->>Combat: Bullet Created
end

Combat->>VFX: Emit weapon_fired Event
VFX-->>Combat: Muzzle Flash + SFX
\`\`\`

**Diagrama 6: Parallel Offset Calculation**
\`\`\`mermaid
flowchart TD
A[Player Pos + Aim Point] --> B[Calculate Vector dx, dz]
B --> C[Normalize distance]
C --> D[Calculate Slot Center]
D --> E[Calculate Offset Index]
E --> F{Offset Index ≈ 0?}
F -->|Yes| G[Return Zero Offset]
F -->|No| H[Calculate Magnitude]
H --> I[Clamp by Target Radius]
I --> J[Calculate Perpendicular Vector]
J --> K[Return Offset x, z]

style G fill:#90EE90
style K fill:#87CEEB
\`\`\`

## 14. Integração com Outros Sistemas

### 14.1. Player System
**Interface necessária:**
\`\`\`gdscript
# PlayerSystem.gd
func get_stats() -> Dictionary:
return {
\"health\": health,
\"maxHealth\": max_health,
\"damage\": damage,
\"multishot\": multishot,
\"magnetismRadius\": magnetism_radius,
\"shieldLevel\": shield_upgrade_level,
\"recoilOffset\": recoil_offset
}

func get_position() -> Vector3:
return global_position

func get_velocity() -> Vector3:
return velocity

func get_shield_radius() -> float:
return get_hull_bounding_radius() + get_shield_padding()
\`\`\`

**Consumo:**
\`\`\`gdscript
# CombatTargetingSystem.gd
func _process(delta: float) -> void:
var player = get_node(\"/root/Game/Player\")
last_known_player_stats = player.get_stats() if player.has_method(\"get_stats\") else {}
# ...
\`\`\`

### 14.2. Enemy Manager
**Interface necessária:**
\`\`\`gdscript
# EnemyManager.gd
func get_active_enemies() -> Array[Enemy]:
return active_enemies.filter(func(e): return not e.destroyed)

func for_each_active_enemy(callback: Callable) -> void:
for enemy in active_enemies:
if not enemy.destroyed:
callback.call(enemy)
\`\`\`

**Consumo:**
\`\`\`gdscript
# CombatTargetingSystem.gd
func find_best_target() -> void:
var enemy_manager = get_node(\"/root/Game/EnemyManager\")
for enemy in enemy_manager.get_active_enemies():
# ...
\`\`\`

### 14.3. Upgrade Manager
**Eventos emitidos:**
\`\`\`gdscript
# UpgradeManager.gd
func apply_upgrade(upgrade_id: String, level: int) -> void:
if upgrade_id == \"targeting_suite\":
var payload = {}
if level == 1:
payload = {\"resetWeights\": true}
elif level == 2:
payload = {
\"dynamicPrediction\": {
\"minLeadTime\": 0.05,
\"maxLeadTime\": 1.1,
\"fallbackLeadTime\": 0.35
}
}
elif level == 3:
payload = {
\"multiLockTargets\": 4,
\"cooldownMultiplier\": 0.92
}
EventBus.emit_signal(\"upgrade_aiming_suite\", payload)
\`\`\`

**Consumo:**
\`\`\`gdscript
# CombatTargetingSystem.gd
func _ready() -> void:
EventBus.upgrade_aiming_suite.connect(apply_aiming_upgrade)
\`\`\`

### 14.4. VFX/SFX System
**Eventos consumidos:**
\`\`\`gdscript
# EffectsSystem.gd
func _ready() -> void:
EventBus.combat_target_lock.connect(_on_target_lock)
EventBus.weapon_fired.connect(_on_weapon_fired)

func _on_target_lock(data: Dictionary) -> void:
if data.get(\"lost\", false):
hide_lock_indicators()
else:
show_lock_pulse(data.enemyId, data.lockCount)

func _on_weapon_fired(data: Dictionary) -> void:
spawn_muzzle_flash(data.position)
play_shoot_sfx(data.targeting.lockCount, data.targeting.dynamicPrediction)
\`\`\`

**Rendering de Indicators:**
\`\`\`gdscript
# CombatTargetingSystem.gd (ou CanvasLayer separado)
func _draw() -> void:
if not current_target_locks.is_empty():
for i in range(current_target_locks.size()):
var enemy = current_target_locks[i]
var assignment = current_lock_assignments[i] if i < current_lock_assignments.size() else null

# Linha de lock
var player_pos = player.global_position
var enemy_pos = enemy.global_position
draw_line(player_pos, enemy_pos, Color(1, 0, 0, lock_line_alpha), 2.0)

# Marcador preditivo (se tier 2+)
if dynamic_prediction_enabled and assignment:
var predicted = assignment.predictedAim
draw_circle(predicted, predicted_marker_radius, Color(1, 1, 0, 0.5))

# Pulse animation
if target_indicator_pulse > 0:
var pulse_alpha = target_indicator_pulse / target_pulse_duration
draw_circle(enemy_pos, 30.0 * pulse_alpha, Color(1, 0, 0, pulse_alpha * 0.3))
\`\`\`

### 14.5. Audio System
**Modulação de SFX:**
\`\`\`gdscript
# AudioSystem.gd
func play_shoot_sfx(lock_count: int, dynamic_prediction: bool) -> void:
var base_pitch = 1.0
var pitch_variation = 0.05 * (lock_count - 1) # +5% por lock adicional
var sustain_multiplier = 1.0 + 0.1 * (lock_count - 1) # +10% sustain por lock

if dynamic_prediction:
base_pitch += 0.03 # Pitch levemente mais alto com predição dinâmica

var audio_player = audio_pool.acquire()
audio_player.stream = shoot_sfx
audio_player.pitch_scale = base_pitch + randf_range(-0.02, 0.02) + pitch_variation
audio_player.volume_db = linear_to_db(0.7 * sustain_multiplier)
audio_player.play()
\`\`\`

## 15. Referências de Código

**Arquivos JavaScript Analisados:**
- \`src/modules/CombatSystem.js\` (linhas 1-2694): Sistema completo de combate
- Linhas 39-142: Constructor e inicialização
- Linhas 244-428: Sistema de targeting
- Linhas 447-660: Lógica de disparo
- Linhas 807-869: Apply aiming upgrade
- Linhas 1009-1247: Multi-lock assignment
- Linhas 1334-1375: Parallel cannon offsets
- Linhas 1377-1424: Danger scoring
- Linhas 1426-1553: Impact threat
- Linhas 1633-1699: Dynamic intercept
- \`src/data/upgrades/offense.js\` (linhas 138-231): Upgrade definitions
- \`src/data/constants/gameplay.js\` (linhas 58-133): Constantes de combate
- \`src/utils/combatHelpers.js\` (linhas 1-110): Funções auxiliares
- \`src/modules/PlayerSystem.js\` (linhas 1082-1095): getStats()
- \`docs/plans/aiming-upgrades-plan.md\`: Contexto de design

**Funções-Chave:**
- \`findBestTarget()\`: Escaneia e seleciona alvos
- \`calculateDangerScore()\`: Calcula score de perigo (7 componentes)
- \`calculateImpactThreat()\`: Calcula trajetória de impacto
- \`calculateDynamicIntercept()\`: Predição balística (equação quadrática)
- \`calculateLinearPrediction()\`: Predição linear (extrapolação)
- \`computeLockCount()\`: Calcula número de locks (min(multiLockTargets, multishot))
- \`buildLockAssignments()\`: Distribui locks entre alvos
- \`computeParallelOffset()\`: Calcula offsets perpendiculares
- \`refreshPredictedAimPoints()\`: Atualiza pontos preditivos
- \`handleShooting()\`: Lógica de disparo
- \`applyAimingUpgrade()\`: Aplica upgrade de mira

**Eventos Emitidos:**
- \`combat-target-lock\`: Quando novo alvo é travado \`{enemyId, variant, score, lockCount}\` ou perdido \`{lost: true}\`
- \`weapon-fired\`: Quando disparo ocorre \`{position, target, weaponType, primaryTargetId, targeting: {dynamicPrediction, lockCount, multiLockActive, predictedPoints}}\`
- \`bullet-created\`: Quando bullet é criado \`{bullet, from, to}\`

**Eventos Consumidos:**
- \`upgrade-aiming-suite\`: Aplica upgrade de mira \`{level?, resetWeights?, dangerWeights?, dynamicPrediction?, multiLockTargets?, cooldownMultiplier?}\`
- \`player-reset\`: Limpa estado de targeting
- \`player-died\`: Limpa estado de targeting
- \`progression-reset\`: Reseta upgrade state
- \`physics-reset\`: Limpa enemy bullets

**Constantes Importantes:**
- \`COMBAT_TARGETING_RANGE = 400\`: Raio de detecção
- \`COMBAT_SHOOT_COOLDOWN = 0.3\`: Cooldown de disparo
- \`BULLET_SPEED = 450\`: Velocidade de projéteis
- \`COMBAT_BULLET_LIFETIME = 1.8\`: Tempo de vida de projéteis
- \`TARGET_UPDATE_INTERVAL = 0.15\`: Intervalo de refresh
- \`COMBAT_MULTISHOT_SPREAD_STEP = 0.3\`: Ângulo de spread

**Mapeamento 2D → 3D (Godot):**
- JavaScript usa plano XY (x horizontal, y vertical)
- Godot 3D top-down usa plano XZ (x horizontal, z profundidade, y altura)
- Conversão: \`{x: js.x, y: 0, z: js.y}\`
- Velocidades: \`{vx: js.vx, vy: 0, vz: js.vy}\`
- Ângulos: \`atan2(dz, dx)\` ao invés de \`atan2(dy, dx)\`

Este documento serve como **referência completa** para implementar o sistema de combate com mira automática em Godot 3D, preservando todas as mecânicas do projeto JavaScript original.
