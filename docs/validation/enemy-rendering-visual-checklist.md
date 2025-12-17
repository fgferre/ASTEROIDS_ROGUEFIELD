# Enemy Rendering – Visual Checklist

## Objetivo

Validar visualmente a renderização de **Drone**, **Mine** e **Hunter** antes de ativar o spawn via WaveManager, garantindo que aparência, animações e performance estejam alinhadas aos requisitos de design estabelecidos em `GameConstants` e aos padrões do `BossEnemy.onDraw()`.

## Pré-requisitos

- Servidor de desenvolvimento ativo: `npm run dev`
- Navegador com suporte a Canvas 2D e ES6 modules
- Abrir `http://localhost:5173/scripts/visual-enemy-rendering-test.html`

## Checklist: Drone

### Geometria e Estrutura

- [ ] Nave triangular claramente visível (nose pontiagudo, tail largo)
- [ ] Proporções corretas: nose ≈ 1.6 × radius, tail ≈ -1.05 × radius, halfWidth ≈ 0.9 × radius
- [ ] Fins laterais simétricas com taper visível (~0.6)
- [ ] Hull stroke delineando contorno externo

### Cores e Materiais (`ENEMY_EFFECT_COLORS.drone`)

- [ ] Body: tons metálicos frios (`body`, `bodyHighlight`, `bodyShadow`)
- [ ] Accent ridges ciano (`accent`, `accentGlow`) visíveis no centro do hull
- [ ] Exhaust quente (`exhaust`) ativado quando há movimento

### Animações Dinâmicas

- [ ] Exhaust glow cresce suavemente com a velocidade (smoothing ≈ 0.2)
- [ ] Exhaust desaparece gradualmente quando parado (`thrust` → 0)
- [ ] Blur e alpha do exhaust variam conforme thrust (blur 6-12, alpha 0.28-0.72)
- [ ] Sem popping ou transições abruptas entre estados

### Efeitos Visuais

- [ ] Accent glow usa `globalCompositeOperation: 'lighter'` com alpha ≈ 0.45
- [ ] Shadow blur do accent glow proporcional ao radius (~0.6 × radius)
- [ ] Exhaust renderizado com composite `'lighter'`

### Performance

- [ ] 60 FPS estável com 3 drones renderizando simultaneamente
- [ ] Sem memory leaks (monitorar DevTools → Memory por 1 minuto)

## Checklist: Mine

### Geometria e Estrutura

- [ ] Esfera perfeita (círculo) com radius ≈ 18 px
- [ ] Core radius igual ao base radius (multiplier 1.0)
- [ ] Halo ring visível (~1.45 × radius)

### Cores e Materiais (`ENEMY_EFFECT_COLORS.mine`)

- [ ] Body: gradiente radial highlight → body → shadow
- [ ] Core: laranja/dourado (`core` ≈ `#ff9348`)
- [ ] Rim: mesma cor do core, alpha variável
- [ ] Halo: tom mais claro (`halo` ≈ `#ffc480`)

### Animações Dinâmicas

- [ ] Pulsação suave e contínua (período ≈ 2.4 s)
- [ ] Intensidade aumenta quando `armed` (multiplier ≈ 1.45)
- [ ] Halo cresce no pico do pulso (exponent ≈ 1.4)
- [ ] Rim alpha varia entre 0.55-0.95 conforme pulso

### Estados

- [ ] Unarmed: pulsação mais fraca, halo discreto
- [ ] Armed: pulsação intensa, halo brilhante, rim destacado
- [ ] Transição suave entre estados quando alternado

### Efeitos Visuais

- [ ] Glow central usa composite `'lighter'` com blur 10-15
- [ ] Halo ring com stroke width ≈ 0.08 × radius
- [ ] Gradiente cacheado corretamente (`_bodyGradientKey`)

### Performance

- [ ] 60 FPS estável com 5 mines renderizando
- [ ] Cache de gradiente funcionando (sem recriação por frame)

## Checklist: Hunter

### Geometria e Estrutura

- [ ] Hull em forma de diamante (front, top, rear, bottom definidos)
- [ ] Proporções: front ≈ 1.9 × radius, rear ≈ 0.72 × front, halfWidth ≈ 1.2 × radius
- [ ] Accent inset visível (~0.48 × radius)
- [ ] Turret separado visualmente do hull

### Turret (Componente Independente)

- [ ] Base circular (~0.34 × radius) centrada
- [ ] Barrel retangular (~1.25 × radius) com accent line magenta
- [ ] Highlight triangular no turret (alpha ≈ 0.45)
- [ ] Turret rotaciona independentemente do hull

### Cores e Materiais (`ENEMY_EFFECT_COLORS.hunter`)

- [ ] Body: tons cinza-azulados (`body`, `bodyHighlight`, `bodyShadow`)
- [ ] Accent: magenta/rosa (`accent`, `accentGlow`)
- [ ] Turret: tom mais claro (`turret` ≈ `#b7a7d9`)
- [ ] Gradiente linear front-to-rear visível

### Animações Dinâmicas

- [ ] Turret rotaciona suavemente (sem jitter)
- [ ] Hull pode rotacionar independentemente
- [ ] Ângulo relativo do turret = `turretAngle - rotation`

### Efeitos Visuais

- [ ] Gradiente linear com stops corretos (shadow 0.12, mid 0.48, highlight 0.88)
- [ ] Hull stroke delineando contorno (~0.14 × radius)
- [ ] Accent stroke no inner diamond (~0.1 × radius)
- [ ] Gradiente cacheado (`_hullGradientKey`)

### Performance

- [ ] 60 FPS estável com 3 hunters renderizando
- [ ] Cache de gradiente funcionando (sem recriação por frame)

## Checklist Geral: Preservação do Canvas

- [ ] `globalAlpha` resetado para 1 após cada `onDraw()`
- [ ] `shadowBlur` resetado para 0
- [ ] `shadowColor` resetado para `'transparent'`
- [ ] `globalCompositeOperation` resetado para `'source-over'`
- [ ] `lineWidth` resetado para 1
- [ ] `strokeStyle` resetado para `'transparent'`
- [ ] Sem vazamento de estado entre renderizações

## Checklist: Comparação com `BossEnemy`

- [ ] Padrão `save()`/`restore()` consistente
- [ ] Consumo de `ENEMY_EFFECT_COLORS` e `ENEMY_RENDER_PRESETS`
- [ ] Payload retornado quando `ctx` é `null`
- [ ] Gradientes cacheados com validação de key
- [ ] Uso apropriado de composite (`'lighter'` para glows)

## Critérios de Aprovação

**Prosseguir para WAVE-004 somente se:**

- Todos os itens de Geometria e Cores foram marcados
- Animações dinâmicas fluem sem artefatos visuais
- Performance estável (60 FPS) com múltiplas instâncias
- Preservação do estado do canvas confirmada

**Bloqueadores:**

- Geometria incorreta ou desproporcional
- Cores divergentes de `ENEMY_EFFECT_COLORS`
- Animações com jitter/popping
- Performance < 50 FPS com 3-5 instâncias
- Vazamento de estado do canvas

## Registro de Validação

**Data:** ******\_******  
**Validador:** ******\_******  
**Navegador/Versão:** ******\_******  
**Resultado:** ☐ Aprovado ☐ Aprovado com ressalvas ☐ Reprovado  
**Observações:**

---

### Próximos Passos Após Aprovação

1. Marcar WAVE-003 como concluído em `docs/plans/phase1-enemy-foundation-plan.md`
2. Prosseguir para WAVE-004: integrar WaveManager ao loop principal
3. Validar rendering in-game com spawn real via WaveManager
