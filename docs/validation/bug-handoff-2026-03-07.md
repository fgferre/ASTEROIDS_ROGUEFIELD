# Handoff de Bugs para Verificacao Futura

Data: 2026-03-07

Objetivo: reduzir custo de contexto para a proxima IA. Este arquivo nao e fonte de verdade. Cada item abaixo deve ser revalidado na fonte antes de qualquer correcao.

## Regras de uso

1. Nao assuma que os findings estao corretos.
2. Abra primeiro as referencias citadas.
3. Tente reproduzir por log, teste ou leitura de fluxo antes de editar.
4. Corrija um item por vez para evitar regressao cruzada.
5. Se um item nao se confirmar, marque como descartado e siga.

## Comandos rapidos

```powershell
npm test
npm run build
Select-String -Path game-debug.log -Pattern "Boss projectile created|Boss projectile destroyed|Player hit by enemy projectile"
Select-String -Path game-debug.log -Pattern "Boss phase transition|Boss defeated - creating effects"
git grep -n "this.setupEventListeners()" -- src/modules src/core
git grep -n "boss-spawned\\|boss-phase-changed\\|boss-defeated\\|effects-boss-\\|ui-boss-" -- src/modules tests
git grep -n "Math.random()" -- src/modules/MenuBackgroundSystem.js src/modules/EffectsSystem.js
git grep -n "screenShake\\|addScreenShake\\|updateCameraShake\\|applyCameraShake" -- src utils tests
```

## Findings priorizados

### HV-01 - Listeners duplicados em subclasses de BaseSystem

Status: forte candidato a bug real
Prioridade: alta

Abrir primeiro:

- `src/core/BaseSystem.js:100-102`
- `src/modules/EnemySystem.js:174-188`
- `src/modules/EnemySystem.js:251-303`
- `src/modules/EnemySystem.js:3871-3890`
- `src/modules/CombatSystem.js:132-170`
- `src/modules/PlayerSystem.js:143-144`
- `src/modules/PlayerSystem.js:293-390`
- `src/modules/WorldSystem.js:12-25`

Hipotese:

- `BaseSystem` ja chama `setupEventListeners()` no `super()`.
- Algumas subclasses chamam `this.setupEventListeners()` de novo no construtor.
- Isso pode duplicar handlers e efeitos colaterais.

Sinais ja vistos:

- `EnemySystem` pode processar `enemy-fired` duas vezes e encaminhar o mesmo payload ao `CombatSystem` duas vezes.
- `EnemySystem` pode aplicar dano de `player-hit-by-projectile` duas vezes.
- `PlayerSystem` pode aplicar upgrades duas vezes.
- `CombatSystem` pode rodar handlers de reset/upgrade duas vezes.
- `WorldSystem` pode duplicar resets.

Evidencia de log para checar:

- `game-debug.log:966-979` projeteis do boss aparecem em pares identicos.
- `game-debug.log:1018-1024` colisao do mesmo projetil com o player aparece repetida.
- `game-debug.log:1029-1041` destruicoes de projeteis aparecem duplicadas.

Checklist de verificacao:

- Confirmar que a classe realmente estende `BaseSystem`.
- Confirmar que o construtor chama `this.setupEventListeners()` apos `super()`.
- Seguir um evento concreto (`enemy-fired`, `upgrade-*`, `player-hit-by-projectile`) e contar quantos handlers equivalentes ficam registrados.
- Se corrigir: nao remover chamadas de classes que nao estendem `BaseSystem` como `InputSystem` e `SettingsSystem`.

### HV-02 - HP do boss e sobrescrito apos a inicializacao

Status: forte candidato a bug real
Prioridade: alta

Abrir primeiro:

- `src/modules/enemies/types/BossEnemy.js:202-207`
- `src/modules/enemies/types/BossEnemy.js:336-348`
- `src/modules/enemies/base/EnemyFactory.js:622-638`
- `src/modules/enemies/components/HealthComponent.js:24-49`
- `src/modules/enemies/components/HealthComponent.js:59-69`
- `src/data/enemies/boss.js:184-189`

Hipotese:

- `BossEnemy.initialize()` calcula vida escalada por wave com `baseHealth * scaling^(wave-1)`.
- Depois o `EnemyFactory.applyComponents()` chama `HealthComponent.initialize(enemy, components.health)`.
- Como `components.health` nao define `waveScaling`, o `HealthComponent` reaplica um modelo diferente e reseta a vida.

Evidencia de log para checar:

- `game-debug.log:960` boss inicializado com `3111/3111`.
- `game-debug.log:962` boss criado logo depois com `1800/1800`.
- `game-debug.log:1142` transicao de fase ocorre com `1152/1800`, consistente com o HP reduzido e nao com o escalado.

Checklist de verificacao:

- Instrumentar ou inspecionar o valor de `boss.health/maxHealth` imediatamente apos `BossEnemy.initialize()`.
- Reinspecionar o mesmo valor apos `EnemyFactory.applyComponents()`.
- Confirmar se o modelo final desejado e "boss define HP" ou "HealthComponent define HP", mas nunca ambos.
- Se corrigir: validar thresholds de fase, rewards e logs de spawn.

### HV-03 - DIContainer suporta registro por instancia, mas nao o expõe corretamente

Status: bug de contrato/API; impacto runtime depende de uso real
Prioridade: media

Abrir primeiro:

- `src/core/DIContainer.js:88-95`
- `src/core/DIContainer.js:232-233`
- `src/core/DIContainer.js:314-315`
- `src/core/serviceUtils.js:45-66`
- `src/app.js:89-97`
- `tests/core/DIContainer.test.js:32-34`

Hipotese:

- `register(name, instance)` e aceito e grava em `singletons`.
- `has()` e `getServiceNames()` olham apenas `factories`.
- `createServiceResolver()` depende de `has()`, entao uma instancia direta pode parecer "nao registrada".

O que verificar antes de tratar como bug de producao:

- Existe call site real usando `register(name, instance)` no runtime atual?
- Algum fluxo depende de `container.has(name)` para esses servicos?
- O problema hoje e so de diagnostico/teste, ou afeta resolucao real?

Teste minimo sugerido:

```javascript
const c = new DIContainer();
const svc = { ok: true };
c.register('x', svc);
// verificar: c.resolve('x'), c.has('x'), c.getServiceNames()
```

### HV-04 - Pipeline de eventos do boss reaplica audio, UI e efeitos

Status: forte candidato a bug real
Prioridade: alta

Abrir primeiro:

- `src/modules/EnemySystem.js:1631-1677`
- `src/modules/EnemySystem.js:1785-1792`
- `src/modules/EffectsSystem.js:611-645`
- `src/modules/UISystem.js:1120-1137`
- `src/modules/AudioSystem.js:623-635`
- `src/modules/AudioSystem.js:1258-1279`
- `src/modules/enemies/systems/EnemySpawnSystem.js:242-256`
- `src/modules/enemies/types/BossEnemy.js:1149-1157`
- `src/modules/enemies/types/BossEnemy.js:1210-1218`

Hipotese:

- Os eventos crus `boss-spawned`, `boss-phase-changed` e `boss-defeated` ja sao consumidos diretamente por `AudioSystem`, `UISystem` e `EffectsSystem`.
- `EnemySystem` recebe o mesmo evento bruto e chama `forwardBossEvent()`.
- `forwardBossEvent()` chama `audio.handleBossEvent()` e `ui.handleBossEvent()` diretamente e ainda emite `audio-*` e `ui-*`.
- Para efeitos, como `EffectsSystem` nao expõe `handleBossEvent()`, o fallback do `EnemySystem` ja cria flash/shake extra e depois ainda emite `effects-*`, que o `EffectsSystem` escuta novamente.

Impacto plausivel:

- roar/phase change/defeat podem tocar duas vezes no audio
- HUD do boss pode recalcular duas vezes por evento
- spawn/phase/defeat podem criar efeitos duplicados; no caminho atual de efeitos o fan-out parece chegar a 3 passagens

Checklist de verificacao:

- Contar quantas vezes `playBossRoar`, `createBossEntranceEffect`, `triggerBossTransitionEffect` e `handleBossEvent` sao invocados apos um unico `eventBus.emit('boss-spawned', payload)`.
- Verificar se existe algum dedupe interno antes de corrigir.
- Se corrigir: escolher uma unica estrategia, ou consumo direto do raw event, ou fan-out por canal, mas nao ambos.

### HV-05 - MenuBackgroundSystem ainda usa Math.random() na montagem da cena

Status: gap real de render/determinismo
Prioridade: media

Abrir primeiro:

- `src/modules/MenuBackgroundSystem.js:40-46`
- `src/modules/MenuBackgroundSystem.js:1204-1224`
- `src/modules/MenuBackgroundSystem.js:1289-1305`
- `tests/visual/menu-background-determinism.test.js:47-150`

Hipotese:

- O sistema injeta helpers deterministas e ainda faz patch do gerador de UUID do Three.
- Mesmo assim, a rotacao inicial das nebulas e as posicoes da poeira espacial continuam vindo de `Math.random()`.
- Duas inicializacoes com a mesma seed podem gerar layouts diferentes no menu, o que reduz a utilidade de snapshots visuais e replays de regressao.

Observacao de cobertura:

- O teste atual cobre apenas o patch de UUID do Three.
- Ele nao exercita a montagem real da cena; no ambiente de teste o sistema nem encontra o canvas.

Checklist de verificacao:

- Instanciar duas vezes com a mesma seed e comparar `mesh.rotation.z` das nebulas e o buffer `positions` da poeira.
- Se corrigir: trocar apenas esses pontos por `this.randomFloat(...)` usando um fork coerente com o dominio visual.

### HV-06 - Particulas de thruster e muzzle flash burlam o RNG deterministico

Status: forte candidato a bug de render/reproducao
Prioridade: media

Abrir primeiro:

- `src/modules/EffectsSystem.js:332-338`
- `src/modules/EffectsSystem.js:2369-2426`
- `src/modules/EffectsSystem.js:2430-2477`

Hipotese:

- `EffectsSystem` recebe helpers de RNG deterministico, mas os emissores de thruster e muzzle flash ainda usam `Math.random()` para arredondamento de contagem, jitter, tamanho e lifetime.
- O mesmo input de gameplay com a mesma seed pode produzir nuvens de particulas diferentes entre runs, inclusive com custo de frame diferente.

Checklist de verificacao:

- Resetar a seed e comparar arrays de particulas gerados por duas chamadas identicas a `createThrusterEffect(...)` e `createMuzzleFlash(...)`.
- Procurar se existe teste de determinismo cobrindo esse caminho; na busca rapida atual nao apareceu cobertura dedicada para essas rotinas.

### HV-07 - Um shake fraco pode prolongar um shake forte ja em curso

Status: forte candidato a bug real
Prioridade: alta

Abrir primeiro:

- `src/utils/ScreenShake.js:146-152`
- `src/utils/ScreenShake.js:171-175`
- `src/modules/EffectsSystem.js:2079-2199`

Hipotese:

- `ScreenShake.add(amount, duration)` soma `trauma`, mas sobrescreve `traumaDecay` usando apenas o ultimo evento.
- Se um evento pequeno chegar durante um shake grande, o decay global pode ficar muito menor do que o necessario para o shake atual.
- Na pratica, um hit fraco ou tiro com shake curto pode alongar uma explosao ou impacto grande em vez de apenas adicionar um pequeno pico.

Evidencia local ja verificada:

- Simulacao manual no repo:
  - depois de `add(1, 1)` e `update(0.5)`, o trauma vai para `0.5`
  - um `add(0.1, 1)` muda `traumaDecay` de `1` para `0.1`
  - apos mais `0.5s`, o trauma continua em `~0.55`
  - sem o segundo hit, no mesmo intervalo, ele cairia para `0`

Checklist de verificacao:

- Repetir a simulacao com uma combinacao de shake forte seguido por um preset fraco do `EffectsSystem`.
- Decidir se o decay deve ser o maximo entre eventos ativos, ou se cada evento precisa de tracking separado.
- Adicionar teste cobrindo stacking sem regressao no comportamento deterministico atual.

### HV-08 - Camera shake do menu altera a posicao real da camera e pode causar drift

Status: forte candidato a bug real
Prioridade: media

Abrir primeiro:

- `src/modules/MenuBackgroundSystem.js:3491-3504`
- `src/modules/MenuBackgroundSystem.js:3834-3845`
- `src/modules/MenuBackgroundSystem.js:3861-3868`
- `src/modules/AsteroidImpactEffect.js:455-463`
- `src/modules/AsteroidImpactEffect.js:584-603`

Hipotese:

- No menu 3D, colisao com impacto acima de `fragmentationThreshold` dispara `impactEffect.trigger(...)`.
- `updateCameraShake()` nao calcula offset temporario; ele soma diretamente `offsetX/offsetY` em `camera.position` a cada frame.
- Como o menu usa essa mesma `camera.position` para orbita e para camadas que seguem a camera, o shake pode virar drift real da camera e contaminar o parallax do fundo.

Impacto plausivel:

- menu parece "escorregar" ou oscilar alem do shake esperado apos varias colisoes
- camadas de starfield/nebula que copiam `camera.position` podem amplificar o movimento

Checklist de verificacao:

- Reproduzir no menu com varias colisoes fortes seguidas e observar se a camera demora a voltar ao trilho orbital.
- Instrumentar `camera.position` antes e depois de `updateCameraShake()` para confirmar se o shake e acumulativo.
- Se corrigir: aplicar shake como offset derivado de uma base camera pose do frame, sem mutar a pose persistente.

### HV-09 - Fix com `Math.max` no ScreenShake encurta varios presets logo no primeiro shake

Status: regressao forte apos tentativa de correcao
Prioridade: alta

Abrir primeiro:

- `src/utils/ScreenShake.js:35-36`
- `src/utils/ScreenShake.js:146-153`
- `src/utils/ScreenShake.js:171-176`

Hipotese:

- O fix de HV-07 trocou a sobrescrita por `Math.max(this.traumaDecay, amount / duration)`.
- Como `traumaDecay` nasce em `1.5`, o primeiro shake nao consegue configurar duracoes mais longas que isso se seu ratio for menor que `1.5`.
- Resultado: varios presets passam a decair mais rapido do que o valor configurado.

Evidencia local ja verificada:

- Simulacao manual no repo com o codigo atual:
  - `add(1, 1)` seguido de `update(0.5)` deixa trauma em `0.25`
  - o esperado para duracao de `1s` seria algo perto de `0.5`
- Ou seja, o floor de `1.5` ainda domina o primeiro shake.

Checklist de verificacao:

- Repetir a simulacao com `add(1, 1)` e comparar com o valor esperado em `0.5s`.
- Validar presets string de `ShakePresets`, porque muitos usam ratios abaixo de `1.5`.
- Se corrigir: nao preservar o decay anterior quando nao existe shake ativo.

### HV-10 - `forwardBossEvent()` em no-op remove feedback proprio de `boss-wave-started`

Status: regressao forte apos tentativa de correcao
Prioridade: media

Abrir primeiro:

- `src/modules/EnemySystem.js:1636-1642`
- `src/modules/EnemySystem.js:1665-1670`
- `src/modules/EnemySystem.js:1716-1723`
- `src/modules/EnemySystem.js:3385-3392`
- `src/modules/UISystem.js:1120-1137`

Hipotese:

- O no-op resolve a duplicacao dos eventos `boss-spawned`, `boss-phase-changed` e `boss-defeated`.
- Mas `boss-wave-started` nao tem listeners raw equivalentes em `EffectsSystem` nem `AudioSystem`.
- Antes, esse evento ainda gerava flash e cue sonora pelos fallbacks em `EnemySystem`.
- Depois do no-op, esse feedback parece ter desaparecido e so o `UISystem` continua reagindo.

Checklist de verificacao:

- Confirmar por busca que apenas `EnemySystem` e `UISystem` consomem `boss-wave-started`.
- Reproduzir o inicio de boss wave e checar se o cue visual/sonoro sumiu.
- Se corrigir: manter o fan-out removido para spawn/phase/defeat, mas tratar `boss-wave-started` por um canal explicito ou listener dedicado.

## Leads ja investigados e nao priorizados

### LP-01 - Boss sendo desenhado duas vezes

Nao tratar como bug sem nova evidencia.

Refs:

- `src/modules/RenderingSystem.js:902-903`
- `src/modules/RenderingSystem.js:956-1004`
- `src/modules/enemies/systems/EnemyRenderSystem.js:48-70`
- `src/modules/enemies/base/BaseEnemy.js:168-191`
- `src/modules/enemies/types/BossEnemy.js:1226-1234`

Motivo:

- O fluxo parecia desenhar boss duas vezes, mas a segunda passada chama `boss.onDraw(ctx)`, nao `boss.draw(ctx)`.
- Em boss componentizado, `onDraw()` retorna sem desenhar. Entao a suspeita inicial nao esta confirmada.

## Ordem sugerida de trabalho

1. Verificar HV-01 com leitura de fluxo e contagem de listeners.
2. Verificar HV-02 com inspeção do valor de HP antes/depois de `applyComponents()`.
3. Verificar HV-04 antes de qualquer ajuste em efeitos/audio/UI do boss.
4. Verificar HV-09 antes de considerar HV-07 encerrado.
5. Verificar HV-10 antes de considerar HV-04 encerrado.
6. Verificar HV-08 se houver relato de menu "andando" ou camera 3D instavel.
7. Verificar HV-05 e HV-06 se o foco da proxima IA for regressao visual ou determinismo.
8. Verificar HV-03 apenas se ainda houver tempo ou se aparecer uso real de registro por instancia.

## Saida esperada da proxima IA

1. Confirmado, descartado ou inconclusivo para cada item.
2. Evidencia curta por item.
3. Se confirmado, plano de correcao minimo e testes/regressoes necessarios.
