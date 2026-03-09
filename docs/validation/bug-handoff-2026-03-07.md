# Handoff Consolidado de Validacao

Data: 2026-03-07

Objetivo: reduzir custo de contexto para a proxima IA. A partir de 2026-03-09, este e o documento canonico de handoff/validacao do repositorio. O arquivo `tasks/HANDOFF_menu-audit.md` fica arquivado apenas como historico complementar.

## Documento Canonico

- Fonte unica atual para backlog, status e proximos passos: este arquivo.
- `tasks/HANDOFF_menu-audit.md` nao deve mais ser tratado como fonte viva; ele permanece no repo so como historico de auditoria do menu.
- Se uma IA abrir `tasks/HANDOFF_menu-audit.md`, ela deve usa-lo apenas como redirecionador e voltar imediatamente para este arquivo.
- Itens ainda realmente abertos no runtime atual:
  - `HV-05` — determinismo incompleto na montagem da cena do menu
  - `F4` — cadencia 30Hz aplicada e testada, mas ainda recomendada validacao visual/runtime em browser
  - `F6` — lazy-load/boot continua deferido por gate de profiling e mapa de dependencias

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

## Revalidacao em 2026-03-09

- `HV-01`: enderecado. `BaseSystem` ainda chama `setupEventListeners()` no `super()`, mas `EnemySystem` limpa os handlers herdados com `removeAllEventListeners()` antes de re-registrar; `CombatSystem`, `PlayerSystem` e `WorldSystem` nao duplicam listeners no construtor.
- `HV-02`: enderecado. `HealthComponent.initialize()` agora respeita `enemy.healthInitialized`; harness local via `EnemySystem.factory.create('boss', { wave: 4 })` manteve `2592/2592` apos `applyComponents()`.
- `HV-03`: hipotese original descartada no runtime atual. `DIContainer.register()` agora rejeita valores nao-funcao, nao ha call sites de `register(name, instance)` e `has()/getServiceNames()` seguem coerentes com a API atual. Nota separada: a mensagem de erro ainda cita um `registerInstance()` que nao existe.
- `HV-04`: enderecado. `EnemySystem.forwardBossEvent()` virou no-op e a busca atual nao encontrou emissores de `effects-boss-*`, `ui-boss-*` ou `audio-boss-*`; `EffectsSystem`, `UISystem` e `AudioSystem` consomem apenas o evento raw.
- `HV-05`: confirmado em aberto. `MenuBackgroundSystem` ainda usa `Math.random()` na rotacao inicial das nebulas e nas posicoes da poeira espacial.
- `HV-06`: corrigido. `spawnThrusterVFX` usa `this.randomFloat('thrusters')`, `createMuzzleFlash` nao depende mais de `Math.random()`, e o teste dedicado esta em `tests/visual/thruster-determinism.test.js`.
- `HV-07`: enderecado. `ScreenShake.add()` agora preserva apenas o decay mais rapido quando ja existe trauma; simulacao local nao reproduziu mais o prolongamento indevido de shake forte por hit fraco.
- `HV-08`: enderecado. `AsteroidImpactEffect.updateCameraShake()` remove o offset do frame anterior antes de aplicar o novo; simulacao local retornou a camera exatamente para a posicao base ao fim do shake.
- `HV-09`: enderecado. O primeiro shake agora usa o decay pedido quando nao havia trauma ativo; simulacao local com `add(1, 1)` + `update(0.5)` resultou em `trauma = 0.5`, como esperado.
- `HV-10`: enderecado. `forwardBossEvent()` ficou em no-op para evitar duplicacao, mas `EnemySystem.handleBossWaveStarted()` aplica diretamente o flash e o cue sonoro que faltariam nesse evento.
- `HV-11`: continua corretamente marcado como confirmado e corrigido; os testes de regressao seguem presentes em `tests/visual/rendering-determinism.test.js`.
- `LP-01`: permanece descartado. O fluxo ainda chama `boss.onDraw(ctx)` na segunda passada e `BossEnemy.onDraw()` continua sem desenhar quando o boss usa componentes.
- `R1`: corrigido. `startFadeOut()` clona o material compartilhado, `deactivateAsteroid()` restaura o material base, e a regressao esta coberta por `tests/visual/material-fade-isolation.test.js`.
- `F3`: corrigido. `CustomFX.enabled` agora desliga o pass quando `chromaticAberration` e `grainAmount` sao zero.
- `F4`: aplicado com evidencia local. `world.step(1/30, delta, 1)` esta preso por teste em `tests/visual/menu-physics-stepping.test.js`; microbenchmark local com `cannon.min.js` vendorizado mediu reducao media de `48.8%` (18 corpos) a `51.0%` (28 corpos) no custo de `world.step`. Ainda vale smoke visual em browser.
- `F6`: segue em aberto/deferido. O ganho de boot ainda nao foi medido com profiling real e nao existe mapa de dependencias para lazy-load seguro.
- `F9`: corrigido. Pool de `PointLight` para explosoes coberto por `tests/visual/explosion-light-pool.test.js`; microbenchmark local mediu `0.0687ms -> 0.0031ms` por burst de 4 explosoes (`-95.5%`).
- `F10`: corrigido. `fragmentAsteroid()` e hot paths de debris em `AsteroidImpactEffect` foram reescritos com temporarios reutilizaveis; microbenchmark local mediu ganhos de `-22.9%`, `-26.6%` e `-13.7%` nos caminhos amostrados.

## Itens Arquivados (enderecados/descartados — sem nova engenharia)

### HV-01 - Listeners duplicados em subclasses de BaseSystem

Status: ARQUIVADO — enderecado no runtime atual
Prioridade: encerrado

Abrir primeiro:

- `src/core/BaseSystem.js:100-102`
- `src/modules/EnemySystem.js:174-188`
- `src/modules/EnemySystem.js:251-303`
- `src/modules/EnemySystem.js:3871-3890`
- `src/modules/CombatSystem.js:132-170`
- `src/modules/PlayerSystem.js:143-144`
- `src/modules/PlayerSystem.js:293-390`
- `src/modules/WorldSystem.js:12-25`

Resultado da revalidacao em 2026-03-09:

- `BaseSystem` continua chamando `setupEventListeners()` no construtor (`src/core/BaseSystem.js:100-102`).
- Na busca atual, a unica subclasse de `BaseSystem` que ainda chama `this.setupEventListeners()` manualmente no construtor e `EnemySystem`.
- Em `EnemySystem`, a segunda chamada nao acumula listeners: o construtor limpa os handlers herdados com `this.removeAllEventListeners()` e so depois re-registra (`src/modules/EnemySystem.js:188-193`).
- `CombatSystem`, `PlayerSystem` e `WorldSystem` seguem estendendo `BaseSystem`, mas nao fazem segunda chamada no construtor, entao nao entram mais neste risco.
- `InputSystem` e `SettingsSystem` ainda chamam `setupEventListeners()` manualmente, mas nao estendem `BaseSystem`; logo, continuam fora do escopo deste item.
- Harness local com `EventBus` + `EnemySystem` confirmou 1 listener registrado para cada evento critico amostrado: `enemy-fired`, `player-hit-by-projectile`, `wave-complete`, `boss-spawned`, `boss-phase-changed` e `boss-defeated`.

Conclusao:

- O handoff capturava um risco valido de um estado anterior, mas o runtime atual ja o endereca.
- Nao abrir correcao para HV-01 sem nova evidencia de duplicacao fora do fluxo atual de `EnemySystem`.

### HV-02 - HP do boss e sobrescrito apos a inicializacao

Status: ARQUIVADO — enderecado no runtime atual
Prioridade: encerrado

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

Status: ARQUIVADO — hipotese original descartada no runtime atual
Prioridade: encerrado

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

Status: ARQUIVADO — duplicacao principal enderecada
Prioridade: encerrado

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

## Itens Ativos

### HV-05 - MenuBackgroundSystem ainda usa Math.random() na montagem da cena

Status: ATIVO — confirmado no runtime atual
Prioridade: media (condicionado a cobertura real da montagem da cena)

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

### F4 - Cadencia da fisica do menu reduzida para 30Hz exige apenas validacao runtime final

Status: ATIVO — implementado com evidencia local; smoke visual/runtime ainda recomendado
Prioridade: baixa

Abrir primeiro:

- `src/modules/MenuBackgroundSystem.js:3912-3913`
- `tests/visual/menu-physics-stepping.test.js`

Estado atual:

- `world.step(1/30, delta, 1)` substituiu `world.step(1/60, delta, 3)`.
- O teste dedicado prende a configuracao nova em `animate()`.
- Microbenchmark local com `cannon.min.js` vendorizado mediu reducao media de `48.8%` (18 corpos) a `51.0%` (28 corpos) no custo de `world.step`.
- O que ainda falta e so validacao visual/runtime em browser para confirmar ausencia de regressao perceptivel no menu.

Checklist de fechamento:

- Observar o menu por alguns segundos e confirmar que a cadencia visual das colisoes/fragmentacoes continua aceitavel.
- Disparar alguns impactos no menu e confirmar ausencia de regressao visual obvia.
- Se tudo permanecer estavel, reclassificar `F4` como arquivado/encerrado neste mesmo documento.

### F6 - Boot/lazy-load continua deferido por gate

Status: ATIVO — deferido ate profiling e mapa de dependencias
Prioridade: media

Abrir primeiro:

- `src/bootstrap/serviceManifest.js`
- `src/app.js`

Estado atual:

- O manifesto ainda registra 26 services, dos quais 21 permanecem `lazy: false`.
- Ainda nao existe medicao de boot real confirmando ganho >= `100ms`.
- Ainda nao existe mapa de dependencias suficiente para mover services de gameplay para lazy-load sem risco.

Checklist de fechamento:

- Medir boot real antes/depois, com numero claro.
- Construir mapa de dependencias para separar `menu-critical` de `gameplay-only`.
- So depois disso decidir se `F6` entra em implementacao ou continua arquivado como deferido.

## Itens Arquivados (continuacao)

### HV-06 - Particulas de thruster burlam o RNG deterministico

Status: CORRIGIDO em 2026-03-08
Prioridade: encerrado

Resolucao:
- Todos os `Math.random()` em `spawnThrusterVFX` substituidos por `this.randomFloat('thrusters')`
- 3 `Math.random()` residuais em `createMuzzleFlash` substituidos por `this.randomFloat('muzzleFlash')`
- Zero chamadas a `Math.random()` restantes em `src/modules/EffectsSystem.js`
- Teste: `tests/visual/thruster-determinism.test.js`

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

Status: ARQUIVADO — enderecado no runtime atual
Prioridade: encerrado

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

Status: ARQUIVADO — enderecado no runtime atual
Prioridade: encerrado

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

Status: ARQUIVADO — enderecado no runtime atual
Prioridade: encerrado

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

Status: ARQUIVADO — enderecado no runtime atual
Prioridade: encerrado

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

### HV-11 - Screen shake desloca o frame inteiro antes do background e dos overlays full-screen

Status: ARQUIVADO — confirmado e corrigido em 2026-03-08
Prioridade: encerrado

Abrir primeiro:

- `src/modules/RenderingSystem.js:843-859`
- `src/modules/RenderingSystem.js:876-928`
- `src/modules/EffectsSystem.js:1084-1088`
- `src/modules/EffectsSystem.js:1124-1136`
- `src/modules/EffectsSystem.js:2021-2074`
- `src/utils/ScreenShake.js:239-248`

Hipotese:

- `RenderingSystem.render()` aplica `effects.applyScreenShake(ctx)` logo no inicio do frame.
- Esse translate/rotate afeta nao so objetos do mundo, mas tambem o pass de background e os overlays full-screen desenhados depois.
- Como o jogo usa o proprio background para "limpar" o canvas, desenhar o background com shake pode deixar areas da viewport sem repintura completa naquele frame.
- Em momentos com explosoes/flashes fortes, essas areas podem preservar lixo do frame anterior e gerar slices/faixas ou flashes deslocados, parecidos com a captura enviada pelo usuario.

Impacto plausivel:

- artefatos em faixas ou bordas quando ha shake forte
- flashes de tela e boss transitions nao cobrindo a viewport toda
- smear/stale pixels em transicoes intensas de combate
- player/nave podendo "sumir" parcialmente ao encostar na faixa onde o frame renderizado foi deslocado, porque o desenho continua sendo clipado pelos limites reais do bitmap do canvas

Evidencia visual adicional:

- O usuario relatou que "parece que o canvas inteiro se desloca em relacao ao frame HTML".
- Em captura posterior, a nave comeca a desaparecer exatamente na fronteira onde o conteudo do jogo entra na area artefatada.
- Isso e compativel com `ctx.translate(...)` aplicado ao frame inteiro: HUD/HTML ficam parados, mas o mundo renderizado escorrega e e cortado nas bordas fisicas do canvas.

Checklist de verificacao:

- Reproduzir com shake forte e comparar um frame com shake ativo vs shake desativado.
- Confirmar se `drawBackground()` e `fillRect(0, 0, width, height)` em `EffectsSystem` estao sendo executados sob transform nao-identidade.
- Se confirmar: aplicar shake apenas ao world pass, ou resetar transform antes de background/overlays full-screen e reaplicar somente onde fizer sentido.

Resultado da revalidacao em 2026-03-08:

- Confirmado por leitura de fluxo e harness local: background e overlays full-screen eram desenhados sob a mesma transform aplicada por `applyScreenShake(ctx)`.
- Correcao aplicada em `src/modules/RenderingSystem.js:824` e `src/modules/RenderingSystem.js:1071`: `render()` ficou protegido por `try/finally` e `drawBackground()` passou a desenhar em transform identidade.
- Correcao aplicada em `src/modules/EffectsSystem.js:1088`, `src/modules/EffectsSystem.js:1124` e `src/modules/EffectsSystem.js:1144`: o `EffectsSystem` separa world pass de overlays screen-space, com reset de transform para flash/transicoes/indicadores full-screen.
- Hardening adicional: corrigido desequilibrio de `save/restore` no starfield e removidos resets redundantes de transform nas particulas.
- Testes de regressao adicionados em `tests/visual/rendering-determinism.test.js:54`, `tests/visual/rendering-determinism.test.js:135` e `tests/visual/rendering-determinism.test.js:151`.
- Hipoteses alternativas rechecadas e sem evidencia no runtime atual: `clearRect()` no canvas principal apos shake, `style.transform` no canvas e `clip()` no pipeline 2D.

## Leads ja investigados e nao priorizados

### LP-01 - Boss sendo desenhado duas vezes

Status: ARQUIVADO — descartado, sem nova evidencia.

Refs:

- `src/modules/RenderingSystem.js:902-903`
- `src/modules/RenderingSystem.js:956-1004`
- `src/modules/enemies/systems/EnemyRenderSystem.js:48-70`
- `src/modules/enemies/base/BaseEnemy.js:168-191`
- `src/modules/enemies/types/BossEnemy.js:1226-1234`

Motivo:

- O fluxo parecia desenhar boss duas vezes, mas a segunda passada chama `boss.onDraw(ctx)`, nao `boss.draw(ctx)`.
- Em boss componentizado, `onDraw()` retorna sem desenhar. Entao a suspeita inicial nao esta confirmada.

## Ordem de trabalho (atualizada 2026-03-09)

1. HV-05: condicionado — so implementar com cobertura real da montagem da cena do menu.
2. F4: fazer apenas smoke visual/runtime final do menu; sem nova engenharia, salvo se o smoke revelar regressao.
3. F6: so iniciar se houver profiling de boot e mapa de dependencias; caso contrario, manter deferido.
4. Todos os demais itens estao arquivados e nao devem ser reabertos sem nova evidencia.

## Saida esperada da proxima IA

1. Confirmado, descartado ou inconclusivo para cada item.
2. Evidencia curta por item.
3. Se confirmado, plano de correcao minimo e testes/regressoes necessarios.
