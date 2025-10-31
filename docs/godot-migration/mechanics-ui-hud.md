# UI/HUD System - JavaScript to Godot 3D Migration Guide

## Document Purpose
This document provides a comprehensive technical reference for migrating the JavaScript UI/HUD system to Godot 3D. It includes complete specifications, algorithms, GDScript pseudocode, layout mockups, and DOM→Godot node mappings.

---

## 1. Visão Geral do Sistema

### Conceito
Sistema de HUD minimalista que fornece feedback visual crítico sem poluir a tela, suportando decisões táticas através de minimap e indicadores de ameaça.

### Componentes Principais
1. **Health Bar** - Barra de vida com estados de cor (verde→amarelo→vermelho)
2. **Shield Indicator** - Indicador de escudo com 4 states (locked, ready, active, cooldown)
3. **XP Bar** - Barra de experiência com indicador de nível
4. **Wave Display** - Display de wave com progresso de kills
5. **Combo Meter** - Medidor de combo com multiplicador
6. **Kills Counter** - Contador de asteroides destruídos
7. **Time Counter** - Tempo de sobrevivência
8. **Minimap** - Mapa tático com contacts coloridos
9. **Threat Indicators** - Indicadores direcionais para inimigos offscreen
10. **Boss HUD** - HUD especializado para boss fights
11. **Level-Up Screen** - Tela de seleção de upgrades

### Layouts Configuráveis

**Classic Layout:**
- **Top-Left**: health, shield, xp, wave, kills, combo
- **Top-Right**: time, minimap
- **Top-Middle**: boss, threat indicators

**Minimal Tactical Layout (Padrão):**
- **Top-Left**: health, shield, combo, kills
- **Top-Right**: time
- **Bottom-Left**: xp
- **Bottom-Right**: wave
- **Bottom-Center**: minimap
- **Top-Middle**: boss, threat indicators

---

## 2. Estrutura de Dados do Sistema

### HUD State (GDScript)

```gdscript
class_name UISystem
extends CanvasLayer

# HUD Elements
var hud_elements: Dictionary = {}  # key -> HUDElement

# Cached Values (para evitar updates desnecessários)
var cached_values: Dictionary = {
    "health": {"current": 0, "max": 0},
    "shield": {
        "level": 0,
        "maxHP": 0,
        "currentHP": 0,
        "isActive": false,
        "isOnCooldown": false,
        "cooldownTimer": 0.0,
        "cooldownDuration": 20.0
    },
    "xp": {
        "current": 0,
        "needed": 1,
        "percentage": 0.0,
        "level": 1
    },
    "wave": {
        "number": 1,
        "killed": 0,
        "total": 0
    },
    "combo": {
        "count": 0,
        "multiplier": 1.0,
        "active": false,
        "high": false
    },
    "boss": {
        "visible": false,
        "health": 0,
        "maxHealth": 0,
        "phase": 0
    },
    "minimap": {
        "range": 300,
        "detectionRange": 450
    }
}

# Layout
var current_layout: String = "minimal"  # "classic" ou "minimal"

# Level-Up State
var level_up_state: Dictionary = {
    "is_visible": false,
    "options": [],
    "buttons": [],
    "focus_index": -1,
    "pool_size": 0
}

# Boss HUD State
var boss_hud_state: Dictionary = {
    "active": false,
    "upcoming": false,
    "defeated": false,
    "boss_id": null,
    "name": null,
    "phase": 0,
    "phase_count": 3,
    "health": 0,
    "max_health": 0,
    "wave": null,
    "color": "#ff6b6b",
    "phase_colors": ["#F56565", "#F6AD55", "#B794F4"],
    "invulnerable": false,
    "timers": {
        "phase": {
            "remaining": null,
            "total": null,
            "label": "Phase shift"
        },
        "enrage": {
            "remaining": null,
            "total": null,
            "label": "Enrage"
        }
    }
}

# Tactical State
var tactical_state: Dictionary = {
    "contacts_cache": null,
    "threats": {},  # threat_id -> {element, icon}
    "last_update": 0.0
}

# Node References
@onready var health_bar: ProgressBar = $HUD/TopLeft/HealthBar/ProgressBar
@onready var health_value: Label = $HUD/TopLeft/HealthBar/Value
@onready var shield_bar: ProgressBar = $HUD/TopLeft/ShieldBar/ProgressBar
@onready var shield_value: Label = $HUD/TopLeft/ShieldBar/Value
@onready var shield_container: Control = $HUD/TopLeft/ShieldBar
@onready var xp_bar: ProgressBar = $HUD/BottomLeft/XPBar/ProgressBar
@onready var xp_value: Label = $HUD/BottomLeft/XPBar/Value
@onready var xp_level: Label = $HUD/BottomLeft/XPBar/Leading
@onready var wave_bar: ProgressBar = $HUD/BottomRight/WaveBar/ProgressBar
@onready var wave_value: Label = $HUD/BottomRight/WaveBar/Value
@onready var wave_number: Label = $HUD/BottomRight/WaveBar/Leading
@onready var combo_container: Control = $HUD/TopLeft/ComboMeter
@onready var combo_value: Label = $HUD/TopLeft/ComboMeter/Value
@onready var combo_multiplier: Label = $HUD/TopLeft/ComboMeter/Multiplier
@onready var minimap_canvas: Control = $HUD/BottomCenter/Minimap/MinimapCanvas
@onready var minimap_range_label: Label = $HUD/BottomCenter/Minimap/RangeLabel
@onready var threat_container: Control = $HUD/TopMiddle/ThreatIndicators
@onready var boss_hud_container: Control = $HUD/TopMiddle/BossHUD
@onready var boss_health_bar: ProgressBar = $HUD/TopMiddle/BossHUD/BossHealthBar
@onready var boss_health_label: Label = $HUD/TopMiddle/BossHUD/BossHealthLabel
@onready var boss_name_label: Label = $HUD/TopMiddle/BossHUD/BossName
@onready var phase_indicators: HBoxContainer = $HUD/TopMiddle/BossHUD/PhaseIndicators
@onready var phase_timer_label: Label = $HUD/TopMiddle/BossHUD/Timers/PhaseTimer
@onready var level_up_screen: Control = $LevelUpScreen
@onready var level_up_title: Label = $LevelUpScreen/Panel/VBoxContainer/Title
@onready var card_container: HBoxContainer = $LevelUpScreen/Panel/VBoxContainer/CardContainer

# HUD Element Class
class HUDElement:
    var root: Control
    var value: Label
    var bar: ProgressBar
    var bar_fill: Control
    var meta: Label
    var leading: Label
    var config: Dictionary
```

### HUD Item Definition (from hudLayout.js)

```gdscript
class HUDItemConfig:
    var key: String  # "health", "shield", "xp", etc.
    var type: String  # "stat", "shield", "xp", "wave", "combo", "minimap", "boss", "threat-indicators"
    var position: String  # "top-left", "top-right", "top-middle", "bottom-left", "bottom-right", "bottom-center"
    var group: String  # "status-progress", "wave-status", "tactical-vitals", etc.
    var layout: String  # "inline-progress", "inline-value", "boss", "custom"
    var icon: Dictionary  # {type: "text" or "svg", value or paths}
    var root_id: String
    var value_id: String
    var initial_value: String
    var thresholds: Dictionary  # {danger: 0.35, warning: 0.60}
    var meta: Dictionary  # {id, initialValue, ariaLabel, classes}
    var custom: Dictionary  # Custom config (for minimap, threat indicators)
```

---

## 3. HUD Layouts

### 3.1. Minimal Tactical Layout (Padrão)

```
Screen Layout:
┌─────────────────────────────────────────────┐
│ [Health] [Shield]      [Boss HUD]     [Time]│
│ [Combo] [Kills]     [Threat Indicators]     │
│                                             │
│                                             │
│              [GAME VIEWPORT]                │
│                                             │
│                                             │
│ [XP Bar]        [Minimap]        [Wave]    │
└─────────────────────────────────────────────┘
```

**Posicionamento:**
- **Top-Left**: health, shield, combo, kills (VBoxContainer)
- **Top-Right**: time (VBoxContainer)
- **Top-Middle**: boss HUD, threat indicators (Control)
- **Bottom-Left**: xp bar (HBoxContainer)
- **Bottom-Right**: wave bar (HBoxContainer)
- **Bottom-Center**: minimap (Control)

**Características:**
- Faixa superior compacta com vitals + session stats
- Progression info no rodapé (xp, wave)
- Minimap centralizado no rodapé para fácil consulta
- Mais espaço livre no centro da tela

### 3.2. Classic Layout

```
Screen Layout:
┌─────────────────────────────────────────────┐
│ [Health]              [Boss HUD]      [Time]│
│ [Shield]         [Threat Indicators] [Minimap]
│ [XP Bar]                                    │
│ [Wave]                                      │
│ [Kills]                                     │
│ [Combo]        [GAME VIEWPORT]             │
│                                             │
│                                             │
└─────────────────────────────────────────────┘
```

**Posicionamento:**
- **Top-Left**: health, shield, xp, wave, kills, combo (VBoxContainer)
- **Top-Right**: time, minimap (VBoxContainer)
- **Top-Middle**: boss HUD, threat indicators (Control)

**Características:**
- Colunas laterais com indicadores empilhados
- Minimap no canto superior direito
- Layout tradicional, mais vertical

---

## 4. Health Bar (Barra de Vida)

### Especificações

- **Display Format**: `"current/max"` (ex: `"100/150"`)
- **Progress Bar**: Fill width baseado em ratio (0-100%)
- **Color States**:
  - Green (>60%): `Color(0.2, 0.9, 0.3)`
  - Yellow (35-60%): `Color(0.9, 0.7, 0.2)`
  - Red (≤35%): `Color(0.9, 0.2, 0.2)`
- **Thresholds**:
  - Danger: 35%
  - Warning: 60%
  - Low Health: 25%
- **Damage Flash**: 280ms animation quando toma dano
- **Icon**: ❤️

### Algoritmo

```gdscript
func update_health_bar(current: int, max: int) -> void:
    # Previne updates desnecessários
    if cached_values.health.current == current and cached_values.health.max == max:
        return

    cached_values.health.current = current
    cached_values.health.max = max

    var ratio = current / float(max) if max > 0 else 0.0
    var percentage = clamp(ratio * 100, 0, 100)

    # Atualiza text
    health_value.text = "%d/%d" % [current, max]

    # Atualiza progress bar
    health_bar.value = percentage

    # Determina states
    var is_danger = ratio <= 0.35
    var is_warning = ratio <= 0.60 and not is_danger
    var is_low_health = ratio <= 0.25 and current > 0

    # Aplica visual states
    if is_danger:
        health_bar.modulate = Color(0.9, 0.2, 0.2)  # Red
    elif is_warning:
        health_bar.modulate = Color(0.9, 0.7, 0.2)  # Yellow
    else:
        health_bar.modulate = Color(0.2, 0.9, 0.3)  # Green

    # Low health pulse (opcional)
    if is_low_health and not _low_health_pulse_active:
        start_low_health_pulse()

func flash_health_damage() -> void:
    # Damage flash animation (280ms)
    var tween = create_tween()
    tween.set_ease(Tween.EASE_OUT)
    tween.set_trans(Tween.TRANS_CUBIC)
    health_value.modulate = Color(1, 0.3, 0.3, 1)  # Red flash
    tween.tween_property(health_value, "modulate", Color.WHITE, 0.28)

var _low_health_pulse_active: bool = false

func start_low_health_pulse() -> void:
    _low_health_pulse_active = true
    var tween = create_tween().set_loops()
    tween.tween_property(health_value, "modulate:a", 0.5, 0.5)
    tween.tween_property(health_value, "modulate:a", 1.0, 0.5)

func stop_low_health_pulse() -> void:
    _low_health_pulse_active = false
    # Kill tween manualmente se necessário
```

### Integration

**Event Listeners:**
- `player_health_changed(current, max)` → `update_health_bar()`
- `player_damaged(amount)` → `flash_health_damage()`

**Connected Systems:**
- PlayerSystem → Health updates
- CombatSystem → Damage flash

---

## 5. Shield Indicator (Indicador de Escudo)

### Especificações

- **4 States**:
  - **Locked**: Não unlocked (level 0)
  - **Ready**: Disponível mas não ativo (level 1+, não ativo, sem cooldown)
  - **Active**: Ativo e absorvendo dano
  - **Cooldown**: Recharging após quebrar
- **Display**:
  - Locked: `"--"`
  - Ready: `"100%"` ou `"maxHP/maxHP"`
  - Active: `"currentHP/maxHP"` (ex: `"50/75"`)
  - Cooldown: `"cooldownProgress%"` (ex: `"67%"`)
- **Progress Bar**:
  - Locked: 0%
  - Ready: 100%
  - Active: `currentHP / maxHP × 100%`
  - Cooldown: `cooldownProgress × 100%`
- **Opacity**:
  - Locked: 0.3
  - Cooldown: 0.5
  - Ready: 0.7
  - Active: 1.0
- **Low Shield Warning**: ≤30% HP quando ativo
- **Icon**: 💠

### State Machine

```
locked (level 0)
    ↓
ready (level 1+, não ativo, sem cooldown)
    ↓
active (ativado pelo jogador)
    ↓
cooldown (quebrado por dano)
    ↓
ready (cooldown completo)
```

### Algoritmo

```gdscript
func update_shield_indicator(state: Dictionary) -> void:
    var level = state.get("level", 0)
    var max_hp = state.get("maxHP", 0)
    var current_hp = state.get("currentHP", 0)
    var is_active = state.get("isActive", false)
    var is_on_cooldown = state.get("isOnCooldown", false)
    var cooldown_timer = state.get("cooldownTimer", 0.0)
    var cooldown_duration = state.get("cooldownDuration", 20.0)

    # Cache check
    var state_key = "%d_%d_%d_%s_%s" % [level, max_hp, current_hp, is_active, is_on_cooldown]
    if cached_values.shield.get("_state_key") == state_key:
        # Update apenas cooldown timer se necessário
        if is_on_cooldown:
            var cooldown_ratio = 1.0 - clamp(cooldown_timer / cooldown_duration, 0.0, 1.0)
            shield_bar.value = cooldown_ratio * 100
            shield_value.text = "%d%%" % int(cooldown_ratio * 100)
        return

    cached_values.shield._state_key = state_key
    cached_values.shield.level = level
    cached_values.shield.maxHP = max_hp
    cached_values.shield.currentHP = current_hp
    cached_values.shield.isActive = is_active
    cached_values.shield.isOnCooldown = is_on_cooldown

    # Calcula ratios
    var cooldown_ratio = 0.0
    if is_on_cooldown and cooldown_duration > 0:
        cooldown_ratio = 1.0 - clamp(cooldown_timer / cooldown_duration, 0.0, 1.0)

    var effective_hp = current_hp if is_active else max_hp
    var hp_ratio = effective_hp / float(max_hp) if max_hp > 0 else 0.0

    # Determina state e atualiza display
    if level == 0:
        # Locked
        shield_value.text = "--"
        shield_bar.value = 0
        shield_container.modulate.a = 0.3
        shield_bar.modulate = Color(0.4, 0.4, 0.4)  # Dark gray
    elif is_on_cooldown:
        # Cooldown
        shield_value.text = "%d%%" % int(cooldown_ratio * 100)
        shield_bar.value = cooldown_ratio * 100
        shield_container.modulate.a = 0.5
        shield_bar.modulate = Color(0.5, 0.5, 0.5)  # Gray
        stop_low_shield_pulse()
    elif not is_active:
        # Ready
        shield_value.text = "%d/%d" % [max_hp, max_hp]
        shield_bar.value = 100
        shield_container.modulate.a = 0.7
        shield_bar.modulate = Color(0.3, 0.7, 1.0)  # Cyan
        stop_low_shield_pulse()
    else:
        # Active
        shield_value.text = "%d/%d" % [current_hp, max_hp]
        shield_bar.value = hp_ratio * 100
        shield_container.modulate.a = 1.0
        shield_bar.modulate = Color(0.4, 0.8, 1.0)  # Bright cyan

        # Low shield warning
        var is_low_shield = hp_ratio <= 0.3
        if is_low_shield and not _low_shield_pulse_active:
            start_low_shield_pulse()
        elif not is_low_shield:
            stop_low_shield_pulse()

var _low_shield_pulse_active: bool = false

func start_low_shield_pulse() -> void:
    _low_shield_pulse_active = true
    var tween = create_tween().set_loops()
    tween.tween_property(shield_container, "modulate:a", 0.5, 0.4)
    tween.tween_property(shield_container, "modulate:a", 1.0, 0.4)

func stop_low_shield_pulse() -> void:
    _low_shield_pulse_active = false
    shield_container.modulate.a = 1.0
```

### Integration

**Event Listeners:**
- `shield_state_changed(state)` → `update_shield_indicator()`
- `shield_activated()` → Update to active state
- `shield_hit(damage, remaining)` → Update HP
- `shield_broken()` → Update to cooldown state
- `shield_recharged()` → Update to ready state

**Connected Systems:**
- PlayerSystem → Shield state updates
- ShieldSystem → State changes, cooldown updates

---

## 6. XP Bar (Barra de Experiência)

### Especificações

- **Display Format**: `"current/needed"` (ex: `"45/120"`)
- **Progress Bar**: Fill width baseado em percentage (0-100%)
- **Level Indicator**: `"Lv 5"` (meta) ou `"XP / Lvl 5"` (leading)
- **Maxed State**: 100% fill com cor especial
- **Level-Up Pulse**: 900ms animation quando level aumenta
- **Icon**: ⚡

### Algoritmo

```gdscript
func update_xp_bar(current: int, needed: int, level: int) -> void:
    var percentage = current / float(needed) if needed > 0 else 0.0
    percentage = clamp(percentage, 0.0, 1.0)

    # Cache check
    if cached_values.xp.current == current and cached_values.xp.needed == needed:
        return

    # Detecta level-up ANTES de atualizar cache
    var did_level_up = level > cached_values.xp.level

    cached_values.xp.current = current
    cached_values.xp.needed = needed
    cached_values.xp.level = level
    cached_values.xp.percentage = percentage

    # Atualiza text
    xp_value.text = "%d/%d" % [current, needed]
    xp_level.text = "XP / Lvl %d" % level

    # Atualiza progress bar
    xp_bar.value = percentage * 100

    # Maxed state
    var is_maxed = percentage >= 1.0
    if is_maxed:
        xp_bar.modulate = Color(1, 1, 0.3)  # Bright yellow
    else:
        xp_bar.modulate = Color(0.3, 0.8, 1.0)  # Cyan

    # Level-up pulse
    if did_level_up:
        start_level_up_pulse()

func start_level_up_pulse() -> void:
    # Pulse animation (900ms total)
    var tween = create_tween()
    tween.set_ease(Tween.EASE_OUT)
    tween.set_trans(Tween.TRANS_ELASTIC)

    # Scale pulse (300ms)
    var xp_container = xp_bar.get_parent()
    tween.tween_property(xp_container, "scale", Vector2(1.1, 1.1), 0.15)
    tween.tween_property(xp_container, "scale", Vector2(1.0, 1.0), 0.15)

    # Color flash (600ms)
    tween.parallel().tween_property(xp_container, "modulate", Color(1, 1, 0.5, 1), 0.3)
    tween.tween_property(xp_container, "modulate", Color.WHITE, 0.3)
```

### Integration

**Event Listeners:**
- `experience_changed(current, needed, level)` → `update_xp_bar()`
- `level_up(new_level)` → Trigger pulse animation

**Connected Systems:**
- ProgressionSystem → XP updates, level-ups

---

## 7. Wave Display (Display de Wave)

### Especificações

- **Display Format**: `"killed/total"` (ex: `"3/10"`)
- **Progress Bar**: Kill ratio (killed / total × 100%)
- **Wave Number**: `"WAVE 5"` (leading label)
- **Boss Wave Indicator**: Cor diferente ou ícone especial
- **Icon**: Asteroid SVG (custom paths) ou 💀 (boss wave)

### Algoritmo

```gdscript
func update_wave_display(wave_number: int, killed: int, total: int, is_boss_wave: bool = false) -> void:
    # Cache check
    if cached_values.wave.number == wave_number and \
       cached_values.wave.killed == killed and \
       cached_values.wave.total == total:
        return

    cached_values.wave.number = wave_number
    cached_values.wave.killed = killed
    cached_values.wave.total = total

    # Atualiza text
    wave_value.text = "%d/%d" % [killed, total]
    wave_number.text = "WAVE %d" % wave_number

    # Atualiza progress bar
    var ratio = killed / float(total) if total > 0 else 0.0
    wave_bar.value = ratio * 100

    # Boss wave indicator
    if is_boss_wave:
        wave_number.modulate = Color(1.0, 0.4, 0.4)  # Red
        wave_bar.modulate = Color(1.0, 0.4, 0.4)  # Red
        # Atualiza ícone se necessário
        # wave_icon.texture = boss_wave_icon
    else:
        wave_number.modulate = Color.WHITE
        wave_bar.modulate = Color(0.6, 0.8, 1.0)  # Light blue
        # wave_icon.texture = asteroid_icon

func handle_wave_complete() -> void:
    # Flash animation ao completar wave
    var tween = create_tween()
    var wave_container = wave_bar.get_parent()
    tween.tween_property(wave_container, "modulate", Color(0.5, 1, 0.5, 1), 0.2)
    tween.tween_property(wave_container, "modulate", Color.WHITE, 0.3)
```

### Integration

**Event Listeners:**
- `wave_state_updated(number, killed, total, isBossWave)` → `update_wave_display()`
- `wave_complete()` → `handle_wave_complete()`
- `wave_start(number)` → Reset display

**Connected Systems:**
- WaveManager → Wave progress updates

---

## 8. Combo Meter (Medidor de Combo)

### Especificações

- **Display Format**: `"count Hits"` (ex: `"5 Hits"`, `"1 Hit"`)
- **Multiplier**: `"x1.4"` (meta label)
- **States**:
  - Inactive: count = 0 (hidden ou opacity 0.3)
  - Active: count > 0
  - High: count ≥ 5 (special color)
- **Pulse Animation**: Ao incrementar combo (scale 1.0→1.1→1.0, 200ms)
- **Break Animation**: 650ms fade quando timeout
- **Icon**: 🔥
- **Color Gradient**: White → Orange baseado em multiplier

### Algoritmo

```gdscript
func update_combo_meter(count: int, multiplier: float) -> void:
    var is_active = count > 0
    var is_high = count >= 5

    # Detecta incremento ANTES de atualizar cache
    var did_increment = count > cached_values.combo.count and is_active

    cached_values.combo.count = count
    cached_values.combo.multiplier = multiplier
    cached_values.combo.active = is_active
    cached_values.combo.high = is_high

    # Atualiza text
    var hits_label = "Hit" if count == 1 else "Hits"
    combo_value.text = "%d %s" % [count, hits_label] if is_active else "0 Hits"
    combo_multiplier.text = "x%.1f" % multiplier

    # Visibility
    combo_container.visible = is_active

    # Color gradient baseado em multiplier (1.0 → 2.0)
    # White (1.0) → Orange (2.0)
    var gradient_factor = clamp((multiplier - 1.0) / 1.0, 0.0, 1.0)
    var color = lerp(Color.WHITE, Color(1, 0.5, 0), gradient_factor)
    combo_value.modulate = color
    combo_multiplier.modulate = color

    # High combo indicator
    if is_high:
        combo_container.modulate = Color(1.2, 1.1, 0.8)  # Slight golden glow
    else:
        combo_container.modulate = Color.WHITE

    # Pulse animation ao incrementar
    if did_increment:
        start_combo_pulse()

func start_combo_pulse() -> void:
    var tween = create_tween()
    tween.set_ease(Tween.EASE_OUT)
    tween.set_trans(Tween.TRANS_BACK)
    tween.tween_property(combo_container, "scale", Vector2(1.1, 1.1), 0.1)
    tween.tween_property(combo_container, "scale", Vector2(1.0, 1.0), 0.1)

func handle_combo_broken(silent: bool = false) -> void:
    update_combo_meter(0, 1.0)

    if not silent:
        # Break animation (650ms fade)
        var tween = create_tween()
        tween.tween_property(combo_container, "modulate:a", 0.0, 0.3)
        tween.tween_callback(func(): combo_container.visible = false)
        tween.tween_interval(0.35)
        tween.tween_callback(func():
            combo_container.modulate.a = 1.0
        )
```

### Integration

**Event Listeners:**
- `combo_updated(count, multiplier)` → `update_combo_meter()`
- `combo_broken(silent)` → `handle_combo_broken()`
- `combo_timeout()` → `handle_combo_broken(false)`

**Connected Systems:**
- CombatSystem → Combo updates, breaks

---

## 9. Minimap (Mapa Tático)

### Especificações

- **Canvas Size**: 120×120px
- **Default Range**: 300u (configurável)
- **Detection Range**: 450u (para offscreen threats)
- **Background**: Dark circle `rgba(10, 16, 28, 0.55)`
- **Border**: White circle `rgba(255, 255, 255, 0.25)`, lineWidth: 2
- **Crosshair**: White lines `rgba(255, 255, 255, 0.12)`
- **Player**: White triangle rotacionado (heading)
  - Vertices: (6, 0), (-5, 4.5), (-5, -4.5)
- **Contacts**: Colored dots
  - Boss: 5px radius
  - Hunter: 4px radius
  - Others: 3px radius
- **Offscreen Indicator**: Ring ao redor do dot quando distance > range

### Contact Colors

```gdscript
const MINIMAP_ENTITY_COLORS = {
    "asteroid": Color("#A0AEC0"),  # Gray
    "drone": Color("#63B3ED"),     # Blue
    "mine": Color("#F6AD55"),      # Orange
    "hunter": Color("#B794F4"),    # Purple
    "boss": Color("#F56565"),      # Red
    "default": Color("#E2E8F0")    # Light gray
}
```

### Algoritmo (Custom Draw)

```gdscript
class_name Minimap
extends Control

const MINIMAP_SIZE = 120
const DEFAULT_RANGE = 300.0
const DETECTION_RANGE = 450.0

var contacts: Array = []
var player_angle: float = 0.0
var minimap_range: float = DEFAULT_RANGE

func _ready() -> void:
    custom_minimum_size = Vector2(MINIMAP_SIZE, MINIMAP_SIZE)
    queue_redraw()

func update_contacts(new_contacts: Array, new_player_angle: float) -> void:
    contacts = new_contacts
    player_angle = new_player_angle
    queue_redraw()

func _draw() -> void:
    var radius = (size.x / 2.0) - 4.0
    var center = size / 2.0
    var scale = radius / minimap_range

    # Background circle
    draw_circle(center, radius, Color(0.04, 0.06, 0.11, 0.55))

    # Border circle
    draw_arc(center, radius, 0, TAU, 64, Color(1, 1, 1, 0.25), 2.0)

    # Crosshair
    var crosshair_color = Color(1, 1, 1, 0.12)
    draw_line(
        Vector2(center.x - radius, center.y),
        Vector2(center.x + radius, center.y),
        crosshair_color, 1.0
    )
    draw_line(
        Vector2(center.x, center.y - radius),
        Vector2(center.x, center.y + radius),
        crosshair_color, 1.0
    )

    # Player triangle (rotacionado)
    var player_vertices = PackedVector2Array([
        Vector2(6, 0),      # Forward point
        Vector2(-5, 4.5),   # Left rear
        Vector2(-5, -4.5)   # Right rear
    ])
    var rotated_vertices = PackedVector2Array()
    for vertex in player_vertices:
        var rotated = vertex.rotated(player_angle)
        rotated_vertices.append(center + rotated)

    draw_colored_polygon(rotated_vertices, Color.WHITE)
    draw_polyline(rotated_vertices, Color(1, 1, 1, 0.55), 1.5, true)

    # Contacts (ordenado por distance - closest last para z-ordering)
    var sorted_contacts = contacts.duplicate()
    sorted_contacts.sort_custom(func(a, b): return a.distance > b.distance)

    for contact in sorted_contacts:
        var distance = contact.distance
        var dx = contact.dx
        var dz = contact.dz
        var magnitude = distance if distance > 0 else 1.0
        var normalized = Vector2(dx / magnitude, dz / magnitude)
        var clamped_distance = min(distance, minimap_range)
        var draw_pos = center + normalized * clamped_distance * scale

        # Determina size e color
        var dot_size = 5.0 if contact.get("is_boss", false) else \
                       (4.0 if contact.get("type") == "hunter" else 3.0)
        var color = get_contact_color(contact.get("type", "default"))

        # Desenha dot
        draw_circle(draw_pos, dot_size, color)

        # Offscreen indicator (ring)
        if distance > minimap_range:
            var boundary_pos = center + normalized * (radius - 2.0)
            draw_arc(boundary_pos, dot_size + 1.5, 0, TAU, 16, color, 1.5)

func get_contact_color(type: String) -> Color:
    return MINIMAP_ENTITY_COLORS.get(type, MINIMAP_ENTITY_COLORS.default)

# Update range display
func update_range_label() -> void:
    minimap_range_label.text = "Range %du" % int(minimap_range)
```

### Integration

**Event Listeners:**
- `tactical_contacts_updated(contacts, playerAngle)` → `update_contacts()`
- `minimap_range_changed(newRange)` → Update range, redraw

**Connected Systems:**
- PhysicsSystem → Contact detection
- PlayerSystem → Player rotation

---

## 10. Threat Indicators (Indicadores de Ameaça)

### Especificações

- **Purpose**: Indicadores direcionais para inimigos offscreen
- **Max Count**: 8 simultâneos (closest first)
- **Severity Levels**:
  - **High**: distance ≤ range + 25% of window (red, pulse rápido)
  - **Medium**: distance ≤ range + 60% of window (yellow, pulse lento)
  - **Low**: distance > range + 60% of window (white, sem pulse)
- **Positioning**: 42-60% radius do centro (baseado em normalized offset)
- **Icons**: boss (☠), hunter (✦), drone (▲), mine (✸), asteroid (●)
- **Rotation**: Aponta para direção do threat

### Threat Icon Lookup

```gdscript
const THREAT_ICON_LOOKUP = {
    "boss": "☠",
    "hunter": "✦",
    "drone": "▲",
    "mine": "✸",
    "asteroid": "●",
    "default": "•"
}
```

### Algoritmo

```gdscript
const MAX_THREAT_INDICATORS = 8

func update_threat_indicators(contacts: Array, range: float, detection_range: float) -> void:
    # Filtra offscreen contacts
    var offscreen = contacts.filter(func(c): return c.distance > range)

    # Ordena por distance (closest first)
    offscreen.sort_custom(func(a, b): return a.distance < b.distance)

    # Limita a MAX_THREAT_INDICATORS
    offscreen = offscreen.slice(0, MAX_THREAT_INDICATORS)

    var seen = {}

    for contact in offscreen:
        var id = get_threat_id(contact)
        seen[id] = true

        # Cria ou reutiliza indicator
        var indicator = tactical_state.threats.get(id)
        if not indicator:
            indicator = create_threat_indicator()
            threat_container.add_child(indicator)
            tactical_state.threats[id] = indicator

        # Calcula severity
        var severity = calculate_threat_severity(contact.distance, range, detection_range)

        # Resolve color e icon
        var color = get_contact_color(contact.get("type", "default"))
        var icon = get_threat_icon(contact.get("type", "default"), contact.get("is_boss", false))

        # Atualiza indicator
        indicator.icon_label.text = icon
        indicator.icon_label.modulate = color

        # Aplica severity styling
        apply_threat_severity_style(indicator, severity)

        # Positioning (42-60% radius do centro)
        var distance_beyond = max(0.0, contact.distance - range)
        var window_size = max(1.0, detection_range - range)
        var normalized_offset = min(1.0, distance_beyond / window_size)
        var radius_percent = 0.42 + normalized_offset * 0.18

        var viewport_size = get_viewport_rect().size
        var angle = contact.angle
        var x = viewport_size.x * (0.5 + cos(angle) * radius_percent)
        var y = viewport_size.y * (0.5 + sin(angle) * radius_percent)
        indicator.position = Vector2(x, y)

        # Rotation (aponta para direção do threat)
        indicator.rotation = angle

        # Pulse animation
        if severity != "low":
            start_threat_pulse(indicator, severity)

    # Cleanup indicators não vistos
    for id in tactical_state.threats.keys():
        if not seen.has(id):
            tactical_state.threats[id].queue_free()
            tactical_state.threats.erase(id)

func calculate_threat_severity(distance: float, range: float, detection_range: float) -> String:
    var distance_beyond = max(0.0, distance - range)
    var window_size = max(1.0, detection_range - range)
    var ratio = distance_beyond / window_size

    if ratio <= 0.25:
        return "high"
    elif ratio <= 0.6:
        return "medium"
    else:
        return "low"

func apply_threat_severity_style(indicator: Control, severity: String) -> void:
    match severity:
        "high":
            indicator.scale = Vector2(1.2, 1.2)
            # Border/glow será aplicado via shader ou outline
        "medium":
            indicator.scale = Vector2(1.0, 1.0)
        "low":
            indicator.scale = Vector2(0.8, 0.8)
            indicator.modulate.a = 0.6

func start_threat_pulse(indicator: Control, severity: String) -> void:
    var pulse_speed = 0.5 if severity == "high" else 1.0
    var tween = create_tween().set_loops()
    tween.tween_property(indicator, "modulate:a", 0.6, pulse_speed)
    tween.tween_property(indicator, "modulate:a", 1.0, pulse_speed)

func get_threat_icon(type: String, is_boss: bool) -> String:
    if is_boss:
        return THREAT_ICON_LOOKUP.boss
    return THREAT_ICON_LOOKUP.get(type, THREAT_ICON_LOOKUP.default)

func get_threat_id(contact: Dictionary) -> String:
    # Gera ID único baseado em type, distance, angle
    return "%s:%.1f:%.2f" % [
        contact.get("type", "unknown"),
        contact.get("distance", 0.0),
        contact.get("angle", 0.0)
    ]

class ThreatIndicator:
    extends Control

    var icon_label: Label

    func _init() -> void:
        icon_label = Label.new()
        icon_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
        icon_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
        icon_label.add_theme_font_size_override("font_size", 20)
        add_child(icon_label)
        custom_minimum_size = Vector2(32, 32)
        pivot_offset = size / 2.0

func create_threat_indicator() -> ThreatIndicator:
    return ThreatIndicator.new()
```

### Integration

**Event Listeners:**
- `tactical_contacts_updated(contacts, range, detectionRange)` → `update_threat_indicators()`

**Connected Systems:**
- PhysicsSystem → Contact detection
- Minimap → Shared contact data

---

## 11. Boss HUD (HUD do Boss)

### Especificações

- **Position**: Top-middle (CenterContainer)
- **Health Bar**: Full width, phase-colored
- **Phase Indicators**: 3 dots (current phase highlighted)
- **Timers**:
  - Phase shift timer (format: "1:23" ou "45s")
  - Enrage timer (format: "1:23" ou "45s")
- **Invulnerability**: Visual feedback (pulsing border, overlay)
- **Banners**:
  - Spawn: "BOSS INCOMING" (2s display)
  - Phase change: "PHASE 2" (1.5s display)
  - Defeat: "BOSS DEFEATED" (3s display, hide HUD após)
- **Auto-hide**: 3s após boss defeated
- **Phase Colors**: Array de cores (ex: red → orange → purple)

### Boss HUD State

```gdscript
var boss_hud_state: Dictionary = {
    "active": false,
    "upcoming": false,
    "defeated": false,
    "boss_id": null,
    "name": "Devastator",
    "phase": 0,
    "phase_count": 3,
    "health": 2000,
    "max_health": 2000,
    "wave": 5,
    "color": "#ff6b6b",
    "phase_colors": ["#F56565", "#F6AD55", "#B794F4"],
    "invulnerable": false,
    "timers": {
        "phase": {
            "remaining": 10.0,
            "total": 15.0,
            "label": "Phase shift"
        },
        "enrage": {
            "remaining": null,
            "total": null,
            "label": "Enrage"
        }
    }
}
```

### Algoritmo

```gdscript
func update_boss_hud(state: Dictionary) -> void:
    if not state.get("active", false):
        boss_hud_container.visible = false
        return

    boss_hud_container.visible = true

    # Boss name
    boss_name_label.text = state.get("name", "BOSS")

    # Health bar
    var health = state.get("health", 0)
    var max_health = state.get("max_health", 1)
    var ratio = health / float(max_health) if max_health > 0 else 0.0
    boss_health_bar.value = ratio * 100
    boss_health_label.text = "%d/%d" % [health, max_health]

    # Phase color
    var phase = state.get("phase", 0)
    var phase_colors = state.get("phase_colors", [])
    var phase_color: Color
    if phase < phase_colors.size():
        phase_color = Color(phase_colors[phase])
    else:
        phase_color = Color(state.get("color", "#ff6b6b"))

    boss_health_bar.modulate = phase_color
    boss_name_label.modulate = phase_color

    # Phase indicators (3 dots)
    var phase_count = state.get("phase_count", 3)
    for i in range(phase_indicators.get_child_count()):
        var dot = phase_indicators.get_child(i)
        if i < phase_count:
            dot.visible = true
            if i == phase:
                dot.modulate = phase_color
                dot.scale = Vector2(1.2, 1.2)
            else:
                dot.modulate = Color(0.5, 0.5, 0.5, 0.5)
                dot.scale = Vector2(1.0, 1.0)
        else:
            dot.visible = false

    # Timers
    var timers = state.get("timers", {})
    update_boss_timer(phase_timer_label, timers.get("phase"))
    update_boss_timer(enrage_timer_label, timers.get("enrage"))

    # Invulnerability feedback
    var invulnerable = state.get("invulnerable", false)
    if invulnerable:
        start_invulnerability_pulse()
    else:
        stop_invulnerability_pulse()

func update_boss_timer(label: Label, timer_data) -> void:
    if timer_data == null or timer_data.get("remaining") == null:
        label.visible = false
        return

    label.visible = true
    var remaining = timer_data.remaining
    var timer_label = timer_data.get("label", "Timer")
    var time_str = format_timer(remaining)
    label.text = "%s: %s" % [timer_label, time_str]

func format_timer(seconds: float) -> String:
    if seconds < 0:
        return "0s"

    var minutes = int(seconds / 60)
    var remaining_seconds = int(seconds) % 60

    if minutes <= 0:
        return "%ds" % remaining_seconds
    else:
        return "%d:%02d" % [minutes, remaining_seconds]

var _invulnerability_pulse_active: bool = false

func start_invulnerability_pulse() -> void:
    if _invulnerability_pulse_active:
        return

    _invulnerability_pulse_active = true
    var tween = create_tween().set_loops()
    tween.tween_property(boss_hud_container, "modulate", Color(1.2, 1.2, 1.2, 1), 0.3)
    tween.tween_property(boss_hud_container, "modulate", Color.WHITE, 0.3)

func stop_invulnerability_pulse() -> void:
    _invulnerability_pulse_active = false
    boss_hud_container.modulate = Color.WHITE

# Boss Banners
func show_boss_banner(message: String, duration: float = 2.0) -> void:
    var banner = boss_banner_label  # Assume existe no scene
    banner.text = message
    banner.visible = true
    banner.modulate.a = 0.0

    var tween = create_tween()
    tween.tween_property(banner, "modulate:a", 1.0, 0.3)
    tween.tween_interval(duration)
    tween.tween_property(banner, "modulate:a", 0.0, 0.3)
    tween.tween_callback(func(): banner.visible = false)

func handle_boss_spawned(boss_data: Dictionary) -> void:
    boss_hud_state = boss_data
    boss_hud_state.active = true
    update_boss_hud(boss_hud_state)
    show_boss_banner("BOSS INCOMING", 2.0)

func handle_boss_phase_changed(new_phase: int) -> void:
    boss_hud_state.phase = new_phase
    update_boss_hud(boss_hud_state)
    show_boss_banner("PHASE %d" % (new_phase + 1), 1.5)

func handle_boss_defeated() -> void:
    boss_hud_state.defeated = true
    show_boss_banner("BOSS DEFEATED", 3.0)

    # Auto-hide após 3s
    await get_tree().create_timer(3.0).timeout
    boss_hud_state.active = false
    update_boss_hud(boss_hud_state)
```

### Integration

**Event Listeners:**
- `boss_spawned(bossData)` → `handle_boss_spawned()`
- `boss_health_changed(health, maxHealth)` → Update health bar
- `boss_phase_changed(newPhase)` → `handle_boss_phase_changed()`
- `boss_invulnerability_changed(isInvulnerable)` → Update invulnerability feedback
- `boss_timer_updated(timerType, remaining, total)` → Update timers
- `boss_defeated()` → `handle_boss_defeated()`

**Connected Systems:**
- BossSystem → Boss state updates
- WaveManager → Boss spawn triggers

---

## 12. Level-Up Screen (Tela de Level-Up)

### Especificações

- **Pause Game**: `get_tree().paused = true`
- **Title**: `"Level X - Escolha sua tecnologia (N opções):"`
- **Cards**: 3-4 upgrade options (horizontal layout)
- **Card Structure**:
  - **Header**: Icon + Category (icon + label) + Current level ("Nv. atual: 2/5")
  - **Body**: Title + Summary + Next level section (title + description + highlights)
  - **Footer**: Prerequisites (✔️ met, 🔒 locked)
- **Hover Effects**: Scale 1.05, glow border
- **Keyboard Navigation**:
  - Arrow keys (move focus)
  - Enter (select)
  - Numbers 1-4 (quick select)

### Category Accent Colors

```gdscript
const COLOR_ASSIST_ACCENTS = {
    "offense": Color("#F6C945"),     # Yellow
    "defense": Color("#4ECDC4"),     # Teal
    "mobility": Color("#5DADE2"),    # Blue
    "utility": Color("#C08BFF"),     # Purple
    "default": Color("#3399FF")      # Default blue
}
```

### Algoritmo

```gdscript
func show_level_up_screen(level: int, options: Array) -> void:
    # Valida options
    if options.size() == 0:
        push_warning("Level-up screen: No upgrade options provided")
        return

    # Pausa game
    get_tree().paused = true

    # Atualiza state
    level_up_state.is_visible = true
    level_up_state.options = options
    level_up_state.pool_size = options.size()
    level_up_state.focus_index = 0

    # Atualiza title
    var option_label = "opção" if options.size() == 1 else "opções"
    level_up_title.text = "Level %d - Escolha sua tecnologia (%d %s):" % [level, options.size(), option_label]

    # Limpa cards anteriores
    for child in card_container.get_children():
        child.queue_free()

    # Cria cards
    var buttons = []
    for i in range(options.size()):
        var option = options[i]
        var card = create_upgrade_card(option, i)
        card_container.add_child(card)
        buttons.append(card)

    level_up_state.buttons = buttons

    # Foca primeira opção
    if buttons.size() > 0:
        buttons[0].grab_focus()
        level_up_state.focus_index = 0

    level_up_screen.visible = true

func create_upgrade_card(option: Dictionary, index: int) -> Button:
    var card = Button.new()
    card.custom_minimum_size = Vector2(280, 360)
    card.focus_mode = Control.FOCUS_ALL

    # Accent color
    var category_id = option.get("category", {}).get("id", "default")
    var accent = COLOR_ASSIST_ACCENTS.get(category_id, COLOR_ASSIST_ACCENTS.default)

    # Structure (usando VBoxContainer como child)
    var vbox = VBoxContainer.new()
    vbox.add_theme_constant_override("separation", 8)
    card.add_child(vbox)

    # === Header ===
    var header = HBoxContainer.new()
    header.add_theme_constant_override("separation", 12)

    # Icon
    var icon_label = Label.new()
    icon_label.text = option.get("icon", "✨")
    icon_label.add_theme_font_size_override("font_size", 32)
    header.add_child(icon_label)

    # Metadata (category + current level)
    var meta_vbox = VBoxContainer.new()
    meta_vbox.add_theme_constant_override("separation", 2)

    var category = option.get("category", {})
    var category_label = Label.new()
    category_label.text = "%s %s" % [category.get("icon", ""), category.get("label", "")]
    category_label.modulate = accent
    category_label.add_theme_font_size_override("font_size", 12)
    meta_vbox.add_child(category_label)

    var level_label = Label.new()
    var current_level = option.get("currentLevel", 0)
    var max_level = option.get("maxLevel", 5)
    level_label.text = "Nv. atual: %d/%d" % [current_level, max_level]
    level_label.add_theme_font_size_override("font_size", 11)
    level_label.modulate = Color(0.7, 0.7, 0.7)
    meta_vbox.add_child(level_label)

    header.add_child(meta_vbox)
    vbox.add_child(header)

    # Separator
    var separator1 = HSeparator.new()
    separator1.modulate = accent
    vbox.add_child(separator1)

    # === Body ===
    # Title
    var title_label = Label.new()
    title_label.text = option.get("name", "Unknown Upgrade")
    title_label.add_theme_font_size_override("font_size", 18)
    title_label.modulate = accent
    vbox.add_child(title_label)

    # Summary
    var summary_label = Label.new()
    summary_label.text = option.get("summary", "")
    summary_label.autowrap_mode = TextServer.AUTOWRAP_WORD
    summary_label.add_theme_font_size_override("font_size", 12)
    summary_label.modulate = Color(0.85, 0.85, 0.85)
    vbox.add_child(summary_label)

    # Next level section
    var next_level = option.get("nextLevel")
    if next_level:
        var next_title_label = Label.new()
        next_title_label.text = "Próximo: %s" % next_level.get("title", "")
        next_title_label.add_theme_font_size_override("font_size", 13)
        next_title_label.modulate = Color(1, 1, 0.7)
        vbox.add_child(next_title_label)

        var next_desc_label = Label.new()
        next_desc_label.text = next_level.get("description", "")
        next_desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD
        next_desc_label.add_theme_font_size_override("font_size", 11)
        next_desc_label.modulate = Color(0.8, 0.8, 0.8)
        vbox.add_child(next_desc_label)

        # Highlights
        var highlights = next_level.get("highlights", [])
        for highlight in highlights:
            var highlight_label = Label.new()
            highlight_label.text = "• %s" % highlight
            highlight_label.add_theme_font_size_override("font_size", 11)
            highlight_label.modulate = accent
            vbox.add_child(highlight_label)

    # Separator
    var separator2 = HSeparator.new()
    separator2.modulate = accent
    vbox.add_child(separator2)

    # === Footer (Prerequisites) ===
    var prerequisites = option.get("prerequisites", [])
    if prerequisites.size() > 0:
        var prereq_vbox = VBoxContainer.new()
        prereq_vbox.add_theme_constant_override("separation", 4)

        for prereq in prerequisites:
            var prereq_label = Label.new()
            var met = prereq.get("met", false)
            var icon = "✔️" if met else "🔒"
            prereq_label.text = "%s %s" % [icon, prereq.get("label", "")]
            prereq_label.add_theme_font_size_override("font_size", 10)
            prereq_label.modulate = Color(0.5, 1, 0.5) if met else Color(1, 0.5, 0.5)
            prereq_vbox.add_child(prereq_label)

        vbox.add_child(prereq_vbox)

    # Event listeners
    card.pressed.connect(func(): select_upgrade(option.get("id", ""), index))
    card.mouse_entered.connect(func(): focus_card(index))
    card.focus_entered.connect(func(): on_card_focused(index))

    return card

func select_upgrade(upgrade_id: String, index: int) -> void:
    # Desabilita buttons
    for button in level_up_state.buttons:
        button.disabled = true

    # Visual feedback
    var selected_card = level_up_state.buttons[index]
    var tween = create_tween()
    tween.tween_property(selected_card, "scale", Vector2(1.1, 1.1), 0.15)
    tween.tween_property(selected_card, "modulate", Color(1.2, 1.2, 0.8), 0.15)

    # Aplica upgrade
    var progression = get_node("/root/ProgressionSystem")
    var success = await progression.apply_upgrade(upgrade_id)

    if success:
        # Fecha level-up screen
        close_level_up_screen()
    else:
        # Re-habilita buttons
        for button in level_up_state.buttons:
            button.disabled = false

        # Reset visual feedback
        tween = create_tween()
        tween.tween_property(selected_card, "scale", Vector2(1.0, 1.0), 0.15)
        tween.tween_property(selected_card, "modulate", Color.WHITE, 0.15)

func close_level_up_screen() -> void:
    # Fade out animation
    var tween = create_tween()
    tween.tween_property(level_up_screen, "modulate:a", 0.0, 0.3)
    tween.tween_callback(func():
        level_up_screen.visible = false
        level_up_screen.modulate.a = 1.0
        level_up_state.is_visible = false
        get_tree().paused = false
    )

func focus_card(index: int) -> void:
    if index < 0 or index >= level_up_state.buttons.size():
        return

    level_up_state.focus_index = index
    level_up_state.buttons[index].grab_focus()

func on_card_focused(index: int) -> void:
    level_up_state.focus_index = index

    # Hover effect (scale)
    var card = level_up_state.buttons[index]
    var tween = create_tween()
    tween.tween_property(card, "scale", Vector2(1.05, 1.05), 0.15)

func _input(event: InputEvent) -> void:
    if not level_up_state.is_visible:
        return

    # Keyboard navigation
    if event.is_action_pressed("ui_left"):
        focus_card(max(0, level_up_state.focus_index - 1))
        get_viewport().set_input_as_handled()
    elif event.is_action_pressed("ui_right"):
        focus_card(min(level_up_state.buttons.size() - 1, level_up_state.focus_index + 1))
        get_viewport().set_input_as_handled()
    elif event.is_action_pressed("ui_accept"):
        if level_up_state.focus_index >= 0:
            var option = level_up_state.options[level_up_state.focus_index]
            select_upgrade(option.get("id", ""), level_up_state.focus_index)
            get_viewport().set_input_as_handled()

    # Quick select via numbers
    for i in range(min(4, level_up_state.buttons.size())):
        if event.is_action_pressed("ui_number_%d" % (i + 1)):
            var option = level_up_state.options[i]
            select_upgrade(option.get("id", ""), i)
            get_viewport().set_input_as_handled()
```

### Integration

**Event Listeners:**
- `upgrade_options_ready(level, options)` → `show_level_up_screen()`
- `upgrade_applied(upgradeId)` → Close screen, resume game

**Connected Systems:**
- ProgressionSystem → Upgrade options generation, upgrade application

---

## 13. Implementação Godot: Estrutura de Cena Completa

### Scene: HUD.tscn (Minimal Tactical Layout)

```
HUD (CanvasLayer)
│
├─ HUD (Control) - anchors: full rect
│  │
│  ├─ TopLeft (MarginContainer) - anchors: top-left, margin: 16px
│  │  └─ VBoxContainer (separation: 8)
│  │     ├─ HealthBar (HBoxContainer)
│  │     │  ├─ Icon (Label) "❤️"
│  │     │  ├─ ProgressBar (min: 0, max: 100)
│  │     │  └─ Value (Label) "100/150"
│  │     ├─ ShieldBar (HBoxContainer)
│  │     │  ├─ Icon (Label) "💠"
│  │     │  ├─ ProgressBar
│  │     │  └─ Value (Label) "50/75"
│  │     ├─ ComboMeter (HBoxContainer)
│  │     │  ├─ Icon (Label) "🔥"
│  │     │  ├─ Value (Label) "5 Hits"
│  │     │  └─ Multiplier (Label) "x1.4"
│  │     └─ Kills (HBoxContainer)
│  │        ├─ Icon (TextureRect) - asteroid.svg
│  │        └─ Value (Label) "42"
│  │
│  ├─ TopRight (MarginContainer) - anchors: top-right, margin: 16px
│  │  └─ VBoxContainer
│  │     └─ Time (HBoxContainer)
│  │        ├─ Icon (TextureRect) - clock.svg
│  │        └─ Value (Label) "1:23"
│  │
│  ├─ TopMiddle (CenterContainer) - anchors: top-center
│  │  └─ VBoxContainer
│  │     ├─ BossHUD (VBoxContainer)
│  │     │  ├─ BossName (Label) "DEVASTATOR"
│  │     │  ├─ BossHealthBar (ProgressBar)
│  │     │  ├─ BossHealthLabel (Label) "2000/2000"
│  │     │  ├─ PhaseIndicators (HBoxContainer)
│  │     │  │  ├─ Phase1 (ColorRect) 12×12
│  │     │  │  ├─ Phase2 (ColorRect) 12×12
│  │     │  │  └─ Phase3 (ColorRect) 12×12
│  │     │  └─ Timers (HBoxContainer)
│  │     │     ├─ PhaseTimer (Label) "Phase shift: 0:45"
│  │     │     └─ EnrageTimer (Label) "Enrage: 2:30"
│  │     ├─ BossBanner (Label) - initially hidden
│  │     └─ ThreatIndicators (Control)
│  │        └─ (dynamic threat indicator nodes)
│  │
│  ├─ BottomLeft (MarginContainer) - anchors: bottom-left, margin: 16px
│  │  └─ XPBar (VBoxContainer)
│  │     ├─ Leading (Label) "XP / Lvl 5"
│  │     ├─ HBoxContainer
│  │     │  ├─ ProgressBar
│  │     │  └─ Value (Label) "45/120"
│  │
│  ├─ BottomRight (MarginContainer) - anchors: bottom-right, margin: 16px
│  │  └─ WaveBar (VBoxContainer)
│  │     ├─ Leading (Label) "WAVE 5"
│  │     ├─ HBoxContainer
│  │     │  ├─ ProgressBar
│  │     │  └─ Value (Label) "3/10"
│  │
│  └─ BottomCenter (MarginContainer) - anchors: bottom-center, margin: 16px
│     └─ Minimap (VBoxContainer)
│        ├─ MinimapCanvas (Control) - custom_minimum_size: 120×120
│        └─ RangeLabel (Label) "Range 300u"
│
└─ LevelUpScreen (Control) - anchors: full rect, initially hidden
   ├─ Background (ColorRect) - color: rgba(0, 0, 0, 0.7)
   └─ Panel (PanelContainer) - anchors: center
      └─ VBoxContainer
         ├─ Title (Label) "Level 5 - Escolha sua tecnologia (3 opções):"
         ├─ CardContainer (HBoxContainer) - separation: 16
         │  └─ (dynamic upgrade card buttons)
         └─ HintLabel (Label) "Use setas para navegar, Enter para selecionar"
```

### Theme Configuration

```gdscript
# HUD Theme (dark, minimal)
var hud_theme = Theme.new()

# Background colors
hud_theme.set_color("bg_color", "Panel", Color(0.1, 0.1, 0.15, 0.8))
hud_theme.set_color("border_color", "Panel", Color(0.3, 0.3, 0.4, 0.5))

# Progress bar
hud_theme.set_stylebox("fill", "ProgressBar", create_flat_stylebox(Color(0.2, 0.6, 0.9)))
hud_theme.set_stylebox("background", "ProgressBar", create_flat_stylebox(Color(0.1, 0.1, 0.15, 0.5)))

# Labels
hud_theme.set_color("font_color", "Label", Color.WHITE)
hud_theme.set_font_size("font_size", "Label", 14)

func create_flat_stylebox(color: Color) -> StyleBoxFlat:
    var style = StyleBoxFlat.new()
    style.bg_color = color
    style.corner_radius_top_left = 4
    style.corner_radius_top_right = 4
    style.corner_radius_bottom_left = 4
    style.corner_radius_bottom_right = 4
    return style
```

---

## 14. Parâmetros e Constantes

### Minimap

```gdscript
const MINIMAP_SIZE = 120
const DEFAULT_MINIMAP_RANGE = 300.0
const DEFAULT_DETECTION_RANGE = 450.0

const MINIMAP_ENTITY_COLORS = {
    "asteroid": Color("#A0AEC0"),
    "drone": Color("#63B3ED"),
    "mine": Color("#F6AD55"),
    "hunter": Color("#B794F4"),
    "boss": Color("#F56565"),
    "default": Color("#E2E8F0")
}
```

### Threat Indicators

```gdscript
const MAX_THREAT_INDICATORS = 8
const THREAT_INDICATOR_MIN_RADIUS = 0.42  # 42% do viewport radius
const THREAT_INDICATOR_MAX_RADIUS = 0.60  # 60% do viewport radius

const THREAT_ICON_LOOKUP = {
    "boss": "☠",
    "hunter": "✦",
    "drone": "▲",
    "mine": "✸",
    "asteroid": "●",
    "default": "•"
}
```

### Health Bar

```gdscript
const HEALTH_THRESHOLD_DANGER = 0.35
const HEALTH_THRESHOLD_WARNING = 0.60
const HEALTH_THRESHOLD_LOW = 0.25
const HEALTH_DAMAGE_FLASH_DURATION = 0.28  # 280ms

const HEALTH_COLOR_NORMAL = Color(0.2, 0.9, 0.3)   # Green
const HEALTH_COLOR_WARNING = Color(0.9, 0.7, 0.2)  # Yellow
const HEALTH_COLOR_DANGER = Color(0.9, 0.2, 0.2)   # Red
```

### Shield

```gdscript
const SHIELD_LOW_THRESHOLD = 0.30
const SHIELD_OPACITY_LOCKED = 0.3
const SHIELD_OPACITY_COOLDOWN = 0.5
const SHIELD_OPACITY_READY = 0.7
const SHIELD_OPACITY_ACTIVE = 1.0

const SHIELD_COLOR_READY = Color(0.3, 0.7, 1.0)    # Cyan
const SHIELD_COLOR_ACTIVE = Color(0.4, 0.8, 1.0)   # Bright cyan
const SHIELD_COLOR_COOLDOWN = Color(0.5, 0.5, 0.5) # Gray
const SHIELD_COLOR_LOCKED = Color(0.4, 0.4, 0.4)   # Dark gray
```

### Combo

```gdscript
const COMBO_HIGH_THRESHOLD = 5
const COMBO_PULSE_DURATION = 0.2  # 200ms
const COMBO_BREAK_DURATION = 0.65  # 650ms
```

### Level-Up Screen

```gdscript
const LEVEL_UP_CARD_WIDTH = 280
const LEVEL_UP_CARD_HEIGHT = 360
const LEVEL_UP_CARD_SEPARATION = 16

const COLOR_ASSIST_ACCENTS = {
    "offense": Color("#F6C945"),
    "defense": Color("#4ECDC4"),
    "mobility": Color("#5DADE2"),
    "utility": Color("#C08BFF"),
    "default": Color("#3399FF")
}
```

### Boss HUD

```gdscript
const BOSS_HUD_PHASE_DOT_SIZE = 12
const BOSS_HUD_AUTO_HIDE_DELAY = 3.0  # 3s após defeat
const BOSS_BANNER_SPAWN_DURATION = 2.0
const BOSS_BANNER_PHASE_DURATION = 1.5
const BOSS_BANNER_DEFEAT_DURATION = 3.0

const BOSS_DEFAULT_PHASE_COLORS = [
    Color("#F56565"),  # Phase 1: Red
    Color("#F6AD55"),  # Phase 2: Orange
    Color("#B794F4")   # Phase 3: Purple
]
```

---

## 15. Color Palettes

### HUD Base Colors

```gdscript
const HUD_COLORS = {
    "background": Color(0.04, 0.06, 0.11, 0.55),      # rgba(10, 16, 28, 0.55)
    "border": Color(1, 1, 1, 0.25),                    # rgba(255, 255, 255, 0.25)
    "text_primary": Color.WHITE,                       # rgba(255, 255, 255, 1)
    "text_secondary": Color(0.7, 0.7, 0.7, 1),        # rgba(179, 179, 179, 1)
    "text_muted": Color(0.5, 0.5, 0.5, 1)             # rgba(128, 128, 128, 1)
}
```

### Entity Colors (Minimap + Threats)

```gdscript
const ENTITY_COLORS = {
    "asteroid": Color("#A0AEC0"),  # Gray
    "drone": Color("#63B3ED"),     # Blue
    "mine": Color("#F6AD55"),      # Orange
    "hunter": Color("#B794F4"),    # Purple
    "boss": Color("#F56565"),      # Red
    "player": Color("#FFFFFF"),    # White
    "default": Color("#E2E8F0")    # Light gray
}
```

### State Colors

```gdscript
const STATE_COLORS = {
    "health_normal": Color("#38C172"),    # Green
    "health_warning": Color("#FFED4E"),   # Yellow
    "health_danger": Color("#E3342F"),    # Red

    "shield_ready": Color("#4D9FFF"),     # Cyan
    "shield_active": Color("#66B3FF"),    # Bright cyan
    "shield_cooldown": Color("#808080"),  # Gray
    "shield_locked": Color("#666666"),    # Dark gray

    "xp_normal": Color("#4D9FFF"),        # Cyan
    "xp_maxed": Color("#FFFF4D"),         # Bright yellow

    "combo_low": Color("#FFFFFF"),        # White
    "combo_high": Color("#FF8040")        # Orange
}
```

### Category Colors (Upgrades)

```gdscript
const CATEGORY_COLORS = {
    "offense": Color("#F6C945"),     # Yellow
    "defense": Color("#4ECDC4"),     # Teal
    "mobility": Color("#5DADE2"),    # Blue
    "utility": Color("#C08BFF"),     # Purple
    "default": Color("#3399FF")      # Default blue
}
```

### Threat Severity Colors

```gdscript
const SEVERITY_COLORS = {
    "high": Color("#FF4444"),      # Bright red
    "medium": Color("#FFAA44"),    # Orange
    "low": Color("#FFFFFF")        # White
}
```

---

## 16. Animation Specifications

### Health Bar

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| Damage flash | 280ms | ease-out cubic | `player_damaged` |
| Low health pulse | 500ms loop | linear | HP ≤ 25% |
| Bar fill update | 150ms | ease-out | HP changed |

### Shield Indicator

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| Low shield pulse | 400ms loop | linear | HP ≤ 30% active |
| Cooldown bar fill | realtime | linear | cooldown timer |
| State transition | 200ms | ease-out | state changed |

### XP Bar

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| Level-up pulse (scale) | 300ms | ease-out elastic | level increased |
| Level-up flash (color) | 600ms | ease-out | level increased |
| Bar fill update | 200ms | ease-out | XP changed |

### Combo Meter

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| Increment pulse | 200ms | ease-out back | combo incremented |
| Break fade | 650ms | ease-out | combo broken |
| Color gradient | 100ms | linear | multiplier changed |

### Threat Indicators

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| High severity pulse | 500ms loop | ease-in-out | severity = high |
| Medium severity pulse | 1000ms loop | ease-in-out | severity = medium |
| Position update | 100ms | ease-out | contact moved |
| Spawn fade-in | 200ms | ease-out | new threat |
| Remove fade-out | 200ms | ease-in | threat removed |

### Boss HUD

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| Invulnerability pulse | 600ms loop | ease-in-out | invulnerable = true |
| Banner spawn | 300ms fade-in<br>2000ms hold<br>300ms fade-out | ease-out | boss spawned |
| Banner phase change | 300ms fade-in<br>1500ms hold<br>300ms fade-out | ease-out | phase changed |
| Banner defeat | 300ms fade-in<br>3000ms hold<br>300ms fade-out | ease-out | boss defeated |
| Health bar update | 200ms | ease-out | boss HP changed |

### Level-Up Screen

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| Screen fade-in | 300ms | ease-out | level-up triggered |
| Screen fade-out | 300ms | ease-in | upgrade selected |
| Card hover scale | 150ms | ease-out | mouse enter |
| Card unhover scale | 150ms | ease-in | mouse exit |
| Card select pulse | 300ms | ease-out back | card clicked |

---

## 17. Diagramas e Mockups

### Layout Diagram: Minimal Tactical

```
┌───────────────────────────────────────────────────────────────┐
│  ❤️ [████████░░] 100/150    ☠ DEVASTATOR [██████████] 2000   ⏱ 1:23 │
│  💠 [██████████] 75/75             ✦ ✦ ▲                        │
│  🔥 5 Hits x1.4                                                │
│  💎 42                                                         │
│                                                                │
│                                                                │
│                        [GAME VIEWPORT]                         │
│                                                                │
│                                                                │
│                                                                │
│  ⚡ XP / Lvl 5          ┌──────────┐          WAVE 5          │
│  [████████░░] 45/120   │ Minimap  │          [███░░░] 3/10    │
│                        │  120×120 │                            │
│                        └──────────┘                            │
│                        Range 300u                              │
└───────────────────────────────────────────────────────────────┘
```

### Minimap Rendering

```
┌────────────┐
│     |      │  Crosshair (white, 12% opacity)
│  ─ ─ + ─ ─ │  Background circle (dark)
│     |      │  Border circle (white, 25% opacity)
│            │
│   ●  ▲     │  Contacts (colored dots)
│      △     │  △ = Player (white triangle, rotated)
│            │  ● = Enemy (colored by type)
│    ◯       │  ◯ = Offscreen (ring indicator)
└────────────┘
```

### Threat Indicator Positioning

```
Screen space diagram:
                    ▲ (42% radius)
                    |
                    |
       ✦ ────────── ● (center) ────────── ▲
                    |
                    |
                    ✸ (60% radius)

- Positioning: 42-60% radius do centro da tela
- Rotation: Aponta para direção do threat
- Severity: high (close), medium, low (far)
```

### State Machine: Shield Indicator

```
┌────────┐
│ LOCKED │ (level 0)
└────┬───┘
     │ upgrade to level 1+
     ▼
┌────────┐
│ READY  │ (available, not active, no cooldown)
└────┬───┘
     │ player activates
     ▼
┌────────┐
│ ACTIVE │ (absorbing damage)
└────┬───┘
     │ shield broken
     ▼
┌──────────┐
│ COOLDOWN │ (recharging)
└────┬─────┘
     │ cooldown complete
     └─────────┐
               │
               ▼
         ┌────────┐
         │ READY  │
         └────────┘
```

### Boss HUD Layout

```
┌────────────────────────────────────────┐
│           DEVASTATOR                   │  Boss name (colored)
│  [████████████████████░░░░░░░] 2000/2000 │  Health bar (phase-colored)
│           ● ● ◯                         │  Phase indicators (3 dots)
│  Phase shift: 0:45    Enrage: 2:30     │  Timers (if active)
└────────────────────────────────────────┘

Phase indicators:
● = Current phase (highlighted, phase color)
◯ = Future phase (dim, gray)
```

### Level-Up Card Structure

```
┌─────────────────────────────────┐
│  ✨  🎯 OFFENSE                 │  Icon + Category
│      Nv. atual: 2/5             │  Current level
├─────────────────────────────────┤
│  Tiro Múltiplo                  │  Title (accent color)
│  Dispara múltiplos projéteis   │  Summary (gray)
│                                 │
│  Próximo: Bobina de Fusão       │  Next level title (yellow)
│  Dispara 3 projéteis            │  Next level description
│  • +1 projétil                  │  Highlights (accent color)
│  • +15% dano por projétil       │
├─────────────────────────────────┤
│  ✔️ Level do piloto 3+          │  Prerequisites (green/red)
│  🔒 Tiro Rápido (Nv. 1)         │
└─────────────────────────────────┘
```

---

## 18. Integration com Outros Sistemas

### PlayerSystem Integration

```gdscript
# PlayerSystem signals
signal health_changed(current: int, max: int)
signal damaged(amount: int)
signal died()

# UISystem connections
func _ready():
    var player = get_node("/root/PlayerSystem")
    player.health_changed.connect(update_health_bar)
    player.damaged.connect(flash_health_damage)
```

### ShieldSystem Integration

```gdscript
# ShieldSystem signals
signal shield_state_changed(state: Dictionary)
signal shield_activated()
signal shield_hit(damage: int, remaining: int)
signal shield_broken()
signal shield_recharged()

# UISystem connections
func _ready():
    var shield = get_node("/root/ShieldSystem")
    shield.shield_state_changed.connect(update_shield_indicator)
```

### ProgressionSystem Integration

```gdscript
# ProgressionSystem signals
signal experience_changed(current: int, needed: int, level: int)
signal level_up(new_level: int)
signal upgrade_options_ready(level: int, options: Array)
signal upgrade_applied(upgrade_id: String)

# UISystem connections
func _ready():
    var progression = get_node("/root/ProgressionSystem")
    progression.experience_changed.connect(update_xp_bar)
    progression.level_up.connect(start_level_up_pulse)
    progression.upgrade_options_ready.connect(show_level_up_screen)
    progression.upgrade_applied.connect(close_level_up_screen)
```

### CombatSystem Integration

```gdscript
# CombatSystem signals
signal combo_updated(count: int, multiplier: float)
signal combo_broken(silent: bool)
signal combo_timeout()
signal enemy_killed(type: String)

# UISystem connections
func _ready():
    var combat = get_node("/root/CombatSystem")
    combat.combo_updated.connect(update_combo_meter)
    combat.combo_broken.connect(handle_combo_broken)
    combat.enemy_killed.connect(increment_kills_counter)
```

### WaveManager Integration

```gdscript
# WaveManager signals
signal wave_state_updated(number: int, killed: int, total: int, is_boss_wave: bool)
signal wave_complete()
signal wave_start(number: int)

# UISystem connections
func _ready():
    var wave_manager = get_node("/root/WaveManager")
    wave_manager.wave_state_updated.connect(update_wave_display)
    wave_manager.wave_complete.connect(handle_wave_complete)
```

### BossSystem Integration

```gdscript
# BossSystem signals
signal boss_spawned(boss_data: Dictionary)
signal boss_health_changed(health: int, max_health: int)
signal boss_phase_changed(new_phase: int)
signal boss_invulnerability_changed(is_invulnerable: bool)
signal boss_timer_updated(timer_type: String, remaining: float, total: float)
signal boss_defeated()

# UISystem connections
func _ready():
    var boss = get_node("/root/BossSystem")
    boss.boss_spawned.connect(handle_boss_spawned)
    boss.boss_health_changed.connect(func(h, m):
        boss_hud_state.health = h
        boss_hud_state.max_health = m
        update_boss_hud(boss_hud_state)
    )
    boss.boss_phase_changed.connect(handle_boss_phase_changed)
    boss.boss_defeated.connect(handle_boss_defeated)
```

### PhysicsSystem Integration

```gdscript
# PhysicsSystem signals
signal tactical_contacts_updated(contacts: Array, player_angle: float, range: float, detection_range: float)

# UISystem connections
func _ready():
    var physics = get_node("/root/PhysicsSystem")
    physics.tactical_contacts_updated.connect(func(contacts, angle, range, detection):
        minimap_canvas.update_contacts(contacts, angle)
        update_threat_indicators(contacts, range, detection)
    )
```

---

## 19. Acessibilidade

### ARIA Labels (Web equivalent)

```gdscript
# Godot não tem ARIA labels nativos, mas podemos usar hints e tooltips
# Para screen readers futuros ou accessibility features

const ACCESSIBILITY_LABELS = {
    "health": "Player health: %d out of %d",
    "shield": "Shield status: %s",
    "xp": "Experience: %d out of %d needed for level %d",
    "wave": "Wave %d: %d out of %d enemies defeated",
    "combo": "%d hit combo with %.1fx multiplier",
    "minimap": "Tactical minimap showing %d contacts within %d units",
    "threat": "%s threat at %d degrees, distance %d units",
    "boss": "Boss %s health: %d out of %d, phase %d",
    "level_up": "Level %d reached, choose upgrade %d of %d"
}

func get_accessibility_label(component: String, data: Dictionary) -> String:
    var template = ACCESSIBILITY_LABELS.get(component, "")
    # Format template com data
    # Pode ser usado para narração ou tooltips
    return template % data.values()
```

### Keyboard Navigation

```gdscript
# Level-up screen keyboard navigation
# Input actions necessários em Project Settings > Input Map:
# - ui_left: Left arrow
# - ui_right: Right arrow
# - ui_accept: Enter
# - ui_number_1: Key 1
# - ui_number_2: Key 2
# - ui_number_3: Key 3
# - ui_number_4: Key 4

func setup_input_actions():
    # Certifique-se de que essas actions existem
    if not InputMap.has_action("ui_left"):
        InputMap.add_action("ui_left")
        var event = InputEventKey.new()
        event.keycode = KEY_LEFT
        InputMap.action_add_event("ui_left", event)

    # Repita para outras actions...
```

### Reduced Motion

```gdscript
# Setting para reduced motion (para jogadores com motion sickness)
var reduced_motion: bool = false

func set_reduced_motion(enabled: bool) -> void:
    reduced_motion = enabled

func create_tween() -> Tween:
    var tween = get_tree().create_tween()
    if reduced_motion:
        # Duração zero ou muito rápida
        tween.set_speed_scale(10.0)
    return tween
```

### Color Blindness Support

```gdscript
# Paletas alternativas para color blindness
enum ColorBlindnessMode {
    NORMAL,
    PROTANOPIA,      # Red-blind
    DEUTERANOPIA,    # Green-blind
    TRITANOPIA       # Blue-blind
}

var colorblindness_mode: ColorBlindnessMode = ColorBlindnessMode.NORMAL

func get_adjusted_color(original: Color) -> Color:
    match colorblindness_mode:
        ColorBlindnessMode.PROTANOPIA:
            # Ajusta red channel
            return Color(original.g, original.g, original.b, original.a)
        ColorBlindnessMode.DEUTERANOPIA:
            # Ajusta green channel
            return Color(original.r, original.r, original.b, original.a)
        ColorBlindnessMode.TRITANOPIA:
            # Ajusta blue channel
            return Color(original.r, original.g, original.r, original.a)
        _:
            return original
```

### High Contrast Mode

```gdscript
var high_contrast: bool = false

func apply_high_contrast() -> void:
    if high_contrast:
        # Aumenta contraste de todos os elementos
        HUD_COLORS.background = Color.BLACK
        HUD_COLORS.border = Color.WHITE
        HUD_COLORS.text_primary = Color.WHITE

        HEALTH_COLOR_NORMAL = Color.GREEN
        HEALTH_COLOR_WARNING = Color.YELLOW
        HEALTH_COLOR_DANGER = Color.RED

        # Força outline em todos os labels
        for label in get_tree().get_nodes_in_group("hud_labels"):
            label.add_theme_color_override("font_outline_color", Color.BLACK)
            label.add_theme_constant_override("outline_size", 2)
```

---

## 20. Referências

### Arquivos JavaScript Analisados

1. **src/modules/UISystem.js** (~5374 linhas)
   - Linhas 60-186: HUD state structure
   - Linhas 293-676: Boss HUD state e rendering
   - Linhas 3803-3920: Minimap rendering (Canvas 2D)
   - Linhas 3985-4060: Threat indicators positioning e severity
   - Linhas 4102-4200: Combo meter updates e animations
   - Linhas 4202-4242: Health bar updates e damage flash
   - Linhas 4311-4397: XP bar updates e level-up pulse
   - Linhas 4398-4693: Wave display updates
   - Linhas 4709-4819: Shield indicator state machine
   - Linhas 4954-5115: Level-up screen rendering
   - Linhas 16-45: Constants (MINIMAP_RANGE, MAX_THREAT_INDICATORS, etc.)

2. **src/data/ui/hudLayout.js** (562 linhas)
   - Linhas 3-514: HUD layout definitions (classic, minimal tactical)
   - HUD item configs (key, type, position, group, layout, icon, thresholds)

3. **src/data/constants/visual.js** (193 linhas)
   - ENEMY_EFFECT_COLORS: drone, hunter, mine, boss
   - ENEMY_RENDER_PRESETS: colors, sizes
   - ENEMY_REWARDS: heart drop chances

### Funções-Chave (UISystem.js)

- `renderMinimap()`: Canvas 2D rendering com contacts, player, crosshair
- `updateThreatIndicators()`: DOM manipulation, severity calculation, positioning
- `updateComboMeter()`: Text update, pulse animation, break animation
- `updateHealthDisplay()`: Health bar, damage flash, low health pulse
- `updateShieldIndicator()`: State machine (locked→ready→active→cooldown)
- `updateXpDisplay()`: XP bar, level indicator, level-up pulse
- `showLevelUpScreen()`: Level-up UI, pause game, upgrade cards
- `buildUpgradeOptionMarkup()`: HTML generation para upgrade cards
- `renderBossHud()`: Boss health bar, phase indicators, timers, banners
- `resolveThreatSeverity()`: Calcula severity baseado em distance beyond range

### Eventos Principais

**Player Events:**
- `player_health_changed`
- `player_damaged`
- `player_died`

**Shield Events:**
- `shield_state_changed`
- `shield_activated`
- `shield_hit`
- `shield_broken`
- `shield_recharged`

**Progression Events:**
- `experience_changed`
- `level_up`
- `upgrade_options_ready`
- `upgrade_applied`

**Combat Events:**
- `combo_updated`
- `combo_broken`
- `combo_timeout`
- `enemy_killed`

**Wave Events:**
- `wave_state_updated`
- `wave_complete`
- `wave_start`

**Boss Events:**
- `boss_spawned`
- `boss_health_changed`
- `boss_phase_changed`
- `boss_invulnerability_changed`
- `boss_timer_updated`
- `boss_defeated`

**Tactical Events:**
- `tactical_contacts_updated`

### Constantes Importantes

```gdscript
# UISystem.js constants (linhas 16-45)
const DEFAULT_MINIMAP_RANGE = 300
const DEFAULT_DETECTION_RANGE = 450
const MAX_THREAT_INDICATORS = 8

const MINIMAP_ENTITY_COLORS = {
    "asteroid": "#A0AEC0",
    "drone": "#63B3ED",
    "mine": "#F6AD55",
    "hunter": "#B794F4",
    "boss": "#F56565",
    "default": "#E2E8F0"
}

const THREAT_ICON_LOOKUP = {
    "boss": "☠",
    "hunter": "✦",
    "drone": "▲",
    "mine": "✸",
    "asteroid": "●",
    "default": "•"
}

const COLOR_ASSIST_ACCENTS = {
    "offense": "#F6C945",
    "defense": "#4ECDC4",
    "mobility": "#5DADE2",
    "utility": "#C08BFF",
    "default": "#3399FF"
}
```

### Conceitos-Chave JS→Godot

| JavaScript | Godot 3D |
|------------|----------|
| DOM elements | Control nodes (Label, ProgressBar, etc.) |
| CSS classes | Theme overrides, modulate, custom properties |
| Canvas 2D rendering | Control._draw() ou SubViewport |
| Event listeners | Godot signals |
| setTimeout/setInterval | Timer nodes ou await get_tree().create_timer() |
| requestAnimationFrame | _process(delta) ou _physics_process(delta) |
| Tween.js | Godot Tween (create_tween()) |
| CSS animations | AnimationPlayer ou Tween |
| Position (%, px) | Anchors, margins, Control.position |
| z-index | CanvasItem.z_index ou Control.z_index |
| Flexbox | VBoxContainer, HBoxContainer, GridContainer |

### GDScript Best Practices para UI

1. **Use CanvasLayer**: Separa UI do game world 3D
2. **Cache Node References**: Use @onready var para performance
3. **Avoid Frequent Redraws**: Cache values, queue_redraw() apenas quando necessário
4. **Use Theme**: Centralize styling em Theme resource
5. **Signal-Driven Updates**: Conecte signals ao invés de polling
6. **Tween Animations**: Use create_tween() para smooth animations
7. **Responsive Layout**: Use anchors e containers ao invés de positions fixas
8. **Accessibility**: Considere keyboard navigation, reduced motion, color blindness

---

## Conclusão

Este documento fornece uma especificação completa para migrar o sistema de UI/HUD do JavaScript para Godot 3D. Todos os algoritmos principais foram traduzidos para pseudocódigo GDScript, layouts foram mapeados para estruturas de cena Godot, e todos os componentes HUD foram documentados com especificações visuais e comportamentais.

**Próximos Passos:**
1. Criar scene HUD.tscn com estrutura de nodes conforme Seção 13
2. Implementar classe UISystem.gd com todos os métodos documentados
3. Criar Minimap.gd com custom _draw() conforme Seção 9
4. Implementar level-up screen conforme Seção 12
5. Conectar signals de todos os sistemas (Player, Shield, Progression, Combat, Wave, Boss)
6. Testar cada componente HUD isoladamente
7. Ajustar theme e styling para match design
8. Implementar accessibility features conforme Seção 19

**Arquivos a Criar:**
- `scenes/ui/HUD.tscn`
- `scenes/ui/LevelUpScreen.tscn`
- `scripts/ui/UISystem.gd`
- `scripts/ui/Minimap.gd`
- `scripts/ui/ThreatIndicator.gd`
- `resources/themes/hud_theme.tres`
