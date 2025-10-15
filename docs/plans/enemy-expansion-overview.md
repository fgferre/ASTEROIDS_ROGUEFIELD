# Plano Geral – Expansão de Inimigos e Sistemas Associados

## Observações Principais

1. **Enemy System:** padrão Factory com `EnemyFactory`, classe base `BaseEnemy` e implementações específicas (atualmente `Asteroid`), utilizando `GamePools` para pooling e design baseado em componentes.
2. **Wave Management:** `WaveManager` controla progressão com configurações pré-definidas (ondas 1-10) e geração dinâmica (11+), usando geradores randômicos escopados.
3. **Effects & Audio:** `EffectsSystem` gerencia partículas, screen shake e indicadores com arquitetura orientada a eventos. `AudioSystem` possui batching, cache e síntese procedural.
4. **UI System:** HUD data-driven a partir de `hudLayout.js` com layouts (classic, minimal) e atualizações dinâmicas via event bus.
5. **Physics:** `PhysicsSystem` usa `SpatialHash` para colisões eficientes e integra-se ao `EnemySystem`.
6. **Dependency Injection:** Sistema de DI (Fase 2.1) com `ServiceManifest` declarando serviços e dependências.

**Conclusões-chave:**
- `BaseEnemy` oferece base para novos inimigos (Drone, Mine, Hunter).
- `GamePools` precisa ser estendido para os novos tipos.
- `WaveManager` permite integração de lógica de boss via configs.
- `EffectsSystem` tem hooks para novos VFX.
- `AudioSystem` suporta camadas dinâmicas via síntese orientada a eventos.
- `UISystem` aceita novos componentes HUD via `hudLayout.js`.

## Estratégia de Implementação

- **Fase 1 – Enemy Type Foundation:** criar classes Drone, Mine e Hunter, registrar no `EnemyFactory`, configurar pools e spawn no `WaveManager`.
- **Fase 2 – Boss System:** introduzir mecânica de boss com comportamento multi-fase, integrando `WaveManager` com spawns periódicos (a cada 5 ondas).
- **Fase 3 – Enhanced VFX:** ampliar `EffectsSystem` com novos tipos de partículas, ajustes de screen shake e efeito de câmera lenta.
- **Fase 4 – Dynamic Audio:** adicionar sistema de camadas musicais no `AudioSystem`, com áudio espacial e troca de trilhas por intensidade.
- **Fase 5 – Tactical HUD:** expandir `hudLayout.js` com componentes (minimapa, indicadores de ameaça, combo) e implementar renderização na `UISystem`.

### Referências de Plano por Fase

- [Fase 1 – Fundamentos de Novos Inimigos](phase1-enemy-foundation-plan.md)
- [Fase 2 – Sistema de Boss](phase2-boss-system-plan.md)
- [Fase 3 – Efeitos Visuais Avançados](phase3-effects-upgrade-plan.md)
- [Fase 4 – Áudio Dinâmico](phase4-audio-dynamics-plan.md)
- [Fase 5 – HUD Tático](phase5-tactical-hud-plan.md)

## Motivação e Análise

A análise detalhada dos arquivos `BaseEnemy`, `EnemyFactory`, `WaveManager`, `EnemySystem`, `GamePools`, `PhysicsSystem`, `EffectsSystem`, `AudioSystem`, `UISystem`, `hudLayout.js`, `GameConstants`, e `serviceManifest` demonstrou que a arquitetura atual já fornece todos os pontos de extensão necessários. As fases listadas acima mantêm o trabalho modular e progressivo, permitindo revisões e validações por etapa.

## Diagrama de Sequência

```mermaid
sequenceDiagram
    participant WM as WaveManager
    participant ES as EnemySystem
    participant EF as EnemyFactory
    participant GP as GamePools
    participant Enemy as Novos Inimigos
    participant Boss as BossEnemy
    participant PS as PhysicsSystem
    participant EffS as EffectsSystem
    participant AS as AudioSystem
    participant UI as UISystem
    participant Player as Player

    Note over WM,UI: Fase 1 – Spawn de Inimigos
    WM->>WM: Verifica se é onda de boss (a cada 5)
    alt Onda de Boss
        WM->>ES: Spawn de boss + inimigos de suporte
        ES->>EF: Cria boss
        EF->>GP: Obtém instância do pool
        GP-->>EF: Instância do boss
        EF->>Boss: Inicializa com config
        Boss-->>ES: Pronto
        ES->>PS: Registra boss para colisão
        ES->>EffS: Emite evento de spawn
        EffS->>EffS: Efeito de entrada
        EffS->>AS: Grito do boss
        AS->>AS: Intensidade musical máxima
    else Onda Regular
        WM->>ES: Spawn variado
        ES->>EF: Cria drones/mines/hunters
        EF->>GP: Obtém dos pools
        GP-->>EF: Instâncias
        EF->>Enemy: Inicializa configs
        Enemy-->>ES: Pronto
        ES->>PS: Registra inimigos
    end

    Note over Enemy,Player: Fase 2 – Comportamento
    loop Update do Jogo
        Enemy->>Enemy: Atualiza IA
        alt Drone/Hunter
            Enemy->>ES: Evento enemy-fired
            ES->>CombatSystem: Cria projéteis
            CombatSystem->>Player: Checa colisão
            Player->>EffS: Evento player-hit
            EffS->>AS: Som de impacto
        else Mine
            Enemy->>Player: Verifica proximidade
            alt Player no raio
                Enemy->>ES: Evento mine-exploded
                ES->>PS: Dano em área
                PS->>EffS: Efeito de explosão
                EffS->>AS: Som de explosão
            end
        end
    end

    Note over Boss,UI: Fase 3 – Mecânicas de Boss
    Boss->>Boss: Avalia transição de fase
    alt Threshold de fase
        Boss->>ES: Evento boss-phase-changed
        ES->>EffS: Efeito de transição
        EffS->>EffS: Freeze + shake
        EffS->>AS: Som de transição
        Boss->>Boss: Altera padrão
        Boss->>UI: Atualiza barra de vida
    end

    Note over UI,Player: Fase 4 – HUD
    loop Frame
        UI->>PS: Busca inimigos próximos
        PS-->>UI: Posições
        UI->>UI: Render minimapa
        UI->>UI: Atualiza indicadores
        ES->>UI: Evento enemy-destroyed
        UI->>UI: Incrementa combo
        UI->>UI: Aplica multiplicador de XP
    end

    Note over Boss,AS: Fase 5 – Derrota do Boss
    Player->>Boss: Dano final
    Boss->>ES: Evento boss-defeated
    ES->>EffS: Explosão épica
    EffS->>EffS: Múltiplos estágios
    EffS->>AS: Fanfare
    AS->>AS: Reduz intensidade musical
    ES->>WM: Conclui onda
    WM->>UI: Mostra tela de conclusão
```
