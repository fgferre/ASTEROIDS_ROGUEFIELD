# Checklist de Testes do Jogo

Marque `[x]` quando o cenário tiver sido validado manualmente. Registre data,
responsável e observações na linha de notas sempre que executar novamente. Os
cenários estão organizados por categoria para facilitar sessões de teste
rápidas.

## Funcionalidades Básicas

- [ ] **Jogo carrega sem erros no console**
  - Passos: `npm run dev`, abrir o endereço local fornecido pelo Vite e inspecionar o console.
  - Esperado: sem mensagens de erro ou warnings inesperados após o carregamento inicial.
- [ ] **Player move com WASD**
  - Passos: iniciar partida, pressionar W/A/S/D (ou setas) e observar deslocamento.
  - Esperado: nave responde suavemente ao input, respeitando limites de velocidade.
- [ ] **Player rotaciona com A/D**
  - Passos: durante a partida, manter pressionadas as teclas A ou D.
  - Esperado: nave gira continuamente no sentido correto sem jitter.
- [ ] **Tiro automático funciona**
  - Passos: iniciar partida, aproximar-se de asteroides e observar disparos automáticos.
  - Esperado: projéteis são criados periodicamente enquanto existir alvo válido.
- [ ] **Asteroides aparecem na tela**
  - Passos: iniciar partida e aguardar os primeiros segundos do jogo.
  - Esperado: asteroides surgem em torno da área jogável e se movem conforme esperado.
- [ ] **Colisões funcionam (bullets vs asteroids)**
  - Passos: permitir que projéteis atinjam asteroides.
  - Esperado: asteroides recebem dano, explodem quando a vida chega a zero e geram efeitos corretos.
- [ ] **XP orbs aparecem quando asteroide morre**
  - Passos: destruir um asteroide e observar os orbes resultantes.
  - Esperado: pelo menos um orb de XP é criado e pode ser coletado.
- [ ] **Level up funciona**
  - Passos: coletar XP suficiente para subir de nível.
  - Esperado: evento de level up, pausa do jogo e apresentação de opções de upgrade.
- [ ] **Upgrades funcionam**
  - Passos: escolher diferentes upgrades durante múltiplos níveis.
  - Esperado: stats do jogador são atualizados e refletem na jogabilidade (dano, velocidade, etc.).
- [ ] **Áudio funciona**
  - Passos: garantir que o AudioSystem tenha sido inicializado (`startGame`) e observar efeitos sonoros.
  - Esperado: sons de tiro, explosão e level up tocam sem falhas.
- [ ] **Ondas progridem corretamente**
  - Passos: sobreviver a múltiplas ondas sequenciais.
  - Esperado: contador de ondas avança, novos asteroides surgem e intervalos são respeitados.
- [ ] **Game over funciona**
  - Passos: deixar a nave receber dano até a morte.
  - Esperado: jogo muda para tela de game over e oferece opção de reinício.

## Performance

- [ ] **60 FPS estável**
  - Passos: usar o monitor de FPS do navegador ou ferramentas de performance durante uma partida longa.
  - Esperado: frames por segundo se mantêm próximos de 60 sem quedas prolongadas.
- [ ] **Sem memory leaks**
  - Passos: acompanhar uso de memória no DevTools em uma sessão prolongada.
  - Esperado: consumo estabiliza após longas sessões, sem crescimento contínuo.
- [ ] **Partículas não acumulam infinitamente**
  - Passos: manter múltiplas explosões e efeitos na tela por alguns minutos.
  - Esperado: sistema remove partículas antigas e a contagem permanece dentro de limites razoáveis.

## Escudo Defletor

- [ ] Upgrade "Matriz de Deflexão" é oferecido e suas descrições evoluem corretamente.
- [ ] Tecla 'E' ativa o escudo, e o ícone na UI e a aura na nave refletem o estado "ativo".
- [ ] Escudo anula corretamente o número de impactos definidos pelo seu nível de upgrade.
- [ ] Aura visual do escudo diminui de espessura a cada impacto absorvido.
- [ ] Ao quebrar, o escudo inicia o cooldown e a UI exibe a animação de recarga.
- [ ] Tentar ativar o escudo durante o cooldown aciona o feedback de falha (som e visual).
- [ ] **(Nv. 5)** A quebra do escudo dispara a onda de choque visual e sonora.
- [ ] **(Nv. 5)** A onda de choque repele fisicamente os asteroides próximos.
- [ ] Todos os efeitos sonoros associados ao escudo são reproduzidos nos momentos corretos.
