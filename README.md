# ASTEROIDS_ROGUEFIELD

Jogo Roguelike inspirado nas mecânicas de Asteroids

## Build

Execute `npm run build` para gerar os arquivos finais em `dist/`.

## Formatação

Use `npm run format` para aplicar o Prettier localmente.
No CI, `npm run format:check` garante que os commits estejam formatados antes do build.

## Registro de Serviços (Fase 2.1)

- O jogo opera com **dois mecanismos em paralelo**:
  - `gameServices`: registro legado responsável por disponibilizar instâncias durante o gameplay.
  - `diContainer`: container criado em `src/app.js` através do `ServiceRegistry`, contendo placeholders que delegam para o Service Locator.
- Enquanto a Fase 2.2 não é ativada, registre novos sistemas **primeiro em `gameServices`** e mantenha o nome listado no `ServiceRegistry.setupServices` para garantir compatibilidade futura.
- Utilize `diContainer.replaceSingleton('nome', instancia)` apenas quando for necessário sincronizar manualmente um serviço recém-registrado com o container.
