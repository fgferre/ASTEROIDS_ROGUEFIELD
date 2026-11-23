/*
 * Gera um cartão de decisão (HTML) a partir de um JSON.
 * Uso: node scripts/cartao.mjs <cartao.json> [--uma "motivo"]
 * Escreve <cartao>.html ao lado do JSON. Só Node, sem dependência.
 * O id do cartão é o nome do arquivo sem extensão.
 *
 * Esquema do JSON (textos aceitam **negrito**; o resto é escapado):
 *   titulo      texto     título da página (obrigatório)
 *   data        texto     ex. "2026-11-23"
 *   contexto    texto | [texto]   parágrafos de abertura
 *   tipo        "gosto" (faz pergunta, tem respostas) | "conferencia" (só para ver: sem pergunta)
 *   endereco    texto     endereço de teste; só http://192.168.1.185:<porta>/... (nunca localhost)
 *   tabela      {colunas:[texto], linhas:[[texto]]}   tabela de comparação (também vale dentro de uma seção)
 *   midia       [item]    mídia solta do cartão
 *   secoes      [seção]   blocos do cartão, cada um pode ter uma pergunta
 * item de mídia:
 *   imagem  {tipo:"imagem", src, legenda, origem}
 *   vídeo   {tipo:"video", src, poster, legenda, origem}
 *   áudio   {tipo:"audio", src, legenda, origem}
 *   origem = de qual versão veio (obrigatório); src/poster = caminho relativo que existe ao lado do JSON
 * seção:
 *   id, titulo, texto (texto|[texto]), lista [texto], nota (texto|[texto], depois da lista), endereco, tabela, midia [item],
 *   variantes [{letra:"A", titulo, texto, midia: item|[item]}]   lado a lado
 *   pergunta?  texto da pergunta
 *   opcoes     [{letra:"A", texto, recomendada:true}]   respostas por letra (só em "gosto")
 * Recusas (saída 1, nada escrito): "gosto" com menos de 3 variantes em todas as seções
 * (a maior seção conta), a não ser com --uma "motivo" (o motivo vai impresso no cartão);
 * endereço (em qualquer texto) cujo host não seja 192.168.1.185; caminho de mídia que não existe.
 */
import fs from 'node:fs';
import path from 'node:path';

const falha = (msg) => {
  console.error(`ERRO: ${msg}`);
  process.exit(1);
};

const args = process.argv.slice(2);
let uma = null;
const iUma = args.indexOf('--uma');
if (iUma >= 0) {
  uma = (args[iUma + 1] || '').trim();
  if (!uma) falha('--uma precisa de um motivo entre aspas.');
  args.splice(iUma, 2);
}
const arquivo = args[0];
if (!arquivo)
  falha('uso: node scripts/cartao.mjs <cartao.json> [--uma "motivo"]');

let c;
try {
  c = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
} catch (e) {
  falha(`não consegui ler o JSON ${arquivo}: ${e.message}`);
}
const dir = path.dirname(path.resolve(arquivo));
const id = path.basename(arquivo, path.extname(arquivo));
const HOST = '192.168.1.185';

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]
  );
const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const lista = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

// --- validações ---
if (!c.titulo) falha('falta "titulo".');
const tipo = c.tipo || 'gosto';
if (tipo !== 'gosto' && tipo !== 'conferencia')
  falha('"tipo" deve ser "gosto" ou "conferencia".');
const secoes = lista(c.secoes);

const checaEndereco = (url, onde) => {
  let u;
  try {
    u = new URL(url);
  } catch {
    falha(`endereço inválido em ${onde}: ${url}`);
  }
  if (u.hostname !== HOST || u.protocol !== 'http:') {
    falha(
      `endereço em ${onde} (${url}) não serve: o celular só alcança http://${HOST}:<porta>/... (nada de localhost, 127.x ou [::1]).`
    );
  }
};
const varre = (v, onde) => {
  if (typeof v === 'string') {
    for (const m of v.match(/https?:\/\/[^\s"'<>)]+/g) || [])
      checaEndereco(m, onde);
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) varre(x, `${onde}.${k}`);
  }
};
varre(c, 'cartão');
if (c.endereco) checaEndereco(c.endereco, '"endereco"');

const checaItem = (m, onde) => {
  if (!['imagem', 'video', 'audio'].includes(m.tipo))
    falha(`${onde}: "tipo" da mídia deve ser imagem, video ou audio.`);
  if (!m.origem) falha(`${onde}: falta "origem" (de qual versão veio).`);
  for (const k of ['src', 'poster']) {
    if (m[k] == null) continue;
    if (/^([a-z]+:|\/)/i.test(m[k]) || m[k].split('/').includes('..')) {
      falha(
        `${onde}: "${k}" deve ser caminho relativo dentro da pasta do JSON (${m[k]}).`
      );
    }
    if (!fs.existsSync(path.join(dir, m[k])))
      falha(`${onde}: o arquivo ${m[k]} não existe ao lado do JSON.`);
  }
  if (!m.src) falha(`${onde}: falta "src".`);
};
const itens = (x) => lista(x);
itens(c.midia).forEach((m, i) => checaItem(m, `midia[${i}]`));
secoes.forEach((s, si) => {
  itens(s.midia).forEach((m, i) => checaItem(m, `secoes[${si}].midia[${i}]`));
  lista(s.variantes).forEach((v, vi) =>
    itens(v.midia).forEach((m, i) =>
      checaItem(m, `secoes[${si}].variantes[${vi}].midia[${i}]`)
    )
  );
  if (tipo === 'gosto' && lista(s.opcoes).length && !s.id)
    falha(`secoes[${si}] tem opcoes mas falta "id".`);
});
const maxVar = Math.max(0, ...secoes.map((s) => lista(s.variantes).length));
if (tipo === 'gosto' && maxVar < 3 && !uma) {
  falha(
    `cartão de gosto com ${maxVar} variante(s): precisa de pelo menos 3. Se só existe uma de verdade, rode com --uma "motivo".`
  );
}
if (tipo === 'conferencia' && secoes.some((s) => lista(s.opcoes).length)) {
  falha('cartão "conferencia" não tem perguntas: tire as "opcoes".');
}

// --- HTML ---
const midia = (m) => {
  const src = esc(m.src);
  let el;
  if (m.tipo === 'video') {
    el = `<video src="${src}"${m.poster ? ` poster="${esc(m.poster)}"` : ''} controls loop muted playsinline preload="metadata"></video>`;
  } else if (m.tipo === 'audio') {
    el = `<audio controls preload="none" src="${src}"></audio>`;
  } else {
    el = `<img src="${src}" alt="${esc(m.legenda || '')}">`;
  }
  return `<figure>${el}<figcaption>${m.legenda ? `${fmt(m.legenda)}<br>` : ''}<span class="orig">Origem: ${fmt(m.origem)}</span></figcaption></figure>`;
};
const paragrafos = (x, cls = '') =>
  lista(x)
    .map((t) => `<p${cls ? ` class="${cls}"` : ''}>${fmt(t)}</p>`)
    .join('');
const endereco = (url) =>
  `<p>Endereço de teste (só na rede de casa): <a href="${esc(url)}">${esc(url)}</a></p>`;
const tabela = (t) =>
  t
    ? `<table><tr>${t.colunas.map((x) => `<th>${fmt(x)}</th>`).join('')}</tr>${t.linhas
        .map((l) => `<tr>${l.map((x) => `<td>${fmt(x)}</td>`).join('')}</tr>`)
        .join('')}</table>`
    : '';
const variantes = (vs) =>
  vs.length
    ? `<div class="vids">${vs
        .map(
          (v) =>
            `<div class="var"><div class="vl"><span class="letra">${esc(v.letra)}</span>${v.titulo ? ` ${fmt(v.titulo)}` : ''}</div>${itens(v.midia).map(midia).join('')}${v.texto ? paragrafos(v.texto) : ''}</div>`
        )
        .join('')}</div>`
    : '';
const opcoes = (s) =>
  lista(s.opcoes).length
    ? `${s.pergunta ? `<p><b>${fmt(s.pergunta)}</b></p>` : ''}<div class="opts">${s.opcoes
        .map(
          (o) =>
            `<label><input type="radio" name="${esc(s.id)}" value="${esc(o.letra)}"><span><b>${esc(o.letra)}.</b> ${fmt(o.texto)}${o.recomendada ? ' <em class="rec">(minha sugestão)</em>' : ''}</span></label>`
        )
        .join(
          ''
        )}</div><textarea data-note="${esc(s.id)}" placeholder="Observação (opcional)"></textarea>`
    : '';
const secao = (s) =>
  `<section${s.id ? ` data-id="${esc(s.id)}"` : ''}>${s.titulo ? `<h3>${fmt(s.titulo)}</h3>` : ''}${paragrafos(s.texto, 'why')}${
    s.endereco ? endereco(s.endereco) : ''
  }${lista(s.lista).length ? `<ul>${s.lista.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul>` : ''}${paragrafos(s.nota, 'note')}${tabela(s.tabela)}${
    itens(s.midia).length
      ? `<div class="vids">${s.midia.map(midia).join('')}</div>`
      : ''
  }${variantes(lista(s.variantes))}${tipo === 'gosto' ? opcoes(s) : ''}</section>`;

const perguntas =
  tipo === 'gosto' ? secoes.filter((s) => lista(s.opcoes).length) : [];
const D = perguntas.map((s) => ({ id: s.id, t: s.titulo || s.id }));

const css = `:root{--bg:#0d0f12;--card:#171a1f;--line:#262b33;--text:#e6e9ee;--dim:#8b93a1;--accent:#00f2ff;--amber:#ffb347}
*{box-sizing:border-box}
body{margin:0 auto;background:var(--bg);color:var(--text);font:15px/1.45 -apple-system,system-ui,sans-serif;padding:16px 16px 140px;max-width:1240px}
a{color:var(--accent);word-break:break-all}
h1{font-size:22px;margin:8px 0} h2{font-size:18px;margin:16px 0 4px} p{margin:6px 0} p.note{color:var(--dim);margin:4px 0 12px}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:12px 0}
section.done{border-color:#155a61} section h3{font-size:16px;margin:0 0 4px} section .why{color:var(--dim);margin:0 0 10px}
.vids{display:flex;gap:10px;flex-wrap:wrap} .vids figure,.vids .var{margin:0;flex:1 1 260px;min-width:0;max-width:380px}
.var figure{max-width:none;margin:0 0 6px}
.vl{margin:0 0 4px;font-weight:600} .letra{display:inline-block;background:var(--accent);color:#001215;border-radius:6px;padding:1px 8px}
video{width:100%;height:auto;border-radius:8px;border:1px solid var(--line);display:block;background:#000} figure img{width:100%;height:auto;border-radius:8px;border:1px solid var(--line);display:block}
audio{width:100%} figure{margin:8px 0}
figcaption{color:var(--dim);font-size:12px;margin-top:4px} .orig{font-style:italic}
table{border-collapse:collapse;width:100%;margin:8px 0} th,td{border:1px solid var(--line);padding:6px 7px;font-size:13px;vertical-align:top;text-align:left} th{background:#11141a}
.opts{display:flex;flex-direction:column;gap:6px;margin:12px 0 6px}
.opts label{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border:1px solid var(--line);border-radius:8px;cursor:pointer}
.opts label:has(input:checked){border-color:var(--accent);background:#0f2a2e} .opts input{margin-top:3px;accent-color:var(--accent)}
.rec{color:var(--amber);font-style:normal}
textarea{width:100%;background:#0f1216;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;min-height:38px}
#out{position:fixed;left:0;right:0;bottom:0;background:#0d0f12f2;border-top:1px solid var(--line);padding:10px 16px}
#out div{max-width:1208px;margin:auto;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
button{background:var(--accent);color:#001215;border:0;border-radius:8px;padding:10px 16px;font:600 15px/1 inherit;cursor:pointer}
#count{color:var(--dim)} #ok{color:var(--amber)} ul{margin:6px 0;padding-left:20px}`;

const js = `const D = ${JSON.stringify(D).replace(/</g, '\\u003c')};
const KEY = ${JSON.stringify(id)}; let pick = {}; try { pick = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pick)); } catch (e) {} sum(); };
const root = document.getElementById('root');
root.querySelectorAll('input[type=radio]').forEach((r) => { if (pick[r.name] === r.value) r.checked = true; r.onchange = () => { pick[r.name] = r.value; save(); }; });
root.querySelectorAll('textarea').forEach((t) => { const k = 'nota:' + t.dataset.note; t.value = pick[k] || '';
  t.oninput = () => { if (t.value.trim()) pick[k] = t.value.trim(); else delete pick[k]; save(); }; });
function text() { return D.filter((d) => pick[d.id] || pick['nota:' + d.id]).map((d) => { const n = pick['nota:' + d.id];
  return KEY + (D.length > 1 ? ' / ' + d.id : '') + ': ' + (pick[d.id] || '(sem letra)') + (n ? ' — obs: ' + n : ''); }).join('\\n'); }
function sum() { const n = D.filter((d) => pick[d.id]).length; document.getElementById('count').textContent = n + ' de ' + D.length + ' respondidas';
  D.forEach((d) => root.querySelector('section[data-id="' + d.id + '"]').classList.toggle('done', Boolean(pick[d.id]))); }
document.getElementById('copy').onclick = () => { const t = text() || 'Nenhuma resposta marcada.'; const ok = document.getElementById('ok');
  const done = () => { ok.textContent = 'Copiado. Cole na conversa.'; setTimeout(() => (ok.textContent = ''), 4000); };
  let a = document.getElementById('manual'); if (!a) { a = document.createElement('textarea'); a.id = 'manual'; a.readOnly = true; a.style.cssText = 'display:block;width:100%;min-height:5em;margin:8px auto 0;font:inherit'; document.getElementById('out').appendChild(a); } a.value = t; a.select();
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(done).catch(() => { ok.textContent = 'Não copiou sozinho: o texto está aqui embaixo, já selecionado.'; }); };
sum();`;

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.titulo)}</title><style>
${css}
</style></head><body>
<h1>${esc(c.titulo)}</h1>
${c.data ? `<p class="note">${esc(c.data)}${tipo === 'conferencia' ? ' · só para conferir, sem pergunta' : ''}</p>` : ''}${paragrafos(c.contexto, 'note')}
${uma ? `<p class="note"><b>Só uma versão:</b> ${esc(uma)}</p>` : ''}${c.endereco ? endereco(c.endereco) : ''}${tabela(c.tabela)}${
  itens(c.midia).length
    ? `<div class="vids">${c.midia.map(midia).join('')}</div>`
    : ''
}
<div id="root">${secoes.map(secao).join('\n')}</div>
${perguntas.length ? `<div id="out"><div><button id="copy">Copiar respostas</button><span id="count"></span><span id="ok"></span></div></div>\n<script>\n${js}\n</script>` : ''}
</body></html>
`;

const saida = path.join(dir, `${id}.html`);
fs.writeFileSync(saida, html);
console.log(`Cartão escrito: ${saida}`);
