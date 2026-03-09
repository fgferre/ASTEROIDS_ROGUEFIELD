# HANDOFF — Auditoria de Menu / Tela de Abertura

**Data:** 2026-03-08
**Autores:** Opus 4.6 + Codex (auditoria cruzada independente com contraditório)
**Status:** Atualizado em 2026-03-09. S0, S1, S1.1, S1.2, F1, F2, F5, F7 arquivados. Itens com seguimento pendente: HV-05, F4 e F6. R1, F3, F9 e F10 implementados e revalidados. R2-R5 arquivados como hipoteses/contexto sem nova engenharia

---

## Status Atual

### Implementado desde este handoff

#### S0 — Warmup do 1º impacto concluído
- Já estava aplicado no preload em `src/modules/MenuBackgroundSystem.js`
- Continua válido como mitigação do caminho frio do primeiro impacto

#### S1 — Fase 1 concluída
- `src/app.js`
  - render 2D agora é controlado pela visibilidade real do `#game-ui`
  - `GamePools.update()` e `garbageCollectionManager.update()` só rodam em gameplay ativo
- `src/modules/MenuBackgroundSystem.js`
  - flag `hasProceduralAsteroids` cacheada; removido `.some()` per-frame
- `src/modules/ui/AAAHudLayout.js`
  - removido `@import` duplicado de fontes
- **Validação:** `npm run build` OK

#### S1.1 — Hotfix de regressão de gameover
- Durante a implementação da Fase 1 apareceu uma regressão: `screen-changed` para `gameover` era emitido pelo `GameSessionService`, mas a UI não reagia
- Correção aplicada em `src/modules/UISystem.js`
  - `UISystem` agora escuta `screen-changed`
  - `gameover` volta a abrir como overlay corretamente
- **Validação:** reprodução do fluxo de `player-died` + `npm run build` OK

#### S1.2 — Ajuste visual funcional do gameover
- O botão `Retry` estava parecendo desabilitado mesmo quando ativo
- A lógica funcional de retry **não** foi alterada
- Ajuste aplicado apenas em `src/style.css`
  - `Retry` ativo ganhou contraste próprio no `gameover`
  - aspecto esmaecido fica reservado ao estado `:disabled`
  - `Quit to Menu` recebeu contraste coerente com a hierarquia visual
- **Validação:** inspeção runtime confirmou `disabled: false` e `opacity: 1` para `Retry` ativo + `npm run build` OK

### Implementado em 2026-03-08

#### R1 — Bug de materiais compartilhados no fade (Fase 2)
- `startFadeOut()` agora clona o material compartilhado antes de aplicar fade
- `deactivateAsteroid()` restaura o material compartilhado e descarta o clone
- Teste: `tests/visual/material-fade-isolation.test.js` (3 testes)
- Evidencia: dois asteroides simultaneos, um fading e outro nao, mantem opacidades independentes

#### HV-06 — Thruster determinism
- Substituidos todos os `Math.random()` em `spawnThrusterVFX` por `this.randomFloat('thrusters')`
- Substituidos 3 `Math.random()` residuais em `createMuzzleFlash` por `this.randomFloat('muzzleFlash')`
- Zero chamadas a `Math.random()` restantes em `EffectsSystem.js`
- Teste: `tests/visual/thruster-determinism.test.js` (2 testes: reset+replay determinismo, no Math.random spy)

#### F3 — CustomFX pass desabilitado quando ocioso
- Pass `.enabled` agora segue `chromaticAberration !== 0 || grainAmount !== 0`
- Atualizado tanto na inicializacao quanto em `applyQualityLevel()`
- Como todas as quality levels tem `chromaticAberration: 0` e `grainAmount` default `0`, o pass fica desabilitado por padrao

#### F4 — Fisica do menu reduzida para 30Hz (sem medicao previa)
- `world.step(1/30, delta, 1)` substitui `world.step(1/60, delta, 3)`
- Menu decorativo nao necessita 60Hz com 3 substeps
- Teste: `tests/visual/menu-physics-stepping.test.js` (prende os parametros `1/30, delta, 1` em `animate()`)
- Benchmark local em Node com `cannon.min.js` vendorizado:
  - 18 corpos: `0.0643ms` -> `0.0329ms` medio por `world.step` (`-48.8%`)
  - 28 corpos: `0.0873ms` -> `0.0428ms` medio por `world.step` (`-51.0%`)
- **Nota:** a mudanca ja tem evidência local de CPU e teste de configuracao, mas o profiling/smoke visual em browser continua recomendado antes de tratar como custo totalmente encerrado

#### F9 — Pool de PointLights para explosoes
- 4 luzes pre-alocadas na inicializacao da cena
- `createExplosion()` reutiliza do pool; `updateExplosions()` devolve ao pool
- Elimina `new THREE.PointLight()` + `scene.add()/remove()` por explosao
- Teste: `tests/visual/explosion-light-pool.test.js` (4 testes: acquire, return, exhaustion fallback, clearAll)
- Benchmark local em Node para burst de 4 explosoes:
  - baseline `new PointLight + scene.add/remove`: `0.0687ms`
  - pool atual: `0.0031ms`
  - ganho medio: `-95.5%`

#### F10 — Temporarios reutilizaveis em fragmentAsteroid + AsteroidImpactEffect
- `MenuBackgroundSystem`: `_tmpVec3` e `_tmpCannonVec3` pre-alocados; `fragmentAsteroid()` reescrito sem `.clone()` por fragmento
- `AsteroidImpactEffect`: `_dummy` Object3D e `_tmpDirection` Vector3 pre-alocados na classe
  - `activateDebrisField()`: `new Object3D()` e `new Vector3()` per-call eliminados
  - `updateDebris()`: `new Object3D()` per-frame eliminado; `velocity.clone().multiplyScalar(delta)` substituido por `addScaledVector(velocity, delta)`
- Benchmark local em Node:
  - `fragmentAsteroid()` por lote de 200 chamadas: `0.2705ms` -> `0.2086ms` (`-22.9%`)
  - `activateDebrisField()`: `0.2044ms` -> `0.1501ms` (`-26.6%`)
  - `updateDebris()`: `0.1211ms` -> `0.1044ms` (`-13.7%`)

#### HV-05 — Deferido
- `Math.random()` na rotacao de nebulas e posicoes de dust permanece
- Justificativa: teste confiavel da montagem real da cena requer canvas/THREE completo; harness fragil
- Manter aberto para implementacao futura com cobertura adequada

#### F6 — Deferido (gate nao atingido)
- 20 services eager vs 5 lazy no manifesto atual
- Sem medicao de boot real para confirmar ganho >= 100ms
- Mapa de dependencias nao construido; risco de regressao alto
- Manter aberto para reavaliacao com profiling real

### Revalidacao em 2026-03-09

- `S0`: confirmado. `prepareInitialField()` continua rodando antes de `warmupFirstImpactPath()` em `src/modules/MenuBackgroundSystem.js`, e o warmup ainda renderiza o caminho completo do primeiro impacto.
- `S1`: confirmado. `src/app.js` ainda usa `shouldRenderGame` baseado na visibilidade real de `#game-ui`, e `GamePools.update()` / `garbageCollectionManager.update()` continuam guardados por `shouldUpdateGame`.
- `S1.1`: confirmado. `UISystem` ainda escuta `screen-changed` e trata `gameover` como overlay funcional.
- `S1.2`: confirmado. `src/style.css` ainda diferencia o `Retry` ativo do estado `:disabled` no bloco de `gameover`.
- `F1`: enderecado. O render 2D nao roda mais no menu enquanto `#game-ui` estiver oculto.
- `F2`: enderecado. `GamePools.update()` e `GC.update()` nao rodam mais no menu.
- `F3`: CORRIGIDO em 2026-03-08. `CustomFX.enabled` agora segue `chromaticAberration !== 0 || grainAmount !== 0`, desabilitando o pass quando ambos sao zero.
- `F4`: APLICADO em 2026-03-08 e revalidado em 2026-03-09. `world.step(1/30, delta, 1)` — 30Hz com max 1 catch-up step. Teste dedicado prende a configuracao e benchmark local mediu `-48.8%` a `-51.0%` de CPU por `world.step`; smoke visual em browser ainda e recomendado.
- `F5`: enderecado. `AAAHudLayout` nao injeta mais `@import` de fontes; o carregamento ficou centralizado em `src/index.html`.
- `F6`: segue em aberto e hoje esta ainda mais claro. O manifesto atual registra 26 services, dos quais 21 continuam `lazy: false`.
- `F7`: enderecado. O preload atual aquece o caminho frio do primeiro impacto apos preparar o campo inicial.
- `F8`: continua valido como limite conhecido. O warmup atual cobre flash/debris/dust/explosion light + render, mas nao aquece fragmentacao nem cascata entre fragmentos.
- `F9`: CORRIGIDO em 2026-03-08 e revalidado em 2026-03-09. 4 PointLights pre-alocados em pool; `createExplosion()` reutiliza do pool. Teste: `tests/visual/explosion-light-pool.test.js`. Benchmark local mediu `0.0687ms` -> `0.0031ms` por burst de 4 explosoes (`-95.5%`).
- `F10`: CORRIGIDO em 2026-03-09. `fragmentAsteroid()` + `AsteroidImpactEffect` (debris hot paths) reescritos com temporarios reutilizaveis. Cobre todos os hot spots identificados no plano; benchmark local mediu ganhos de `-22.9%`, `-26.6%` e `-13.7%` nos tres caminhos amostrados.
- `R1`: CORRIGIDO em 2026-03-08. `startFadeOut()` agora clona o material compartilhado; `deactivateAsteroid()` restaura e descarta o clone. Teste: `tests/visual/material-fade-isolation.test.js`.
- `R2`: permanece apenas contextual. O adaptive quality continua existindo, mas nada novo nesta revalidacao elevou a prioridade.
- `R3`: continua correto. Bloom segue ativo em `high`, SMAA continua ligado e apenas o `CustomFX` permanece como trabalho obviamente vazio no default atual.
- `R4`: permanece como hipotese forte, nao fato fechado. O warmup continua mitigando o caminho frio, mas nao prova causa unica para todo microtravamento residual.
- `R5`: permanece como hipotese media. A fragmentacao ainda cria corpos proximos e pode amplificar custo, mas a revalidacao atual nao fecha isso como causa confirmada.

## Contexto

Duas auditorias independentes do menu principal do Asteroid Roguefield foram conduzidas em paralelo (Opus 4.6 e Codex), seguidas de três rodadas de contraditório cruzado. O objetivo era identificar melhorias reais em eficiência, desempenho e custo de boot/render da tela de abertura, sem regressão e sem forçar mudanças desnecessárias.

**Conclusão compartilhada:** A direção de arte está boa. Não há necessidade de redesign. O trabalho é poda de custo invisível e desacoplamento.

---

## Achados Consolidados (pós-contraditório)

### FATOS CONFIRMADOS POR AMBOS

#### F1 — Render 2D roda a cada frame no menu em canvas invisível [PRIORIDADE 1]
- `renderGame()` em `src/app.js:603` é chamada incondicionalmente
- `RenderingSystem.render()` em `src/modules/RenderingSystem.js:824` não tem guarda de tela
- Pipeline completo: starfield parallax 3 camadas, service resolution (8 services), state manager transitions, screen shake, performance stats
- Canvas 2D (`#game-canvas`) está `display: none` durante o menu
- **Custo estimado:** ~2-5ms/frame de CPU desperdiçado
- **CORREÇÃO IMPORTANTE (Codex):** O guard **não pode** ser `shouldUpdateGame` porque pause e gameover mantêm gameplay visível por trás do overlay (`src/modules/UISystem.js:2279-2283`). O guard correto é por **tela/visibilidade** — render 2D só deve rodar quando o canvas está visível (screen === 'playing' ou overlays que mantêm gameplay visível como pause/gameover)

#### F2 — GamePools.update + GC.update rodam no menu gerenciando pools vazios
- `src/app.js:553-559` — sem guarda de tela
- GamePools.update() quase não faz nada quando não há TTL ativo (`src/core/GamePools.js:676`, `src/core/ObjectPool.js:468`)
- GC só verifica poucas tasks (`src/core/GarbageCollectionManager.js:101`)
- **Custo:** ~0.1-0.3ms/frame. Pequeno mas desnecessário
- **Achado adicional (Codex):** Há duplicação de auto-management de pools — loop em `src/core/GamePools.js:689` E no GC em `src/bootstrap/serviceManifest.js:146`

#### F3 — Pipeline 3D do menu usa 4 post-processing passes sempre ativos
- `src/modules/MenuBackgroundSystem.js:1003-1050`: RenderPass → UnrealBloomPass → CustomFX → SMAAPass
- **Nuance (Codex corrigiu Opus):** Menu começa em `high` (bloom=0.1), não em `low`. Bloom e SMAA contribuem para o visual. Mas CustomFX com chromatic=0 e grain=0 faz 3 texture samples/pixel para somar zero — este pass específico é trabalho vazio
- `applyQualityLevel()` só mexe em uniformes (`src/modules/MenuBackgroundSystem.js:3657`), nunca desliga passes
- SMAA roda em full-res × devicePixelRatio sempre

#### F4 — Física Cannon.js roda a cada frame do menu
- `src/modules/MenuBackgroundSystem.js:3775` — `world.step(1/60, delta, 3)` com até 3 substeps
- NaiveBroadphase O(n²) em `src/modules/MenuBackgroundSystem.js:848`
- **Nuance (Codex):** O problema maior é world.step() rodando todo frame, não a escolha do broadphase. Com 18-28 corpos o broadphase é secundário

#### F5 — Fontes duplicadas: @import no HUD + `<link>` no HTML [ACHADO CODEX]
- `src/modules/ui/AAAHudLayout.js:571` injeta `@import` das mesmas fontes já carregadas em `src/index.html:12-17`
- Duplicação real de request/parsing de CSS de fontes

#### F6 — Boot inicializa 26 services eagerly antes do primeiro clique
- 16+ services `lazy: false` em `src/bootstrap/serviceManifest.js` incluindo PhysicsSystem, CombatSystem, EnemySystem, PlayerSystem, WorldSystem
- Audio, enemy-spawn/damage/update/render são corretamente lazy
- **Ambos concordam:** alto upside potencial (~100-200ms), mas risco de regressão é ALTO. Requer mapa de dependências antes de qualquer ação

#### F7 — O preload do impacto não aquecia o 1º impacto real [ACHADO CODEX]
- `AsteroidImpactEffect.preload()` cria pools e chama `warmUpShaders()` (`src/modules/AsteroidImpactEffect.js:55-99`)
- `warmUpShaders()` só torna 1 flash/debris/dust visível por 1 `requestAnimationFrame` (`src/modules/AsteroidImpactEffect.js:233-260`)
- Isso **não** garantia um render representativo com asteroides lit do menu já ativos; na ordem original do preload o campo inicial ainda nem estava preparado
- Resultado provável: o primeiro impacto real ainda pagava trabalho atrasado de GPU/shader mesmo com “preload completo”

#### F8 — O warmup atual cobre o grosso do caminho frio do 1º impacto, mas não cobre fragmentação/cascata [VALIDADO]
- O warmup implementado em `src/modules/MenuBackgroundSystem.js:3588-3649` cobre:
  - `createExplosion()` (mudança de light count)
  - `impactEffect.trigger()` (flash + debris + dust)
  - 2 renders reais via `composer.render()` / `renderer.render()`
- O warmup **não** cobre:
  - `fragmentAsteroid()` em `src/modules/MenuBackgroundSystem.js:3519-3570`
  - eventual cascata de colisões entre fragmentos recém-criados
  - alocações JS recorrentes no hot path de debris/fragmentação
- Conclusão prática: o warmup deve atacar a maior parte do custo frio inicial; o que sobra tende a ser custo JS/cascata e não o primeiro grande salto de GPU

#### F9 — `createExplosion()` usa `PointLight` transitória fora de pool [VALIDADO]
- `src/modules/MenuBackgroundSystem.js:3573-3585` faz `new THREE.PointLight()` a cada explosão
- Isso contrasta com o `flashPool` do `AsteroidImpactEffect`, que já pré-aloca `PointLight`s em `src/modules/AsteroidImpactEffect.js:129-153`
- Se ainda existir microstutter residual depois do warmup, este é um alvo estrutural concreto
- **Nuance:** pooling dessas luzes ajuda a remover alocação e `scene.add/remove`, mas **não** garante sozinho light count estável; se o número de luzes visíveis variar, o renderer ainda pode precisar de variantes diferentes de shader

#### F10 — Ainda há alocações evitáveis no hot path de fragmentação e debris [VALIDADO]
- `fragmentAsteroid()` aloca por fragmento:
  - `new THREE.Vector3(...)` em `src/modules/MenuBackgroundSystem.js:3534`
  - `new CANNON.Vec3(...)` em `src/modules/MenuBackgroundSystem.js:3544`, `3551`, `3557`
  - múltiplos `.clone()` em `src/modules/MenuBackgroundSystem.js:3526`, `3540`, `3542`
- `activateDebrisField()` aloca por impacto:
  - `new THREE.Object3D()` em `src/modules/AsteroidImpactEffect.js:333`
  - `new THREE.Vector3()` por partícula em `src/modules/AsteroidImpactEffect.js:346`
- `updateDebris()` também aloca de forma recorrente:
  - `new THREE.Object3D()` por frame em `src/modules/AsteroidImpactEffect.js:509`
  - `particle.velocity.clone()` por partícula/frame em `src/modules/AsteroidImpactEffect.js:520`
- Isso parece custo secundário frente ao caminho frio de GPU, mas é candidato claro para reduzir pressão de GC se restar stutter

### RECLASSIFICAÇÕES DO CONTRADITÓRIO

#### R1 — `material.needsUpdate = true` durante fades → SUSPEITA DE BUG, não micro-opt
- `src/modules/MenuBackgroundSystem.js:3805`
- **Insight (Codex):** Materiais são compartilhados via `baseMaterials[]` (`src/modules/MenuBackgroundSystem.js:924, 3393, 3396`). Fade por opacity sem clone pode contaminar instâncias que não estão em fade
- Material procedural base nasce sem `transparent: true` (`src/modules/MenuBackgroundSystem.js:2620`)
- **Reclassificado por ambos:** investigar como potencial bug visual antes de tratar como otimização

#### R2 — Adaptive quality empurrando para ultra → P3, não P2
- Opus questionou, Codex aceitou rebaixar. Sem evidência de throttling térmico. Impacto real depende de laptop vs desktop

#### R3 — "4 passes inúteis" → exagerado
- Opus corrigiu: bloom ativo em high/ultra, SMAA contribui. Apenas CustomFX é trabalho vazio quando parâmetros=0

#### R4 — A causa exata do microtravamento do 1º impacto ainda é hipótese forte, não fato fechado
- A cadeia causal mais provável continua sendo:
  - `createExplosion()` instancia `PointLight` novo em `src/modules/MenuBackgroundSystem.js:3573`
  - `impactEffect.trigger()` ativa outro `PointLight` do pool via flash e popula debris/dust reais em `src/modules/AsteroidImpactEffect.js:266-281`
  - `activateDebrisField()` faz `instanceMatrix.needsUpdate` em `src/modules/AsteroidImpactEffect.js:319-380`
  - `activateDustCloud()` faz `BufferAttribute.needsUpdate` em `src/modules/AsteroidImpactEffect.js:390-446`
- Isso explica bem o sintoma reportado, mas sem profiling GPU/CPU no momento do 1º impacto não fecha causalidade com 100% de certeza
- **Consenso atualizado:** tratar como hipótese forte bem fundamentada; a mitigação implementada continua válida mesmo sem prova final da causa única

#### R5 — Cascata de colisões entre fragmentos é hipótese média, não fato
- Cada asteroid pooled recebe listener de colisão em `src/modules/MenuBackgroundSystem.js:3271-3273`
- `maxFragmentationLevel = 2` em `src/modules/MenuBackgroundSystem.js:116` limita profundidade, mas não elimina a possibilidade de múltiplas colisões logo após a fragmentação
- `fragmentAsteroid()` cria 2-4 corpos próximos entre si em `src/modules/MenuBackgroundSystem.js:3522-3568`
- Sem captura de runtime, isso fica como hipótese de amplificação de custo, não como causa confirmada

---

## Plano de Execução Consolidado (Opus + Codex convergidos)

### Fase 0 — Já implementado por Codex
| # | Ação | Arquivo | Status |
|---|------|---------|--------|
| 0 | Aquecer o caminho completo do 1º impacto durante o preload, **depois** de `prepareInitialField()`, forçando render com flash + explosion light + debris + dust e limpando o estado em seguida | `src/modules/MenuBackgroundSystem.js:966-967, 3588-3649` | Implementado + build OK |

**Objetivo da fase 0:** remover ou reduzir fortemente os microtravamentos do primeiro impacto do menu sem mexer ainda no visual final do efeito.

**Observação de revisão (Opus):** vale confirmar visualmente que o warmup não deixa camera shake residual no primeiro frame visível do menu. O cleanup atual já zera `cameraShakeState`, então não há evidência de correção adicional necessária neste momento.

**Cobertura esperada da fase 0:** aquecer o bulk do custo frio de GPU/shader do primeiro impacto. Se ainda restar microstutter, os suspeitos seguintes passam a ser `PointLight` sem pool, cascata de fragmentos e alocação recorrente de temporários.

### Fase 1 — Quick wins sem risco [CONCLUÍDA]
| # | Ação | Arquivo | Status |
|---|------|---------|--------|
| 1 | Guard render 2D **por tela visível** (não `shouldUpdateGame`). Render quando: playing, pause, gameover. Não render quando: menu, levelup sem gameplay atrás | `src/app.js` | Implementado |
| 2 | Guard `GamePools.update()` + `GC.update()` fora de gameplay | `src/app.js` | Implementado |
| 3 | Cachear flag `hasProceduralAsteroids` no setup, eliminar `.some()` per-frame | `src/modules/MenuBackgroundSystem.js` | Implementado |
| 4 | Remover `@import` de fontes duplicadas no HUD | `src/modules/ui/AAAHudLayout.js` | Implementado |
| 5 | Corrigir regressão de `gameover` causada pela ausência de reação da UI a `screen-changed` | `src/modules/UISystem.js` | Implementado |
| 6 | Restaurar contraste funcional do `Retry` no `gameover`, mantendo o aspecto esmaecido apenas quando `disabled` | `src/style.css` | Implementado |

**Teste fase 1 concluído:** build OK; fluxo de `gameover` revalidado; ajuste visual do `Retry` validado em runtime

### Fase 2 — Investigação de bug
| # | Ação | Arquivo | Risco |
|---|------|---------|-------|
| 6 | Investigar materiais compartilhados + fade por opacity. Verificar se fadeout contamina instâncias. Se sim, clonar material ao iniciar fade | `src/modules/MenuBackgroundSystem.js:3804-3805, 924, 3393` | Médio |
| 7 | Verificar se material nasce com `transparent: true` ou se precisa ser setado antes do fade | `src/modules/MenuBackgroundSystem.js:2620` | Médio |

**Teste fase 2:** Observar visualmente fadeout de asteroids. Verificar que asteroids não-fading mantêm opacidade 1.0

### Fase 3 — Medição antes de ação
| # | Ação | O que medir |
|---|------|-------------|
| 8 | Medir custo real do render 2D durante menu | `performance.now()` antes/depois de `renderGame()` |
| 9 | Medir overhead do composer vs render direto | `performance.now()` antes/depois de `composer.render()` vs `renderer.render()` |
| 10 | Verificar se vale cortar `effects.update()` fora de gameplay | Confirmar custo real e ausência de dependência em cleanup/transições quando `delta=0` |
| 11 | Medir boot time por service tier | Instrumentar `bootstrapServices()` com timing |
| 12 | Profile GPU em hardware integrado | Chrome DevTools > Performance |

### Fase 4 — Só se medição confirmar ganho
| # | Ação | Condição | Risco |
|---|------|----------|-------|
| 13 | Bypass CustomFX pass quando chromatic=0 e grain=0 | Se medição mostrar >1ms de ganho | Médio |
| 14 | Desligar SMAA no nível adaptive "low" | Se medição em GPU integrada mostrar >2ms | Médio |
| 15 | Investigar lazy-load de services de gameplay | Só após mapa completo de dependências | Alto |
| 16 | Remover duplicação de auto-management de pools | Após confirmar que GC e GamePools fazem o mesmo trabalho | Baixo |
| 17 | Remover churn de `PointLight` em `createExplosion()` (pool, budget fixo ou alternativa sem mudar light count) | Se ainda houver stutter residual após a fase 0 | Médio |
| 18 | Reutilizar temporários em `fragmentAsteroid()` e `AsteroidImpactEffect` | Se profiling mostrar pressão de GC no impacto/debris | Baixo |
| 19 | Mitigar colisão em cascata entre fragmentos recém-criados | Só se profiling/runtime confirmar explosões em cadeia | Médio |

---

## O que NÃO VALE MEXER (consenso)

- Redesign da arquitetura de boot (DI + manifest é sólido)
- Substituir Three.js por canvas 2D no menu (visual é intencional)
- Lazy-load de Three.js (necessário antes do primeiro frame)
- Otimizar EventBus (<0.1ms/emit)
- Pool pre-allocation (168 objetos, ~5ms, previne jank no primeiro frame de jogo)
- Direção de arte do menu (está boa)

---

## Arquivos Críticos

| Arquivo | Papel | Linhas-chave |
|---------|-------|-------------|
| `src/app.js` | Game loop, boot, guards | 553-559, 563-565, 603, 479-630 |
| `src/modules/RenderingSystem.js` | Render 2D pipeline | 824-874 |
| `src/modules/MenuBackgroundSystem.js` | Three.js menu background, physics, post-processing, adaptive quality, fades | 119-140, 820-857, 1003-1050, 3753-3910, 3805 |
| `src/modules/AsteroidImpactEffect.js` | Preload, flash/debris/dust, warmup incompleto original, alocações recorrentes em debris | 55-99, 233-260, 266-446, 507-533 |
| `src/modules/UISystem.js` | Screen management, HUD mount | 2270-2331, 2279-2283 |
| `src/modules/ui/AAAHudLayout.js` | HUD layout, fontes duplicadas | 571 |
| `src/bootstrap/serviceManifest.js` | Service registration, lazy/eager | 400, 645, 673, 146 |
| `src/core/GamePools.js` | Pool update, auto-management duplicado | 676, 689 |
| `src/core/GarbageCollectionManager.js` | GC update | 101 |
| `src/index.html` | Scripts, fontes, DOM structure | 12-17, 285-298 |

---

## Divergências Resolvidas

| Tema | Opus original | Codex original | Resolução |
|------|--------------|----------------|-----------|
| Guard do render 2D | `shouldUpdateGame` | Por tela/visibilidade | **Codex correto** — pause/gameover precisam de render |
| "4 passes inúteis" | Todos zerados | Menu começa em high, bloom ativo | **Codex correto** — só CustomFX é trabalho vazio |
| `needsUpdate` | Quick win micro-opt | Bug visual por materiais compartilhados | **Codex correto** — investigar como bug primeiro |
| Lazy-load prioridade | Só com medição | Item 2 da lista | **Convergência** — Codex aceitou reclassificar para "medir + mapear" |
| Adaptive→ultra | P2 | Rebaixado para P3 | **Convergência** — sem evidência de throttling |
| GamePools/GC no menu | Top 5 quick win | Impacto pequeno | **Convergência** — vale podar, não é prioridade |
