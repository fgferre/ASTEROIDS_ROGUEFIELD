# WAVE-007: Checklist de Validação Final da Integração do WaveManager

## Objetivo
Validar que a integração completa do WaveManager (WAVE-001 a WAVE-006) funciona corretamente com todas as feature flags ativadas, preservando métricas baseline e introduzindo novos inimigos sem regressões.

## Pré-requisitos
- Todas as fases WAVE-001 a WAVE-006 concluídas e documentadas
- Código commitado e versionado (registrar commit SHA)
- Ambiente de teste limpo (sem modificações locais)

## Fase 1: Preparação do Ambiente

### 1.1 Ativar Feature Flags
- [x] (Histórico) Flags `USE_WAVE_MANAGER` e `WAVEMANAGER_HANDLES_ASTEROID_SPAWN` removidas em 18/10/2025 — WaveManager ativo por padrão
- [ ] Verificar `PRESERVE_LEGACY_SIZE_DISTRIBUTION` conforme cenário desejado
- [ ] Verificar `PRESERVE_LEGACY_POSITIONING` conforme cenário desejado

### 1.2 Verificar Dependências
- [ ] Executar `npm install` para garantir dependências atualizadas
- [ ] Verificar versão do Node.js: `node --version` (registrar)
- [ ] Verificar versão do navegador para testes manuais (registrar)

### 1.3 Backup de Segurança
- [ ] Criar branch de teste: `git checkout -b wave-007-validation`
- [x] (Histórico) Commit específico para ativação de flags não é mais necessário — utilizar commits normais de validação
- [ ] Registrar commit SHA para rastreabilidade

## Fase 2: Validação Automatizada

### 2.1 Testes de Baseline (Crítico)
- [ ] Executar: `npm run test:baseline`
- [ ] **Critério de Sucesso:** Todos os testes devem passar (0 failures)
- [ ] Registrar output completo em `docs/validation/wave-007-test-output.txt`
- [ ] Verificar especificamente:
  - [ ] Wave spawn rate (waves 1-10) corresponde à fórmula
  - [ ] Size distribution 50/30/20 preservada
  - [ ] Variant distribution com wave scaling correto
  - [ ] Fragmentation rules respeitadas
  - [ ] Determinismo mantido (seeds idênticos → sequências idênticas)
  - [ ] Feature flag tests passando (linhas 827-919)

### 2.2 Suite Completa de Testes
- [ ] Executar: `npm test`
- [ ] **Critério de Sucesso:** Todos os testes passam
- [ ] Registrar número de testes executados e tempo total
- [ ] Verificar ausência de warnings ou deprecations
- [ ] Anotar qualquer teste skipped ou pending

### 2.3 Testes de Renderização
- [ ] Executar: `npm test -- --run src/__tests__/rendering/enemy-types-rendering.test.js`
- [ ] Validar que Drone, Mine, Hunter têm payloads corretos
- [ ] Verificar canvas state preservation
- [ ] Confirmar que onDraw() não lança exceções

### 2.4 Análise de Resultados Automatizados
- [ ] **Se todos os testes passaram:** Prosseguir para Fase 3
- [ ] **Se algum teste falhou:** 
  - [ ] Registrar falhas em `docs/validation/wave-007-test-failures.md`
  - [ ] Classificar como bloqueador ou não-bloqueador
  - [ ] Se bloqueador: PARAR validação, corrigir, re-executar Fase 2
  - [ ] Se não-bloqueador: Documentar e prosseguir com cautela

## Fase 3: Validação Manual In-Game

### 3.1 Iniciar Servidor de Desenvolvimento
- [ ] Executar: `npm run dev`
- [ ] Abrir navegador em `http://localhost:5173`
- [ ] Abrir DevTools (F12) e manter Console visível
- [ ] Verificar ausência de erros no carregamento inicial

### 3.2 Validação de Spawn de Asteroides (Waves 1-3)
- [ ] Iniciar jogo e observar wave 1
- [ ] **Verificar:**
  - [ ] 4 asteroides spawnam (conforme baseline)
  - [ ] Asteroides aparecem nas 4 bordas (top/right/bottom/left)
  - [ ] Distribuição visual de tamanhos parece 50/30/20
  - [ ] Variantes aparecem (iron, gold, volatile, etc.)
  - [ ] Fragmentação funciona ao destruir asteroides
  - [ ] XP orbs dropam corretamente
  - [ ] Contador de inimigos na HUD está correto
- [ ] Completar wave 1 e observar countdown de 10 segundos
- [ ] Repetir para waves 2 e 3
- [ ] **Logs esperados no console:**
  - `[EnemySystem] Wave system: WaveManager`
  - `[WaveManager] Starting wave X`
  - `[WaveManager] Registered enemy: type=asteroid, wave=X`
  - `[WaveManager] Enemy destroyed: Y/Z`
  - `[WaveManager] Wave X complete in Ys`

### 3.3 Validação de Boss Wave (Wave 5)
- [ ] Jogar até wave 5 (primeira boss wave)
- [ ] **Verificar:**
  - [ ] Boss spawna corretamente (nave grande, visual distinto)
  - [ ] Boss HUD aparece (barra de vida, indicador de fase)
  - [ ] Boss ataca com padrões distintos
  - [ ] Boss muda de fase ao perder HP (33%, 66%)
  - [ ] Efeitos visuais de transição de fase funcionam
  - [ ] Áudio de boss funciona (roar, phase change)
  - [ ] Inimigos de suporte spawnam (drones/hunters)
  - [ ] Boss dropa 10 XP orbs ao ser derrotado
  - [ ] Boss pode dropar health heart (25% chance)
- [ ] **Logs esperados:**
  - `[WaveManager] Boss wave detected: wave 5`
  - `[EnemySystem] Boss spawned: ...`
  - `[EnemySystem] Boss phase changed: ...`
  - `[EnemySystem] Boss defeated: ...`

### 3.4 Validação de Novos Inimigos (Waves 6-10)
- [ ] Continuar jogando até wave 10
- [ ] **Drone (spawna a partir de wave 8):**
  - [ ] Renderiza como nave triangular com exhaust glow
  - [ ] Move-se corretamente (persegue player)
  - [ ] Dropa 2 XP orbs ao ser destruído
  - [ ] NÃO dropa health hearts
  - [ ] Colisões funcionam (player ↔ drone, bullet ↔ drone)
- [ ] **Mine (spawna a partir de wave 6):**
  - [ ] Renderiza como esfera pulsante
  - [ ] Pulsa corretamente (sin wave)
  - [ ] Explode ao ser atingida ou ao tocar player
  - [ ] Dropa 1-2 XP orbs (randomizado)
  - [ ] NÃO dropa health hearts
- [ ] **Hunter (spawna a partir de wave 9):**
  - [ ] Renderiza como diamante com turret rotacionável
  - [ ] Turret rotaciona independentemente do hull
  - [ ] Ataca com projéteis direcionados
  - [ ] Dropa 3 XP orbs ao ser destruído
  - [ ] Pode dropar health heart (3% chance)

### 3.5 Validação de Reward System
- [ ] Destruir pelo menos 10 de cada tipo de inimigo
- [ ] **Registrar na tabela:**

| Tipo | Inimigos Destruídos | Orbs Dropados | XP Total Ganho | Hearts Dropados |
|------|---------------------|---------------|----------------|----------------|
| Asteroid (large) | ___ | ___ | ___ | ___ |
| Asteroid (medium) | ___ | ___ | ___ | ___ |
| Asteroid (small) | ___ | ___ | ___ | ___ |
| Drone | ___ | ___ | ___ | 0 |
| Mine | ___ | ___ | ___ | 0 |
| Hunter | ___ | ___ | ___ | ___ |
| Boss | ___ | ___ | ___ | ___ |

- [ ] **Validar:**
  - [ ] Drone: ~2 orbs/inimigo (10 XP base)
  - [ ] Mine: ~1.5 orbs/inimigo (7.5 XP médio)
  - [ ] Hunter: ~3 orbs/inimigo (15 XP base)
  - [ ] Boss: ~10 orbs/inimigo (50 XP base)
  - [ ] Wave bonus aplicado (+1 orb a cada 5 waves)
  - [ ] Hearts só de hunters/bosses (nunca drones/mines)

### 3.6 Validação de Performance
- [ ] Abrir DevTools → Performance tab
- [ ] Iniciar gravação e jogar por 2 minutos
- [ ] **Verificar:**
  - [ ] FPS médio ≥ 55 (idealmente 60)
  - [ ] FPS mínimo ≥ 45
  - [ ] Sem frame drops significativos (>100ms)
  - [ ] Sem long tasks (>50ms)
- [ ] Abrir DevTools → Memory tab
- [ ] Take heap snapshot inicial
- [ ] Jogar 5 waves completas
- [ ] Take heap snapshot final
- [ ] **Verificar:**
  - [ ] Memory usage aumentou <20MB
  - [ ] Sem memory leaks detectados (heap size estável)
  - [ ] Detached DOM nodes <10

### 3.7 Validação de Console (Crítico)
- [ ] Revisar console após 10 waves
- [ ] **Verificar ausência de:**
  - [ ] Erros (vermelho)
  - [ ] Warnings de desincronização (`Kill count mismatch`)
  - [ ] Exceções não tratadas
  - [ ] Deprecation warnings
- [ ] **Verificar presença de:**
  - [ ] Logs de WaveManager (wave start/complete)
  - [ ] Logs de sincronização de estado
  - [ ] Logs de registro de inimigos

## Fase 4: Análise de Resultados e Decisão

### 4.1 Compilar Resultados
- [ ] Preencher `docs/validation/wavemanager-integration-report.md` com todos os dados coletados
- [ ] Anexar screenshots de:
  - [ ] Boss wave (wave 5)
  - [ ] Novos inimigos (drone, mine, hunter)
  - [ ] Performance metrics (DevTools)
  - [ ] Console logs (sem erros)

### 4.2 Classificar Issues Encontrados
- [ ] Listar todos os problemas identificados
- [ ] Classificar cada um como:
  - **Bloqueador:** Impede ativação (ex: crash, baseline divergente >5%)
  - **Crítico:** Deve ser corrigido antes de produção (ex: boss não spawna)
  - **Não-bloqueador:** Pode ser corrigido depois (ex: visual glitch menor)
  - **Melhoria:** Sugestão de otimização (ex: ajuste de balanceamento)

### 4.3 Tomar Decisão
- [ ] **Se 0 bloqueadores E 0 críticos:** ✅ **APROVADO PARA ATIVAÇÃO**
  - Prosseguir para Fase 5 (Documentação e Preparação)
- [ ] **Se 0 bloqueadores E 1-3 críticos:** ⚠️ **APROVADO COM RESSALVAS**
  - Criar issues no GitHub para cada crítico
  - Prosseguir para Fase 5 com monitoramento reforçado
- [ ] **Se ≥1 bloqueador:** ❌ **REPROVADO**
  - Criar issues para bloqueadores
  - Desativar flags: `USE_WAVE_MANAGER = false`
  - Corrigir bloqueadores
  - Re-executar WAVE-007 completo

## Fase 5: Documentação e Preparação para Produção

### 5.1 Atualizar Documentação de Planos
- [ ] Abrir `docs/plans/phase1-enemy-foundation-plan.md`
- [ ] Adicionar seção "✅ Final Validation (WAVE-007)" ao final
- [ ] Documentar:
  - Status: Concluído
  - Data de validação
  - Commit SHA testado
  - Resultado: Aprovado/Aprovado com ressalvas/Reprovado
  - Issues criados (se houver)
  - Próximos passos

### 5.2 Adicionar Comentários Críticos no Código
- [ ] **EnemySystem.js:**
  - Adicionar comentário em `updateWaveManagerLogic()` (linha ~1638) explicando sincronização bidirecional
  - Adicionar comentário em `updateWaveLogic()` (linha ~1644) marcando como LEGACY
  - Adicionar comentário em `handleSpawning()` (linha ~1938) marcando para remoção futura
- [ ] **WaveManager.js:**
  - Adicionar comentário em `onEnemyDestroyed()` (linha ~1627) explicando contabilização de fragmentos
  - Adicionar comentário em `spawnWave()` (linha ~1095) explicando registro via `registerActiveEnemy()`
  - Adicionar comentário em `calculateEdgeSpawnPosition()` (linha ~1474) referenciando lógica legada
- [ ] **GameConstants.js:**
  - Adicionar comentário em flags (linha 1742-1747) com data de ativação e critérios de remoção

### 5.3 Criar Plano de Rollback
- [ ] Documentar em `docs/validation/wave-007-rollback-plan.md`:
  - Passos para desativar flags rapidamente
  - Comandos git para reverter para commit anterior
  - Checklist de validação pós-rollback
  - Contatos de emergência (se aplicável)

### 5.4 Preparar Monitoramento em Produção
- [ ] Definir métricas a monitorar:
  - Taxa de crash/erro
  - FPS médio dos usuários
  - Tempo médio de wave
  - Taxa de conclusão de boss waves
  - Feedback de usuários (se houver canal)
- [ ] Definir período de monitoramento: 1-2 semanas
- [x] (18/10/2025) Critérios de rollback definidos no plano de emergência — ver `docs/validation/wave-007-rollback-plan.md`

## Fase 6: Limpeza de Código Legado (Histórico)

**Status:** ✅ Concluída em 18/10/2025 após duas semanas de monitoramento em produção.

### 6.1 Remoções Aplicadas
- ✅ `EnemySystem.js` — `handleSpawning()`, `spawnAsteroid()`, `updateWaveLogic()` e os ramos condicionais de `update()` foram removidos (commit 66efd58d77c6cc375af7e1f8ff84a3ae6cb7d64f).
- ✅ `WaveManager.js` — condicionais de feature flag eliminadas; geração de ondas assume controle integral do spawn.
- ℹ️ `selectRandomVariant()` permanece disponível por compatibilidade com presets personalizados de inimigos (não utilizado pelo fluxo principal).
- ✅ Suite completa executada após a limpeza (`npm test`).

### 6.2 Flags Eliminadas
- ✅ `GameConstants.js` — constantes `USE_WAVE_MANAGER` e `WAVEMANAGER_HANDLES_ASTEROID_SPAWN` removidas do código-fonte e da documentação.
- ✅ Busca global garantiu ausência de referências residuais.

### 6.3 Documentação e Arquivamento
- ✅ README.md e `docs/plans/phase1-enemy-foundation-plan.md` atualizados para refletir WaveManager como caminho único.
- ℹ️ Histórico consolidado neste checklist e em `docs/plans/phase1-enemy-foundation-plan.md`; nenhum arquivo adicional em `docs/archive/` foi necessário.

## Critérios de Conclusão de WAVE-007

- [x] Todas as fases 1-4 concluídas
- [x] Decisão tomada (Aprovado/Aprovado com ressalvas/Reprovado)
- [x] Documentação atualizada
- [x] Comentários críticos adicionados
- [x] Plano de rollback criado
- [x] Relatório de validação preenchido
- [x] Fase 6 (limpeza) executada após validação em produção

## Assinaturas

**Validador Técnico:** _____________  
**Data:** _____________  
**Resultado:** ☐ Aprovado ☐ Aprovado com ressalvas ☐ Reprovado  

**Aprovador de Produção:** _____________  
**Data:** _____________  

---

**Referências:**
- Plano de Fase 1: `docs/plans/phase1-enemy-foundation-plan.md`
- Baseline Metrics: `docs/validation/asteroid-baseline-metrics.md`
- Relatório de Integração: `docs/validation/wavemanager-integration-report.md`
- Testes Automatizados: `src/__tests__/legacy/asteroid-baseline-metrics.test.js`
