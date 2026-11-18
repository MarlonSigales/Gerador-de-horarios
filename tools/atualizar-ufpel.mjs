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
// O portal bloqueia (HTTP 403) quem pede rápido demais: uma página por vez, com pausa; bloqueado, espera e tenta de novo.
// Cada execução tem um tempo máximo: lê primeiro o que está há mais tempo sem leitura e o resto fica para a próxima (todo dia).
const PAUSA_MS = Number(process.env.PAUSA_MS || 2500), ESPERA_BLOQUEIO_MS = 120000, TENTATIVAS = 3, MAX_BLOQUEIOS_SEGUIDOS = 4;
const ORCAMENTO_MS = Number(process.env.ORCAMENTO_MIN || 50) * 60000;
const inicio = Date.now();
const temTempo = () => Date.now() - inicio < ORCAMENTO_MS;
let bloqueiosSeguidos = 0, parou = false;

const lerJson = (arq, padrao) => { try { return JSON.parse(readFileSync(arq, 'utf8')); } catch { return padrao; } };
const gravar = (arq, obj) => { mkdirSync(dirname(arq), { recursive: true }); writeFileSync(arq, JSON.stringify(obj, null, 0) + '\n'); };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

/** Lê uma página. null = não existe (404); undefined = não deu (bloqueio, erro, sem tempo). */
async function pagina(caminho) {
    if (parou || !temTempo()) return undefined;
    for (let i = 1; i <= TENTATIVAS; i++) {
        try {
            const r = await fetch(BASE + caminho, { headers: { 'User-Agent': 'GeradorDeHorarios/1.0 (CEng UFPel; github.com/MarlonSigales/Gerador-de-horarios)', Accept: 'text/html' } });
            await dorme(PAUSA_MS);
            if (r.status === 404) { bloqueiosSeguidos = 0; return null; }
            if (r.status === 403 || r.status === 429 || r.status === 503) {
                bloqueiosSeguidos++;
                console.warn(`bloqueado (${r.status}) em ${caminho}; esperando ${ESPERA_BLOQUEIO_MS / 1000} s`);
                if (bloqueiosSeguidos >= MAX_BLOQUEIOS_SEGUIDOS) { parou = true; console.warn('muitos bloqueios seguidos: paro aqui e guardo o que já li'); return undefined; }
                await dorme(ESPERA_BLOQUEIO_MS);
                continue;
            }
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            bloqueiosSeguidos = 0;
            return parseHTML(await r.text()).document;
        } catch (e) {
            if (i === TENTATIVAS) { console.warn(`falhou ${caminho}: ${e.message}`); return undefined; }
            await dorme(3000 * i);
        }
    }
    return undefined;
}

/** Uma de cada vez (o portal não aceita pedidos em paralelo). */
async function emLotes(itens, fn) { for (const x of itens) { if (parou || !temTempo()) break; await fn(x); } }

const antigoCursos = lerJson(join(PASTA, 'cursos.json'), { cursos: {} });
const antigoDisc = lerJson(join(PASTA, 'disciplinas.json'), { disciplinas: {} });
const ids = lerJson(join(PASTA, 'ids.json'), {}); // id interno do portal → código (não muda)
const agora = new Date().toISOString();

// 1) cursos (começa com o que já tinha; o que não der para ler agora fica como estava)
const cursos = Object.assign({}, antigoCursos.cursos);
const codigos = new Set();
for (const u of CATALOGO.unidades) for (const c of u.cursos) {
    const doc = await pagina(`/cursos/cod/${c.cod}`);
    if (!doc) { if (cursos[c.cod]) (cursos[c.cod].matriz || []).forEach((m) => m.codigo && codigos.add(m.codigo)); else c.matriz && c.matriz.forEach((m) => codigos.add(m.codigo)); console.warn(`curso ${c.cod}: mantido o anterior`); continue; }
    const info = Leitor.curso(doc);
    info.unidadeId = u.id; info.lidoEm = agora;
    cursos[c.cod] = info;
    info.matriz.forEach((m) => m.codigo && codigos.add(m.codigo));
    console.log(`curso ${c.cod} ${info.nome}: ${info.matriz.length} na matriz, ${info.alunos.total} alunos, ${info.egressos.total} egressos`);
}

// 2) disciplinas das matrizes: primeiro as nunca lidas, depois as lidas há mais tempo
const disciplinas = Object.assign({}, antigoDisc.disciplinas);
const turmasPorPeriodo = {};
const ordem = [...codigos].sort((a, b) => String((disciplinas[a] || {}).lidoEm || '').localeCompare(String((disciplinas[b] || {}).lidoEm || '')));
let lidas = 0;
await emLotes(ordem, async (cod) => {
    const doc = await pagina(`/disciplinas/cod/${cod}`);
    if (!doc) return;
    lidas++;
    const d = Leitor.disciplina(doc);
    const { turmas, ...resto } = d;
    resto.codigo = resto.codigo || cod; resto.lidoEm = agora;
    disciplinas[cod] = resto;
    for (const t of turmas) ((turmasPorPeriodo[t.periodo] = turmasPorPeriodo[t.periodo] || {})[cod] = turmasPorPeriodo[t.periodo][cod] || []).push(t);
});

// 3) códigos das equivalentes (o portal liga pelo id interno)
console.log(`disciplinas: ${lidas} lidas agora; ${ordem.length - lidas} ficam para a próxima execução`);
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
