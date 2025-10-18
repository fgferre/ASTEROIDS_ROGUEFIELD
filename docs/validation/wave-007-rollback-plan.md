# WAVE-007: Plano de Rollback de Emergência

## Objetivo
Fornecer procedimento rápido e seguro para reverter a ativação do WaveManager em caso de problemas críticos detectados em produção ou durante validação.

## Quando Executar Rollback

### Gatilhos Automáticos (Se Monitoramento Implementado)
- Crash rate >1% em 1 hora
- FPS médio <45 por >10 minutos
- Error rate >5% em 30 minutos
- Memory leak detectado (heap growth >50MB/hora)

### Gatilhos Manuais
- Bloqueador identificado durante WAVE-007
- Feedback negativo consistente de usuários
- Boss waves quebrando progressão
- Baseline metrics divergindo >10%
- Decisão da equipe/stakeholders

## Procedimento de Rollback

### Caminho principal: Restaurar release estável anterior

**Tempo estimado:** 5-10 minutos

**Passos:**

1. **Identificar o commit ou tag estável:**
   ```bash
   git fetch origin --tags
   git log --oneline origin/main | head -n 20
   # Selecionar o commit imediatamente anterior à regressão (ex.: tag release-2025-10-10)
   ```

2. **Criar commit de rollback:**
   ```bash
   # Mantendo histórico limpo
   git revert <sha-problematico>..HEAD
   # ou revert unitário se apenas um commit causou o problema
   git push origin HEAD
   ```

   > ⚠️ Se múltiplos commits estiverem envolvidos, prefira abrir um branch de emergência e criar um PR com o revert agregado para revisão rápida.

3. **Gerar build e publicar:**
   ```bash
   npm ci
   npm run build
   # Executar pipeline/deploy conforme processo da equipe
   ```

4. **Validar ambiente restaurado:**
   - Executar `npm test` (ou pipeline equivalente) para garantir sanidade.
   - Abrir a aplicação e jogar 2 waves para verificar estabilidade.
   - Confirmar ausência de erros de console ou travamentos.

5. **Comunicar stakeholders:**
   - Informar que o rollback foi executado e o commit/timeline envolvidos.
   - Registrar o incidente e criar issue de acompanhamento com causa raiz.

### Alternativa: Reimplantar artefato conhecido

Caso exista um build estável arquivado (artefato CI/CD):

1. Selecionar o artefato aprovado.
2. Publicar novamente no ambiente afetado.
3. Atualizar `main` com um commit "revert" equivalente para manter histórico consistente.
4. Seguir as mesmas validações e comunicação descritas acima.

## Checklist Pós-Rollback

### Validação Técnica
- [ ] Aplicação carrega sem erros
- [ ] Build revertido corresponde ao commit/tag planejado
- [ ] Suite automatizada (ex.: `npm test`) passa sem falhas
- [ ] Jogar 5 waves completas sem erros ou quedas de FPS
- [ ] Performance estável (≥55 FPS)
- [ ] Uso de memória dentro da linha base (<100MB após 5 waves)

### Comunicação
- [ ] Equipe notificada sobre rollback
- [ ] Motivo do rollback documentado
- [ ] Issue criado no GitHub com:
  - Descrição do problema
  - Logs/screenshots relevantes
  - Passos para reproduzir
  - Prioridade (bloqueador/crítico)
- [ ] Stakeholders informados (se aplicável)

### Análise Pós-Mortem
- [ ] Revisar logs de erro
- [ ] Identificar causa raiz
- [ ] Documentar lições aprendidas
- [ ] Atualizar WAVE-007 checklist com novos testes
- [ ] Planejar correção

## Prevenção de Rollbacks Futuros

### Antes de promover nova versão
- [ ] Executar checklist WAVE-007 (ou sucessor) completo
- [ ] Garantir aprovação em code review e QA
- [ ] Preparar ponto de restauração (tag ou artefato) antes do deploy
- [ ] Comunicar janela de lançamento e plano de contingência

### Durante o rollout
- [ ] Monitorar métricas críticas em tempo real (primeiros 30 min)
- [ ] Manter equipe de prontidão para revert imediato
- [ ] Registrar qualquer anomalia observada

### Após o rollout
- [ ] Acompanhar métricas por 24-48 horas
- [ ] Coletar feedback de usuários e moderadores
- [ ] Revisar logs diariamente e arquivar incidentes
- [ ] Manter este plano acessível e atualizado

## Contatos de Emergência

_Preencher com informações da equipe:_

- **Tech Lead:** _____________
- **DevOps:** _____________
- **QA Lead:** _____________
- **Product Owner:** _____________

## Histórico de Rollbacks

| Data | Motivo | Opção Usada | Tempo | Responsável | Notas |
|------|--------|-------------|-------|-------------|-------|
| ___ | ___ | ___ | ___ | ___ | ___ |

## Referências

- Checklist de Validação: `docs/validation/wave-007-final-validation-checklist.md`
- Plano de Fase 1: `docs/plans/phase1-enemy-foundation-plan.md`
- Relatório de Integração: `docs/validation/wavemanager-integration-report.md`
- GameConstants.js: `src/core/GameConstants.js` (seção "WAVE MANAGER CONFIGURATION (WAVE-007)")
