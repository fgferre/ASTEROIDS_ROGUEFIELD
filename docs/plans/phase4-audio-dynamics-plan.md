# Plano da Fase 4 – Áudio Dinâmico e Camadas Musicais

## Objetivo
Expandir `AudioSystem` com novos efeitos sonoros para drones, mines, hunters e boss, além de introduzir um sistema de trilha musical em camadas que reage à intensidade das ondas e lutas contra bosses.

## Componentes Principais

- `AudioSystem` (escuta de novos eventos, síntese procedural e controle de trilhas).
- `AudioCache` e `AudioBatcher` (reuso de buffers e disparo coordenado).
- Integração com eventos das fases anteriores.

## Passos Detalhados

1. **Eventos e Handlers:**
   - Registrar listeners para: `enemy-fired`, `mine-exploded`, `boss-spawned`, `boss-phase-changed`, `boss-defeated`, `wave-started`.
   - Métodos específicos:
     - `playDroneFire(data)` – laser agudo 600-800Hz, duração ~0.1s.
     - `playHunterBurst(data)` – três disparos 700-900Hz, espaçados 0.05s.
     - `playMineExplosion(data)` – explosão profunda usando `AudioCache.getNoiseBuffer('explosion')`, duração ~0.5s.
     - `playBossRoar()` – onda serrilhada 80-150Hz com vibrato, 1.2s.
     - `playBossPhaseChange(phase)` – sweep 200→800Hz, 0.6s.
     - `playBossDefeated()` – fanfarra crescente de 2.0s.

2. **Sistema de Camadas Musicais:**
   - Criar propriedade `musicLayers` contendo osciladores/loops: base (110Hz drone), intensidade1 (220Hz), intensidade2 (330Hz), intensidade3 (440Hz).
   - Implementar `startBackgroundMusic()` inicializando layers e gains individuais.
   - Implementar `setMusicIntensity(level)` (0-3) ajustando gains gradualmente, mantendo layer base sempre ativo.
   - Reagir a eventos:
     - Ondas comuns ajustam intensidade com base no número da onda.
     - `boss-spawned` força intensidade máxima; `boss-defeated` reduz gradualmente.

3. **Integração com Pools de Áudio:**
   - Garantir reutilização via `AudioBatcher` para disparos rápidos (drones/hunters).
   - Cachear buffers recorrentes (explosões, fanfarra) em `AudioCache` para evitar custos extras.

4. **Coordenação com Outros Sistemas:**
   - `EffectsSystem` e `UISystem` já emitem eventos; assegurar sincronização (ex.: fanfarra após explosão final do boss).
   - Atualizar documentação inline indicando como novos inimigos devem disparar sons via eventos.

## Critérios de Conclusão

- Cada inimigo dispara efeitos sonoros característicos alinhados aos parâmetros definidos em `GameConstants`.
- Sistema de música reage às ondas e bosses sem cortes abruptos (transições suaves de ganho).
- O áudio permanece gerenciável via caches e batcher existentes, sem introduzir bibliotecas externas.

## Thruster Sound System (✅ COMPLETED)

Implemented procedural thruster sounds with start→loop→stop architecture directly in `AudioSystem.js`:

### Implementation Details

**ThrusterLoopManager Class:**
- Internal class managing active loop state per thruster type (main, retro, side)
- Tracks loop nodes: oscillators (saw+square mix), gains, noise sources, filters
- Methods: `startLoop()`, `updateLoop()`, `stopLoop()`, `isActive()`, `cleanup()`
- Prevents duplicate loops and handles edge cases (multiple starts, stop without start)

**Thruster Types:**
- **Main Thruster (forward acceleration):**
  - Start burst: 180-260ms, sawtooth oscillator, pitch ramp 180→220Hz
  - Loop: 1.0-1.5s tileable noise buffer, saw (40%) + square (60%) mix at ~85Hz
  - Stop release: 140-220ms, pitch drop to 150Hz
  - Band-pass filter: 3kHz center, Q=1.2
- **Retro Thruster (braking - maps from 'aux' event type):**
  - Start burst: 160-220ms, descending pitch 220→180Hz for "reverso" effect
  - Loop: 0.8-1.2s tileable buffer, ~95Hz base frequency
  - Stop release: 140-200ms with lowpass filter sweep
  - Band-pass filter: 2.5kHz center
- **Side Thrusters (rotation - mono "puff" sound):**
  - Start burst: 90-150ms, square wave, 300Hz ± variation
  - Loop: 0.6-1.0s, ~110Hz, quick attack/decay
  - Stop release: 80-120ms
  - Band-pass filter: 3.5kHz center

**Audio Architecture:**
- **Start Phase:** Plays short burst sound (180-260ms for main, 160-220ms for retro, 90-150ms for side) with pitch ramp and noise component
- **Loop Phase:** Continuous tileable sound using oscillator mix (saw 40% + square 60%) + band-passed noise, set to `noiseSource.loop = true`
- **Stop Phase:** Release sound with pitch drop and filter sweep, cleanup of loop nodes

**EQ Filter Chain (Start Bursts):**
- HPF: 70Hz (remove subsonic rumble)
- Peaking: 250Hz, +3dB (body/warmth)
- Peaking: 3kHz, +2dB (presence/clarity)

**State Management:**
- Event handler: `handleThrusterEffect(data)` receives events from PlayerSystem
- Type mapping: `'aux'` → `'retro'`, `'main'` stays `'main'`, `'side'` stays `'side'`
- Intensity thresholds: `startThreshold: 0.1`, `stopThreshold: 0.05` (hysteresis prevents flapping)
- Tracks last intensity per type to detect state changes

**Integration:**
- Event listener: `'thruster-effect'` from PlayerSystem (lines 728-771)
- Uses existing `AudioPool` for node pooling (oscillators, gains, buffer sources)
- Uses `AudioCache` for tileable noise buffer generation with family-based scoping
- Deterministic variations via `RandomService` scopes: `thruster`, `thrusterMain`, `thrusterRetro`, `thrusterSide`
- Performance tracking: `_trackPerformance()` calls for all methods
- Cleanup: `thrusterLoopManager.cleanup()` called in `AudioSystem.reset()`

**Key Design Decisions:**
1. **Tileable Loops:** Noise buffers use `loop = true` on AudioBufferSourceNode for seamless continuous playback
2. **Hysteresis:** Start threshold (0.1) > stop threshold (0.05) prevents rapid on/off cycling
3. **Simplified Side Thrusters:** Single mono sound instead of stereo left/right (game handles spatial audio)
4. **Retro Clarity:** Removed one-shot variant, all thrusters use consistent start/loop/stop lifecycle
5. **Safeguards:** ThrusterLoopManager prevents duplicate loops, handles cleanup edge cases

**Performance Optimizations:**
- Loops reuse pooled nodes (not returned until stop)
- Noise buffers cached per family (thrusterMain, thrusterRetro, thrusterSide)
- Intensity updates without recreating nodes (smooth gain ramp)
- Filter nodes created per loop but not pooled (biquad filters can't be reused easily)

## UI Sound System (✅ COMPLETED)

Implemented procedural UI sounds with deterministic variations for enhanced user feedback across all menu interactions:

### Implementation Details

**UI Sound Types:**

**1. UI Hover (button mouseenter):**
- **Purpose:** Brief audio feedback when hovering over interactive buttons
- **Variations:** 5 deterministic variations via `uiHover` random scope
- **Duration:** 80-150ms (randomized per variation)
- **Synthesis:** "Ting" effect with dual-oscillator architecture
  - Fundamental: Sine wave at 1.2-2.4kHz with ±2% pitch variation per variation
  - Harmonic: Sine wave at 2× fundamental frequency for richness
- **Envelope:**
  - Attack: 0-8ms (randomized)
  - Decay: 70-120ms (randomized)
- **EQ Chain:**
  - HPF: 120Hz (removes subsonic rumble)
  - Peaking filter: 2-4kHz, +2dB, Q=1.0 (adds presence and clarity)
- **Gain:** -10dB peak (0.316 linear), fundamental at full level, harmonic at -6dB relative
- **Batching:** Integrated with AudioBatcher using overlap prevention (~80ms minInterval)

**2. UI Select/Confirm (button click):**
- **Purpose:** Distinctive feedback for button activation (replaces deprecated `playButtonClick()`)
- **Variations:** 5 deterministic variations via `uiSelect` random scope
- **Duration:** 120-180ms (randomized per variation)
- **Synthesis:** Single sine oscillator with frequency modulation for "down-up" feel
  - Base frequency: 700-900Hz with ±2% pitch variation
  - Down phase: Ramps to 95% frequency over first 40% of duration
  - Up phase: Ramps to 105% frequency over remaining 60%
- **Envelope:** Follows frequency curve for cohesive feel
  - Attack: 5ms to peak
  - Dip: Drops to 50% at 40% duration mark
  - Peak: Returns to 100% at 70% mark
  - Decay: Exponential to silence by end
- **EQ Chain:**
  - HPF: 120Hz
  - Exciter: Peaking at 4kHz, +3dB, Q=2.0 (enhances 3-5kHz presence)
- **Gain:** -9dB peak (0.355 linear)

**3. UI StartGame (game start action):**
- **Purpose:** Exciting audio signature when starting/restarting game
- **Variations:** 2 deterministic variations via `uiStartGame` random scope (sine vs triangle)
- **Duration:** 300-450ms (randomized)
- **Synthesis:** Two-component hybrid with delay-based reverb
  - **Ping component:**
    - Oscillator type: Sine (var 0) or Triangle (var 1)
    - Base frequency: 1-1.5kHz ascending 2-3 semitones over 60% duration
    - Envelope: 10ms attack, sustain at 50% level, exponential decay
  - **Whoosh component:**
    - White noise through band-pass filter (1-6kHz, Q=1.0)
    - Starts at 200ms offset, duration 200-250ms
    - Envelope: Quick 20ms attack, exponential decay
    - Gain: 0.2 linear
- **Reverb:** Simplified delay-based approach (ADAPTATION 1)
  - Delay: 80ms
  - Feedback: 30% for tail extension
  - Wet gain: -12dB (0.25 linear)
  - Dry/wet: Both components sent to delay + master (70/30 mix)
- **Master gain:** -6dB peak (0.5 linear), target LUFS -21 (informational)

**Technical Architecture:**

**Random Scopes:**
- `uiHover`: Forked from `'audio:family:ui:hover'`
- `uiSelect`: Forked from `'audio:family:ui:select'`
- `uiStartGame`: Forked from `'audio:family:ui:startgame'`
- All scopes provide deterministic variations for consistent playback across game resets

**Event Integration:**
- **AudioSystem listeners:**
  - `'ui-hover'` → Schedules `playUIHover()` via AudioBatcher (overlap prevention)
  - `'input-confirmed'` → Calls `playUISelect()` directly
  - `'game-started'` → Calls `playUIStartGame()` directly
- **UISystem event emissions:**
  - Pause menu buttons (resume, settings, exit): Emit on `mouseenter`
  - Settings menu buttons (tabs, close, reset): Emit on `mouseenter`
  - Credits menu close buttons: Emit on `mouseenter`
  - Upgrade selection buttons: Emit on `mouseenter` (enhanced existing handler)
  - Main menu buttons (start-game-btn, restart-game-btn): Emit on `mouseenter`
- **GameSessionService integration:**
  - New wrapper method: `emitGameStarted(meta)` follows existing pattern (`emitPauseState`, `emitScreenChanged`)
  - Emission location: After `emitScreenChanged('playing')` in `startNewRun()` (ensures audio init, screen transition, then sound)
  - Payload: `{ source, timestamp: Date.now() }`

**AudioBatcher Integration:**
- Added `'playUIHover'` to `batchableSounds` array (line 221)
- Added UI category to `_getSoundCategory()`: Returns `'ui'` for sounds containing 'UI' or 'ui' (line 675)
- Overlap prevention: Hover sounds use minInterval ~80ms to prevent accumulation during rapid navigation

**Performance Characteristics:**
- **playUIHover:** <1ms synthesis time, dual-oscillator with 2 filters
- **playUISelect:** <2ms synthesis time, single-oscillator with modulation
- **playUIStartGame:** <5ms synthesis time (includes delay setup, no convolution)
- All sounds tracked via `_trackPerformance()` for monitoring
- Zero memory leaks: All nodes returned to AudioPool after use with appropriate margins
- Deterministic: Same variations play consistently across runs with same seed

**Design Decisions:**

**ADAPTATION 1 - Simplified Reverb:**
- Replaced complex ConvolverNode + impulse response generation with delay-based feedback reverb
- Rationale: Convolution impulse generation causes GC pressure and potential audio glitches
- Result: Same spatial effect with simpler, more performant implementation

**ADAPTATION 2 - GameSessionService Pattern:**
- Used wrapper method `emitGameStarted()` instead of direct `gameEvents.emit()`
- Follows established pattern (matches `emitPauseState`, `emitScreenChanged`)
- Maintains consistency with service architecture

**ADAPTATION 3 - AudioBatcher Category:**
- Added explicit 'ui' category for proper overlap tracking
- Ensures hover sounds batch correctly with appropriate minInterval

**ADAPTATION 5 - Simplified playUISelect:**
- Single oscillator with frequency modulation instead of two separate transients
- Achieves same "down-up" feel with less code complexity
- More efficient node usage (1 oscillator vs 2)

**Backward Compatibility:**
- `playButtonClick()` method retained with `@deprecated` JSDoc tag
- Existing references (if any) continue to work
- New code should use `playUISelect()` for better UX

**Accessibility:**
- Brief durations (80-450ms) don't interfere with screen readers
- AudioBatcher prevents sound accumulation during keyboard navigation
- No changes to ARIA attributes or focus management required
- Hover sounds provide optional feedback, not critical information

**Code Locations:**
- [AudioSystem.js:2848-2850](../src/modules/AudioSystem.js#L2848-L2850) - Random scope creation
- [AudioSystem.js:608-620](../src/modules/AudioSystem.js#L608-L620) - Event listeners
- [AudioSystem.js:3273-3538](../src/modules/AudioSystem.js#L3273-L3538) - Sound methods (playUIHover, playUISelect, playUIStartGame)
- [AudioSystem.js:3149](../src/modules/AudioSystem.js#L3149) - Deprecated playButtonClick
- [AudioBatcher.js:221](../src/modules/AudioBatcher.js#L221) - Batchable sounds array
- [AudioBatcher.js:675](../src/modules/AudioBatcher.js#L675) - UI category mapping
- [GameSessionService.js:273-279](../src/services/GameSessionService.js#L273-L279) - emitGameStarted method
- [GameSessionService.js:687](../src/services/GameSessionService.js#L687) - game-started emission
- [UISystem.js:1552-1588](../src/modules/UISystem.js#L1552-L1588) - Pause menu mouseenter handlers
- [UISystem.js:1598-1642](../src/modules/UISystem.js#L1598-L1642) - Settings menu mouseenter handlers
- [UISystem.js:1679-1686](../src/modules/UISystem.js#L1679-L1686) - Credits menu mouseenter handlers
- [UISystem.js:4989-4992](../src/modules/UISystem.js#L4989-L4992) - Upgrade button mouseenter handler
- [UISystem.js:1690-1709](../src/modules/UISystem.js#L1690-L1709) - Main menu buttons mouseenter handlers

## Dependências

- Depende das fases 1 e 2 (eventos e boss) e dos presets definidos na Fase 3 para sincronizar feedback audiovisual.
- Fornece contexto auditivo que a Fase 5 usará para reforçar indicadores de ameaça e combo.
