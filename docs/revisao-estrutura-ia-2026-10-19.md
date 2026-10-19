# Revisão da refatoração para desenvolvimento com IA — 19/10/2026

**Parecer: a direção está correta e houve melhora estrutural real.** A ampliação feita pelo Claude atende ao novo objetivo de produzir mais conteúdo. A revisão encontrou correções pontuais para tornar essa produção mais confiável; não encontrou motivo para desfazer a divisão ou iniciar outra reorganização geral.

Este documento substitui o diagnóstico de 18/10 como avaliação do estado atual. O relatório anterior permanece como histórico, com indicação desta revisão.

## Versão e alcance

- Código examinado: `ad7a8303112245943396b092519c53d3399e49ba`, na `main`, após a Rodada 0 do PR #280. HEAD permaneceu igual durante a análise e o gate. A comparação de tamanhos usa o diagnóstico anterior, correspondente ao estado de `73b72b2`.
- Inventário de fontes, histórico, mapa de imports, leituras dirigidas da composição, receitas, testes, ferramentas e contratos dos módulos. Não foi revisão linha a linha das centenas de arquivos alterados.
- Executei o gate completo, o validador de dependências e sondas pequenas somente em memória. Não alterei código, configuração, conteúdo do jogo, fixtures, planos ou backlog. Os únicos arquivos editados são estes relatórios; não fiz commit nem publicação.
- O Canvas antigo já está separado como museu estático. Sua remoção do código ativo é uma decisão de produto, não uma duplicação a ser reaberta nesta revisão.
- Não medi tokens de sessões reais nem repeti as medições de FPS do Claude. Não executei uma nova inspeção visual no navegador.

## 1. O que melhorou

| Medida                                                    | Diagnóstico anterior |  Agora |
| --------------------------------------------------------- | -------------------: | -----: |
| Arquivos JavaScript próprios em `src`, excluindo `public` |                  192 |    389 |
| Linhas, incluindo comentários e espaços                   |              101.905 | 99.097 |
| Arquivos com mais de 1.200 linhas                         |                   20 |      0 |
| CombatSystem                                              |                4.867 |    606 |
| UISystem                                                  |                4.516 |    964 |
| EffectsSystem                                             |                4.462 |    567 |
| SFXBus                                                    |                4.595 |  1.080 |
| EnemySystem                                               |                3.570 |  1.183 |
| GameSessionService                                        |                2.400 |  1.131 |
| enemyMirror                                               |                2.965 |    755 |
| Arquivos de teste                                         |                  161 |    182 |

O número de arquivos praticamente dobrou, enquanto o volume total de fontes caiu pouco. Isso não significa desperdício: 81 arquivos estão agora em `src/content`, incluindo o registro e um helper. Cartas, inimigos e outros itens pequenos podem ser localizados e editados individualmente. O ganho pretendido é **ler menos conteúdo irrelevante por tarefa**, não necessariamente reduzir todo o código do jogo.

A separação também vai além de mover métodos:

- [CombatSystem](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/CombatSystem.js:31) compõe mira, armas, projéteis, resolução de acertos e efeitos de cartas com callbacks e dados explícitos. Não repassa indiscriminadamente a classe antiga inteira.
- [UISystem](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/UISystem.js:125) monta controladores por tela. Configurações, cartas, pausa e fim de partida têm locais reconhecíveis.
- [EffectsSystem](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/EffectsSystem.js:54) mantém a coordenação e entrega capacidades específicas aos efeitos por assunto.
- Áudio ganhou famílias de sons e dados próprios; deixou de concentrar temas musicais no agregador geral de constantes.
- O caminho legado de ondas identificado antes foi removido: as antigas opções e funções de conciliação não aparecem mais em `src` e testes. O [WaveManager](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/enemies/managers/WaveManager.js:1) coordena camadas e delega assuntos para os módulos de ondas.
- Os mapas de fontes e testes foram atualizados. O seletor de testes agora segue imports transitivos e o `import.meta.glob` literal usado pelo catálogo.

A análise sintática dos imports/reexports locais estáticos, incluindo a expansão do glob do registro, não encontrou ciclos de execução entre os 389 arquivos. Isso não significa ausência de relações circulares por callbacks ou eventos.

O teto de 1.200 linhas é uma proteção contra nova concentração. Seu cumprimento não prova sozinho que uma extração ficou boa; os contratos explícitos acima são evidência mais relevante.

## 2. A fábrica de conteúdo é uma boa ampliação do escopo

O [registro](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/content/registry.js:7) descobre arquivos automaticamente. Para inimigos, isso alimenta [pools](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/core/GamePools.js:70), [registro de tipos](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/enemies/base/enemyTypeRegistry.js:37), seleção por papel, apresentação e outras integrações. Armas geram sua carta a partir da definição de conteúdo.

Os testes [newEnemyRole](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/tests/content/newEnemyRole.test.js:60) e [newWeapon](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/tests/content/newWeapon.test.js:58) exercitam itens adicionais. Passaram nesta revisão. A demonstração manual Lancet/Needle Array mencionada no plano não foi repetida; o ramo dessa demonstração já foi removido.

**A promessa precisa conservar a condição que o próprio CONTENT.md já registra:** um novo item pode ser um arquivo quando combina capacidades existentes. Um novo comportamento, padrão de tiro, estratégia de movimento ou mecânica de chefe exige trabalho no motor. Um papel de inimigo que nenhuma camada solicita também requer ajustar a camada.

Essa distinção é saudável. O catálogo atual permite variedade dentro de uma biblioteca; ele não promete que qualquer ideia futura dispense programação. Não recomendo antecipar uma arquitetura para toda mecânica imaginável. Acrescentar capacidades conforme o conteúdo realmente as exigir mantém o custo sob controle.

## 3. Correções recomendadas antes de expandir o catálogo em volume

### 3.1. Validar limites e combinações das receitas, além dos tipos — prioridade alta para a expansão

Os testes de inimigos já conferem muitas coisas úteis: nomes de comportamento, conjunto exato de parâmetros, tipos, escopos de random, efeitos, sons e cadastro. Porém números apenas finitos ainda podem produzir um comportamento inválido.

**Reprodução concreta:** copiei em memória os parâmetros de `fan-shot` do Shade e alterei somente `shots` de 3 para 1. Todos os tipos declarados pelo comportamento continuaram válidos. A execução produziu:

```text
allDeclaredParameterTypesPass: true
enemy-fired: angle=NaN, vx=NaN, vy=NaN
```

A causa é [a divisão por `shots - 1`](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/enemies/behaviors/fanShot.js:30). O [validador atual](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/tests/content/enemies.test.js:82) verifica tipo numérico finito, sem restringir esse valor. O Shade publicado usa 3 tiros; esta sonda não demonstra regressão no conteúdo atual. Demonstra uma armadilha na biblioteca agora oferecida como reutilizável.

Outro exemplo por inspeção: `movement.strategy` é validado apenas como string, e [um nome desconhecido cai silenciosamente em `linear`](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/enemies/components/MovementComponent.js:408). Um erro de digitação pode criar um inimigo que se move de modo diferente do solicitado.

**Pedido ao Claude:** decidir se um tiro é uma combinação suportada ou se o contrato deve exigir pelo menos dois; testar o limite escolhido. Validar nomes de estratégia contra o catálogo existente e acrescentar restrições semânticas onde houver necessidade demonstrada. Não é necessário instalar uma biblioteca de schemas nem construir um segundo registro. Esses checks podem continuar nos contratos de conteúdo e nos testes já existentes.

### 3.2. O mapa automático ainda não entende o registro novo — prioridade alta para a confiabilidade da ferramenta

Executei o equivalente ao script `validate:deps`:

```text
node scripts/analyze-dependencies.js --validate-only
exit code: 1
Dependency issues detected:
cycles: []
orphans: [src/content/biomes/outer-ring.js,
          src/content/cards/phase_dash.js,
          src/content/enemies/drone.js, ...]
```

O [analisador](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/scripts/analyze-dependencies.js:176) procura imports explícitos por regex; não expande o glob que carrega os itens. Por isso denuncia como órfãos muitos arquivos ativos. A correção anterior de criar a pasta de saída do Mermaid foi feita, mas não resolve esta nova limitação.

**Impacto para IA:** uma ferramenta de faxina que identifica conteúdo vivo como abandonado pode orientar uma próxima rodada para uma conclusão errada. Os arquivos citados acima não são candidatos a exclusão por esse resultado.

**Pedido ao Claude:** fazer analisador e seletor concordarem sobre os imports que o projeto realmente usa, aproveitando o entendimento de glob já existente em `tocados`. Testar conteúdo carregado pelo registro e um arquivo realmente órfão. Não mascarar o problema ignorando indiscriminadamente a pasta de conteúdo.

### 3.3. Corrigir uma instrução que gera trabalho errado — pequena, mas diretamente ligada ao custo das rodadas

O [CONTENT.md](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/CONTENT.md:123) manda achar a maior ordem usando linhas como `order: 10` com `sort -n`. O número não está no início da linha: a ordenação não compara corretamente o valor depois de `order:`.

Reprodução com as declarações atuais e o comando de ordenação indicado:

```text
inimigos: maior order real = 10; última linha da ordenação indicada = order: 9
cartas:   maior order real = 41; última linha da ordenação indicada = order: 7
```

**Pedido ao Claude:** corrigir a instrução para extrair o número antes de ordenar e continuar considerando as cartas que vivem nas armas. Não precisa de uma ferramenta nova. O teste de unicidade tende a detectar a colisão depois, mas uma instrução correta evita a tentativa desperdiçada.

## 4. O que ainda pode custar contexto, sem justificar outra grande refatoração

### Seleção de testes conservadora e muito ampla

Consultei `buildGraph` e `selectTests` sem executar suítes adicionais. Uma mudança isolada em cada um destes arquivos seleciona **154 dos 182 arquivos de teste**: Drone, Scatter, Phase Dash ou Outer Ring.

Isso decorre principalmente do registro único e eager: todos os consumidores importam o mesmo módulo, que importa todos os tipos de conteúdo. A seleção agora é mais segura que a anterior, mas uma edição pequena pode continuar quase tão cara de validar quanto o jogo inteiro.

Também encontrei referências JSDoc, como `import('../SFXBus.js').SfxKit`, sendo interpretadas pelo seletor como imports de execução. Elas criaram ciclos aparentes no grafo do seletor; a análise sintática confirmou que esses ciclos não existem no código executável.

**Recomendação:** manter o gate completo ao final e medir o custo nas próximas rodadas. Se for relevante, melhorar a precisão do seletor antes de dividir o registro só para reduzir testes. Um módulo comum para acessar o conteúdo tem valor; não há motivo para desfazer essa escolha com base apenas no número de testes selecionados.

### Dependências entre assuntos continuam existindo

Mira, armas, projéteis e cartas se consultam através dos contratos do compositor. Essa interdependência faz parte do combate. Alguns pontos ainda atravessam internals: [HitResolution lê `rewardManager`](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/combat/HitResolution.js:86) e chama sua criação de orbes. A extração mudou o endereço desse acoplamento, não o eliminou.

Recomendo encapsular esses pontos quando uma alteração real voltar a atravessá-los. Não remover todas as fachadas ou callbacks só porque eles aumentam a contagem de métodos. Eles preservam nomes conhecidos e permitem ler uma área por vez.

### Mapa útil, mas evitar carregar tudo em toda sessão

O mapa de fontes tem aproximadamente 34 KB, incluindo a tabela com bastante preenchimento, e `CONTENT.md`, 15 KB. Isso não é uma medição de tokens. O mapa já recomenda busca e leitura por trechos: seguir essa orientação importa mais que acrescentar documentação.

Para uma nova carta, a entrada deve ser a seção de cartas, uma carta semelhante e o contrato relevante. Para uma nova mecânica, o caminho deve se expandir até os módulos afetados. O teto de linhas não deve se transformar em obrigação de abrir todos os arquivos pequenos.

## 5. O que a validação prova — e o que não prova

Executei `npm run done` **uma vez**, na arquitetura `arm64`, com HEAD estável:

| Verificação  | Resultado                                                      |
| ------------ | -------------------------------------------------------------- |
| ESLint       | Passou                                                         |
| Prettier     | Passou                                                         |
| Vitest       | 182 arquivos; 1.522 testes passaram                            |
| Golden trace | Incluído na suíte; comparação com fixture na mesma arquitetura |
| Build Vite   | Passou; 393 módulos transformados                              |

A suíte reportou 37,01 s; o gate levou aproximadamente 46 s. Houve avisos de `--localstorage-file` sem caminho válido e de bundle principal acima de 500 KB; não impediram o gate. O validador de dependências, que **não faz parte de `done`**, falhou como descrito no achado 3.2.

O golden trace é uma melhoria substancial para refatoração: compara 21 cenários de 60 segundos simulados, com hashes de estado e eventos. Há limites importantes para interpretar o resultado:

- O [harness](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/tests/__helpers__/headlessGame.js:1) substitui UI e áudio e não renderiza o jogo. O trace não comprova equivalência visual, sonora ou FPS.
- O [registro de eventos](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/tests/integration/golden-trace.test.js:158) guarda nomes; não todos os payloads. O estado hashado também é uma seleção, não todo o estado interno.
- Em arquitetura de CPU diferente da fixture, o [teste compara duas execuções atuais](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/tests/integration/golden-trace.test.js:266), conforme documentado no código. Isso verifica repetibilidade naquele ambiente, mas não equivalência com a versão anterior.
- A frase do plano de que toda fatia manteve a fixture intacta precisa de precisão: no commit `21de1fb`, mudou um hash de eventos de Harmonic e um de Scatter. Os hashes de estado desses cenários permaneceram iguais. Isso é compatível com a mudança de eventos das armas, mas não com uma afirmação literal de fixture intocada.

Esses limites não invalidam os testes. Apenas impedem transformar um resultado verde em garantia de equivalência de tudo. Eu preservaria a suíte e a política de só atualizar expectativas por mudança intencional, explicando as exceções no commit.

## 6. Encaminhamento sugerido ao Claude

> Reanalise esta revisão sobre o commit ad7a830. A divisão por responsabilidade e o cadastro de conteúdo foram considerados avanços reais; preserve essa direção. Confira primeiro os achados reproduzidos: fan-shot com um tiro gera NaN, o analisador acusa conteúdo carregado por glob como órfão e o comando de próxima ordem em CONTENT.md retorna o valor errado. Proponha correções pequenas com testes adequados, sem nova reorganização geral, sem mudar balanço e sem regenerar o golden trace para esconder divergências. Depois avalie se o custo de selecionar 154/182 suítes merece otimização. Diferencie claramente adicionar uma receita de implementar uma mecânica inédita. Ao explicar a preservação de comportamento, respeite os limites do trace e a alteração intencional de eventos em 21de1fb.

Minha recomendação para a próxima rodada é corrigir esses pontos e usar a estrutura em conteúdo real, observando quantos arquivos a IA precisa ler, quanto retrabalho ocorre e qual o consumo efetivo. **A arquitetura já está pronta para ser exercitada; outra rodada ampla de divisão, antes dessa experiência, tem retorno incerto.**
