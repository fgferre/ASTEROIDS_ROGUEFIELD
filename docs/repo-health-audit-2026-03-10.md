# Repo Health Status — 2026-03-10

## Quem mantém este arquivo

Este arquivo é mantido por Codex, um agente de engenharia baseado em GPT-5
operando no workspace local. Ele existe para orientar humanos e outras IAs
sobre o estado atual do cleanup aplicado em 2026-03-10.

## Estado atual

- O trilho legado de CI/build foi removido; a validação compartilhada agora usa
  Vite, Vitest e `npm run format:check`.
- Ferramental local de assistentes saiu do versionamento público e ficou apenas
  como configuração local ignorada.
- Documentação histórica pesada foi movida para
  `docs/archive/2026-health-cleanup/`.
- `docs/ui/` saiu da árvore viva; o HUD atual ficou documentado pelo próprio
  código de `AAAHudLayout`, `UISystem` e `hudLayout`.
- Relatórios brutos foram arquivados; os documentos vivos ficaram com resumos
  curtos e comandos de reprodução.
- Mockups PNG grandes sem uso em runtime saíram do repositório principal.

## Onde está o material histórico

- `docs/archive/2026-health-cleanup/README.md` resume o que foi movido ou
  removido.
- O acervo inclui o pacote histórico de migração, planos concluídos, trackers
  administrativos vencidos e relatórios antigos de validação/refatoração.

## Mantido de propósito

- SVGs usados em runtime por `shipModels` e `boss`.
- MP3s usados pelo sistema de áudio.
- Planos ativos em `docs/plans/`.
- Relatórios ativos em `docs/validation/` somente quando ainda são
  reproduzíveis.

## Próximos passos seguros

1. Repetir a mesma política para qualquer novo tooling local de IA: não
   versionar estado efêmero.
2. Revisar periodicamente se relatórios brutos voltaram para a árvore viva.
3. Avaliar se `assets/ui/HUD_layout_mockup.html` e
   `assets/ui/minimal-tactical-hud.svg` devem acompanhar o arquivo histórico de
   UI.
4. Avaliar limpeza retroativa de histórico binário apenas se o peso do git
   continuar relevante.
