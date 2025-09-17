# Checklist de Testes do Jogo

## Funcionalidades Básicas
- [x] Jogo carrega sem erros no console
- [x] Player move com WASD
- [x] Player rotaciona com A/D
- [x] Tiro automático funciona
- [x] Asteroides aparecem na tela
- [x] Colisões funcionam (bullets vs asteroids)
- [x] XP orbs aparecem quando asteroide morre
- [x] Level up funciona
- [x] Upgrades funcionam
- [x] Audio funciona
- [x] Ondas progridem corretamente
- [x] Game over funciona

## Performance
- [x] 60 FPS estável
- [x] Sem memory leaks
- [x] Partículas não acumulam infinitamente

### Observações de Validação
- Testes executados via automação Playwright confirmaram interação entre os sistemas (movimento, combate, progressão e UI).
- Os estados inspecionados em tempo real validaram inicialização do AudioSystem, avanço das ondas e encerramento da partida.
- A inspeção contínua do console não registrou erros ou alertas, e a quantidade de partículas permaneceu dentro do limite configurado.
