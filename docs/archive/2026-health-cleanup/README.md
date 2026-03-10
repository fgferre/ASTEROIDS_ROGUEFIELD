# 2026 Health Cleanup Archive

Este diretório reúne o material retirado da árvore viva durante a limpeza de
2026-03-10.

## Arquivado aqui

- pacote histórico de migração;
- planos concluídos ou substituídos;
- documentação histórica de UI/HUD;
- trackers administrativos vencidos;
- relatórios antigos de refatoração e validação;
- log bruto do relatório de integração do WaveManager.

## Removido do repositório principal

- três PNGs de referência visual antes mantidos em
  `assets/inpirational mockups/`;
- artefatos locais e scripts órfãos sem uso no runtime ou no CI.

Se esses PNGs ainda forem úteis como referência, mantenha-os em armazenamento
externo de design em vez de recolocá-los no repositório.

## Fontes vivas após a limpeza

- `docs/plans/`
- `docs/validation/`
- `docs/repo-health-audit-2026-03-10.md`

`docs/ui/` saiu da árvore viva porque o HUD atual já está consolidado no código
(`src/modules/ui/AAAHudLayout.js`, `src/modules/UISystem.js`,
`src/data/ui/hudLayout.js`) e os documentos restantes não carregavam pendências
acionáveis.
