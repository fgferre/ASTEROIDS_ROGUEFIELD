# Checklist de Validação

## Automação
- [ ] `npm test -- --run tests/integration/deterministic-systems.test.js`
- [ ] `npm test`

## Execução determinística (manual)
- [ ] Iniciar o jogo com uma seed conhecida, ex.: abrir `http://localhost:5173/?seed=1337` após rodar `npm run dev`.
- [ ] Confirmar nos logs do console que o bootstrap registrou a seed informada e que o guardião de `Math.random()` emite aviso caso algum módulo bypass o `RandomService`.
- [ ] Reiniciar a run (usar "Restart" ou recarregar com a mesma seed) e verificar que starfield, ondas iniciais e drops de orbes se mantêm idênticos.
- [ ] Documentar seeds usadas e resultados relevantes no relatório de validação ou anotações de QA.
