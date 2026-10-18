# Análise estrutural para desenvolvimento com IA — 18/10/2026

**Parecer:** vale fazer uma refatoração localizada. A base tem uma arquitetura reconhecível e várias boas separações, mas alguns arquivos concentram responsabilidades e mudanças demais. O maior ganho provável vem de tornar a localização de código confiável, reduzir o contexto necessário por funcionalidade e encerrar sobreposições específicas. Não há evidência que justifique uma reescrita geral.

Análise solicitada pelo dono, sem implementação. Este relatório é o único arquivo criado por esta análise. Não alterei código, configurações, planos ou backlog; não fiz commit ou publicação.

## Escopo e limites

- Fotografia levantada durante a sessão no checkout local em `main`, com HEAD inicial `dc56ef1`. Revisado em 18/10 por uma segunda sessão, com HEAD `1de2685`: o congelamento do 2D como easter egg já está mesclado (PR #262), os tamanhos e contagens abaixo foram reconferidos e continuam iguais, e os achados foram checados no código. As correções estão incorporadas ao texto, sem marcação.
- Inventário dos arquivos, tamanhos, imports estáticos, histórico de mudanças e leituras dirigidas dos sistemas principais, infraestrutura, documentação e ferramentas. Não foi uma revisão linha a linha de todo o jogo.
- Contagens incluem comentários e linhas vazias. Bibliotecas e assets de `src/public/`, dependências instaladas e build foram excluídos das métricas de JavaScript próprio.
- Não foram analisados registros de consumo da ferramenta de IA. Tamanho e frequência de mudança são indicadores de custo de contexto, não medição de tokens ou de economia financeira.
- Na revisão, o portão completo (`npm run done`) foi executado na `main`: passou, 161 arquivos e 1.140 testes, 35 segundos no Mac do dono. Isso certifica que o ponto de partida está verde; não certifica desempenho nem ausência de bugs de render, porque o portão não abre o navegador (achado G).

## 1. O que os números mostram

| Indicador                              |                                    Fotografia local |
| -------------------------------------- | --------------------------------------------------: |
| Arquivos JavaScript próprios em `src`  |                                                 192 |
| Linhas nesses arquivos                 |                                             101.905 |
| Arquivos acima de 1.000 linhas         |                                                  23 |
| Linhas concentradas nesses 23 arquivos |                                      58.510 — 57,4% |
| Arquivos acima de 4.000 linhas         |                                                   4 |
| Linhas nesses quatro                   |                                      18.440 — 18,1% |
| Arquivos de teste                      | 161, incluindo o teste local da rodada em andamento |

Os principais candidatos não são apenas grandes: acumulam assuntos diferentes e recebem mudanças recorrentes.

| Arquivo                                                                                               | Linhas | Assuntos hoje reunidos                                                            | Direção recomendada                                                                 |
| ----------------------------------------------------------------------------------------------------- | -----: | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [UISystem.js](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/UISystem.js:94)                  |  4.516 | Telas, configurações, controles, HUD, cartas, Hangar, Códice, falas               | Separar por tela ou responsabilidade, aproveitando a pasta de UI existente          |
| [SFXBus.js](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/audio/SFXBus.js:577)               |  4.595 | Infraestrutura de áudio, síntese de dezenas de sons, motores, interface, máquinas | Separar famílias de sons da infraestrutura comum                                    |
| [CombatSystem.js](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/CombatSystem.js:89)          |  4.867 | Seleção de alvo, previsão, armas, projéteis, efeitos de cartas, dano, desenho     | Separar mira, armas/projéteis e efeitos de upgrades, preservando o contrato externo |
| [EffectsSystem.js](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/EffectsSystem.js:147)       |  4.462 | Eventos, tempo de jogo, tremor, telegraphs, partículas e efeitos por inimigo      | Separar efeitos por assunto; distinguir efeitos ativos do legado congelado          |
| [enemyMirror.js](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/render3d/enemyMirror.js:1398) |  2.965 | Construção e atualização visual de vários inimigos, chefes, afixos e rochas       | Separar famílias visuais mantendo recursos compartilhados centralizados             |

Existem outros arquivos grandes, como `MenuBackgroundSystem.js` (3.864), `EnemySystem.js` (3.570), `WaveManager.js` (2.871) e `GameSessionService.js` (2.400). Não recomendo dividir todos de uma vez: tamanho sozinho não estabelece prioridade.

Há evidência de crescimento recente. Comparando o último commit anterior a 17/10 UTC (`9183e82`, de 16/06) com a fotografia atual:

| Arquivo            | Antes | Agora |
| ------------------ | ----: | ----: |
| `UISystem.js`      | 3.016 | 4.516 |
| `SFXBus.js`        | 2.486 | 4.595 |
| `CombatSystem.js`  | 3.704 | 4.867 |
| `EffectsSystem.js` | 4.132 | 4.462 |
| `EnemySystem.js`   | 3.999 | 3.570 |

No intervalo, entre commits sem merge, `UISystem.js` aparece em 43 commits; `CombatSystem.js` e `enemyMirror.js`, em 21 cada; `SFXBus.js`, em 14; `EffectsSystem.js`, em 12. UI é o arquivo em que dividir mais reduz conflito entre sessões e releitura por tarefa. SFXBus é o que mais cresceu com menos commits: mudanças grandes e mecânicas, famílias de sons inteiras de cada vez, o que o torna o piloto mais barato (seção 5). A redução de `EnemySystem.js` também mostra que já houve trabalho de organização: o crescimento não é uniformemente desordenado.

## 2. O que já funciona e deve ser preservado

- **Composição centralizada:** o [manifesto de serviços](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/bootstrap/serviceManifest.js:260) descreve a montagem do jogo. `ServiceRegistry`, `DIContainer` e `bootstrapServices` têm papéis complementares: registrar, resolver dependências e inicializar. Não são três implementações independentes da mesma arquitetura.
- **Dados separados:** inimigos, upgrades, armas, biomas e camadas já têm definições próprias. O [catálogo de upgrades](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/data/upgrades/index.js:1) é um exemplo de agregação simples que deve continuar existindo.
- **Subdomínios reconhecíveis:** há pastas para inimigos, áudio, UI e renderização 3D. Não é necessário reorganizar todas as pastas para obter ganho.
- **Base compartilhada:** `BaseSystem`, `serviceUtils`, `RandomService` e o EventBus já oferecem mecanismos comuns. O caminho é completar e esclarecer seu uso, não criar outra infraestrutura concorrente.
- **Imports estáticos sem ciclos detectados:** a análise sintática dos 192 arquivos não encontrou componentes cíclicos entre imports/reexports locais estáticos. Isso é positivo; não exclui relações circulares em runtime através de serviços e eventos.
- **Proteções existentes:** testes por comportamento, cenários de integração, replay/determinismo, lint e o gate final já dão uma base para refatorações graduais. A quantidade de testes não comprova cobertura suficiente de cada extração.

## 3. Achados prioritários

### A. O mapa de entrada não acompanha o código

O [README de fontes](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/README.md:39) orienta a consultar planos ativos em `docs/plans/`. Porém o [plano mestre nessa pasta](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/docs/plans/architecture-master-plan.md:1) avisa que descreve uma fase anterior e aponta para o plano da raiz. Seu corpo ainda propõe migrações que já aconteceram, como extrair o serviço de sessão e consolidar o bootstrap.

O [README de testes](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/tests/README.md:5) declara 45 arquivos e lista 45 entradas, uma delas já inexistente; a fotografia local tem 161. Faltam pastas inteiras no inventário: `render3d` (18 testes), `ui` (13), `data` (6), `unit` (3), `process` (2). Ele ainda cita um `agents.md §5.1` que não existe. O README de fontes tem só duas referências a número de linha, as duas erradas. Fora dos READMEs, o cabeçalho de `PLAN.md` diz «Rodada 12 em curso» quando as rodadas 12 e 13 parcial já estão na `main`, e pelo menos três linhas de `BACKLOG.md` descrevem coisas já feitas (a discrepância de contagem e a semente do diretor, fechadas em R13.5; o controlador de intensidade da música, removido).

**Consequência:** uma IA pode investigar um problema arquitetural já resolvido ou não encontrar o teste relevante. Isso gera releitura e trabalho errado, mesmo com código bem separado.

**Recomendação:** atualizar os índices existentes para servirem como mapa por tarefa: assunto → ponto de entrada → dependências importantes → testes. Inventários e contagens envelhecem em semanas; o mapa aponta pastas e nomes, nunca números de linha nem totais. O README de testes vira uma página curta: como os testes se organizam por domínio e como escolher os de um assunto. Planos antigos podem continuar como histórico, claramente fora da rota de entrada. Não é necessário acrescentar outro grande documento de arquitetura nem carregar todos os planos em cada sessão.

O `AGENTS.md` já é curto, com 48 linhas. Eu manteria esse papel: regras essenciais e indicação do mapa, sem transformar instruções globais em manual do jogo. O alinhamento sobre o destino do 2D pertence à rodada que já está em andamento.

### B. As extrações existentes ainda deixam trabalho demais nos arquivos centrais

`UISystem` já usa vários módulos de UI, mas ainda mantém 133 métodos. A atualização do HUD ocupa cerca de 266 linhas em [um método](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/UISystem.js:1454), e a conexão de eventos ocupa cerca de 324 linhas em [outro](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/UISystem.js:1724). Configurações, cartas e telas continuam passando pela mesma classe.

Em combate, [seleção/disparo](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/CombatSystem.js:609), [acerto e dano](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/CombatSystem.js:3096), [fragmentação especial](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/CombatSystem.js:3595) e [desenho](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/CombatSystem.js:4426) convivem na mesma classe.

**Consequência:** uma alteração pequena frequentemente exige compreender estado compartilhado com assuntos que não serão alterados. Também aumenta a disputa pelos mesmos arquivos quando várias IAs trabalham.

**Recomendação:** extrações por responsabilidade, começando por uma fatia delimitada de UI ou por uma família de sons. Cada módulo deve receber apenas os dados e serviços de que precisa. Mover métodos para outro arquivo e passar a classe inteira como `this` apenas distribui o mesmo acoplamento.

O [plano atual](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/PLAN.md:90) já contém R13.8 para arquivos grandes. Estas recomendações refinam essa intenção; não justificam abrir um segundo plano concorrente. Acrescentaria `enemyMirror` à avaliação conforme novas máquinas forem sendo desenvolvidas.

### C. Há duas autoridades sobre partes das ondas e do nascimento de inimigos

A opção [WAVEMANAGER_HANDLES_ASTEROID_SPAWN](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/data/constants/gameplay.js:298) está em `false`. O gerenciador [filtra asteroides para o caminho legado](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/enemies/managers/WaveManager.js:455), o [sistema de nascimento](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/enemies/systems/EnemySpawnSystem.js:377) mantém contabilidade condicionada a esse caminho, e a [sessão](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/services/GameSessionService.js:782) participa da partida dos asteroides. A conclusão da camada precisa consultar [pendências do caminho legado](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/enemies/managers/WaveManager.js:1556).

A opção tem ainda uma segunda porta: o gerenciador consulta uma sobrescrita em `globalThis` antes da constante, mas os outros quatro leitores (`app.js`, a sessão, `EnemySpawnSystem` e `EnemyUpdateSystem`) leem a constante direto e ignoram a sobrescrita. Ligar a opção por essa porta, num teste ou no console, deixa o jogo em estado misto.

**Consequência:** para entender quantos inimigos faltam ou quem inicia uma camada, é necessário atravessar mais de um dono de estado. Este é um caso concreto de sobreposição estrutural, independente da escolha entre 2D e 3D.

**Recomendação:** reservar uma etapa própria para estabelecer uma autoridade sobre agendamento e contabilidade, mantendo separada a construção física dos inimigos. Não basta inverter a opção: a mudança exige comparar sequência de spawns, fragmentação, chefes, modo infinito, reset e replay. O caminho legado ainda executa trabalho real; não deve ser tratado como código morto.

### D. As dependências reais nem sempre aparecem no manifesto

O serviço de física [declara apenas o barramento de eventos](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/bootstrap/serviceManifest.js:428). A fábrica no manifesto ainda lê `resolved['enemies']`, mas o registro só preenche `resolved` com as dependências declaradas; esse valor é sempre indefinido, e o caminho vivo é a resolução tardia dentro do próprio sistema, repetida a cada frame enquanto o serviço não aparece. Efeitos são obtidos no primeiro uso. O [próprio código explica](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/PhysicsSystem.js:878) a necessidade de ordem de inicialização e o caso legítimo de testes sem efeitos; o ramo morto no manifesto não tem explicação e deve sair.

Há acesso direto por dependências injetadas, helpers comuns, caches e resolução tardia; a sessão também mantém [um mapa de aliases](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/services/GameSessionService.js:1429). Isso não equivale a múltiplos contêineres, mas dificulta enxergar o contrato completo olhando apenas um arquivo.

Também há acoplamento que ultrapassa esse mecanismo: combate consulta dados internos de recompensas e [reconstrói parte do processo de fragmentação](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/CombatSystem.js:3595).

**Recomendação:** diferenciar dependência obrigatória, opcional e tardia; manter um caminho comum para cada caso e explicar as exceções no ponto de uso. Na extração do combate, deixar nascimento, registro e recompensas sob responsabilidade do domínio de inimigos, através de operações pequenas. Não converter todos os relacionamentos em eventos nem adicionar outro resolvedor.

### E. Aleatoriedade e configuração precisam de organização seletiva

O gerador seeded é comum, mas existem mecanismos próprios para guardar, criar e restaurar escopos: [BaseSystem](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/core/BaseSystem.js:167), [EnemySystem](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/EnemySystem.js:417), WaveManager e helpers de random. Parte disso tem funções distintas; não foi demonstrado que tudo seja duplicação dispensável.

`GameConstants` também combina reexports de definições especializadas com centenas de linhas de conteúdo de áudio, incluindo [temas musicais](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/core/GameConstants.js:239). É importado por 39 arquivos no grafo estático.

**Recomendação:** manter dados de áudio junto de seu domínio e conservar agregadores pequenos quando forem úteis. Consolidar somente operações de random cuja equivalência esteja comprovada; nomes de escopo e ordem dos sorteios fazem parte do comportamento dos replays. Não fazer uma substituição geral só para uniformizar estilo.

### F. As ferramentas de navegação e teste têm limites que atrapalham a faxina

O gerador de grafo [grava arquivos](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/scripts/generate-mermaid-graph.js:211) em `docs/architecture/` sem criar a pasta, que não existe; `npm run analyze:deps` termina em erro, e sua primeira etapa deixa dois arquivos não ignorados na raiz. O analisador usa regex e descreve imports; não representa dependências tardias nem eventos. Merece um conserto mínimo (criar a pasta, ignorar os artefatos), não investimento: para a IA, um mapa por assunto rende mais que um grafo de imports.

O seletor [test:tocados](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/scripts/tocados.mjs:54) tem três falhas que o desqualificam como portão de iteração. Só vê imports diretos dos arquivos de teste: uma mudança num módulo usado através de `tests/__helpers__/headlessGame.js` não seleciona os cenários que dependem dele, e caminhos passados a `vi.mock()` não contam. Compara com `HEAD`: depois de um commit informa «nada tocado» e não roda nada, justamente no fluxo de um commit por tarefa. E quando um arquivo de `src` não tem teste direto, imprime «unguarded» e roda só os testes de processo. Nas três situações o portão passa sem ter testado a mudança.

O portão completo tem outro custo escondido: sua saída tem cerca de 456 mil linhas, quase todas registros do jogo impressos pelos testes (o logger de debug imprime cada evento, e nada o silencia sob teste). Uma IA que leia essa saída sem filtrar gasta mais contexto do que a tarefa inteira, e o filtro é reinventado a cada sessão.

**Recomendação:** consertar o seletor antes de qualquer sequência de extrações: comparar com a base do ramo (`merge-base` com `main`) mais a árvore de trabalho; seguir a cadeia de imports de `src` até os testes, uma busca em largura sobre o grafo que o analisador já extrai; contar `vi.mock()`. Silenciar a saída de console dos testes na configuração do Vitest, ou desligar o logger de debug sob teste, para que o portão imprima só falhas e o resumo. A seleção transitiva importa especialmente quando novos módulos são introduzidos atrás de uma fachada já testada. O gate completo continua necessário ao final das mudanças de código; não há necessidade de trocar o framework de testes.

### G. O que toda rodada repete não está no repositório

A regra «mudança visual termina com captura» e a sonda de erros de runtime antes de mesclar na `main` dependem de Playwright, mas não há script, dependência nem comando para isso no repositório (busca por playwright, chromium e screenshot em `scripts/`, `tests/` e `package.json`: nenhum resultado). A sonda vive como trecho de doze linhas dentro do BASTÃO, escrita para o contêiner da nuvem; o ajuste para esta máquina (servidor só em IPv6, Playwright instalado globalmente, caminho do Chromium) vive na memória privada de uma IA. Cada sessão nova, e cada subagente, redescobre isso. Na última vez custou três execuções falhas antes da primeira captura.

**Consequência:** o passo de verificação visual, que deveria ser o mais barato da iteração, é o mais caro em tentativas, e tende a ser pulado.

**Recomendação (decisão do dono, 18/10):** sem dependência nova. Nesta configuração a sessão principal tem um navegador embutido que abre o jogo, captura a tela e lê o console; a captura e a sonda ficam com ela, antes de dizer que algo está pronto e antes de mesclar na `main`. Os scripts Playwright (`scripts/probe.mjs`, `scripts/capture.mjs`) ficam anotados no `BACKLOG.md` para quando houver sessão na nuvem ou automação, onde não existe navegador embutido.

### H. Uma regra do AGENTS.md já virou exceção

A armadilha «dev mode é um só interruptor, `IS_DEV`» tem três exceções no código: `app.js`, `AudioSystem.js` e `debugLogging.js` usam `isDevEnvironment()` de `GameDebugLogger`. O próprio AGENTS.md pede que uma regra que pode virar verificação vire verificação. Uma regra de lint proibindo essa importação fora de `env.js`, ou fazer `isDevEnvironment` delegar a `IS_DEV`, custa minutos e libera a linha da armadilha.

## 4. Como deveria ser a navegação de uma próxima rodada

O mapa curto deve encaminhar pelo pedido do dono, sem exigir leitura integral do sistema. Exemplo baseado nos pontos de entrada atuais:

| Pedido                             | Onde começar                                                                                         | Expansão necessária                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Mudar uma carta                    | [Catálogo de upgrades](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/data/upgrades/index.js:1)      | Sistema que aplica aquele efeito e seu teste de comportamento                         |
| Mudar uma arma                     | [Definições de armas](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/data/weapons.js:1)              | Combate, apresentação 3D e testes da arma                                             |
| Criar uma máquina                  | [Exemplo Leech](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/modules/enemies/types/Leech.js:1)     | Dados, registro, pool, apresentação e integrações de áudio/Códice que o pedido exigir |
| Mudar uma configuração             | [Schema de configurações](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/data/settingsSchema.js:1)   | Painel e sistema que consome a opção                                                  |
| Mudar duração/composição de camada | [Definições de camadas](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/data/layers.js:1)             | Agendamento, contabilidade e cenários de integração                                   |
| Investigar início, morte ou retry  | [Serviço de sessão](/Users/fgferre/Github/ASTEROIDS_ROGUEFIELD/src/services/GameSessionService.js:1) | Eventos, snapshot, replay e tela envolvida                                            |

Uma máquina nova naturalmente envolve mais de um arquivo: comportamento, aparência e som têm motivos para serem separados. O objetivo é saber quais são esses lugares, não comprimir a funcionalidade inteira em um arquivo ou criar um registro universal para todos os domínios.

Nas leituras, procurar primeiro símbolos, imports e eventos específicos; abrir trechos e ampliar conforme a dependência exigir. Isso já reduz desperdício antes de qualquer refatoração. Bibliotecas empacotadas, documentação histórica e arquivos grandes não precisam entrar automaticamente no contexto de toda tarefa.

Quem mais precisa do mapa não é a sessão principal: são os subagentes, que começam sem contexto e hoje gastam a primeira parte de cada tarefa procurando. O mapa vive em `src/README.md` e entra no brief de cada worker como três linhas (entrada, dependências, testes).

## 5. Ordem de execução recomendada, se aprovada depois

| Ordem | Trabalho                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Ganho esperado                                                                                                                                 | Risco relativo                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1     | Base da iteração: (a) consertar o seletor de testes (base do ramo, transitivo, `vi.mock`); (b) criar a pasta e ignorar os artefatos do grafo; (c) captura e sonda pela sessão principal com o navegador embutido do Claude Code, sem dependência nova (os scripts Playwright ficam no backlog para sessões na nuvem); (d) `src/README.md` vira o mapa por assunto da seção 4 e `tests/README.md` vira página curta sem inventário; (e) cabeçalho do `PLAN.md` e linhas já feitas do `BACKLOG.md`; (f) lint para o interruptor de dev e remoção do ramo morto do manifesto; (g) silenciar o console dos testes para o portão imprimir só falhas e o resumo | Cada iteração começa sabendo onde ir e termina com verificação confiável                                                                       | Baixo: só ferramentas e documentos, tudo mecânico, cabe em workers no modelo barato |
| 2     | Piloto: `SFXBus`. Extrair famílias de sons (motores, interface, máquinas) para módulos em `src/modules/audio/`, deixando no barramento só a infraestrutura; mover os dados de áudio de `GameConstants` para o domínio de áudio no mesmo passo                                                                                                                                                                                                                                                                                                                                                                                                             | Validar o padrão de extração no caso mais mecânico: funções quase puras sobre o contexto de áudio, com os testes de áudio existentes como rede | Baixo a moderado; worker no modelo barato com brief fechado                         |
| 3     | `UISystem`, com o padrão validado: uma tela ou responsabilidade por fatia (HUD, configurações, cartas, Hangar e Códice), cada módulo recebendo só o que usa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | É o arquivo mais alterado: menos conflito entre sessões e menos releitura por tarefa de UI                                                     | Moderado; worker no modelo intermediário, captura por fatia                         |
| 4     | `CombatSystem` (mira, armas e projéteis, efeitos de cartas) e famílias visuais de `enemyMirror`; `EffectsSystem` só na parte ativa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Menos concentração nos arquivos de gameplay                                                                                                    | Moderado a alto; worker no modelo intermediário, cenários de integração e replay    |
| 5     | Autoridade das ondas; depois repetição nos escopos de random                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Um dono por estado; menos caminhos paralelos para raciocinar                                                                                   | Alto; exige comparar sequência de spawns e replays                                  |

Uma fatia por vez, com comportamento preservado. Não misturar extração estrutural com ajuste de dano, spawn, efeitos, áudio ou sensação. Para cada fatia, usar testes do comportamento afetado e o gate final; captura e execução no navegador quando o caminho visual for envolvido. Ajustes de balanço continuam dependendo do dono jogando.

**Forma de cada iteração do modo de meta**, para que o custo de uma rodada seja previsível: a sessão principal escolhe o próximo item do `PLAN.md` e escreve um brief com as três linhas do mapa; um worker executa e roda `npm run gate`; a sessão principal lê `git diff --stat` e os trechos relevantes, manda rodar `npm run done` (só falhas voltam), roda a captura quando a mudança é visual e faz um commit no ramo com a linha do plano marcada. O que a sessão principal lê por iteração é o brief, o resumo, o diff e a captura; nunca um arquivo grande inteiro. Isso só funciona depois da etapa 1: hoje o seletor pode passar sem testar e a captura é redescoberta a cada sessão.

Evitaria nesta faxina: trocar linguagem/framework/engine, introduzir ECS ou arquitetura de plugins, renomear todas as pastas, criar outro barramento, transformar cada função em arquivo, expandir manuais obrigatórios e mexer na rodada do easter egg. Dividir por limite arbitrário de linhas pode aumentar o número de arquivos que a IA precisa abrir.

## 6. Como verificar se o investimento compensou

O aplicativo mostra o consumo de cada sessão. Registrar por iteração, numa linha do `PLAN.md` ou do commit: item do plano, tokens da sessão principal, tokens dos workers, arquivos que a sessão principal precisou abrir, tentativas até o portão passar e regressões encontradas. Comparar as mesmas três tarefas (uma configuração, uma arma, um inimigo) antes da etapa 1 e depois da etapa 3, com a mesma ferramenta e modelo.

O critério de sucesso é a IA conseguir realizar uma mudança delimitada entendendo um contrato pequeno e alguns módulos relevantes. Reduzir linhas por arquivo sem reduzir esse conjunto não comprova melhora.

**Decisão sugerida:** aproveitar R13.8, já previsto no plano, na ordem da seção 5. A etapa 1 pode começar agora: não altera comportamento do jogo e a única decisão nova que exige é a dependência de Playwright para os scripts de captura e sonda. O piloto de extração é `SFXBus`; UI vem em seguida. A hipótese de desperdício tem fundamento estrutural; sua dimensão em tokens começa a ser medida na primeira iteração. A coexistência com o 2D, agora congelado como easter egg, não é a causa central.
