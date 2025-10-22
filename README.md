# ASTEROIDS_ROGUEFIELD

Roguelike de asteroides focado em arquitetura modular e ferramentas de debug para agentes de IA.

## Início rápido

| Ação | Comando |
| --- | --- |
| Instalar dependências | `npm ci` |
| Ambiente de desenvolvimento | `npm run dev` |
| Build de produção | `npm run build` |
| Testes principais | `npm test` |
| Checar formatação | `npm run format:check` |
| Aplicar formatação | `npm run format` |

## Debug logging em 1 minuto

1. Rode `npm run dev`.
2. Reproduza o problema no navegador.
3. Abra o console (F12) e execute `downloadDebugLog()` para salvar `game-debug.log`.
4. Anexe o arquivo ao report de bug para permitir diagnóstico determinístico.

Comandos adicionais: `showDebugLog()` exibe o buffer atual e `clearDebugLog()` reinicia a captura.

## Documentação para agentes

`agents.md` é a referência principal para o fluxo completo (arquitetura, checklists, políticas de PR). Consulte-o antes de qualquer alteração. Checklist de validação adicional: `docs/validation/test-checklist.md`.

## Scripts úteis

- `npm run analyze:deps` &rarr; Atualiza `dependency-graph.json`, `dependency-issues.json` e `docs/architecture/dependency-graph.mmd`.
- `npm run validate:deps` &rarr; Executa a análise sem gerar arquivos e falha em caso de ciclos, hubs críticos ou órfãos.
- `npm run stress` &rarr; Executa cenários de carga adicionais descritos em `docs/validation/`.

Diagramas e detalhes adicionais sobre dependências: `docs/architecture/DEPENDENCY_GRAPH.md`.

