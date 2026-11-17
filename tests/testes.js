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
const exemplo = () => E.criarCompleto(N); // regras gerais: arquivo com 3 cursos
const exemploUm = () => E.criar(N); // como o app usa: 1 curso + outros cursos
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
        { disc: 'instr', d: 4, h: 6, sala: 'lia' }, // laboratório reservado para pesquisa sexta à tarde
        { disc: 'circ', d: 1, h: 12, sala: 's103' }, // Sala 103 indisponível à noite
        { disc: 'calc2', d: 1, h: 11, sala: 's102' }, // oferta à noite: fora do funcionamento
        { disc: 'estr', d: 2, h: 0, sala: 'lpc' } // Fábio no Lab. de Pós-Colheita (só responsáveis)
    ];
    const t = tipos(d);
    ['prof-indisp', 'fixo', 'pesquisa-sala', 'sala-indisp', 'curso', 'lab-permissao'].forEach((x) => ok(t.includes(x), `faltou ${x}`));
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
        if (h === 4 || h === 10) ok(!r.valido, 'bloco de 2 não passa do fim da manhã nem do fim da tarde');
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

teste('Horários do CEng/UFPel: 15 períodos de 50 min (tarde com 6) e intervalos certos', () => {
    const h = N.horariosPadrao(), cfg = { horarios: h };
    igual(h.length, 15);
    const min = (x) => { const [a, b] = x.split(':').map(Number); return a * 60 + b; };
    h.forEach((x) => igual(min(x.fim) - min(x.ini), 50, x.ini));
    ok(N.seguidas(cfg, 1), 'intervalo 9h40–10h não quebra o bloco');
    ok(N.seguidas(cfg, 12), 'intervalo 20h40–20h50 não quebra o bloco');
    ok(N.seguidas(cfg, 7), 'intervalo 16h–16h20 não quebra o bloco');
    ok(N.seguidas(cfg, 9), '17h10–18h e 18h–18h50 são seguidas');
    ok(!N.seguidas(cfg, 10), 'da tarde (18h50) para a noite (19h) o bloco quebra');
    igual(N.turno(h[10]), 'tarde');
    igual([h[7].fim, h[8].ini], ['16:00', '16:20']);
    igual([h[0].ini, h[4].fim, h[5].ini, h[10].fim, h[11].ini, h[14].fim], ['08:00', '12:30', '13:30', '18:50', '19:00', '22:30']);
});

teste('Códigos de horário UFPel: 611, 222 e sexta à tarde 621 622 623 624', () => {
    const cfg = { dias: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'], horarios: N.horariosPadrao() };
    igual(N.codigoHorario(cfg, 4, 0), '611');
    igual(N.codigoHorario(cfg, 0, 6), '222');
    igual([5, 6, 7, 8].map((h) => N.codigoHorario(cfg, 4, h)).join(' '), '621 622 623 624');
    igual(N.codigoHorario(cfg, 4, 10), '626');
    igual(N.codigoHorario(cfg, 2, 11), '431');
    const d = exemplo();
    d.grade.alocacoes = [5, 6, 7, 8].map((h) => ({ disc: 'secag', d: 4, h, sala: 's101' }));
    igual(N.codigosDisciplina(d, 'secag'), '621 622 623 624');
    const rel = N.relacao(d, 'eagri').find((l) => l.disc === 'secag');
    igual([rel.semestre, rel.professor, rel.horarios, rel.salas], [8, 'Bruno Costa (exemplo)', '621 622 623 624', 'Sala 101']);
});

teste('Um curso por grade: exemplo tem 1 curso e 2 outros cursos; gera sem conflito em 20 sementes', () => {
    const d0 = exemploUm();
    igual(d0.cursos.length, 1);
    igual(d0.externos.map((e) => e.curso), ['Engenharia de Controle e Automação', 'Engenharia Civil']);
    for (let s = 1; s <= 20; s++) {
        const d = exemploUm(); const r = N.gerar(d, { semente: s });
        d.grade = { alocacoes: r.alocacoes, naoAlocadas: r.naoAlocadas, geradaEm: 't' };
        igual(r.naoAlocadas.length, 0, `semente ${s}`);
        igual(N.conflitos(d).lista.map((x) => x.msg), [], `semente ${s}`);
    }
});

teste('Outros cursos: professor já alocado por outro curso no mesmo horário = conflito', () => {
    const d = exemploUm();
    const au = d.externos[0].aulas.find((a) => a.codigo === 'ECA030'); // Circuitos, Diego
    const dd = d.config.dias.indexOf(au.dia), h = d.config.horarios.findIndex((x) => x.ini === au.ini);
    d.grade.alocacoes = [{ disc: 'empr', d: dd, h, sala: 's201' }]; // Empreendedorismo, também do Diego
    const c = N.conflitos(d).lista.find((x) => x.tipo === 'externo-prof');
    ok(c && /Diego Rocha \(exemplo\) já tem aula em Engenharia de Controle e Automação/.test(c.msg), c && c.msg);
});

teste('Outros cursos: laboratório já ocupado por outro curso = conflito', () => {
    const d = exemploUm();
    const au = d.externos[0].aulas.find((a) => a.codigo === 'ECA010'); // Lab. de Informática
    const dd = d.config.dias.indexOf(au.dia), h = d.config.horarios.findIndex((x) => x.ini === au.ini);
    d.grade.alocacoes = [{ disc: 'instr', d: dd, h, sala: 'linfo' }];
    ok(N.conflitos(d).lista.some((x) => x.tipo === 'externo-sala'));
});

teste('Outros cursos: mesma disciplina (código) na mesma sala = turma conjunta, sem conflito; o gerador prefere juntar', () => {
    const d = exemploUm();
    const au = d.externos[0].aulas.find((a) => a.codigo === 'MAT001');
    const dd = d.config.dias.indexOf(au.dia), h = d.config.horarios.findIndex((x) => x.ini === au.ini);
    const sala = d.salas.find((x) => x.nome === au.sala).id;
    d.grade.alocacoes = [{ disc: 'calc1', d: dd, h, sala }];
    ok(!N.conflitos(d).lista.some((x) => /externo/.test(x.tipo)), 'conjunta não é conflito');
    d.grade.alocacoes = [{ disc: 'calc1', d: dd, h, sala: d.salas.find((x) => x.nome !== au.sala && x.tipo === 'sala').id }];
    ok(N.conflitos(d).lista.some((x) => x.tipo === 'externo-prof'), 'outra sala: professor em dois lugares');
    const r = N.gerar(exemploUm(), { semente: 3 });
    const meus = r.alocacoes.filter((a) => a.disc === 'calc1').map((a) => `${d.config.dias[a.d]} ${d.config.horarios[a.h].ini}`).sort();
    const deles = d.externos[0].aulas.filter((a) => a.codigo === 'MAT001').map((a) => `${a.dia} ${a.ini}`).sort();
    igual(meus, deles);
});

teste('Outros cursos: separar um curso de um arquivo com vários e recusar período diferente', () => {
    const todos = exemplo();
    const so = N.separarCurso(todos, 'ecivil');
    igual(so.cursos.map((c) => c.id), ['ecivil']);
    ok(so.disciplinas.every((q) => q.ofertas.every((o) => o.curso === 'ecivil')));
    const d = exemploUm();
    const ext = N.externoDe(so, 'ecivil', 'arquivo'); ext.ano = 1999;
    ok(!N.incluirExterno(d, ext).ok);
    const proprio = N.externoDe(N.separarCurso(todos, 'eagri'), 'eagri');
    ok(!N.incluirExterno(d, proprio).ok, 'o próprio curso não entra');
});

teste('Unidade: outro curso de OUTRA unidade só bloqueia salas, não professores', () => {
    const d = exemploUm();
    const au = d.externos[0].aulas.find((a) => a.codigo === 'ECA030');
    const dd = d.config.dias.indexOf(au.dia), h = d.config.horarios.findIndex((x) => x.ini === au.ini);
    d.grade.alocacoes = [{ disc: 'empr', d: dd, h, sala: d.salas.find((x) => x.nome === au.sala).id }];
    ok(N.conflitos(d).lista.some((x) => x.tipo === 'externo-prof') && N.conflitos(d).lista.some((x) => x.tipo === 'externo-sala'));
    d.externos[0].unidade = 'Centro de Ciências Químicas';
    const t = N.conflitos(d).lista.map((x) => x.tipo);
    ok(!t.includes('externo-prof'), 'outra unidade não bloqueia professor');
    ok(t.includes('externo-sala'), 'mas a sala continua bloqueada');
});

teste('Turno preferido por semestre: o gerador respeita quando dá e avisa quando não dá', () => {
    const d = exemploUm();
    d.cursos[0].preferencias = { 1: ['manha'], 3: ['manha'], 5: ['tarde'], 7: ['tarde'] };
    const r = N.gerar(d, { semente: 4 });
    d.grade = { alocacoes: r.alocacoes, naoAlocadas: r.naoAlocadas, geradaEm: 't' };
    const fora = N.conflitos(d).lista.filter((x) => x.tipo === 'turno-pref');
    const total = r.alocacoes.filter((a) => d.disciplinas.find((q) => q.id === a.disc).ofertas.some((o) => [1, 3, 5, 7].includes(o.semestre))).length;
    ok(fora.length < total / 4, `muitas fora do turno: ${fora.length} de ${total}`);
    d.grade.alocacoes = [{ disc: 'calc1', d: 1, h: 6, sala: 's101' }];
    ok(N.conflitos(d).lista.some((x) => x.tipo === 'turno-pref' && x.gravidade === 'aviso'));
});

teste('Matriz curricular: 9 engenharias do CEng; importar Eng. Agrícola (obrigatórias com aula; estágio, TCC, EAD e optativas com 0)', () => {
    const C = require('../js/matrizes.js');
    const u = C.unidades[0];
    igual([u.id, u.nome], [444, 'Centro de Engenharias']);
    const eng = u.cursos.filter((c) => c.matriz);
    igual(eng.length, 9);
    eng.forEach((c) => igual(Math.max(...c.matriz.map((m) => m.sem)), 10, c.nome));
    const ea = u.cursos.find((c) => c.cod === 700);
    const ds = N.disciplinasDaMatriz(ea, 'c1', []);
    igual(ds.length, 105);
    const calc = ds.find((q) => q.codigo === '15000768');
    igual([calc.nome, calc.aulas, calc.ofertas[0].semestre], ['Cálculo A', 6, 1]);
    igual(ds.find((q) => q.codigo === '15000893').aulas, 0, 'estágio');
    const opt = ds.find((q) => q.codigo === '15000907');
    igual([opt.aulas, opt.ofertas[0].semestre, opt.ofertas[0].carater], [0, 0, 'optativa']);
    igual(N.disciplinasDaMatriz(ea, 'c1', ds).length, 0, 'não repete');
});

teste('Exportar: só o curso, sem as grades dos outros cursos', () => {
    const d = exemploUm();
    const e = N.exportarCurso(d);
    igual([e.cursos.length, e.externos.length], [1, 0]);
    igual(d.externos.length, 2, 'o original não muda');
});

teste('MEGA (simulado): salvar versões, listar e trazer os outros cursos do período', async () => {
    const Nuvem = require('../js/nuvem.js');
    const arq = (name, bytes, ts) => ({ name, directory: false, timestamp: ts, downloadBuffer: async () => bytes });
    let relogio = 1000;
    const pasta = (name) => ({ name, directory: true, children: [], async mkdir(n) { const p = pasta(n); this.children.push(p); return p; },
        upload(meta, bytes) { this.children.push(arq(meta.name, bytes, relogio++)); return { complete: Promise.resolve() }; } });
    const raiz = pasta('root');
    Nuvem.estado.simulado = { Storage: function () { this.ready = Promise.resolve(); this.root = raiz; } };
    global.localStorage = { setItem() {}, getItem() { return ''; } };
    await Nuvem.entrar('grupo@exemplo', 'x');
    const todos = exemplo();
    const r = N.gerar(todos, { semente: 2 }); todos.grade.alocacoes = r.alocacoes;
    for (const c of ['ecaut', 'ecivil', 'eagri']) await Nuvem.salvar(N.separarCurso(todos, c), N.exportarCurso);
    await Nuvem.salvar(N.separarCurso(todos, 'eagri'), N.exportarCurso); // segunda versão
    const lista = await Nuvem.listar(exemploUm());
    igual(lista.map((x) => x.curso).sort(), ['Engenharia Agricola', 'Engenharia Civil', 'Engenharia de Controle e Automacao']);
    igual(lista.find((x) => x.curso === 'Engenharia Agricola').versoes.length, 2);
    const meu = N.separarCurso(todos, 'eagri'); meu.externos = [];
    const outros = await Nuvem.outrosCursos(meu);
    igual(outros.map((x) => N.normalizar(x.dados).cursos[0].nome).sort(), ['Engenharia Civil', 'Engenharia de Controle e Automação']);
    ok(lista[0].versoes[0].name.startsWith(lista[0].curso));
    Nuvem.estado.simulado = null;
});

teste('Calendário: ler o texto colado da página (datas e tipos) em formatos diferentes', () => {
    const texto = `Calendário Acadêmico 2027
01/01/2027 – sexta-feira Feriado: Confraternização Universal
10/02/2027 quarta-feira Quarta-Feira de Cinzas (ponto facultativo até as 14 horas)
12/02/2027 Prazo para as Unidades solicitarem salas à SACE
08/03 segunda-feira Início do semestre letivo 2027/1 - Todos os cursos de Graduação e de Pós-Graduação
26/03/2027 Sexta-Feira Santa
21/04/2027 | Tiradentes
28/05/2027 - Recesso administrativo e acadêmico
10/07/2027 sábado Último dia letivo de 2027/1.
02/08/2027 Início do semestre 2027/2 - Todos os cursos
04/12/2027 Último dia letivo de 2027/2.`;
    const c = N.lerCalendarioTexto(texto, 2027, 'https://exemplo');
    igual(c.ano, 2027);
    igual(c.semestres, { 1: { inicio: '2027-03-08', fim: '2027-07-10' }, 2: { inicio: '2027-08-02', fim: '2027-12-04' } });
    igual(c.eventos.map((e) => [e.data, e.tipo]), [['2027-01-01', 'feriado'], ['2027-02-10', 'ponto'], ['2027-03-26', 'feriado'], ['2027-04-21', 'feriado'], ['2027-05-28', 'recesso']]);
    igual(c.eventos[1].ateHora, '14:00');
});

teste('Calendário 2027/1: dias letivos por dia da semana e disciplinas mais prejudicadas', () => {
    const d = exemploUm();
    igual(d.config.calendario.url, N.CALENDARIO_URL_2027);
    d.config.ano = 2027; d.config.metade = 1;
    d.grade.alocacoes = [{ disc: 'instal', d: 4, h: 0, sala: 's101' }, { disc: 'instal', d: 4, h: 1, sala: 's101' }, { disc: 'calc1', d: 0, h: 0, sala: 's102' }];
    const a = N.analisarCalendario(d);
    igual([a.inicio, a.fim], ['2027-03-08', '2027-07-10']);
    igual(a.porDia.map((x) => [x.dia, x.total, x.perdidos]), [['Segunda', 18, 0], ['Terça', 18, 0], ['Quarta', 18, 1], ['Quinta', 18, 1], ['Sexta', 18, 2]]);
    igual(a.disciplinas[0].codigo, 'EAG081', 'a da sexta é a mais prejudicada');
    igual([a.disciplinas[0].previstas, a.disciplinas[0].perdidas, a.disciplinas[0].datas], [36, 4, ['26/03/2027', '28/05/2027']]);
    igual(a.disciplinas[1].perdidas, 0, 'segunda não perde nada em 2027/1');
    d.config.metade = 2;
    const b = N.analisarCalendario(d);
    igual(b.porDia.find((x) => x.dia === 'Segunda').perdidos, 2, '2027/2: 20/09 e 15/11 são segundas');
    ok(b.disciplinas.find((x) => x.codigo === 'MAT001').perdidas === 2);
});

teste('Calendário: ponto facultativo até as 14h só tira as aulas da manhã', () => {
    const d = exemploUm();
    d.config.ano = 2027; d.config.metade = 1;
    d.config.calendario.eventos.push({ data: '2027-03-10', tipo: 'ponto', descricao: 'teste', ateHora: '14:00' });
    d.grade.alocacoes = [{ disc: 'calc1', d: 2, h: 0, sala: 's101' }, { disc: 'calc2', d: 2, h: 7, sala: 's101' }];
    const a = N.analisarCalendario(d);
    igual(a.disciplinas.find((x) => x.codigo === 'MAT001').datas.includes('10/03/2027'), true);
    igual(a.disciplinas.find((x) => x.codigo === 'MAT002').datas.includes('10/03/2027'), false);
});

teste('Pesquisa: o gerador não põe aula em horário reservado para pesquisa (sala e professor)', () => {
    for (let s = 1; s <= 10; s++) {
        const d = exemploUm();
        d.professores.find((p) => p.id === 'marlon').pesquisa = N.chavesTurno(d.config, 'manha', [1]);
        const r = N.gerar(d, { semente: s });
        const lia = d.salas.find((x) => x.id === 'lia');
        r.alocacoes.forEach((a) => {
            const k = `${a.d}|${a.h}`;
            ok(!(a.sala === 'lia' && lia.pesquisa.includes(k)), 'aula no horário de pesquisa do laboratório');
            ok(!(d.disciplinas.find((q) => q.id === a.disc).professor === 'marlon' && a.d === 1 && a.h < 5), 'aula no horário de pesquisa do professor');
        });
    }
});

teste('Relatórios internos: carga dos professores (com outros cursos) e uso das salas (ensino, pesquisa, livre)', () => {
    const d = exemploUm();
    const r0 = N.gerar(d, { semente: 6 }); d.grade.alocacoes = r0.alocacoes;
    const r = N.relatorios(d);
    const total = d.disciplinas.reduce((t, q) => t + q.aulas, 0); // nesta grade (só Eng. Agrícola) não há par de equivalentes
    igual(r.professores.reduce((t, p) => t + p.aulas, 0), total);
    const marlon = r.professores.find((p) => p.nome === 'Marlon Soares Sigales');
    igual(marlon.aulas, 15); igual(marlon.horas, 12.5);
    ok(r.professores.find((p) => p.nome.startsWith('Ana')).outrosCursosHoras > 0, 'Ana tem aula nos outros cursos');
    const lia = r.salas.find((s) => s.nome.startsWith('Lab. de Instrumentação'));
    igual(lia.pesquisaHoras, Math.round(6 * 50 / 60 * 10) / 10);
    ok(Math.abs(lia.pctEnsino + lia.pctPesquisa + lia.pctLivre + (lia.indispHoras ? 100 * lia.indispHoras / r.horasSemana : 0) - 100) < 0.5, 'soma 100%');
    for (let i = 1; i < r.salas.length; i++) ok(r.salas[i - 1].pctEnsino >= r.salas[i].pctEnsino, 'ordem: mais usadas primeiro');
});

const P = require('../js/planos.js'); global.Nucleo = N;
const comGradeUm = (semente = 1) => { const d = exemploUm(); d.config.ano = 2027; const r = N.gerar(d, { semente }); d.grade.alocacoes = r.alocacoes; d.grade.geradaEm = 't'; return d; };

teste('Estatística: média e desvio padrão amostral', () => {
    igual(P.estatistica([2, 4, 4, 4, 5, 5, 7, 9]), { n: 8, media: 5, desvio: 2.14, min: 2, max: 9 });
    igual(P.estatistica([]).n, 0);
});

teste('Verificação interna: horas de sala, laboratório, preparo (fator) e totais por professor; curso e unidade', () => {
    const d = comGradeUm(3);
    d.config.fatorPreparo = 1.5;
    const v = P.verificacao(d);
    const m = v.curso.professores.find((p) => p.nome === 'Marlon Soares Sigales');
    igual(m.aula, Math.round((m.sala + m.lab) * 100) / 100);
    igual(m.preparo, Math.round(m.aula * 1.5 * 100) / 100);
    ok(m.lab > 0, 'Marlon tem aula no laboratório (Instrumentação)');
    ok(v.unidade.professores.length >= v.curso.professores.length);
    const ana = v.unidade.professores.find((p) => p.nome.startsWith('Ana'));
    ok(ana.cursos.length >= 2, 'Ana aparece em mais de um curso na unidade');
    igual(v.curso.estat.total.n, v.curso.professores.length);
});

teste('Rendimento do professor: posição e médias do curso e da unidade', () => {
    const d = comGradeUm(3);
    const r = P.rendimento(d, 'Marlon Soares Sigales');
    ok(r.curso.eu && r.curso.posicao >= 1 && r.curso.posicao <= r.curso.de);
    ok(r.unidade.estat.aula.media > 0);
});

teste('Plano de ensino: cronograma pula feriados e o conteúdo salvo volta no outro semestre só com datas novas', () => {
    const d = comGradeUm(1);
    d.grade.alocacoes = d.grade.alocacoes.filter((a) => a.disc !== 'instal').concat([0, 1, 2].map((h) => ({ disc: 'instal', d: 4, h: 5 + h, sala: 's101' })));
    const q = d.disciplinas.find((x) => x.id === 'instal');
    const salvo = { ementa: 'Ementa X', roteiro: 'A\nB | T\nC | P', datasSemAula: '' };
    const p1 = P.planoDoSemestre(d, q, salvo);
    const l1 = p1.cronograma.linhas;
    igual(l1.slice(0, 4).map((l) => [l.dataBR, l.topico]), [['12/03/2027', 'A'], ['19/03/2027', 'B'], ['26/03/2027', 'Não haverá aula — Feriado: Sexta-Feira Santa'], ['02/04/2027', 'C']]);
    igual(l1[1].tipo, 'T'); igual(l1[3].tipo, 'P');
    ok(l1.some((l) => l.dataBR === '28/05/2027' && l.semAula), 'recesso 28/05');
    igual(l1[l1.length - 1].topico, 'Exame'); igual(l1[l1.length - 1].dataBR, '16/07/2027');
    igual(p1.localHorario.codigos, '621 622 623');
    d.config.metade = 2;
    const p2 = P.planoDoSemestre(d, q, salvo);
    igual(p2.ementa, 'Ementa X');
    igual(p2.cronograma.linhas[0].dataBR, '06/08/2027');
    igual(p2.semestre, 2);
});

teste('Plano: ponto até as 14h só tira aula da manhã; SIIEPE sem aula por padrão; datas próprias sem aula', () => {
    const d = comGradeUm(1);
    d.config.calendario.eventos.push({ data: '2027-03-10', tipo: 'ponto', descricao: 'teste', ateHora: '14:00' });
    d.grade.alocacoes = [{ disc: 'calc1', d: 2, h: 0, sala: 's101' }, { disc: 'calc2', d: 2, h: 7, sala: 's101' }];
    const manha = P.cronograma(d, d.disciplinas.find((q) => q.id === 'calc1'), P.conteudoPadrao(d, d.disciplinas.find((q) => q.id === 'calc1')));
    const tarde = P.cronograma(d, d.disciplinas.find((q) => q.id === 'calc2'), Object.assign(P.conteudoPadrao(d, d.disciplinas.find((q) => q.id === 'calc2')), { datasSemAula: '17/03 Semana Acadêmica' }));
    ok(manha.linhas.find((l) => l.dataBR === '10/03/2027').semAula);
    ok(!tarde.linhas.find((l) => l.dataBR === '10/03/2027').semAula);
    ok(tarde.linhas.find((l) => l.dataBR === '17/03/2027').topico.includes('Semana Acadêmica'));
    d.config.metade = 2;
    const sii = P.cronograma(d, d.disciplinas.find((q) => q.id === 'calc1'), P.conteudoPadrao(d, d.disciplinas.find((q) => q.id === 'calc1')));
    ok(sii.linhas.find((l) => l.dataBR === '20/10/2027').semAula, 'SIIEPE (quarta 20/10) sem aula');
});

teste('RAAD do ano: CH da turma = créditos × 18; dois semestres do ano pelo histórico; projetos', () => {
    const d = comGradeUm(2);
    const ind = P.individualVazio('Marlon Soares Sigales');
    ind.planos = { EAG081: { creditos: 4, cargaTeorica: 45, cargaPratica: 15 } };
    ind.historico = { '2027/2': [{ periodo: '2027/2', codigo: 'X1', nome: 'Outra', creditos: 2, ch: 36, chT: 36, chP: 0, chE: 0, chEAD: 0, chEX: 0, vinculo: '' }], '2026/2': [{ periodo: '2026/2', codigo: 'V', nome: 'Velha', ch: 99 }] };
    ind.projetos = [{ projeto: 'P1', acao: 'A', papel: 'Colaborador', ch: 40 }];
    const r = P.raad(d, ind);
    igual(r.ano, 2027);
    const inst = r.turmas.find((t) => t.codigo === 'EAG081');
    igual([inst.creditos, inst.ch, inst.chT, inst.chP], [4, 72, 54, 18]);
    ok(r.turmas.some((t) => t.codigo === 'X1') && !r.turmas.some((t) => t.codigo === 'V'), 'só o ano corrente');
    igual(r.chTotal, r.chEnsino + 40);
});

teste('Dados individuais: exportar traz planos, RAAD e rendimento, mas nunca a senha', async () => {
    const d = comGradeUm(2);
    const ind = P.individualVazio('Marlon Soares Sigales');
    ind.senhaHash = await P.hashSenha('segredo', ind.sal);
    ok(ind.senhaHash !== await P.hashSenha('outra', ind.sal));
    const x = P.exportarIndividual(d, ind);
    ok(!JSON.stringify(x).includes(ind.senhaHash) && !('senhaHash' in x) && !('sal' in x));
    igual(x.tipo, 'individual');
    ok(x.planosDoSemestre.length > 0 && x.raad && x.rendimento);
});

teste('Unidade: exportar (sem dados individuais) e importar juntando salas e professores pelo nome', () => {
    const d = comGradeUm(2);
    d.professores[0].pesquisa = ['1|0'];
    const u = P.exportarUnidade(d);
    igual(u.tipo, 'unidade');
    ok(u.cursos.length === 3, 'este curso + 2 outros');
    ok(!JSON.stringify(u).includes('senha'));
    const vazio = N.dadosVazios(); vazio.config.horarios = d.config.horarios;
    const r = P.importarUnidade(vazio, u);
    igual([r.salas, r.professores], [d.salas.length, d.professores.length]);
    igual(vazio.professores[0].pesquisa, ['1|0']);
    igual(vazio.salas.find((s) => s.nome.startsWith('Lab. de Instrumentação')).responsaveis.length, 1);
    igual(P.importarUnidade(vazio, u).salas, 0, 'não duplica');
});

teste('DOCX: plano de ensino e RAAD são gerados (zip .docx com o texto)', async () => {
    global.LOGOS_PDF = require('vm').runInNewContext(require('fs').readFileSync(path.join(__dirname, '../js/logos.js'), 'utf8') + ';LOGOS_PDF');
    const X = require('../js/docx-docs.js');
    const d = comGradeUm(1);
    const q = d.disciplinas.find((x) => x.id === 'eletrot');
    const buf = await X.plano(P.planoDoSemestre(d, q, { ementa: 'Ementa de teste', roteiro: 'Apresentação' }));
    ok(buf.length > 10000 && buf[0] === 0x50 && buf[1] === 0x4b, 'é um zip');
    const JSZipLike = require('../js/vendor/docx.umd.js'); // a biblioteca já carrega o zip; conferimos o XML direto
    const txt = buf.toString('latin1');
    ok(txt.includes('word/document.xml'));
    const r = await X.raad(P.raad(d, P.individualVazio('Marlon Soares Sigales')));
    ok(r.length > 10000);
});

teste('MEGA (simulado): unidade salva em _unidade e não aparece como curso', async () => {
    const Nuvem = require('../js/nuvem.js');
    const arq = (name, bytes, ts) => ({ name, directory: false, timestamp: ts, downloadBuffer: async () => bytes });
    let relogio = 5000;
    const pasta = (name) => ({ name, directory: true, children: [], async mkdir(n) { const p = pasta(n); this.children.push(p); return p; },
        upload(meta, bytes) { this.children.push(arq(meta.name, bytes, relogio++)); return { complete: Promise.resolve() }; } });
    const raiz = pasta('root');
    Nuvem.estado.simulado = { Storage: function () { this.ready = Promise.resolve(); this.root = raiz; } };
    Nuvem.estado.storage = null;
    global.localStorage = { setItem() {}, getItem() { return ''; } };
    await Nuvem.entrar('grupo@exemplo', 'x');
    const d = comGradeUm(2);
    await Nuvem.salvar(d, N.exportarCurso);
    await Nuvem.salvarUnidade(d, P.exportarUnidade);
    igual((await Nuvem.listar(d)).map((x) => x.curso), ['Engenharia Agricola']);
    const u = await Nuvem.abrirUnidade(d);
    igual([u.tipo, u.salas.length], ['unidade', d.salas.length]);
    Nuvem.estado.simulado = null;
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

(async () => {
    let falhas = 0;
    for (const t of TESTES) {
        try { await t.f(); console.log(`  ok  ${t.nome}`); } catch (e) { falhas++; console.log(`FALHOU ${t.nome}\n      ${e.message}`); }
    }
    console.log(`\n${TESTES.length - falhas} de ${TESTES.length} passaram.`);
    process.exit(falhas ? 1 : 0);
})();
