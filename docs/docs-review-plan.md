# Plano de Revisão Contínua da Pasta `docs`

**Atualizado em 2025-10-10.** Após a consolidação de todos os planos anteriores no `docs/plans/docs-implementation-master-plan.md`, a revisão da documentação passa a seguir o fluxo simplificado abaixo.

## Estrutura vigente
- `docs/plans/` — contém **apenas** o plano mestre atual.
- `docs/progress/` — registro vivo de acompanhamento (`docs-review-tracker.md`, `historico_do_projeto.txt`).
- `docs/archive/2025-plan/` — acervo congelado com os documentos substituídos; cada arquivo possui nota indicando a seção correspondente do novo plano.

## Fluxo de manutenção
1. **Planejar** — quaisquer novas frentes devem ser adicionadas primeiro ao plano mestre (criando subseções ou itens de tabela).
2. **Executar** — as equipes trabalham a partir dos itens priorizados no plano mestre e registram o andamento no board compartilhado.
3. **Registrar** — ao finalizar um item, atualizar `docs/progress/docs-review-tracker.md` com data, responsável e link do PR.
4. **Arquivar** — quando um documento perder validade, movê-lo para uma subpasta datada em `docs/archive/` com sufixo `.old` e nota de rastreabilidade para o plano vigente.

## Checklists por ciclo de revisão (quinzenal)
- Validar se houve progresso nas seções 2.x–6.x do plano mestre.
- Verificar se novas decisões foram refletidas no tracker e no histórico de progresso.
- Revisar se não existem arquivos novos fora de `docs/plans/`, `docs/progress/` ou `docs/archive/` sem rastreabilidade.

## Política de atualização
- Alterações estruturais devem ser aprovadas na reunião quinzenal.
- O plano mestre nunca deve coexistir com versões concorrentes; ao criar um novo plano, arquive o anterior seguindo a política acima.
- O tracker permanece como a única fonte de verdade sobre status e responsáveis.
