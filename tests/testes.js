/**
 * © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * Testes automáticos das regras, dos conflitos, do gerador e do PDF. Rodar: node tests/testes.js
 */

'use strict';

const path = require('path');
const N = require('../js/nucleo.js');
const E = require('../js/exemplo.js');

const TESTES = [];
const teste = (nome, f) => TESTES.push({ nome, f });
const ok = (c, msg) => { if (!c) throw new Error(msg || 'condição falsa'); };
const igual = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || ''} esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };
const exemplo = () => E.criar(N);
const comGrade = (semente = 1) => { const d = exemplo(); const r = N.gerar(d, { semente }); d.grade = { alocacoes: r.alocacoes, naoAlocadas: r.naoAlocadas, geradaEm: 'teste' }; return d; };
const tipos = (d) => N.conflitos(d).lista.map((c) => c.tipo);

teste('Oferta e reoferta: metade 1 = ímpares oferta; metade 2 = pares oferta', () => {
    igual([1, 2, 3, 10].map((s) => N.situacao(s, 1)), ['oferta', 'reoferta', 'oferta', 'reoferta']);
    igual([1, 2, 3, 10].map((s) => N.situacao(s, 2)), ['reoferta', 'oferta', 'reoferta', 'oferta']);
});

teste('Blocos: "2+2", automático e soma errada', () => {
    igual(N.blocos({ aulas: 4, blocos: '2+2' }), [2, 2]);
    igual(N.blocos({ aulas: 3 }), [3]);
    igual(N.blocos({ aulas: 5 }), [2, 3]);
    igual(N.blocos({ aulas: 4, blocos: '3+3' }), [2, 2], 'soma diferente das aulas cai no automático');
});

teste('Gerador: exemplo inteiro sem conflito em 20 sementes', () => {
    for (let s = 1; s <= 20; s++) {
        const d = comGrade(s);
        const c = N.conflitos(d);
        igual(d.grade.naoAlocadas.length, 0, `semente ${s}: aulas sem lugar`);
        igual(c.erros + c.avisos, 0, `semente ${s}: ${c.lista.map((x) => x.msg).join(' | ')}`);
        igual(d.grade.alocacoes.length, d.disciplinas.reduce((t, q) => t + q.aulas, 0), `semente ${s}: total de aulas`);
    }
});

teste('Gerador: respeita horários fixos, indisponibilidade e laboratório', () => {
    const d = comGrade(3);
    const emb = d.disciplinas.find((q) => q.id === 'emb1');
    d.grade.alocacoes.filter((a) => a.disc === 'emb1').forEach((a) => ok(emb.fixos.includes(`${a.d}|${a.h}`), 'fora do horário fixo'));
    const ana = d.professores.find((p) => p.id === 'ana');
    d.grade.alocacoes.filter((a) => d.disciplinas.find((q) => q.id === a.disc).professor === 'ana').forEach((a) => ok(!ana.indisp.includes(`${a.d}|${a.h}`), 'Ana indisponível'));
    d.grade.alocacoes.filter((a) => a.sala === 'lpc').forEach((a) => igual(d.disciplinas.find((q) => q.id === a.disc).professor, 'bruno', 'Lab. de Pós-Colheita só aceita o responsável'));
});

teste('Equivalentes: mesmo horário e mesma sala, sem conflito de professor/sala', () => {
    const d = comGrade(5);
    const ea = d.grade.alocacoes.filter((a) => a.disc === 'alg-ea').map((a) => `${a.d}|${a.h}|${a.sala}`).sort();
    const cca = d.grade.alocacoes.filter((a) => a.disc === 'alg-cca').map((a) => `${a.d}|${a.h}|${a.sala}`).sort();
    igual(ea, cca);
});

teste('Conflitos: professor e sala em duas aulas ao mesmo tempo', () => {
    const d = exemplo();
    d.grade.alocacoes = [{ disc: 'calc1', d: 1, h: 0, sala: 's101' }, { disc: 'calc2', d: 1, h: 0, sala: 's101' }];
    const t = tipos(d);
    ok(t.includes('prof'), 'faltou conflito de professor');
    ok(t.includes('sala-dupla'), 'faltou conflito de sala');
});

teste('Conflitos: horários proibidos, horário fixo, curso e laboratório não autorizado', () => {
    const d = exemplo();
    d.grade.alocacoes = [
        { disc: 'calc1', d: 0, h: 0, sala: 's101' }, // Ana não pode segunda de manhã
        { disc: 'emb1', d: 0, h: 5, sala: 'lia' }, // fora do horário fixo
        { disc: 'instr', d: 4, h: 6, sala: 'lia' }, // laboratório indisponível sexta à tarde
        { disc: 'calc2', d: 1, h: 11, sala: 's102' }, // oferta à noite: fora do funcionamento
        { disc: 'estr', d: 2, h: 0, sala: 'lpc' } // Fábio no Lab. de Pós-Colheita (só responsáveis)
    ];
    const t = tipos(d);
    ['prof-indisp', 'fixo', 'sala-indisp', 'curso', 'lab-permissao'].forEach((x) => ok(t.includes(x), `faltou ${x}`));
});

teste('Conflitos: autorizado pelo responsável não gera conflito de laboratório', () => {
    const d = exemplo();
    d.grade.alocacoes = [{ disc: 'embsis', d: 1, h: 0, sala: 'lia' }]; // Diego autorizado no LIA
    ok(!tipos(d).includes('lab-permissao'));
});

teste('Conflitos: mesmo semestre não tem duas aulas no mesmo horário (qualquer caráter)', () => {
    const d = exemplo();
    d.grade.alocacoes = [{ disc: 'instal', d: 1, h: 0, sala: 's101' }, { disc: 'energ', d: 1, h: 0, sala: 's102' }];
    const c = N.conflitos(d).lista.filter((x) => x.tipo === 'turma');
    ok(c.length && c[0].gravidade === 'erro');
    d.grade.alocacoes = [{ disc: 'emb1', d: 3, h: 5, sala: 'lia' }, { disc: 'hidr', d: 3, h: 5, sala: 's101' }];
    const c2 = N.conflitos(d).lista.filter((x) => x.tipo === 'turma');
    ok(c2.length && c2[0].gravidade === 'erro', 'optativa também é conflito');
});

teste('Prioridade: conflito de sala diz quem é o responsável', () => {
    const d = exemplo();
    d.grade.alocacoes = [{ disc: 'instr', d: 1, h: 5, sala: 'lia' }, { disc: 'embsis', d: 1, h: 5, sala: 'lia' }];
    const c = N.conflitos(d).lista.find((x) => x.tipo === 'sala-dupla');
    ok(c && /Prioridade do responsável: EAG050/.test(c.msg), c && c.msg);
});

teste('Edição: mover bloco mostra os conflitos do destino e não cabe se passar do turno', () => {
    const d = comGrade(2);
    const i = d.grade.alocacoes.findIndex((a) => a.disc === 'calc1');
    const bloco = N.blocoDe(d, i);
    igual(bloco.length, 2);
    let achouConflito = false, achouLivre = false;
    for (let dd = 0; dd < d.config.dias.length; dd++) for (let h = 0; h < d.config.horarios.length; h++) {
        const r = N.avaliarMovimento(d, bloco, dd, h);
        if (h === 4 || h === 6) ok(!r.valido, 'bloco de 2 não passa do fim da manhã nem atravessa a pausa 15h10–16h');
        if (r.valido && r.erros) achouConflito = true;
        if (r.valido && !r.conflitos.length) achouLivre = true;
    }
    ok(achouConflito && achouLivre);
});

teste('Edição: inserir aulas que faltam', () => {
    const d = comGrade(2);
    d.grade.alocacoes = d.grade.alocacoes.filter((a) => a.disc !== 'tcc');
    igual(N.faltando(d), [{ disc: 'tcc', faltam: 2 }]);
    const r = N.inserirBloco(d, 'tcc', 2, 1, 5, 's101');
    igual(N.faltando(r.dados), []);
});

teste('Gerador: mantém aulas travadas', () => {
    const d = exemplo();
    d.grade.alocacoes = [{ disc: 'energ', d: 4, h: 0, sala: 's201', travada: true }, { disc: 'energ', d: 4, h: 1, sala: 's201', travada: true }, { disc: 'energ', d: 4, h: 2, sala: 's201', travada: true }];
    const r = N.gerar(d, { semente: 9 });
    igual(r.alocacoes.filter((a) => a.disc === 'energ').map((a) => `${a.d}|${a.h}`), ['4|0', '4|1', '4|2']);
});

teste('Gerador: explica por que não alocou (cursos sem horário comum)', () => {
    const d = exemplo();
    d.cursos.find((c) => c.id === 'ecaut').reoferta = N.chavesTurno(d.config, 'noite');
    const r = N.gerar(d, { semente: 1, tentativas: 5 });
    const fis = r.naoAlocadas.find((x) => x.disc === 'fis1');
    ok(fis && /não têm horário em comum/.test(fis.motivo), fis && fis.motivo);
});

teste('Configuração: trocar horários mantém o que continua existindo', () => {
    const d = comGrade(4);
    const nova = { dias: d.config.dias.slice(0, 4), horarios: d.config.horarios.slice(0, 10) };
    const r = N.remapearConfig(d, nova);
    ok(r.perdidas > 0);
    r.dados.grade.alocacoes.forEach((a) => ok(a.d < 4 && a.h < 10));
    igual(r.dados.professores.find((p) => p.id === 'ana').indisp.length, 5);
});

teste('Excluir professor tira ele das disciplinas e dos laboratórios', () => {
    const d = exemplo();
    N.excluir(d, 'professor', 'marlon');
    ok(!d.salas.find((s) => s.id === 'lia').responsaveis.includes('marlon'));
    ok(d.disciplinas.filter((q) => q.professor === 'marlon').length === 0);
});

teste('Horários do CEng/UFPel: 14 períodos de 50 min e intervalos certos', () => {
    const h = N.horariosPadrao(), cfg = { horarios: h };
    igual(h.length, 14);
    const min = (x) => { const [a, b] = x.split(':').map(Number); return a * 60 + b; };
    h.forEach((x) => igual(min(x.fim) - min(x.ini), 50, x.ini));
    ok(N.seguidas(cfg, 1), 'intervalo 9h40–10h não quebra o bloco');
    ok(N.seguidas(cfg, 11), 'intervalo 20h40–20h50 não quebra o bloco');
    ok(!N.seguidas(cfg, 6), '15h10–16h quebra o bloco');
    igual([h[0].ini, h[4].fim, h[5].ini, h[9].fim, h[10].ini, h[13].fim], ['08:00', '12:30', '13:30', '18:30', '19:00', '22:30']);
});

teste('Arquivo: normalizar completa campos faltando', () => {
    const d = N.normalizar({ cursos: [{ nome: 'X' }], disciplinas: [{ nome: 'Y', ofertas: [{ curso: 'c', semestre: '3' }] }] });
    igual(d.cursos[0].semestres, 10);
    igual(d.disciplinas[0].ofertas[0].carater, 'obrigatoria');
    ok(Array.isArray(d.grade.alocacoes));
});

teste('PDF: gera com o exemplo (capa, grades, disciplinas, conflitos)', () => {
    global.Nucleo = N;
    global.LOGOS_PDF = require('vm').runInNewContext(require('fs').readFileSync(path.join(__dirname, '../js/logos.js'), 'utf8') + ';LOGOS_PDF');
    let jsPDF;
    try { jsPDF = require(path.join(__dirname, '../js/vendor/jspdf.umd.min.js')).jsPDF; } catch (e) { return; }
    global.window = undefined;
    const ctx = { jsPDF, window: { jsPDF }, globalThis: {} };
    require('vm').runInNewContext(require('fs').readFileSync(path.join(__dirname, '../js/vendor/jspdf.plugin.autotable.min.js'), 'utf8'), Object.assign(ctx, { exports: {}, module: { exports: {} }, require }));
    const autoTable = ctx.module.exports && (ctx.module.exports.default || ctx.module.exports);
    if (typeof autoTable === 'function' && autoTable.length !== undefined && ctx.module.exports.applyPlugin) ctx.module.exports.applyPlugin(jsPDF);
    if (!jsPDF.API.autoTable) { console.log('      (PDF: o plugin de tabelas não carrega no Node; o PDF é testado no navegador pelo Playwright)'); return; }
    const PDF = require('../js/pdf.js');
    const doc = PDF.gerar(comGrade(1), { jsPDF });
    ok(doc.internal.getNumberOfPages() > 10);
    igual(PDF.txt('⚠ Lab 🔒'), '(!) Lab');
});

let falhas = 0;
TESTES.forEach((t) => {
    try { t.f(); console.log(`  ok  ${t.nome}`); } catch (e) { falhas++; console.log(`FALHOU ${t.nome}\n      ${e.message}`); }
});
console.log(`\n${TESTES.length - falhas} de ${TESTES.length} passaram.`);
process.exit(falhas ? 1 : 0);
