$(awk 'NR<102{print}' README.md)
## Feature Flags

O WaveManager está ativo permanentemente desde a conclusão da fase WAVE-007
(18/10/2025). As antigas flags `USE_WAVE_MANAGER` e `WAVEMANAGER_HANDLES_ASTEROID_SPAWN`
foram removidas do código-base; rollback agora requer reverter para um commit
anterior, conforme descrito em `docs/validation/wave-007-rollback-plan.md`.

As únicas flags restantes servem como ajustes de compatibilidade e balanceamento:

### Compatibilidade de Spawn de Asteroides

- `PRESERVE_LEGACY_SIZE_DISTRIBUTION` (default: `true`)
  - `true`: mantém a distribuição 50/30/20 (large/medium/small) usada pelo baseline
    original (útil para comparações históricas).
  - `false`: ativa a distribuição 30/40/30 otimizada para o mix com drones, mines e
    hunters.

- `PRESERVE_LEGACY_POSITIONING` (default: `true`)
  - `true`: spawn nas 4 bordas com margem fixa (experiência clássica).
  - `false`: spawn com distância segura do jogador (melhor UX em telas maiores).

- `STRICT_LEGACY_SPAWN_SEQUENCE` (default: `true`)
  - Garante determinismo idêntico ao baseline ao reutilizar o mesmo stream de
    randomização para posição e tamanho.

### Métricas e Validação

- Suite de testes automatizados (`npm test`) cobre integração completa do WaveManager.
- `docs/validation/wave-007-final-validation-checklist.md` permanece como referência
  histórica dos passos executados na ativação definitiva.
- `docs/validation/wave-007-rollback-plan.md` descreve como reverter a release caso
  seja necessário retornar ao sistema legado via git revert.

WAVE-007 foi aprovado sem ressalvas. O código legado do sistema de ondas foi removido,
comentários críticos foram atualizados e os novos contadores do HUD refletem todos os
inimigos quando as flags de compatibilidade são desativadas.

