# Teste de música local no PC (pedido da conversa da trilha, 16/11/2026)

Para o Claude que rodar neste PC (Windows, AMD Ryzen 7 5700X3D, 32 GB RAM, NVIDIA RTX 3070 8 GB).
O dono, Felipe, não programa: fale com ele em português simples, frases curtas, sem jargão.

## Objetivo
Descobrir se o modelo aberto **ACE-Step 1.5** (https://github.com/ACE-Step/ACE-Step-1.5, licença MIT, uso comercial
permitido) gera bem música instrumental para o jogo dele, neste PC, e quanto tempo leva. Pronto quer dizer: os
arquivos abaixo e um `RESULTADO.md` commitados NESTE ramo (`amostras/trilha-pc`) e enviados ao GitHub.

## Antes de instalar qualquer coisa
Diga ao Felipe, em uma frase, o que vai baixar e quanto ocupa (o repositório do ACE-Step, um ambiente Python e uns
7 a 10 GB de modelos) e onde (uma pasta fora do jogo, por exemplo `C:\ace-step`), e espere o "sim" dele.
Se faltar Python, Git ou driver da NVIDIA, pergunte antes de instalar. Nada de instalar em todo o sistema sem perguntar.
Use a versão "turbo" com o modelo de linguagem pequeno (cabe em 8 GB de placa de vídeo); não use a versão XL.

## O que gerar
Tudo instrumental (nas letras, só `[instrumental]`), 44,1 kHz, salvo em MP3 192 kbps.

1. **fase1-a.mp3, fase1-b.mp3, fase1-c.mp3** — três versões (sementes diferentes) deste pedido, 120 segundos,
   96 BPM, Ré menor, se a interface aceitar andamento e tom:
   > Video game soundtrack, space exploration, lonely but hopeful, gentle forward motion. D minor (dorian), 96 BPM,
   > 4/4. Calm half: warm analog synth pad, felt piano melody of four rising notes, soft plucked synth arpeggio, round
   > sub bass. Intense half: the same melody on a bright synth lead, punchy electronic drums, pulsing eighth-note synth
   > bass, low toms. Structure: intro 4 bars (pad only), calm 20 bars, intense 20 bars, outro 4 bars.
   > Instrumental only, no vocals, no lyrics. No harsh high frequencies, no sustained whistling or buzzing tones.
   > Mixed for a video game: leave room in the mids for sound effects. Steady tempo from start to end. The last bar
   > returns to the first chord so the track loops seamlessly.
   Se a interface pedir tags curtas em vez de texto longo, use: `instrumental, cinematic electronic, space, video game
   soundtrack, felt piano, analog synth pad, synth arpeggio, electronic drums, D minor, 96 bpm, hopeful, melancholic`
   e coloque a estrutura nas letras: `[intro]` `[instrumental]` `[verse]` `[instrumental]` `[chorus]` `[instrumental]` `[outro]`.

2. **chefe1-a.mp3, chefe1-b.mp3** — o chefe da fase 1 como uma variação sombria da mesma música (ideia do Felipe: o
   chefe continua a melodia da fase, só que sinistro). Use a melhor das três versões da fase como música de origem no
   modo "cover" (ou "repaint"/"audio to audio", o que existir) com este pedido, 90 segundos, mesmo andamento (96 BPM):
   > Same melody, dark and sinister boss battle variation. Heavier: distorted synth bass, big drums, low brass, wordless
   > choir (no words). Same key (D minor) and same tempo (96 BPM). Instrumental only, no vocals.
   Teste duas forças de "cover" (uma mais fiel à origem, outra mais livre) e diga qual é qual.

Anote, para cada arquivo: tempo de geração, memória de vídeo no pico, configuração usada (modelo, passos, semente,
força do cover).

## Entregar
- Salve os MP3 e um `RESULTADO.md` (o que instalou e onde, tempos, configurações, problemas, e a sua impressão
  honesta de cada arquivo se você puder analisar) na raiz deste ramo.
- `git add` só desses arquivos, um commit, e `git push origin amostras/trilha-pc`. Este ramo não tem o jogo: é só
  para as amostras. Nunca envie para `main`, nunca mexa em outro ramo.
- Diga ao Felipe, em duas linhas, que terminou e quanto tempo levou.

## Se der errado
Duas tentativas falhas na mesma coisa: pare, escreva o que aconteceu no `RESULTADO.md`, envie o ramo assim mesmo e
diga ao Felipe em uma frase. Não tente outro modelo nem outro caminho por conta própria.
