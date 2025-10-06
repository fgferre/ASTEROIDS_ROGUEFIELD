# Plano de Revisão Contínua da Pasta `docs`

**Atualizado em 2025-10-11 (pós-auditoria de código).** O acompanhamento segue o plano mestre revisado, que confirma o que está entregue (upgrades de motor, WaveManager, XP fixado e menu 3D) e detalha o novo backlog: HUD realmente sobreposto, modularização do `UISystem`, telemetria de orbs, migração para DI, divisão do `app.js`, polish audiovisual e governança de documentação.

## Estrutura vigente
- `docs/plans/` — contém o plano mestre atual.
- `docs/progress/` — centraliza o `docs-review-tracker.md`, relatórios (`perf/`, `xp-drop-report-*`, etc.) e o histórico resumido quando criado (`§6.2`).
- `docs/archive/2025-plan/` — acervo congelado com notas no cabeçalho indicando a seção correspondente do plano vigente.

## Fluxo de manutenção
1. **Planejar:** qualquer nova frente deve ser descrita no plano mestre, referenciando o documento-fonte arquivado.
2. **Executar:** trabalhar os itens na ordem definida no plano e anexar evidências em `docs/progress/`.
3. **Registrar:** ao finalizar um item, atualizar o tracker com data, responsável, link do PR e caminho do artefato.
4. **Arquivar:** documentos substituídos continuam sendo movidos para subpastas datadas em `docs/archive/`, com sufixo `.old` e nota de rastreabilidade.

## Checklists por revisão quinzenal
- Verificar progresso nas seções 2 a 6 do plano mestre revisado, com foco imediato nas frentes de HUD e modularização do `UISystem`.
- Confirmar se os relatórios obrigatórios (ex.: `perf:record`, `xp-drop-report`) foram gerados quando aplicável.
- Garantir que não existam documentos novos fora da estrutura (`plans/`, `progress/`, `archive/`) sem referência ao plano.

## Política de atualização
- Se o plano mestre for substituído, arquive a versão anterior em `docs/archive/<ano>-plan/` antes de publicar a nova.
- Alterações estruturais maiores devem ser aprovadas na reunião quinzenal de governança.
- O tracker (`docs/progress/docs-review-tracker.md`) é a fonte de verdade sobre status e responsáveis.
