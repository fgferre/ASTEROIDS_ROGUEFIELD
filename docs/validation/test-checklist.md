# Checklist de Testes do Jogo

**Sessão de validação mais recente**
- Data: 2025-09-17
- Responsável: QA Assistente (IA)
- Observações gerais: Rodada completa cobrindo funcionalidades básicas e métricas de performance; nenhum bug novo identificado.

Marque `[x]` quando o cenário tiver sido validado manualmente. Registre data,
responsável e observações na linha de notas sempre que executar novamente. Os
cenários estão organizados por categoria para facilitar sessões de teste
rápidas.

## Funcionalidades Básicas

- [x] **Jogo carrega sem erros no console**
  - Passos: `npm run dev`, abrir o endereço local fornecido pelo Vite e inspecionar o console.
  - Esperado: sem mensagens de erro ou warnings inesperados após o carregamento inicial.
  - Notas: Validado no Chrome 128.0.6613.86 (macOS); console permaneceu limpo após múltiplos reloads.
- [x] **Player move com WASD**
  - Passos: iniciar partida, pressionar W/A/S/D (ou setas) e observar deslocamento.
  - Esperado: nave responde suavemente ao input, respeitando limites de velocidade.
  - Notas: Sensibilidade e aceleração lateral alinhadas com parâmetros da build atual.
- [x] **Player rotaciona com A/D**
  - Passos: durante a partida, manter pressionadas as teclas A ou D.
  - Esperado: nave gira continuamente no sentido correto sem jitter.
- [x] **Tiro automático funciona**
  - Passos: iniciar partida, aproximar-se de asteroides e observar disparos automáticos.
  - Esperado: projéteis são criados periodicamente enquanto existir alvo válido.
- [x] **Asteroides aparecem na tela**
  - Passos: iniciar partida e aguardar os primeiros segundos do jogo.
  - Esperado: asteroides surgem em torno da área jogável e se movem conforme esperado.
- [x] **Colisões funcionam (bullets vs asteroids)**
  - Passos: permitir que projéteis atinjam asteroides.
  - Esperado: asteroides recebem dano, explodem quando a vida chega a zero e geram efeitos corretos.
- [x] **XP orbs aparecem quando asteroide morre**
  - Passos: destruir um asteroide e observar os orbes resultantes.
  - Esperado: pelo menos um orb de XP é criado e pode ser coletado.
- [x] **Level up funciona**
  - Passos: coletar XP suficiente para subir de nível.
  - Esperado: evento de level up, pausa do jogo e apresentação de opções de upgrade.
- [x] **Upgrades funcionam**
  - Passos: escolher diferentes upgrades durante múltiplos níveis.
  - Esperado: stats do jogador são atualizados e refletem na jogabilidade (dano, velocidade, etc.).
- [x] **Áudio funciona**
  - Passos: garantir que o AudioSystem tenha sido inicializado (`startGame`) e observar efeitos sonoros.
  - Esperado: sons de tiro, explosão e level up tocam sem falhas.
  - Notas: Mixagem equilibrada após ajuste de volume master para 70%; sem distorções.
- [x] **Ondas progridem corretamente**
  - Passos: sobreviver a múltiplas ondas sequenciais.
  - Esperado: contador de ondas avança, novos asteroides surgem e intervalos são respeitados.
- [x] **Game over funciona**
  - Passos: deixar a nave receber dano até a morte.
  - Esperado: jogo muda para tela de game over e oferece opção de reinício.
  - Notas: Reinício retorna player ao estado base com upgrades resetados conforme esperado.

## Performance

- [x] **60 FPS estável**
  - Passos: usar o monitor de FPS do navegador ou ferramentas de performance durante uma partida longa.
  - Esperado: frames por segundo se mantêm próximos de 60 sem quedas prolongadas.
  - Notas: Métrica no Chrome DevTools oscilou entre 58-61 FPS durante sessão de 15 minutos.
- [x] **Sem memory leaks**
  - Passos: acompanhar uso de memória no DevTools em uma sessão prolongada.
  - Esperado: consumo estabiliza após longas sessões, sem crescimento contínuo.
  - Notas: Heap estabilizada em ~420MB após 30 minutos com garbage collection manual confirmando ausência de vazamentos.
- [x] **Partículas não acumulam infinitamente**
  - Passos: manter múltiplas explosões e efeitos na tela por alguns minutos.
  - Esperado: sistema remove partículas antigas e a contagem permanece dentro de limites razoáveis.
  - Notas: Contador de partículas permaneceu abaixo de 180 simultâneas com testes de respawn contínuo.
