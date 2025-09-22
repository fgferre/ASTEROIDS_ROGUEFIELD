# Plano de Melhoria: Efeitos de Quebra dos Asteroides

## Contexto atual

- O comportamento de dano e destruicao esta concentrado em `src/modules/EnemySystem.js` e aciona efeitos via `asteroid-crack-stage-changed` e `enemy-destroyed`.
- O `EffectsSystem` responde criando particulas genericas (`SpaceParticle`, `createAsteroidExplosion`, `createCrackDebris`, `createVolatileExplosionEffect`).
- O `AudioSystem` sincroniza sons, mas ainda sem diferencas significativas por variante.
- As rachaduras atuais aparecem como linhas soltas sobre o sprite, sem narrativa visual progressiva.

## Problemas observados

- Pipeline pouco parametrizado pelas variantes do asteroide (`denseCore`, `volatile`).
- Falta de relacao clara entre `crackStage` e o que e renderizado.
- Sensacao de quebra pouco impactante e dependente de particulas dispersas.
- Flags de acessibilidade (`reducedParticles`, `motionReduced`) ainda nao controlam todos os efeitos.

## Objetivos

1. Deixar a rachadura progressiva consistente com tamanho e variante do asteroide.
2. Amarrar cores, particulas e audio as variantes sem exigir ajustes manuais em cada sistema.
3. Reforcar impacto da explosao preservando performance e respeito a acessibilidade.

## Abordagem iterativa

Cada iteracao deve caber em um PR pequeno (<300 linhas) e encerrar com `npm run build` mais itens relevantes da checklist.

### Iteracao 0 - Levantamento rapido

- Mapear no codigo onde estao usados `crackStage`, `asteroid.crackVariants` e constantes relacionadas.
- Confirmar como `RenderingSystem` desenha o overlay atual e quais dependencias visuais existem.
- Adicionar log de contagem de particulas somente em build dev (guardado por `GameConstants.DEBUG_PARTICLES`).
- Verificar comportamento das flags `reducedParticles` e `motionReduced` e listar faltas.

### Iteracao 1 - Fundacoes visuais controladas por dados

- Introduzir tabela `GameConstants.ASTEROID_CRACKS` com camadas progressivas por variante.
- Adaptar `EnemySystem.updateCrackStage` para emitir somente o identificador da camada ativa.
- Ajustar `EffectsSystem` para consumir a nova tabela e aplicar overlays coerentes (sem glow ainda).
- Garantir fallback simples quando `reducedParticles` estiver ativo (apenas overlay, sem detritos adicionais).

### Iteracao 2 - Feedback por variante

- Passar esquema de cores da variante para `createAsteroidExplosion` e `createCrackDebris`.
- Fazer `generateFragments` herdar parte de `vx` e `vy` do asteroide quebrado, limitando exageros via constantes.
- Diferenciar sutilmente audio no `AudioSystem` (pitch ou camada extra) utilizando os mesmos dados de variante.
- Revisar HUD para garantir que novas chamadas (ex. contagem de ondas) respeitem `motionReduced`.

### Iteracao 3 - Polimento e performance

- Introduzir pooling simples de particulas em `EffectsSystem` para diminuir alocacoes repetidas.
- Adicionar pequeno glow pulsante (opcional) condicionado a `motionReduced`.
- Revisar densidade de particulas em diferentes resolucoes, escalando por `asteroid.radius`.
- Consolidar configuracoes finais em `docs/data/GameConstants` ou arquivo dedicado em `/src/data`.

## Validacao e documentacao

- Atualizar `docs/validation/test-checklist.md` ao fim de cada iteracao com cenarios cobertos.
- Registrar decisoes relevantes em `historico_do_projeto.txt` e no guia do HUD se necessario.
- Capturar comparativos antes/depois para uso futuro em README ou apresentacoes.

## Proximos passos imediatos

1. Executar Iteracao 0 e abrir issue destacando lacunas encontradas.
2. Implementar Iteracao 1 focando somente no overlay alimentado por dados.
3. Avaliar resultado antes de promover Iteracao 2 e 3.
