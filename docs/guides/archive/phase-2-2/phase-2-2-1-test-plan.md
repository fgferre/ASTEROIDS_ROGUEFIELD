# Fase 2.2.1: Plano de Testes - AsteroidMovement Ativado

> **Estado:** Arquivado. Para validações atuais consulte
> [`docs/guides/phase-2-2-actual-state.md`](../../phase-2-2-actual-state.md).

**Data:** 2025-10-01
**Branch:** `feature/phase-2-2-1-activate-movement`
**Servidor:** http://localhost:5501/

---

## ✅ Status da Implementação

### Arquivos Modificados

1. ✅ **AsteroidMovement.js**
   - Atualizado `parasiteMovement()` com lógica do Asteroid
   - Adicionado `updateBehaviorState()` para ataque parasite
   - Atualizado `wrapScreenEdges()` com fallback para CONSTANTS

2. ✅ **EnemySystem.js**
   - Integrado component no `updateAsteroids()`
   - Branch condicional: component ativo quando `useComponents=true`
   - Asteroid ainda atualiza visual state e timers

3. ✅ **Asteroid.js**
   - Flag de controle adicionada: `useExternalMovement`
   - Previne duplicação quando component está ativo
   - Mantém código legado para rollback

### Build Status

✅ **Build passou sem erros**
```
Running "clean:0" (clean) task
>> 1 path cleaned.

Running "copy:main" (copy) task
Copied 54 files

Done.
```

---

## 🧪 Roteiro de Testes

### Pré-requisito: Verificar Flag

**IMPORTANTE:** Verificar que `useComponents = true` no EnemySystem

```javascript
// src/modules/EnemySystem.js linha 48
this.useComponents = true; // ✅ DEVE ESTAR TRUE
```

Se estiver `false`, o component não será usado e cairá no código legado.

---

### Teste 1: Movimento Linear (Asteroids Comuns) ⭐ CRÍTICO

**Objetivo:** Verificar que asteroids sem variant especial movem-se normalmente

**Como testar:**
1. Abrir http://localhost:5501/
2. Iniciar novo jogo
3. Observar os primeiros asteroids

**Comportamento esperado:**
- ✅ Asteroids se movem em linha reta
- ✅ Rotação contínua funcionando
- ✅ Atravessam as bordas da tela corretamente (screen wrapping)
- ✅ Velocidades variadas entre large/medium/small
- ✅ Sem stuttering ou travamentos
- ✅ FPS estável em ~60

**Pontos de atenção:**
- ❌ Asteroids não devem "teleportar"
- ❌ Asteroids não devem parar de se mover
- ❌ Não deve haver queda de performance

**Status:** ⬜ Não testado | ✅ Passou | ❌ Falhou

**Notas:**
```
[Espaço para anotações do teste]
```

---

### Teste 2: Screen Wrapping ⭐ CRÍTICO

**Objetivo:** Verificar que asteroids atravessam as bordas corretamente

**Como testar:**
1. Observar asteroids chegando nas 4 bordas
2. Top, Right, Bottom, Left
3. Verificar transição suave

**Comportamento esperado:**
- ✅ Asteroid desaparece por uma borda
- ✅ Reaparece na borda oposta
- ✅ Mantém velocidade e direção
- ✅ Não há "flash" ou glitch visual

**Pontos de atenção:**
- ❌ Não deve haver clipping
- ❌ Asteroid não deve "prender" na borda

**Status:** ⬜ Não testado | ✅ Passou | ❌ Falhou

**Notas:**
```
[Espaço para anotações do teste]
```

---

### Teste 3: Colisões entre Asteroids

**Objetivo:** Verificar que física de colisão ainda funciona

**Como testar:**
1. Observar asteroids colidindo entre si
2. Spawnar vários asteroids (avançar para wave 2-3)

**Comportamento esperado:**
- ✅ Asteroids colidem elasticamente
- ✅ Velocidades mudam após colisão
- ✅ Rotação aumenta após colisão
- ✅ Não atravessam uns aos outros

**Status:** ⬜ Não testado | ✅ Passou | ❌ Falhou

**Notas:**
```
[Espaço para anotações do teste]
```

---

### Teste 4: Destruição e Fragmentação

**Objetivo:** Verificar que asteroids ainda fragmentam corretamente

**Como testar:**
1. Atirar em asteroid large
2. Observar fragmentos
3. Verificar movimento dos fragmentos

**Comportamento esperado:**
- ✅ Large → 2 mediums
- ✅ Medium → 2-3 smalls
- ✅ Fragmentos herdam velocidade do parent
- ✅ Fragmentos se movem normalmente

**Status:** ⬜ Não testado | ✅ Passou | ❌ Falhou

**Notas:**
```
[Espaço para anotações do teste]
```

---

### Teste 5: XP Orbs (RewardManager)

**Objetivo:** Verificar que sistema de recompensas ainda funciona

**Como testar:**
1. Destruir asteroids
2. Observar XP orbs dropando
3. Coletar orbs

**Comportamento esperado:**
- ✅ XP orbs aparecem após destruir asteroid
- ✅ Quantidade varia por tamanho (small=1, medium=2, large=4)
- ✅ Orbs são atraídos para o player
- ✅ XP é ganho ao coletar

**Status:** ⬜ Não testado | ✅ Passou | ❌ Falhou

**Notas:**
```
[Espaço para anotações do teste]
```

---

### Teste 6: Movimento Parasite ⭐ CRÍTICO

**Objetivo:** Verificar tracking de player e ataque de contato

**Como testar:**
1. Avançar para wave 10+ (parasites aparecem)
2. Observar asteroids vermelhos (parasite variant)
3. Ver se seguem o player
4. Deixar um parasite te alcançar

**Comportamento esperado:**
- ✅ Parasite acelera em direção ao player
- ✅ Tracking contínuo (segue movimento do player)
- ✅ Respeita velocidade máxima
- ✅ Não "gruda" no player (minDistance repulsion)
- ✅ Causa dano de contato ao alcançar
- ✅ Tem cooldown entre ataques (~1.2s)

**Pontos de atenção:**
- ❌ Não deve ter delay inicial (implementação antiga tinha)
- ❌ Não deve acelerar em burst (deve ser aceleração contínua)
- ❌ Não deve atravessar o player

**Status:** ⬜ Não testado | ✅ Passou | ❌ Falhou

**Notas:**
```
[Espaço para anotações do teste]
```

---

### Teste 7: Movimento Volatile

**Objetivo:** Verificar que volatiles movem-se normalmente (é linear)

**Como testar:**
1. Avançar para wave 7+ (volatiles aparecem)
2. Observar asteroids com particle trail
3. NÃO destruir, deixar timer acabar

**Comportamento esperado:**
- ✅ Movimento linear (igual common)
- ✅ Particle trail atrás do asteroid
- ✅ Trail acelera conforme fuse diminui
- ✅ Explosão ocorre após ~10s
- ✅ Explosão causa dano em área

**Pontos de atenção:**
- ❌ Volatile NÃO muda movimento (é só linear)
- ❌ Timer deve funcionar independente do component

**Status:** ⬜ Não testado | ✅ Passou | ❌ Falhou

**Notas:**
```
[Espaço para anotações do teste]
```

---

### Teste 8: Variants Especiais

**Objetivo:** Testar outros variants (iron, gold, crystal, denseCore)

**Como testar:**
1. Avançar waves
2. Observar asteroids com cores diferentes
3. Verificar movimento

**Comportamento esperado:**
- ✅ Iron (cinza): movimento normal, mais HP
- ✅ Gold (dourado): movimento normal, mais XP
- ✅ Crystal (azul): movimento normal, brilho especial
- ✅ DenseCore (roxo): movimento normal, HP muito alto

**Todos devem ter movimento LINEAR (igual common)**

**Status:** ⬜ Não testado | ✅ Passou | ❌ Falhou

**Notas:**
```
[Espaço para anotações do teste]
```

---

### Teste 9: Performance ⭐ CRÍTICO

**Objetivo:** Verificar que não houve degradação de performance

**Como testar:**
1. Avançar para wave 5+
2. Ter 15-20 asteroids na tela
3. Observar FPS (F12 → Console → digitar: `console.log(performance.now())`)
4. Jogar por 5 minutos

**Comportamento esperado:**
- ✅ FPS mantido em ~60
- ✅ Sem stuttering
- ✅ Sem memory leaks (memória não cresce indefinidamente)
- ✅ Game loop estável

**Comparação:**
- Antes: ~60 FPS com 20 asteroids
- Depois: ~60 FPS com 20 asteroids (igual)

**Status:** ⬜ Não testado | ✅ Passou | ❌ Falhou

**Notas:**
```
[Espaço para anotações do teste]
```

---

### Teste 10: Console Errors

**Objetivo:** Verificar que não há erros no console

**Como testar:**
1. F12 → Console
2. Limpar console
3. Jogar por 2 minutos
4. Observar erros

**Comportamento esperado:**
- ✅ Sem erros vermelhos
- ✅ Sem warnings críticos
- ✅ Logs normais aparecem:
  - `[EnemySystem] Initialized`
  - `[AsteroidMovement] Registered strategy: ...`
  - `[EnemySystem] AsteroidMovement component initialized`

**Status:** ⬜ Não testado | ✅ Passou | ❌ Falhou

**Notas:**
```
[Espaço para anotações do teste]
```

---

## 🔍 Debugging Tips

### Se asteroids não se movem:

1. Verificar flag: `useComponents = true`
2. Console: procurar por `[AsteroidMovement] component initialized`
3. Breakpoint em `AsteroidMovement.update()`

### Se movimento está duplicado (2x velocidade):

1. Flag `useComponents` está ativa MAS
2. `Asteroid.update()` não está detectando corretamente
3. Verificar: `asteroid.system?.useComponents && asteroid.system?.movementComponent`

### Se parasite não ataca:

1. Verificar que `updateBehaviorState()` está sendo chamado
2. Console: `asteroid.variantState.attackCooldown` deve existir
3. Verificar range: `attackRange` vs `distance`

---

## 🎯 Critérios de Aceitação

Para considerar a ativação **bem-sucedida**, TODOS os testes críticos (⭐) devem passar:

- ✅ Teste 1: Movimento Linear
- ✅ Teste 2: Screen Wrapping
- ✅ Teste 6: Movimento Parasite
- ✅ Teste 9: Performance

Testes secundários podem ter pequenos ajustes, mas não devem ter falhas críticas.

---

## 📊 Resultado Final

| Teste | Status | Notas |
|-------|--------|-------|
| 1. Movimento Linear | ⬜ | |
| 2. Screen Wrapping | ⬜ | |
| 3. Colisões | ⬜ | |
| 4. Fragmentação | ⬜ | |
| 5. XP Orbs | ⬜ | |
| 6. Parasite | ⬜ | |
| 7. Volatile | ⬜ | |
| 8. Variants | ⬜ | |
| 9. Performance | ⬜ | |
| 10. Console | ⬜ | |

**Status Geral:** ⬜ Aguardando testes

---

## 🔄 Rollback (Se Necessário)

Se testes falharem criticamente:

### Opção 1: Desabilitar Component

```javascript
// src/modules/EnemySystem.js linha 48
this.useComponents = false; // Volta para código legado
```

### Opção 2: Reverter Branch

```bash
git checkout main
```

### Opção 3: Reverter Commit Específico

```bash
git log --oneline
git revert <commit-hash>
```

---

## 📝 Próximos Passos (Após Testes Passarem)

1. ✅ Merge para main
2. ✅ Remover código duplicado (cleanup)
3. ✅ Documentar mudanças
4. ✅ Iniciar Fase 2.2.2 (WaveManager activation)

---

**🎮 Bons testes!**

Servidor: http://localhost:5501/
Branch: `feature/phase-2-2-1-activate-movement`
