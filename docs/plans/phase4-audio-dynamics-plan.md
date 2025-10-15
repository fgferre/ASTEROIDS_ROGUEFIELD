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

## Dependências

- Depende das fases 1 e 2 (eventos e boss) e dos presets definidos na Fase 3 para sincronizar feedback audiovisual.
- Fornece contexto auditivo que a Fase 5 usará para reforçar indicadores de ameaça e combo.
