// © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
// Robô de atualização: lê as páginas públicas do portal institucional da UFPel (cursos do catálogo e as disciplinas das
// matrizes) e grava data/ufpel/*.json, que o app lê. Roda todo dia pelo GitHub Actions (.github/workflows/atualizar-ufpel.yml).
// Nomes de alunos nunca são gravados: só contagens. Uso: npm i linkedom && node tools/atualizar-ufpel.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseHTML } from 'linkedom';

const require = createRequire(import.meta.url);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const Leitor = require(join(RAIZ, 'js', 'ufpel-leitor.js'));
const CATALOGO = require(join(RAIZ, 'js', 'matrizes.js'));
const PASTA = join(RAIZ, 'data', 'ufpel');
const BASE = 'https://institucional.ufpel.edu.br';
const PARALELO = 4, PAUSA_MS = 150, TENTATIVAS = 3;

const lerJson = (arq, padrao) => { try { return JSON.parse(readFileSync(arq, 'utf8')); } catch { return padrao; } };
const gravar = (arq, obj) => { mkdirSync(dirname(arq), { recursive: true }); writeFileSync(arq, JSON.stringify(obj, null, 0) + '\n'); };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

async function pagina(caminho) {
    for (let i = 1; i <= TENTATIVAS; i++) {
        try {
            const r = await fetch(BASE + caminho, { headers: { 'User-Agent': 'GeradorDeHorarios/1.0 (CEng UFPel; github.com/MarlonSigales/Gerador-de-horarios)' } });
            if (r.status === 404) return null;
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const { document } = parseHTML(await r.text());
            return document;
        } catch (e) {
            if (i === TENTATIVAS) { console.warn(`falhou ${caminho}: ${e.message}`); return undefined; }
            await dorme(1000 * i);
        }
    }
}

/** Executa tarefas com no máximo PARALELO ao mesmo tempo. */
async function emLotes(itens, fn) {
    const fila = itens.slice(); const out = [];
    await Promise.all(Array.from({ length: PARALELO }, async () => {
        while (fila.length) { const x = fila.shift(); out.push(await fn(x)); await dorme(PAUSA_MS); }
    }));
    return out;
}

const antigoCursos = lerJson(join(PASTA, 'cursos.json'), { cursos: {} });
const antigoDisc = lerJson(join(PASTA, 'disciplinas.json'), { disciplinas: {} });
const ids = lerJson(join(PASTA, 'ids.json'), {}); // id interno do portal → código (não muda)
const agora = new Date().toISOString();

// 1) cursos
const cursos = {};
const codigos = new Set();
for (const u of CATALOGO.unidades) for (const c of u.cursos) {
    const doc = await pagina(`/cursos/cod/${c.cod}`);
    if (!doc) { if (antigoCursos.cursos[c.cod]) cursos[c.cod] = antigoCursos.cursos[c.cod]; console.warn(`curso ${c.cod}: mantido o anterior`); continue; }
    const info = Leitor.curso(doc);
    info.unidadeId = u.id; info.lidoEm = agora;
    cursos[c.cod] = info;
    info.matriz.forEach((m) => m.codigo && codigos.add(m.codigo));
    console.log(`curso ${c.cod} ${info.nome}: ${info.matriz.length} na matriz, ${info.alunos.total} alunos, ${info.egressos.total} egressos`);
    await dorme(PAUSA_MS);
}

// 2) disciplinas das matrizes
const disciplinas = {};
const turmasPorPeriodo = {};
await emLotes([...codigos], async (cod) => {
    const doc = await pagina(`/disciplinas/cod/${cod}`);
    if (!doc) { if (antigoDisc.disciplinas[cod]) disciplinas[cod] = antigoDisc.disciplinas[cod]; return; }
    const d = Leitor.disciplina(doc);
    const { turmas, ...resto } = d;
    resto.codigo = resto.codigo || cod; resto.lidoEm = agora;
    disciplinas[cod] = resto;
    for (const t of turmas) ((turmasPorPeriodo[t.periodo] = turmasPorPeriodo[t.periodo] || {})[cod] = turmasPorPeriodo[t.periodo][cod] || []).push(t);
});

// 3) códigos das equivalentes (o portal liga pelo id interno)
const faltam = [...new Set(Object.values(disciplinas).flatMap((d) => (d.equivalentes || []).filter((e) => !e.codigo && e.id && !ids[e.id]).map((e) => e.id)))];
await emLotes(faltam, async (id) => {
    const doc = await pagina(`/disciplinas/id/${id}`);
    if (doc) { const d = Leitor.disciplina(doc); if (d.codigo) ids[id] = { codigo: d.codigo, horas: d.cargaHoraria, nome: d.nome }; }
});
for (const d of Object.values(disciplinas)) for (const e of d.equivalentes || []) {
    const x = ids[e.id];
    if (!e.codigo && x) e.codigo = x.codigo;
    if (x && x.horas) e.horas = x.horas;
}

// 4) gravar (as turmas de cada período ficam guardadas: é daí que vem o "semestre anterior")
gravar(join(PASTA, 'cursos.json'), { fonte: BASE, atualizadoEm: agora, cursos });
gravar(join(PASTA, 'disciplinas.json'), { fonte: BASE, atualizadoEm: agora, disciplinas });
gravar(join(PASTA, 'ids.json'), ids);
for (const [per, porCod] of Object.entries(turmasPorPeriodo)) {
    const arq = join(PASTA, 'turmas', `${per.replace('/', '-')}.json`);
    const velho = lerJson(arq, { turmas: {} });
    gravar(arq, { periodo: per, atualizadoEm: agora, turmas: Object.assign({}, velho.turmas, porCod) });
}
const periodos = existsSync(join(PASTA, 'turmas')) ? readdirSync(join(PASTA, 'turmas')).filter((f) => /^\d{4}-\d\.json$/.test(f)).map((f) => f.slice(0, 6).replace('-', '/')).sort() : [];
gravar(join(PASTA, 'indice.json'), { fonte: BASE, atualizadoEm: agora, periodos, cursos: Object.keys(cursos).length, disciplinas: Object.keys(disciplinas).length });
console.log(`ok: ${Object.keys(cursos).length} cursos, ${Object.keys(disciplinas).length} disciplinas, períodos ${periodos.join(', ')}`);
