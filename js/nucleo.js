/**
 * © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * NÚCLEO: modelo de dados, regras, detecção de conflitos e gerador aleatório da grade.
 * Não mexe na página: roda igual no navegador e no Node (tests/testes.js).
 *
 * Um horário é uma chave "d|h": d = índice do dia em config.dias, h = índice da aula em config.horarios.
 *
 * Regras (do pedido do usuário):
 *  - sala/laboratório pode ter horários proibidos (sala.indisp);
 *  - professor pode ter horários proibidos (professor.indisp);
 *  - uma disciplina pode ter horários fixos (disciplina.fixos): só ocorre neles;
 *  - mais de um curso pode usar a mesma disciplina (disciplina.ofertas: vários cursos/semestres);
 *  - professor e sala não podem ter duas aulas ao mesmo tempo, a menos que as disciplinas sejam equivalentes
 *    (disciplina.equivalentes: viram uma turma só, no mesmo horário e na mesma sala);
 *  - cada curso tem número de semestres próprio e horários próprios para ofertas e para reofertas;
 *    na metade 1 do ano os semestres ímpares são oferta e os pares são reoferta (na metade 2, o contrário);
 *  - cada curso tem disciplinas obrigatórias, optativas e livres (caráter da disciplina naquele curso);
 *  - no mesmo semestre de um curso não pode haver duas aulas no mesmo horário (qualquer caráter);
 *  - cada disciplina tem um professor responsável e pode ter vários regentes (disciplina.regentes); todos dão aula, mas o
 *    regente pode apoiar várias disciplinas: colisão só de regência = aviso leve; regência × responsável = aviso;
 *    responsável × responsável = erro. Regente indisponível (com o responsável disponível) = aviso. O gerador só
 *    bloqueia o responsável; para os regentes, evita colisões quando dá;
 *  - cada laboratório tem um ou mais responsáveis;
 *  - cada arquivo é a grade de UM curso (dados.cursos tem um curso só), de uma unidade (config.unidade);
 *  - cada unidade é autônoma: professores só se bloqueiam entre cursos da mesma unidade; salas nunca podem conflitar;
 *  - cada curso pode preferir turnos por semestre (curso.preferencias: {semestre: ['manha', ...]}): o gerador tenta;
 *  - professores e laboratórios já usados pela grade de outro curso (dados.externos, vindos do MEGA ou de JSON importado)
 *    não podem ser usados no mesmo horário, a não ser na mesma disciplina (mesmo código), mesma sala: turma conjunta;
 *  - responsáveis do laboratório têm prioridade nele e decidem se aceitam aulas de outros professores
 *  - horários reservados para pesquisa (sala.pesquisa, professor.pesquisa) não recebem aula;
 *    (sala.politica: 'todos' | 'autorizados' (lista sala.autorizados) | 'responsaveis').
 */

'use strict';

const Nucleo = (() => {
    const CARATER = { obrigatoria: 'Obrigatória', optativa: 'Optativa', livre: 'Livre' };
    const POLITICA = {
        todos: 'Aceita aulas de qualquer professor',
        autorizados: 'Só responsáveis e professores autorizados',
        responsaveis: 'Só os responsáveis'
    };
    const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

    const chave = (d, h) => `${d}|${h}`;
    const separa = (k) => k.split('|').map(Number);
    const copia = (x) => JSON.parse(JSON.stringify(x));

    /** Gerador pseudoaleatório com semente (mulberry32), para os testes serem repetíveis. */
    function rngSemente(semente) {
        let a = (semente >>> 0) || 1;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function embaralha(lista, rng) {
        for (let i = lista.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [lista[i], lista[j]] = [lista[j], lista[i]];
        }
        return lista;
    }

    const minutos = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
    /** Turno pelo início da aula: manhã antes das 12h, tarde antes das 18h30, noite depois. */
    function turno(horario) { const m = minutos(horario.ini); return m < 720 ? 'manha' : (m < 1110 ? 'tarde' : 'noite'); }
    const NOME_TURNO = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };

    /** Situação da disciplina no curso: na metade 1 os semestres ímpares são oferta; na metade 2, os pares. */
    function situacao(semestre, metade) {
        const impar = Number(semestre) % 2 === 1;
        return (Number(metade) === 2 ? !impar : impar) ? 'oferta' : 'reoferta';
    }

    /** Todos os horários válidos da configuração. */
    function todasChaves(cfg) {
        const r = [];
        for (let d = 0; d < cfg.dias.length; d++) for (let h = 0; h < cfg.horarios.length; h++) r.push(chave(d, h));
        return r;
    }
    /** As aulas h e h+1 são seguidas (mesmo turno e intervalo de até 20 min)? Um bloco não passa de um turno para outro. */
    function seguidas(cfg, h) {
        const a = cfg.horarios[h], b = cfg.horarios[h + 1];
        return !!(a && b) && turno(a) === turno(b) && minutos(b.ini) - minutos(a.fim) <= 20 && minutos(b.ini) >= minutos(a.fim) - 1;
    }

    /** Índices auxiliares por id. */
    function indices(dados) {
        const por = (lista) => Object.fromEntries((lista || []).map((x) => [x.id, x]));
        return { curso: por(dados.cursos), prof: por(dados.professores), sala: por(dados.salas), disc: por(dados.disciplinas) };
    }

    /** Grupos de disciplinas equivalentes (união das listas, nos dois sentidos). Devolve {grupoDe: id→lider, grupos: lider→[ids]}. */
    function gruposEquivalentes(dados) {
        const pai = {};
        const acha = (x) => { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; };
        (dados.disciplinas || []).forEach((d) => { pai[d.id] = d.id; });
        (dados.disciplinas || []).forEach((d) => (d.equivalentes || []).forEach((e) => {
            if (pai[e] === undefined) return;
            const a = acha(d.id), b = acha(e);
            if (a !== b) pai[b] = a;
        }));
        const grupos = {}, grupoDe = {};
        (dados.disciplinas || []).forEach((d) => { const r = acha(d.id); (grupos[r] = grupos[r] || []).push(d.id); });
        Object.values(grupos).forEach((ids) => { const lider = ids[0]; ids.forEach((i) => { grupoDe[i] = lider; }); });
        const porLider = {};
        Object.values(grupos).forEach((ids) => { porLider[ids[0]] = ids; });
        return { grupoDe, grupos: porLider };
    }

    /** Horários permitidos pelos cursos para a disciplina (interseção da janela de oferta/reoferta de cada curso). null = sem restrição. */
    function janelaCursos(dados, disc, idx) {
        let conj = null;
        (disc.ofertas || []).forEach((o) => {
            const c = idx.curso[o.curso];
            if (!c) return;
            const lista = c[situacao(o.semestre, dados.config.metade)] || [];
            if (!lista.length) return; // curso sem janela cadastrada = sem restrição
            const s = new Set(lista);
            conj = conj === null ? s : new Set([...conj].filter((k) => s.has(k)));
        });
        return conj;
    }

    /** O professor pode dar aula nesta sala? (decisão dos responsáveis do laboratório) */
    function profPodeNaSala(sala, profId) {
        if (!sala) return false;
        const resp = sala.responsaveis || [];
        if (resp.includes(profId)) return true;
        const pol = sala.politica || 'todos';
        if (pol === 'todos') return true;
        if (pol === 'autorizados') return (sala.autorizados || []).includes(profId);
        return false;
    }

    /** Salas onde a disciplina pode ocorrer: a lista dela ou, se vazia, todas as salas comuns. */
    function salasPermitidas(dados, disc) {
        if (disc.salas && disc.salas.length) return disc.salas.filter((s) => (dados.salas || []).some((x) => x.id === s));
        return (dados.salas || []).filter((s) => s.tipo !== 'laboratorio').map((s) => s.id);
    }

    /** Divide as aulas semanais em blocos de aulas seguidas: "2+2" ou automático (até 3 juntas; acima, blocos de 2). */
    function blocos(disc) {
        const n = Math.max(0, Number(disc.aulas) || 0);
        const txt = String(disc.blocos || '').trim();
        if (txt) {
            const partes = txt.split(/[+,; ]+/).map(Number).filter((x) => x > 0);
            if (partes.length && partes.reduce((a, b) => a + b, 0) === n) return partes;
        }
        if (n <= 3) return n ? [n] : [];
        const r = [];
        let resto = n;
        while (resto > 3) { r.push(2); resto -= 2; }
        if (resto) r.push(resto);
        return r;
    }

    /** Turmas (curso|semestre|situação) às quais a disciplina pertence, com o caráter. */
    function turmasDe(dados, disc) {
        return (disc.ofertas || []).filter((o) => Number(o.semestre) > 0).map((o) => ({
            id: `${o.curso}|${o.semestre}|${situacao(o.semestre, dados.config.metade)}`,
            curso: o.curso, semestre: Number(o.semestre), situacao: situacao(o.semestre, dados.config.metade), carater: o.carater || 'obrigatoria'
        }));
    }

    /** Professores que dão a disciplina: o responsável e os regentes (sem repetir). */
    function professoresDe(disc) {
        return [...new Set([disc && disc.professor, ...((disc && disc.regentes) || [])].filter(Boolean))];
    }
    /** Nomes dos professores da disciplina ("Ana Lima, Bruno Costa"). */
    const nomesProfessores = (dados, disc) => professoresDe(disc).map((p) => nomeDe(dados.professores, p)).join(', ');

    /** Sigla do curso pelas iniciais (Engenharia de Controle e Automação → ECA). */
    function sigla(nome) {
        const fora = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para'];
        return String(nome || '').split(/\s+/).filter((w) => w && !fora.includes(w.toLowerCase())).map((w) => w[0].toUpperCase()).join('').slice(0, 5) || '?';
    }
    const nomeDisc = (d) => d ? `${d.codigo ? d.codigo + ' ' : ''}${d.nome}` : '?';
    const nomeDe = (lista, id) => ((lista || []).find((x) => x.id === id) || {}).nome || id;
    const rotuloHorario = (cfg, k) => { const [d, h] = separa(k); const ho = cfg.horarios[h]; return `${cfg.dias[d] || '?'} ${ho ? ho.ini : '?'}`; };

    // ================================================================ CÓDIGOS DE HORÁRIO (padrão UFPel)

    /** Número do dia no padrão UFPel: domingo 1, segunda 2, …, sexta 6, sábado 7. */
    const NUM_DIA = { Domingo: 1, Segunda: 2, 'Terça': 3, Quarta: 4, Quinta: 5, Sexta: 6, 'Sábado': 7 };
    const NUM_TURNO = { manha: 1, tarde: 2, noite: 3 };

    /** Código de um horário: dia + turno + período no turno. Sexta, manhã, 1º período = 611; segunda, tarde, 2º = 222. */
    function codigoHorario(cfg, d, h) {
        const ho = cfg.horarios[h];
        if (!ho) return '?';
        const t = turno(ho);
        let p = 0;
        for (let i = 0; i <= h; i++) if (turno(cfg.horarios[i]) === t) p++;
        return `${NUM_DIA[cfg.dias[d]] || d + 2}${NUM_TURNO[t]}${p}`;
    }

    /** Códigos dos horários de uma disciplina na grade, em ordem (ex.: "621 622 623 624"); com as salas, se pedir. */
    function codigosDisciplina(dados, discId, comSala) {
        const minhas = ((dados.grade && dados.grade.alocacoes) || []).filter((a) => a.disc === discId)
            .sort((a, b) => (NUM_DIA[dados.config.dias[a.d]] || a.d) - (NUM_DIA[dados.config.dias[b.d]] || b.d) || a.h - b.h);
        if (!comSala) return minhas.map((a) => codigoHorario(dados.config, a.d, a.h)).join(' ');
        const porSala = [];
        minhas.forEach((a) => {
            let g = porSala.find((x) => x.sala === a.sala);
            if (!g) { g = { sala: a.sala, cods: [] }; porSala.push(g); }
            g.cods.push(codigoHorario(dados.config, a.d, a.h));
        });
        return porSala.map((g) => ({ sala: g.sala, codigos: g.cods.join(' ') }));
    }

    /**
     * Relação de disciplinas e professores (sem grade): uma linha por disciplina em cada curso/semestre.
     * curso = id para filtrar (ou vazio para todos). Ordem: curso, semestre, código.
     */
    function relacao(dados, curso) {
        const linhas = [];
        (dados.disciplinas || []).forEach((q) => (q.ofertas || []).forEach((o) => {
            if (curso && o.curso !== curso) return;
            const porSala = codigosDisciplina(dados, q.id, true);
            linhas.push({
                curso: o.curso, cursoNome: nomeDe(dados.cursos, o.curso), semestre: Number(o.semestre), situacao: situacao(o.semestre, dados.config.metade),
                carater: o.carater, disc: q.id, codigo: q.codigo, nome: q.nome, professor: nomeDe(dados.professores, q.professor) || '', regentes: (q.regentes || []).map((p) => nomeDe(dados.professores, p)),
                salas: porSala.map((x) => nomeDe(dados.salas, x.sala)).join('; '),
                horarios: porSala.length > 1 ? porSala.map((x) => `${x.codigos} (${nomeDe(dados.salas, x.sala)})`).join('; ') : (porSala[0] ? porSala[0].codigos : ''),
                aulas: Number(q.aulas) || 0, naGrade: porSala.reduce((t, x) => t + x.codigos.split(' ').length, 0)
            });
        }));
        return linhas.sort((a, b) => a.cursoNome.localeCompare(b.cursoNome) || a.semestre - b.semestre || String(a.codigo).localeCompare(String(b.codigo)) || a.nome.localeCompare(b.nome));
    }

    // ================================================================ OUTROS CURSOS (ocupações externas)

    const normNome = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

    /** Tira de um arquivo (que pode ter vários cursos) só a grade de um curso. */
    function separarCurso(dados, cursoId) {
        const d = copia(dados);
        d.cursos = d.cursos.filter((c) => c.id === cursoId);
        d.disciplinas = d.disciplinas.filter((q) => q.ofertas.some((o) => o.curso === cursoId)).map((q) => Object.assign(q, { ofertas: q.ofertas.filter((o) => o.curso === cursoId) }));
        const ids = new Set(d.disciplinas.map((q) => q.id));
        d.disciplinas.forEach((q) => { q.equivalentes = q.equivalentes.filter((e) => ids.has(e)); });
        d.grade.alocacoes = d.grade.alocacoes.filter((a) => ids.has(a.disc));
        d.grade.naoAlocadas = (d.grade.naoAlocadas || []).filter((x) => ids.has(x.disc));
        return d;
    }

    /** Aulas de um curso num formato que não depende da configuração (dia pelo nome, horário pelo relógio). */
    function aulasParaOutros(dados, cursoId) {
        const cfg = dados.config, idx = indices(dados);
        return ((dados.grade && dados.grade.alocacoes) || []).filter((a) => { const q = idx.disc[a.disc]; return q && (!cursoId || q.ofertas.some((o) => o.curso === cursoId)); })
            .map((a) => {
                const q = idx.disc[a.disc], h = cfg.horarios[a.h];
                return h && cfg.dias[a.d] ? { dia: cfg.dias[a.d], ini: h.ini, fim: h.fim, professor: nomeDe(dados.professores, q.professor) || '', professores: professoresDe(q).map((p) => nomeDe(dados.professores, p)), sala: nomeDe(dados.salas, a.sala) || '', codigo: q.codigo || '', disciplina: q.nome } : null;
            }).filter(Boolean);
    }

    /** Resumo da grade de um curso para bloquear professores e salas nos outros cursos. */
    function externoDe(dados, cursoId, origem) {
        const c = (dados.cursos || []).find((x) => x.id === cursoId) || (dados.cursos || [])[0];
        return { curso: c ? c.nome : '?', unidade: ((dados.config.unidade || {}).nome) || '', ano: dados.config.ano, metade: dados.config.metade, origem: origem || 'arquivo',
            versao: (dados.grade && dados.grade.geradaEm) || null, aulas: aulasParaOutros(dados, c && c.id) };
    }

    /** Coloca (ou troca) a grade de outro curso na lista de externos. Devolve aviso se o período for diferente ou o curso for o mesmo. */
    function incluirExterno(dados, ext) {
        const meu = normNome((dados.cursos[0] || {}).nome);
        if (meu && normNome(ext.curso) === meu) return { ok: false, motivo: `É o próprio curso desta grade (${ext.curso}).` };
        if (Number(ext.ano) !== Number(dados.config.ano) || Number(ext.metade) !== Number(dados.config.metade)) return { ok: false, motivo: `${ext.curso} é de ${ext.ano}/${ext.metade}; esta grade é de ${dados.config.ano}/${dados.config.metade}.` };
        dados.externos = (dados.externos || []).filter((x) => normNome(x.curso) !== normNome(ext.curso));
        dados.externos.push(ext);
        return { ok: true };
    }

    /**
     * Onde os professores e as salas desta grade já estão ocupados por outros cursos (casados pelo nome).
     * Devolve { prof: {profId: {chave: [info]}}, sala: {salaId: {chave: [info]}}, semPar: {professores:Set, salas:Set} }.
     * Um horário de outro curso ocupa todo horário local que se sobrepõe a ele no relógio.
     */
    function ocupacoesExternas(dados) {
        const cfg = dados.config, meu = normNome((dados.cursos[0] || {}).nome);
        const profPorNome = {}, salaPorNome = {};
        (dados.professores || []).forEach((p) => { profPorNome[normNome(p.nome)] = p.id; });
        (dados.salas || []).forEach((x) => { salaPorNome[normNome(x.nome)] = x.id; });
        const prof = {}, sala = {};
        const poe = (mapa, id, k, info) => { const m = (mapa[id] = mapa[id] || {}); (m[k] = m[k] || []).push(info); };
        const minhaUnidade = normNome((cfg.unidade || {}).nome);
        (dados.externos || []).forEach((ex) => {
            if (normNome(ex.curso) === meu) return;
            const mesmaUnidade = !ex.unidade || !minhaUnidade || normNome(ex.unidade) === minhaUnidade; // outra unidade: só as salas contam
            (ex.aulas || []).forEach((au) => {
                const d = cfg.dias.indexOf(au.dia);
                if (d < 0) return;
                const a0 = minutos(au.ini), a1 = minutos(au.fim || au.ini) || a0 + 50;
                const info = { curso: ex.curso + (mesmaUnidade || !ex.unidade ? '' : ` (${ex.unidade})`), codigo: au.codigo, disciplina: au.disciplina, sala: au.sala, professor: au.professor };
                cfg.horarios.forEach((h, j) => {
                    if (!(minutos(h.ini) < a1 && a0 < minutos(h.fim))) return;
                    const k = chave(d, j);
                    const x = salaPorNome[normNome(au.sala)];
                    if (mesmaUnidade) {
                        const vistosP = new Set();
                        (au.professores && au.professores.length ? au.professores : [au.professor]).forEach((nm) => {
                            const p = profPorNome[normNome(nm)];
                            if (!p || vistosP.has(p)) return; vistosP.add(p);
                            poe(prof, p, k, Object.assign({}, info, { papel: normNome(nm) === normNome(au.professor) ? 'resp' : 'reg' })); // papel lá: responsável ou regente
                        });
                    }
                    if (x) poe(sala, x, k, info);
                });
            });
        });
        return { prof, sala };
    }
    /** Mesma disciplina (código) na mesma sala = turma conjunta com o outro curso (permitido). */
    const conjunta = (info, disc, nomeSala) => !!info.codigo && normNome(info.codigo) === normNome(disc.codigo) && normNome(info.sala) === normNome(nomeSala);

    // ================================================================ PREFERÊNCIA DE TURNO POR SEMESTRE

    /** Turnos preferidos para a disciplina (pelos semestres dela no curso). null = sem preferência. */
    function turnosPreferidos(dados, disc) {
        let pref = null;
        (disc.ofertas || []).forEach((o) => {
            const c = (dados.cursos || []).find((x) => x.id === o.curso);
            const lista = c && c.preferencias && c.preferencias[String(o.semestre)];
            if (!lista || !lista.length) return;
            pref = pref === null ? new Set(lista) : new Set([...pref].filter((t) => lista.includes(t)));
        });
        return pref;
    }

    // ================================================================ MATRIZ CURRICULAR (catálogo UFPel)

    /** Nome em maiúsculas da matriz → forma usual (CÁLCULO A → Cálculo A; INTRODUÇÃO À ENGENHARIA → Introdução à Engenharia). */
    function tituloPT(nome) {
        const minus = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'à', 'às', 'a', 'o', 'ao', 'aos', 'para', 'por', 'com', 'via'];
        const siglas = /^(I{1,3}|IV|V|VI{0,3}|IX|X|EAD|TCC|EAS|CLPS?|LMI|SMS|ACE|LIBRAS|3D|4\.0|\(AUT\)|\(EAD\))$/i;
        const partes = String(nome || '').toLowerCase().split(/(\s+)/);
        return partes.map((w, i) => {
            if (/^\s+$/.test(w)) return w;
            const limpo = w.replace(/[()]/g, '');
            if (siglas.test(w) || siglas.test(limpo)) return w.toUpperCase();
            if (i > 0 && i < partes.length - 1 && minus.includes(w)) return w; // a última palavra fica maiúscula (Cálculo A)
            return w.charAt(0).toUpperCase() + w.slice(1);
        }).join('').replace(/\(\s*/g, '(').replace(/\s*\)/g, ')');
    }
    /** Disciplina sem aula em sala (estágio, TCC, EAD, extensão): entra no cadastro com 0 aulas, fora da grade. */
    const SEM_AULA = /EST[ÁA]GIO|TRABALHO DE (CONCLUS|GRADUA)|^TCC\b|\(EAD\)|PROJETOS DE EXTENS|PR[ÁA]TICAS EXTENSIONISTAS|^ATIVIDADES|VOLUNTARIADO/i;

    /**
     * Disciplinas de um curso do catálogo (matriz curricular): obrigatórias no semestre delas, com aulas semanais = créditos;
     * estágio, TCC, EAD e extensão com 0 aulas; optativas com 0 aulas e semestre 0 (a definir quando forem ofertadas).
     * Não repete códigos que já existem em `jaExistem`.
     */
    function disciplinasDaMatriz(cursoCat, cursoId, jaExistem) {
        const tem = new Set((jaExistem || []).map((q) => q.codigo).filter(Boolean));
        return ((cursoCat && cursoCat.matriz) || []).filter((m) => !tem.has(m.codigo)).map((m) => ({
            id: `m${m.codigo}`, codigo: m.codigo, nome: tituloPT(m.nome), professor: '',
            aulas: m.carater === 'optativa' || SEM_AULA.test(m.nome) ? 0 : m.creditos, blocos: '', salas: [], fixos: [], equivalentes: [],
            ofertas: [{ curso: cursoId, semestre: m.sem, carater: m.carater }], creditos: m.creditos, horas: m.horas
        }));
    }

    /** Arquivo para exportar/salvar: só este curso (sem as grades dos outros cursos). */
    function exportarCurso(dados) {
        const d = copia(dados);
        d.externos = [];
        d.exportadoEm = new Date().toISOString();
        return d;
    }


    // ================================================================ CALENDÁRIO ACADÊMICO (feriados, dias letivos, aulas perdidas)

    /** Calendário acadêmico 2027 da UFPel (CRA), extraído em 17/11/2026 de CALENDARIO_URL_2027. */
    const CALENDARIO_URL_2027 = 'https://wp.ufpel.edu.br/cra/calendarios-academicos/calendario-academico-2027/';
    function calendario2027() {
        const e = (data, tipo, descricao, ateHora) => ({ data, tipo, descricao, ateHora: ateHora || '' });
        return {
            url: CALENDARIO_URL_2027, ano: 2027, obtidoEm: '2026-11-17', origem: 'embutido',
            semestres: { 1: { inicio: '2027-03-08', fim: '2027-07-10', exames: { inicio: '2027-07-12', fim: '2027-07-17' } },
                2: { inicio: '2027-08-02', fim: '2027-12-04', exames: { inicio: '2027-12-06', fim: '2027-12-11' } } },
            eventos: [
                e('2027-01-01', 'feriado', 'Confraternização Universal'), e('2027-02-02', 'feriado', 'Nossa Senhora dos Navegantes'),
                e('2027-02-08', 'recesso', 'Recesso'), e('2027-02-09', 'recesso', 'Recesso: Carnaval'),
                e('2027-02-10', 'ponto', 'Quarta-Feira de Cinzas (ponto facultativo até as 14 horas)', '14:00'),
                e('2027-03-26', 'feriado', 'Sexta-Feira Santa'), e('2027-03-28', 'feriado', 'Páscoa'), e('2027-04-21', 'feriado', 'Tiradentes'),
                e('2027-05-01', 'feriado', 'Dia do Trabalhador'), e('2027-05-12', 'evento', 'Mostra de Cursos'),
                e('2027-05-27', 'feriado', 'Corpus Christi'), e('2027-05-28', 'recesso', 'Recesso administrativo e acadêmico (ponto facultativo)'),
                e('2027-09-07', 'feriado', 'Independência'), e('2027-09-20', 'feriado', 'Dia do Gaúcho'), e('2027-09-29', 'evento', 'Mundo UFPel'),
                e('2027-10-12', 'feriado', 'Nossa Senhora Aparecida'),
                ...['18', '19', '20', '21', '22', '23'].map((d) => e(`2027-10-${d}`, 'evento', 'SIIEPE — Semana Integrada de Inovação, Ensino, Pesquisa e Extensão')),
                e('2027-10-28', 'recesso', 'Recesso: Dia do Servidor Público'), e('2027-11-02', 'feriado', 'Finados'),
                e('2027-11-15', 'feriado', 'Proclamação da República'), e('2027-11-20', 'feriado', 'Dia Nacional de Zumbi e da Consciência Negra'),
                e('2027-12-20', 'recesso', 'Início do período de recesso'), e('2027-12-24', 'recesso', 'Recesso: Véspera de Natal'),
                e('2027-12-25', 'feriado', 'Natal'), e('2027-12-31', 'recesso', 'Recesso: Véspera de Ano Novo')
            ]
        };
    }
    const SUSPENDE = { feriado: true, recesso: true, ponto: true, evento: false, curso: true, ausencia: true };
    const NOME_TIPO_CAL = { feriado: 'Feriado', recesso: 'Recesso', ponto: 'Ponto facultativo', evento: 'Evento (não suspende aulas)', curso: 'Evento do curso', ausencia: 'Ausência do professor' };
    /** Período (início–fim, AAAA-MM-DD) → lista de datas. */
    function datasDoPeriodo(inicio, fim) {
        const r = [];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio || '')) return r;
        const f = /^\d{4}-\d{2}-\d{2}$/.test(fim || '') && fim >= inicio ? fim : inicio;
        for (let dt = dataUTC(inicio); isoDe(dt) <= f; dt.setUTCDate(dt.getUTCDate() + 1)) r.push(isoDe(dt));
        return r;
    }
    /**
     * Datas do calendário que valem para esta grade: as do calendário acadêmico vigente + os eventos do curso
     * (config.eventosCurso: semana acadêmica etc.; semAula=false = há aula) + (se dadas) as ausências de um professor.
     */
    function eventosDoCalendario(dados, ausencias) {
        const cal = dados.config.calendario || {};
        const r = (cal.eventos || []).slice();
        (dados.config.eventosCurso || []).forEach((e) => datasDoPeriodo(e.inicio, e.fim).forEach((data) => r.push({ data, tipo: e.semAula === false ? 'evento' : 'curso', descricao: e.descricao || 'Evento do curso', ateHora: '' })));
        (ausencias || []).forEach((e) => datasDoPeriodo(e.inicio, e.fim).forEach((data) => r.push({ data, tipo: 'ausencia', descricao: `${e.motivo || 'Ausência justificada'}`, ateHora: '' })));
        return r.sort((a, b) => a.data.localeCompare(b.data));
    }
    const FERIADOS_NOMES = /confraterniza|navegantes|sexta-feira santa|p[áa]scoa|tiradentes|trabalh|corpus christi|independ[êe]ncia|ga[úu]cho|aparecida|finados|proclama|zumbi|consci[êe]ncia negra|natal\b|feriado/i;

    /**
     * Lê o texto do calendário acadêmico (copiado da página do link vigente). Tolerante ao formato:
     * cada data DD/MM ou DD/MM/AAAA abre uma entrada com o texto até a próxima data.
     */
    function lerCalendarioTexto(texto, anoPadrao, url) {
        const t = String(texto || '').replace(/\r/g, '');
        const re = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)/g; // não pega "27/1" de "2027/1"
        const marcas = [];
        let m;
        while ((m = re.exec(t))) marcas.push({ i: m.index, fimI: re.lastIndex, d: +m[1], mes: +m[2], ano: m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : null });
        const cal = { url: url || '', ano: anoPadrao, obtidoEm: new Date().toISOString().slice(0, 10), origem: 'texto', semestres: {}, eventos: [] };
        const anos = {};
        marcas.forEach((mk) => { if (mk.ano) anos[mk.ano] = (anos[mk.ano] || 0) + 1; });
        const anoMaisComum = Number(Object.keys(anos).sort((a, b) => anos[b] - anos[a])[0]) || anoPadrao;
        cal.ano = anoMaisComum;
        marcas.forEach((mk, k) => {
            if (mk.d < 1 || mk.d > 31 || mk.mes < 1 || mk.mes > 12) return;
            const ano = mk.ano || anoMaisComum;
            const desc = t.slice(mk.fimI, k + 1 < marcas.length ? marcas[k + 1].i : t.length).replace(/^[\s\-–—:|,.()a-zçáéíóúâêôãõ]{0,25}?(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/, '').replace(/\s+/g, ' ').trim().slice(0, 200);
            if (!desc) return;
            const data = `${ano}-${String(mk.mes).padStart(2, '0')}-${String(mk.d).padStart(2, '0')}`;
            const sem = desc.match(/(\d{4})\/([12])/);
            if (/in[íi]cio do semestre/i.test(desc) && sem) { (cal.semestres[sem[2]] = cal.semestres[sem[2]] || {}).inicio = data; return; }
            if (/[úu]ltimo dia letivo/i.test(desc) && sem) { (cal.semestres[sem[2]] = cal.semestres[sem[2]] || {}).fim = data; return; }
            if (/per[íi]odo de exames?|exames? (de|do)/i.test(desc) && sem) { const x = (cal.semestres[sem[2]] = cal.semestres[sem[2]] || {}); x.exames = x.exames || {}; if (/fim|t[ée]rmino|encerra/i.test(desc)) x.exames.fim = data; else { x.exames.inicio = x.exames.inicio || data; if (!x.exames.fim) x.exames.fim = data; } return; }
            let tipo = null;
            if (/recesso/i.test(desc)) tipo = 'recesso';
            else if (/ponto facultativo/i.test(desc)) tipo = 'ponto';
            else if (FERIADOS_NOMES.test(desc) && desc.length < 90) tipo = 'feriado';
            else if (/SIIEPE|semana acad[êe]mica|aulas suspensas|atividades suspensas/i.test(desc)) tipo = /suspens/i.test(desc) ? 'recesso' : 'evento';
            if (!tipo) return;
            const ate = desc.match(/at[ée] (?:as |às )?(\d{1,2})\s*(?:h|horas)/i);
            if (!cal.eventos.some((x) => x.data === data && x.descricao === desc)) cal.eventos.push({ data, tipo, descricao: desc, ateHora: ate ? `${ate[1].padStart(2, '0')}:00` : '' });
        });
        cal.eventos.sort((a, b) => a.data.localeCompare(b.data));
        return cal;
    }

    const NOMES_DIA_JS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const dataUTC = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
    const isoDe = (dt) => dt.toISOString().slice(0, 10);
    const dataBR = (iso) => iso.split('-').reverse().join('/');

    /**
     * Análise do semestre letivo: feriados e recessos que caem nos dias de aula, dias letivos por dia da semana e as
     * disciplinas mais prejudicadas (aulas perdidas pela grade atual). Devolve null sem calendário/semestre.
     */
    function analisarCalendario(dados) {
        const cal = dados.config.calendario;
        const sem = cal && cal.semestres && cal.semestres[String(dados.config.metade)];
        if (!sem || !sem.inicio || !sem.fim) return null;
        const cfg = dados.config, idx = indices(dados);
        const ini = dataUTC(sem.inicio), fim = dataUTC(sem.fim);
        const evPorData = {};
        const todosEventos = eventosDoCalendario(dados);
        todosEventos.forEach((e) => { (evPorData[e.data] = evPorData[e.data] || []).push(e); });
        const porDia = cfg.dias.map((nome) => ({ dia: nome, total: 0, perdidos: 0, parciais: 0, letivos: 0, datasPerdidas: [] }));
        const eventos = [];
        for (let dt = new Date(ini); dt <= fim; dt.setUTCDate(dt.getUTCDate() + 1)) {
            const iso = isoDe(dt), nome = NOMES_DIA_JS[dt.getUTCDay()], d = cfg.dias.indexOf(nome);
            const evs = evPorData[iso] || [];
            evs.forEach((e) => eventos.push(Object.assign({}, e, { diaSemana: nome, temAula: d >= 0, suspende: !!SUSPENDE[e.tipo] })));
            if (d < 0) continue;
            const pd = porDia[d];
            pd.total++;
            const susp = evs.filter((e) => SUSPENDE[e.tipo]);
            if (susp.some((e) => !e.ateHora)) { pd.perdidos++; pd.datasPerdidas.push(iso); }
            else if (susp.length) pd.parciais++;
            else pd.letivos++;
        }
        // eventos fora do período (para a lista de feriados do ano) também entram, marcados
        todosEventos.forEach((e) => { if (e.data < sem.inicio || e.data > sem.fim) eventos.push(Object.assign({}, e, { diaSemana: NOMES_DIA_JS[dataUTC(e.data).getUTCDay()], foraDoPeriodo: true, suspende: !!SUSPENDE[e.tipo] })); });
        eventos.sort((a, b) => a.data.localeCompare(b.data));

        // aulas perdidas por alocação
        const perdeu = (d, h, iso) => (evPorData[iso] || []).some((e) => SUSPENDE[e.tipo] && (!e.ateHora || minutos(cfg.horarios[h].ini) < minutos(e.ateHora)));
        const datasDoDia = cfg.dias.map(() => []);
        for (let dt = new Date(ini); dt <= fim; dt.setUTCDate(dt.getUTCDate() + 1)) { const d = cfg.dias.indexOf(NOMES_DIA_JS[dt.getUTCDay()]); if (d >= 0) datasDoDia[d].push(isoDe(dt)); }
        const porDisc = {};
        ((dados.grade && dados.grade.alocacoes) || []).forEach((a) => {
            const q = idx.disc[a.disc];
            if (!q || !cfg.horarios[a.h] || a.d >= cfg.dias.length) return;
            const r = (porDisc[q.id] = porDisc[q.id] || { disc: q.id, codigo: q.codigo, nome: q.nome, professor: nomesProfessores(dados, q), aulasSemana: 0, dias: new Set(), previstas: 0, perdidas: 0, datas: new Set() });
            r.aulasSemana++; r.dias.add(cfg.dias[a.d]);
            datasDoDia[a.d].forEach((iso) => { r.previstas++; if (perdeu(a.d, a.h, iso)) { r.perdidas++; r.datas.add(iso); } });
        });
        const disciplinas = Object.values(porDisc).map((r) => {
            const q = idx.disc[r.disc];
            const exigidas = Number(q.horas) || (Number(q.creditos) || Number(q.aulas) || 0) * 15;
            const dadas = r.previstas - r.perdidas;
            return { disc: r.disc, codigo: r.codigo, nome: r.nome, professor: r.professor, aulasSemana: r.aulasSemana, dias: [...r.dias].join(', '),
                previstas: r.previstas, perdidas: r.perdidas, dadas, pct: r.previstas ? Math.round(1000 * r.perdidas / r.previstas) / 10 : 0,
                exigidas, saldo: dadas - exigidas, datas: [...r.datas].sort().map(dataBR) };
        }).sort((a, b) => b.perdidas - a.perdidas || b.pct - a.pct || a.saldo - b.saldo);
        return { url: cal.url, inicio: sem.inicio, fim: sem.fim, ano: cal.ano, eventos, porDia, disciplinas, semanas: Math.round((fim - ini) / 6048e5 * 10) / 10 };
    }

    // ================================================================ RELATÓRIOS INTERNOS (carga horária e uso)

    /**
     * Carga horária dos professores e uso das salas/laboratórios nesta grade (e, para os professores, nos outros cursos
     * da mesma unidade carregados em dados.externos). Aula = 1 período (duração tirada dos horários).
     */
    function relatorios(dados) {
        const cfg = dados.config, idx = indices(dados), eq = gruposEquivalentes(dados);
        const dur = (h) => (minutos(cfg.horarios[h].fim) - minutos(cfg.horarios[h].ini)) / 60;
        const totalSlots = cfg.dias.length * cfg.horarios.length;
        const horasSlots = cfg.dias.length * cfg.horarios.reduce((t, h, j) => t + dur(j), 0);
        // aulas desta grade: turmas conjuntas (equivalentes no mesmo horário e sala) contam uma vez para professor e sala
        const vistos = new Set(), aulas = [];
        ((dados.grade && dados.grade.alocacoes) || []).forEach((a) => {
            const q = idx.disc[a.disc]; if (!q || !cfg.horarios[a.h]) return;
            const ch = `${eq.grupoDe[a.disc]}|${a.d}|${a.h}|${a.sala}`;
            if (vistos.has(ch)) return; vistos.add(ch);
            aulas.push({ a, q });
        });
        const ext = ocupacoesExternas(dados);
        const professores = (dados.professores || []).map((p) => {
            const minhas = aulas.filter((x) => professoresDe(x.q).includes(p.id));
            const horas = minhas.reduce((t, x) => t + dur(x.a.h), 0);
            const meusK = new Set(minhas.map((x) => chave(x.a.d, x.a.h))); // turma conjunta: mesmo horário aqui e lá conta uma vez
            const foraK = Object.keys(ext.prof[p.id] || {}).filter((k) => !meusK.has(k));
            const fora = foraK.length; // horários ocupados em outros cursos (mesma unidade)
            const foraHoras = foraK.reduce((t, k) => t + dur(separa(k)[1]), 0);
            const pesquisaH = (p.pesquisa || []).reduce((t, k) => { const h = separa(k)[1]; return cfg.horarios[h] ? t + dur(h) : t; }, 0);
            return { id: p.id, nome: p.nome, aulas: minhas.length, horas: Math.round(horas * 10) / 10, disciplinas: [...new Set(minhas.map((x) => x.q.codigo || x.q.nome))],
                dias: [...new Set(minhas.map((x) => cfg.dias[x.a.d]))], turnos: [...new Set(minhas.map((x) => NOME_TURNO[turno(cfg.horarios[x.a.h])]))],
                outrosCursos: fora, outrosCursosHoras: Math.round(foraHoras * 10) / 10, total: Math.round((horas + foraHoras) * 10) / 10,
                pesquisaHoras: Math.round(pesquisaH * 10) / 10, responsavelPor: (dados.salas || []).filter((s) => (s.responsaveis || []).includes(p.id)).map((s) => s.nome) };
        }).sort((a, b) => b.total - a.total || b.horas - a.horas);
        const salas = (dados.salas || []).map((s) => {
            const minhas = aulas.filter((x) => x.a.sala === s.id);
            const ensinoH = minhas.reduce((t, x) => t + dur(x.a.h), 0);
            const foraKeys = Object.keys(ext.sala[s.id] || {}).filter((k) => !minhas.some((x) => chave(x.a.d, x.a.h) === k));
            const foraH = foraKeys.reduce((t, k) => t + dur(separa(k)[1]), 0);
            const pesq = (s.pesquisa || []).filter((k) => cfg.horarios[separa(k)[1]] && separa(k)[0] < cfg.dias.length);
            const pesqH = pesq.reduce((t, k) => t + dur(separa(k)[1]), 0);
            const indisp = (s.indisp || []).filter((k) => cfg.horarios[separa(k)[1]] && separa(k)[0] < cfg.dias.length && !pesq.includes(k));
            const indispH = indisp.reduce((t, k) => t + dur(separa(k)[1]), 0);
            const usoEnsino = ensinoH + foraH;
            const livreH = Math.max(0, horasSlots - usoEnsino - pesqH - indispH);
            const pct = (v) => (horasSlots ? Math.round(1000 * v / horasSlots) / 10 : 0);
            return { id: s.id, nome: s.nome, tipo: s.tipo, responsaveis: (s.responsaveis || []).map((p) => nomeDe(dados.professores, p)),
                ensinoAulas: minhas.length, ensinoHoras: Math.round(ensinoH * 10) / 10, outrosCursosHoras: Math.round(foraH * 10) / 10,
                pesquisaHoras: Math.round(pesqH * 10) / 10, indispHoras: Math.round(indispH * 10) / 10, livreHoras: Math.round(livreH * 10) / 10,
                pctEnsino: pct(usoEnsino), pctPesquisa: pct(pesqH), pctLivre: pct(livreH),
                disciplinas: [...new Set(minhas.map((x) => x.q.codigo || x.q.nome))], pesquisa: pesq };
        }).sort((a, b) => b.pctEnsino - a.pctEnsino || b.ensinoHoras - a.ensinoHoras);
        return { professores, salas, horasSemana: Math.round(horasSlots * 10) / 10, totalSlots };
    }

    // ================================================================ CONFLITOS

    /** Gravidade da colisão de um professor entre duas aulas: responsável nas duas = erro; numa = aviso; regente nas duas = leve. */
    function gravidadeColisao(respA, respB) { return respA && respB ? 'erro' : (respA || respB ? 'aviso' : 'leve'); }
    const DESC_PAPEL = { erro: 'responsável nas duas', aviso: 'responsável numa e regente na outra', leve: 'regente nas duas' };

    /**
     * Lista todos os conflitos da grade.
     * Cada conflito: { tipo, gravidade: 'erro'|'aviso', msg, alocs: [índices em grade.alocacoes] }.
     * Devolve também porAloc: índice → [conflitos] (para pintar a grade).
     */
    function conflitos(dados) {
        const cfg = dados.config, idx = indices(dados), eq = gruposEquivalentes(dados);
        const alocs = (dados.grade && dados.grade.alocacoes) || [];
        const ext = ocupacoesExternas(dados);
        const lista = [];
        const add = (tipo, gravidade, msg, quais) => lista.push({ tipo, gravidade, msg, alocs: quais });
        const porChave = {};

        alocs.forEach((a, i) => {
            const disc = idx.disc[a.disc];
            const k = chave(a.d, a.h);
            const onde = rotuloHorario(cfg, k);
            if (!disc) { add('disciplina', 'erro', `Aula de disciplina que não existe mais (${a.disc}).`, [i]); return; }
            if (a.d < 0 || a.d >= cfg.dias.length || a.h < 0 || a.h >= cfg.horarios.length) {
                add('fora', 'erro', `${nomeDisc(disc)}: horário fora da configuração (dia ou aula removidos).`, [i]); return;
            }
            (porChave[k] = porChave[k] || []).push(i);
            const profsD = professoresDe(disc).map((p) => idx.prof[p]).filter(Boolean);
            const prof = idx.prof[disc.professor], sala = idx.sala[a.sala];
            if (!sala) add('sala', 'erro', `${nomeDisc(disc)} em ${onde}: sem sala (ou sala removida).`, [i]);
            const ehResp = (pr) => pr.id === disc.professor; // responsável: erro; regente (com o responsável dando a aula): aviso
            const grav = (pr) => (ehResp(pr) ? 'erro' : 'aviso');
            const papelTxt = (pr) => (ehResp(pr) ? '' : ' — é regente; o responsável dá a aula');
            profsD.forEach((pr) => { if ((pr.indisp || []).includes(k)) add('prof-indisp', grav(pr), `${pr.nome} não pode dar aula em ${onde} (${nomeDisc(disc)})${papelTxt(pr)}.`, [i]); });
            if (sala && (sala.pesquisa || []).includes(k)) add('pesquisa-sala', 'erro', `${sala.nome} está reservada para pesquisa em ${onde} (${nomeDisc(disc)}).`, [i]);
            profsD.forEach((pr) => { if ((pr.pesquisa || []).includes(k)) add('pesquisa-prof', grav(pr), `${pr.nome} tem horário reservado para pesquisa em ${onde} (${nomeDisc(disc)})${papelTxt(pr)}.`, [i]); });
            if (sala && (sala.indisp || []).includes(k)) add('sala-indisp', 'erro', `${sala.nome} não pode ser usada em ${onde} (${nomeDisc(disc)}).`, [i]);
            if ((disc.fixos || []).length && !disc.fixos.includes(k)) add('fixo', 'erro', `${nomeDisc(disc)} só pode ocorrer nos horários fixos dela; está em ${onde}.`, [i]);
            const jan = janelaCursos(dados, disc, idx);
            if (jan && !jan.has(k)) add('curso', 'erro', `${nomeDisc(disc)} em ${onde}: fora do horário de funcionamento do(s) curso(s) para ${turmasDe(dados, disc).map((t) => t.situacao).filter((v, j, s) => s.indexOf(v) === j).join('/')}.`, [i]);
            if (sala) profsD.filter((pr) => !profPodeNaSala(sala, pr.id)).forEach((pr) => {
                add('lab-permissao', grav(pr), `${sala.nome}: ${pr.nome}${ehResp(pr) ? '' : ' (regente)'} não está autorizado pelo(s) responsável(is) (${(sala.responsaveis || []).map((p) => nomeDe(dados.professores, p)).join(', ') || 'sem responsável'}).`, [i]);
            });
            const vistos = new Set();
            profsD.forEach((pr) => (((ext.prof[pr.id] || {})[k]) || []).forEach((info) => {
                if (conjunta(info, disc, sala && sala.nome) || vistos.has('p' + pr.id + info.curso + info.codigo)) return;
                vistos.add('p' + pr.id + info.curso + info.codigo);
                const g = gravidadeColisao(ehResp(pr), info.papel !== 'reg');
                add('externo-prof', g, `${pr.nome} já tem aula em ${info.curso} em ${onde} (${info.codigo ? info.codigo + ' ' : ''}${info.disciplina}${info.sala ? ', ' + info.sala : ''}) — ${DESC_PAPEL[g]}.`, [i]);
            }));
            if (sala) (((ext.sala[sala.id] || {})[k]) || []).forEach((info) => {
                if ((info.codigo && normNome(info.codigo) === normNome(disc.codigo)) || vistos.has('s' + info.curso + info.codigo)) return;
                vistos.add('s' + info.curso + info.codigo);
                add('externo-sala', 'erro', `${sala.nome} já está ocupada por ${info.curso} em ${onde} (${info.codigo ? info.codigo + ' ' : ''}${info.disciplina}, ${info.professor}).`, [i]);
            });
            const pref = turnosPreferidos(dados, disc);
            if (pref && pref.size && !pref.has(turno(cfg.horarios[a.h]))) add('turno-pref', 'aviso', `${nomeDisc(disc)} em ${onde}: fora do turno preferido do semestre (${[...pref].map((t) => NOME_TURNO[t].toLowerCase()).join(' ou ')}).`, [i]);
            if (sala && (disc.salas || []).length && !disc.salas.includes(sala.id)) add('sala-pref', 'aviso', `${nomeDisc(disc)} em ${onde}: ${sala.nome} não está entre as salas dela.`, [i]);
        });

        // pares no mesmo horário
        Object.entries(porChave).forEach(([k, quais]) => {
            const onde = rotuloHorario(cfg, k);
            for (let x = 0; x < quais.length; x++) for (let y = x + 1; y < quais.length; y++) {
                const a = alocs[quais[x]], b = alocs[quais[y]];
                const da = idx.disc[a.disc], db = idx.disc[b.disc];
                const mesmaTurma = eq.grupoDe[a.disc] === eq.grupoDe[b.disc] && a.sala === b.sala; // equivalentes juntas = uma turma
                if (a.disc === b.disc) { add('duplicada', 'erro', `${nomeDisc(da)} aparece duas vezes em ${onde}.`, [quais[x], quais[y]]); continue; }
                if (mesmaTurma) continue;
                const pb = professoresDe(db);
                professoresDe(da).filter((p) => pb.includes(p)).forEach((p) => {
                    const g = gravidadeColisao(da.professor === p, db.professor === p);
                    add('prof', g, `${nomeDe(dados.professores, p)} tem duas aulas em ${onde}: ${nomeDisc(da)} e ${nomeDisc(db)} (${DESC_PAPEL[g]}).`, [quais[x], quais[y]]);
                });
                if (a.sala && a.sala === b.sala) {
                    const sala = idx.sala[a.sala];
                    const resp = (sala && sala.responsaveis) || [];
                    const ra = professoresDe(da).some((p) => resp.includes(p)), rb = professoresDe(db).some((p) => resp.includes(p));
                    const prio = ra !== rb ? ` Prioridade do responsável: ${nomeDisc(ra ? da : db)}.` : '';
                    add('sala-dupla', 'erro', `${nomeDe(dados.salas, a.sala)} tem duas aulas em ${onde}: ${nomeDisc(da)} e ${nomeDisc(db)}.${prio}`, [quais[x], quais[y]]);
                }
                const ta = turmasDe(dados, da), tb = turmasDe(dados, db);
                ta.forEach((t1) => tb.forEach((t2) => {
                    if (t1.id !== t2.id) return;
                    const turma = `${nomeDe(dados.cursos, t1.curso)} ${t1.semestre}º sem. (${t1.situacao})`;
                    add('turma', 'erro', `${turma} tem duas aulas em ${onde}: ${nomeDisc(da)} e ${nomeDisc(db)}.`, [quais[x], quais[y]]);
                }));
            }
        });

        // aulas faltando ou sobrando
        const conta = {};
        alocs.forEach((a) => { conta[a.disc] = (conta[a.disc] || 0) + 1; });
        (dados.disciplinas || []).forEach((d) => {
            const tem = conta[d.id] || 0, quer = Number(d.aulas) || 0;
            if (dados.grade && dados.grade.geradaEm && tem < quer) add('faltam', 'aviso', `${nomeDisc(d)}: faltam ${quer - tem} de ${quer} aulas na grade.`, []);
            if (tem > quer) add('sobram', 'aviso', `${nomeDisc(d)}: ${tem} aulas na grade, mas o cadastro pede ${quer}.`, alocs.map((a, i) => a.disc === d.id ? i : -1).filter((i) => i >= 0));
        });

        const porAloc = {};
        lista.forEach((c) => c.alocs.forEach((i) => { (porAloc[i] = porAloc[i] || []).push(c); }));
        return { lista, porAloc, erros: lista.filter((c) => c.gravidade === 'erro').length, avisos: lista.filter((c) => c.gravidade === 'aviso').length, leves: lista.filter((c) => c.gravidade === 'leve').length };
    }

    // ================================================================ EDIÇÃO

    /** Bloco que se move junto: aulas seguidas da mesma disciplina (e das equivalentes), mesmo dia e mesma sala. */
    function blocoDe(dados, i) {
        const alocs = dados.grade.alocacoes, a = alocs[i];
        if (!a) return [];
        const eq = gruposEquivalentes(dados), g = eq.grupoDe[a.disc];
        const doGrupo = alocs.map((x, j) => j).filter((j) => { const x = alocs[j]; return eq.grupoDe[x.disc] === g && x.d === a.d && x.sala === a.sala; });
        const horas = new Set(doGrupo.map((j) => alocs[j].h));
        let ini = a.h, fim = a.h;
        while (horas.has(ini - 1) && seguidas(dados.config, ini - 1)) ini--;
        while (horas.has(fim + 1) && seguidas(dados.config, fim)) fim++;
        return doGrupo.filter((j) => alocs[j].h >= ini && alocs[j].h <= fim).sort((p, q) => alocs[p].h - alocs[q].h || (alocs[p].disc < alocs[q].disc ? -1 : 1));
    }

    /** Copia dos dados com o bloco movido para (d, h0) e, se dada, outra sala. null se não cabe (passa do fim do turno). */
    function moverBloco(dados, bloco, d, h0, sala) {
        const alocs = dados.grade.alocacoes;
        const h1 = Math.min(...bloco.map((j) => alocs[j].h));
        const n = Math.max(...bloco.map((j) => alocs[j].h)) - h1 + 1;
        if (d < 0 || d >= dados.config.dias.length || h0 < 0 || h0 + n - 1 >= dados.config.horarios.length) return null;
        for (let h = h0; h < h0 + n - 1; h++) if (!seguidas(dados.config, h)) return null;
        const novo = copia(dados);
        bloco.forEach((j) => {
            const a = novo.grade.alocacoes[j];
            a.h = h0 + (a.h - h1); a.d = d;
            if (sala) a.sala = sala;
        });
        return novo;
    }

    /** Conflitos que envolvem o bloco se ele for para (d, h0, sala). {valido:false} se não cabe. */
    function avaliarMovimento(dados, bloco, d, h0, sala) {
        const novo = moverBloco(dados, bloco, d, h0, sala);
        if (!novo) return { valido: false, conflitos: [] };
        const c = conflitos(novo);
        const set = new Set(bloco);
        const seus = c.lista.filter((x) => x.alocs.some((i) => set.has(i)));
        return { valido: true, conflitos: seus, erros: seus.filter((x) => x.gravidade === 'erro').length };
    }

    /** Coloca n aulas novas (não alocadas) da disciplina a partir de (d, h0) numa sala. */
    function inserirBloco(dados, disc, n, d, h0, sala) {
        if (d < 0 || d >= dados.config.dias.length || h0 < 0 || h0 + n - 1 >= dados.config.horarios.length) return null;
        for (let h = h0; h < h0 + n - 1; h++) if (!seguidas(dados.config, h)) return null;
        const novo = copia(dados);
        const eq = gruposEquivalentes(novo);
        const membros = eq.grupos[eq.grupoDe[disc]] || [disc];
        const indicesNovos = [];
        membros.forEach((m) => { for (let h = h0; h < h0 + n; h++) { novo.grade.alocacoes.push({ disc: m, d, h, sala, travada: false }); indicesNovos.push(novo.grade.alocacoes.length - 1); } });
        return { dados: novo, indices: indicesNovos };
    }

    /** Aulas que faltam por disciplina (cadastro − grade). */
    function faltando(dados) {
        const conta = {};
        ((dados.grade && dados.grade.alocacoes) || []).forEach((a) => { conta[a.disc] = (conta[a.disc] || 0) + 1; });
        return (dados.disciplinas || []).map((d) => ({ disc: d.id, faltam: Math.max(0, (Number(d.aulas) || 0) - (conta[d.id] || 0)) })).filter((x) => x.faltam > 0);
    }

    // ================================================================ GERADOR ALEATÓRIO

    /**
     * Monta uma grade a partir das regras. Mantém as aulas travadas e sorteia o resto.
     * Faz várias tentativas e fica com a que deixa menos aulas sem lugar (depois, menos dias repetidos).
     * opcoes: { tentativas = 150, semente, rng }
     * Devolve { alocacoes, naoAlocadas: [{disc, aulas, motivo}], tentativas }.
     */
    function gerar(dados, opcoes = {}) {
        const rng = opcoes.rng || (opcoes.semente !== undefined ? rngSemente(opcoes.semente) : Math.random);
        const tentativas = Math.max(1, opcoes.tentativas || 150);
        const cfg = dados.config, idx = indices(dados), eq = gruposEquivalentes(dados);
        const todas = todasChaves(cfg);
        const travadas = ((dados.grade && dados.grade.alocacoes) || []).filter((a) => a.travada && idx.disc[a.disc]
            && a.d < cfg.dias.length && a.h < cfg.horarios.length);

        const ext = ocupacoesExternas(dados);
        // unidades = grupos de equivalentes
        const unidades = Object.entries(eq.grupos).map(([lider, ids]) => {
            const discs = ids.map((i) => idx.disc[i]);
            const profs = [...new Set(discs.flatMap((d) => professoresDe(d)))];
            const resps = [...new Set(discs.map((d) => d.professor).filter(Boolean))]; // bloqueio rígido só para o responsável
            const regs = profs.filter((p) => !resps.includes(p)); // regentes: o gerador evita colisões quando dá
            // salas: interseção das listas não vazias; se todas vazias, salas comuns
            let salas = null;
            discs.forEach((d) => {
                if (!(d.salas || []).length) return;
                const s = new Set(salasPermitidas(dados, d));
                salas = salas === null ? s : new Set([...salas].filter((x) => s.has(x)));
            });
            salas = salas === null ? salasPermitidas(dados, discs[0]) : [...salas];
            salas = salas.filter((s) => resps.every((p) => profPodeNaSala(idx.sala[s], p)));
            const salaRegNao = new Set(salas.filter((s) => regs.some((p) => !profPodeNaSala(idx.sala[s], p)))); // lab sem autorização do regente: evitar
            // horários permitidos estáticos: fixos ∩ janela dos cursos ∩ disponibilidade dos professores
            let permitidos = new Set(todas);
            let semJanela = false;
            discs.forEach((d) => {
                if ((d.fixos || []).length) { const f = new Set(d.fixos); permitidos = new Set([...permitidos].filter((k) => f.has(k))); }
                const jan = janelaCursos(dados, d, idx);
                if (jan) { if (!jan.size) semJanela = true; permitidos = new Set([...permitidos].filter((k) => jan.has(k))); }
            });
            const antesProf = permitidos.size;
            resps.forEach((p) => { const ind = new Set([...((idx.prof[p] && idx.prof[p].indisp) || []), ...((idx.prof[p] && idx.prof[p].pesquisa) || [])]); permitidos = new Set([...permitidos].filter((k) => !ind.has(k))); });
            const regIndisp = new Set(regs.flatMap((p) => [...((idx.prof[p] && idx.prof[p].indisp) || []), ...((idx.prof[p] && idx.prof[p].pesquisa) || [])]));
            const turmas = [], turmasTodas = [];
            discs.forEach((d) => turmasDe(dados, d).forEach((t) => {
                if (!turmas.includes(t.id)) turmas.push(t.id); // regra: mesmo semestre não tem duas aulas no mesmo horário
                if (!turmasTodas.includes(t.id)) turmasTodas.push(t.id);
            }));
            const jaTem = travadas.filter((a) => a.disc === lider).length;
            const aulas = Number(discs[0].aulas) || 0;
            const resto = Math.max(0, aulas - jaTem);
            const bl = jaTem ? blocos({ aulas: resto }) : blocos(discs[0]);
            // prioridade dos responsáveis: a unidade cujo professor é responsável por um laboratório permitido vai primeiro
            const prioridade = salas.some((s) => idx.sala[s] && idx.sala[s].tipo === 'laboratorio' && profs.some((p) => (idx.sala[s].responsaveis || []).includes(p))) ? 0 : 1;
            // outros cursos: horários em que o professor já está ocupado (bloqueio) ou em turma conjunta da mesma disciplina
            const codigos = new Set(discs.map((d) => normNome(d.codigo)).filter(Boolean));
            const profBloq = new Set(), profConj = {}, salaBloq = {}, profSoft = new Set();
            profs.forEach((p) => Object.entries(ext.prof[p] || {}).forEach(([k, infos]) => infos.forEach((info) => {
                if (info.codigo && codigos.has(normNome(info.codigo))) (profConj[k] = profConj[k] || new Set()).add(normNome(info.sala));
                else if (resps.includes(p) && info.papel !== 'reg') profBloq.add(k); // responsável lá e cá: erro, bloqueia
                else profSoft.add(k); // envolve regência: evitar quando dá
            })));
            salas.forEach((x) => Object.entries(ext.sala[x] || {}).forEach(([k, infos]) => infos.forEach((info) => {
                if (!(info.codigo && codigos.has(normNome(info.codigo)))) (salaBloq[x] = salaBloq[x] || new Set()).add(k);
            })));
            let pref = null;
            discs.forEach((d) => { const p = turnosPreferidos(dados, d); if (p) pref = pref === null ? p : new Set([...pref].filter((t) => p.has(t))); });
            const descTurmas = [];
            discs.forEach((d) => turmasDe(dados, d).forEach((t) => descTurmas.push(`${nomeDe(dados.cursos, t.curso)} (${t.semestre}º, ${t.situacao})`)));
            return { lider, ids, profs, resps, regs, salaRegNao, regIndisp, profSoft, salas, permitidos, turmas, turmasTodas, profBloq, profConj, salaBloq, pref, blocos: bl, prioridade, fixos: discs.some((d) => (d.fixos || []).length), semJanela, antesProf, descTurmas };
        }).filter((u) => u.blocos.length);

        let melhor = null;
        for (let t = 0; t < tentativas; t++) {
            const res = tentativa(unidades);
            if (!melhor || res.custo < melhor.custo) melhor = res;
            if (melhor.custo === 0) break;
        }
        melhor.tentativas = tentativas;
        return melhor;

        function tentativa(unids) {
            const profOc = {}, profRegOc = {}, salaOc = {}, turmaOc = {}, turmaTodasOc = {}; // profOc: como responsável; profRegOc: como regente
            const ocupa = (mapa, id, k) => { (mapa[id] = mapa[id] || new Set()).add(k); };
            const livre = (mapa, id, k) => !(mapa[id] && mapa[id].has(k));
            const alocacoes = travadas.map((a) => copia(a));
            alocacoes.forEach((a) => {
                const d = idx.disc[a.disc], k = chave(a.d, a.h);
                professoresDe(d).forEach((p) => ocupa(p === d.professor ? profOc : profRegOc, p, k));
                ocupa(salaOc, a.sala, k);
                turmasDe(dados, d).forEach((tu) => { ocupa(turmaOc, tu.id, k); ocupa(turmaTodasOc, tu.id, k); });
            });
            const diasUsados = {};
            travadas.forEach((a) => { const g = eq.grupoDe[a.disc]; (diasUsados[g] = diasUsados[g] || new Set()).add(a.d); });

            // ordem: responsáveis nos seus laboratórios, depois horários fixos, depois as mais restritas (com sorteio)
            const peso = new Map(unids.map((u) => [u, u.permitidos.size * Math.max(1, u.salas.length) * (0.5 + rng())]));
            const ordem = embaralha(unids.slice(), rng).sort((a, b) => a.prioridade - b.prioridade || (b.fixos - a.fixos) || peso.get(a) - peso.get(b));
            const naoAlocadas = [];
            let custo = 0;
            ordem.forEach((u) => {
                const blocosOrd = u.blocos.slice().sort((a, b) => b - a);
                blocosOrd.forEach((n) => {
                    const cands = [], candsMesmoDia = [];
                    for (let d = 0; d < cfg.dias.length; d++) {
                        for (let h0 = 0; h0 + n - 1 < cfg.horarios.length; h0++) {
                            let okH = true;
                            for (let h = h0; h < h0 + n; h++) {
                                const k = chave(d, h);
                                if (!u.permitidos.has(k) || u.profBloq.has(k) || (h < h0 + n - 1 && !seguidas(cfg, h))
                                    || !u.resps.every((p) => livre(profOc, p, k)) || !u.turmas.every((tu) => livre(turmaOc, tu, k))) { okH = false; break; }
                            }
                            if (!okH) continue;
                            u.salas.forEach((s) => {
                                const sala = idx.sala[s];
                                let conj = true;
                                for (let h = h0; h < h0 + n; h++) {
                                    const k = chave(d, h);
                                    if (!livre(salaOc, s, k) || (sala.indisp || []).includes(k) || (sala.pesquisa || []).includes(k) || (u.salaBloq[s] && u.salaBloq[s].has(k))) return;
                                    if (u.profConj[k] && !u.profConj[k].has(normNome(sala.nome))) return; // o professor estaria noutra sala com o outro curso
                                    if (!u.profConj[k]) conj = false;
                                }
                                let choqueLeve = false; // optativa/livre na mesma turma: evitar se der
                                for (let h = h0; h < h0 + n && !choqueLeve; h++) { const k = chave(d, h); choqueLeve = u.turmasTodas.some((tu) => !livre(turmaTodasOc, tu, k)); }
                                let noTurno = true;
                                if (u.pref && u.pref.size) for (let h = h0; h < h0 + n; h++) if (!u.pref.has(turno(cfg.horarios[h]))) noTurno = false;
                                let regOk = !u.salaRegNao.has(s); // regentes livres, disponíveis e autorizados: preferido
                                for (let h = h0; h < h0 + n && regOk; h++) {
                                    const k = chave(d, h);
                                    if (u.regIndisp.has(k) || u.profSoft.has(k) || !u.resps.every((p) => livre(profRegOc, p, k)) || !u.regs.every((p) => livre(profOc, p, k) && livre(profRegOc, p, k))) regOk = false;
                                }
                                const c = { d, h0, s, choqueLeve, conj, noTurno, regOk };
                                if (diasUsados[u.lider] && diasUsados[u.lider].has(d)) candsMesmoDia.push(c); else cands.push(c);
                            });
                        }
                    }
                    const semChoque = (l) => { const x = l.filter((c) => !c.choqueLeve); return x.length ? x : l; };
                    const conjuntas = [...cands, ...candsMesmoDia].filter((c) => c.conj); // turma conjunta com outro curso: preferida
                    const noTurno = (l) => { const x = l.filter((c) => c.noTurno); return x.length ? x : l; }; // preferência de turno do semestre
                    const regOk = (l) => { const x = l.filter((c) => c.regOk); return x.length ? x : l; };
                    const usar = conjuntas.length ? regOk(conjuntas) : noTurno(semChoque(regOk(cands.length ? cands : candsMesmoDia)));
                    if (!usar.length) { naoAlocadas.push({ disc: u.lider, aulas: n, motivo: diagnostico(u, n) }); custo += 1000 * n; return; }
                    if (!cands.length) custo += 1;
                    if (usar[0].choqueLeve) custo += 1;
                    if (!usar[0].noTurno) custo += 1;
                    if (!usar[0].regOk) custo += 1;
                    // responsáveis preferem o próprio laboratório
                    const proprios = usar.filter((c) => (idx.sala[c.s].responsaveis || []).some((p) => u.profs.includes(p)));
                    const pool = proprios.length && rng() < 0.85 ? proprios : usar;
                    const c = pool[Math.floor(rng() * pool.length)];
                    (diasUsados[u.lider] = diasUsados[u.lider] || new Set()).add(c.d);
                    for (let h = c.h0; h < c.h0 + n; h++) {
                        const k = chave(c.d, h);
                        u.resps.forEach((p) => ocupa(profOc, p, k));
                        u.regs.forEach((p) => ocupa(profRegOc, p, k));
                        ocupa(salaOc, c.s, k);
                        u.turmas.forEach((tu) => ocupa(turmaOc, tu, k));
                        u.turmasTodas.forEach((tu) => ocupa(turmaTodasOc, tu, k));
                        u.ids.forEach((id) => alocacoes.push({ disc: id, d: c.d, h, sala: c.s, travada: false }));
                    }
                });
            });
            // as equivalentes que não são líderes herdam as aulas não alocadas do líder
            const naoTodas = [];
            naoAlocadas.forEach((x) => { (eq.grupos[x.disc] || [x.disc]).forEach((id) => naoTodas.push({ ...x, disc: id })); });
            return { alocacoes, naoAlocadas: naoTodas, custo };
        }

        function diagnostico(u, n) {
            if (!u.salas.length) return 'nenhuma sala permitida (lista de salas da disciplina ou autorização do responsável do laboratório)';
            if (u.semJanela) return `os horários de funcionamento dos cursos não têm horário em comum: ${u.descTurmas.join(', ')}`;
            if (!u.antesProf) return 'os horários fixos da disciplina estão fora do funcionamento do(s) curso(s)';
            if (!u.permitidos.size) return `o professor não está disponível em nenhum horário permitido para a disciplina`;
            if (u.profBloq.size || Object.keys(u.salaBloq).length) return n > 1 ? `não há ${n} aulas seguidas livres para professor, sala e turma (contando as aulas já marcadas por outros cursos)` : 'horários permitidos já ocupados (inclusive por outros cursos)';
            if (n > 1) return `não há ${n} aulas seguidas livres ao mesmo tempo para professor, sala e turma`;
            return 'horários permitidos já ocupados por outras aulas do professor, da sala ou da turma';
        }
    }

    // ================================================================ DADOS

    let contadorId = 0;
    function novoId(prefixo) { contadorId++; return `${prefixo}${Date.now().toString(36)}${contadorId.toString(36)}`; }

    function dadosVazios() {
        return {
            versao: 1,
            config: { titulo: 'Grade horária', unidade: { id: 444, nome: 'Centro de Engenharias' }, calendario: calendario2027(), ano: new Date().getFullYear() + 1, metade: 1, dias: DIAS_SEMANA.slice(0, 5), horarios: horariosPadrao() },
            cursos: [], professores: [], salas: [], disciplinas: [],
            grade: { alocacoes: [], naoAlocadas: [], geradaEm: null },
            externos: []
        };
    }
    /**
     * Horários do CEng/UFPel, períodos de 50 min:
     * manhã 8h–12h30 (intervalo 9h40–10h); tarde 13h30–18h30 (intervalo 16h–16h20); noite 19h–22h30 (intervalo 20h40–20h50).
     * Tarde com 6 períodos: 3 antes e 3 depois do intervalo, o último das 18h às 18h50.
     */
    function horariosPadrao() {
        return [['08:00', '08:50'], ['08:50', '09:40'], ['10:00', '10:50'], ['10:50', '11:40'], ['11:40', '12:30'],
            ['13:30', '14:20'], ['14:20', '15:10'], ['15:10', '16:00'], ['16:20', '17:10'], ['17:10', '18:00'], ['18:00', '18:50'],
            ['19:00', '19:50'], ['19:50', '20:40'], ['20:50', '21:40'], ['21:40', '22:30']].map(([ini, fim]) => ({ ini, fim }));
    }

    /** Confere e completa dados vindos de arquivo (campos faltando viram listas vazias). */
    function normalizar(x) {
        const d = dadosVazios();
        if (!x || typeof x !== 'object') return d;
        const cfg = Object.assign(d.config, x.config || {});
        cfg.metade = Number(cfg.metade) === 2 ? 2 : 1;
        if (!Array.isArray(cfg.dias) || !cfg.dias.length) cfg.dias = DIAS_SEMANA.slice(0, 5);
        if (!Array.isArray(cfg.horarios) || !cfg.horarios.length) cfg.horarios = horariosPadrao();
        const arr = (v) => Array.isArray(v) ? v : [];
        if (!cfg.unidade || typeof cfg.unidade !== 'object' || !cfg.unidade.nome) cfg.unidade = { id: 444, nome: 'Centro de Engenharias' };
        if (!cfg.calendario || typeof cfg.calendario !== 'object' || !Array.isArray(cfg.calendario.eventos)) cfg.calendario = calendario2027();
        cfg.eventosCurso = (Array.isArray(cfg.eventosCurso) ? cfg.eventosCurso : []).filter((e) => e && e.inicio).map((e) => ({ inicio: e.inicio, fim: e.fim || e.inicio, descricao: e.descricao || 'Evento do curso', semAula: e.semAula !== false }));
        d.cursos = arr(x.cursos).map((c) => ({ id: c.id || novoId('c'), cod: c.cod || null, nome: c.nome || 'Curso', semestres: Number(c.semestres) || 10, oferta: arr(c.oferta), reoferta: arr(c.reoferta),
            preferencias: (c.preferencias && typeof c.preferencias === 'object') ? Object.fromEntries(Object.entries(c.preferencias).map(([k, v]) => [k, arr(v).filter((t) => NOME_TURNO[t])])) : {} }));
        d.professores = arr(x.professores).map((p) => ({ id: p.id || novoId('p'), nome: p.nome || 'Professor', email: p.email || '', indisp: arr(p.indisp), pesquisa: arr(p.pesquisa) }));
        d.salas = arr(x.salas).map((s) => ({ id: s.id || novoId('s'), nome: s.nome || 'Sala', tipo: s.tipo === 'laboratorio' ? 'laboratorio' : 'sala', capacidade: Number(s.capacidade) || 0,
            responsaveis: arr(s.responsaveis), politica: POLITICA[s.politica] ? s.politica : 'todos', autorizados: arr(s.autorizados), indisp: arr(s.indisp), pesquisa: arr(s.pesquisa) }));
        d.disciplinas = arr(x.disciplinas).map((q) => ({ id: q.id || novoId('d'), codigo: q.codigo || '', nome: q.nome || 'Disciplina', professor: q.professor || '', regentes: arr(q.regentes).filter((p) => p && p !== q.professor),
            aulas: Number(q.aulas) || 0, blocos: q.blocos || '', salas: arr(q.salas), fixos: arr(q.fixos), equivalentes: arr(q.equivalentes),
            ofertas: arr(q.ofertas).map((o) => ({ curso: o.curso, semestre: Number(o.semestre) >= 0 && o.semestre !== '' && o.semestre !== undefined ? Number(o.semestre) : 1, carater: CARATER[o.carater] ? o.carater : 'obrigatoria' })),
            creditos: Number(q.creditos) || 0, horas: Number(q.horas) || 0 }));
        const g = x.grade || {};
        d.grade = { alocacoes: arr(g.alocacoes).map((a) => ({ disc: a.disc, d: Number(a.d), h: Number(a.h), sala: a.sala, travada: !!a.travada })), naoAlocadas: arr(g.naoAlocadas), geradaEm: g.geradaEm || null };
        d.externos = arr(x.externos).map((e) => ({ curso: e.curso || '?', unidade: e.unidade || '', ano: Number(e.ano) || d.config.ano, metade: Number(e.metade) === 2 ? 2 : 1, origem: e.origem || 'arquivo', versao: e.versao || null,
            aulas: arr(e.aulas).filter((a) => a && a.dia && a.ini).map((a) => ({ dia: a.dia, ini: a.ini, fim: a.fim || '', professor: a.professor || '', professores: arr(a.professores), sala: a.sala || '', codigo: a.codigo || '', disciplina: a.disciplina || '' })) }));
        return d;
    }

    /** Remove um item e tudo que aponta para ele (para excluir sem quebrar a grade). */
    function excluir(dados, tipo, id) {
        const d = dados;
        if (tipo === 'curso') {
            d.cursos = d.cursos.filter((x) => x.id !== id);
            d.disciplinas.forEach((q) => { q.ofertas = q.ofertas.filter((o) => o.curso !== id); });
        } else if (tipo === 'professor') {
            d.professores = d.professores.filter((x) => x.id !== id);
            d.disciplinas.forEach((q) => { if (q.professor === id) q.professor = ''; q.regentes = (q.regentes || []).filter((p) => p !== id); });
            d.salas.forEach((s) => { s.responsaveis = s.responsaveis.filter((p) => p !== id); s.autorizados = s.autorizados.filter((p) => p !== id); });
        } else if (tipo === 'sala') {
            d.salas = d.salas.filter((x) => x.id !== id);
            d.disciplinas.forEach((q) => { q.salas = q.salas.filter((s) => s !== id); });
            d.grade.alocacoes = d.grade.alocacoes.filter((a) => a.sala !== id);
        } else if (tipo === 'disciplina') {
            d.disciplinas = d.disciplinas.filter((x) => x.id !== id);
            d.disciplinas.forEach((q) => { q.equivalentes = q.equivalentes.filter((e) => e !== id); });
            d.grade.alocacoes = d.grade.alocacoes.filter((a) => a.disc !== id);
        }
        return d;
    }

    /**
     * Troca dias/horários da configuração sem perder o que já foi marcado: cada horário antigo é levado para o novo
     * pelo nome do dia e pelo início/fim da aula. O que não existe mais é descartado (e as aulas da grade nele também).
     * Devolve { dados, perdidas } (perdidas = aulas da grade que saíram).
     */
    function remapearConfig(dados, novaCfg) {
        const velha = dados.config;
        const mapaD = velha.dias.map((n) => novaCfg.dias.indexOf(n));
        const rot = (h) => `${h.ini}-${h.fim}`;
        const novosH = novaCfg.horarios.map(rot);
        const mapaH = velha.horarios.map((h) => novosH.indexOf(rot(h)));
        const conv = (k) => { const [d, h] = separa(k); const nd = mapaD[d], nh = mapaH[h]; return nd >= 0 && nh >= 0 && nd !== undefined && nh !== undefined ? chave(nd, nh) : null; };
        const lista = (l) => (l || []).map(conv).filter(Boolean);
        const novo = copia(dados);
        novo.config = Object.assign({}, velha, novaCfg);
        novo.cursos.forEach((c) => { c.oferta = lista(c.oferta); c.reoferta = lista(c.reoferta); });
        novo.professores.forEach((p) => { p.indisp = lista(p.indisp); p.pesquisa = lista(p.pesquisa); });
        novo.salas.forEach((s) => { s.indisp = lista(s.indisp); s.pesquisa = lista(s.pesquisa); });
        novo.disciplinas.forEach((q) => { q.fixos = lista(q.fixos); });
        const antes = novo.grade.alocacoes.length;
        novo.grade.alocacoes = novo.grade.alocacoes.map((a) => {
            const k = conv(chave(a.d, a.h));
            if (!k) return null;
            const [d, h] = separa(k);
            return Object.assign(a, { d, h });
        }).filter(Boolean);
        return { dados: novo, perdidas: antes - novo.grade.alocacoes.length };
    }

    /** Horários de um turno (para marcar janelas e indisponibilidades rapidamente). */
    function chavesTurno(cfg, nomeTurno, dias) {
        const r = [];
        (dias || cfg.dias.map((_, i) => i)).forEach((d) => cfg.horarios.forEach((h, i) => { if (turno(h) === nomeTurno) r.push(chave(d, i)); }));
        return r;
    }

    return {
        CARATER, POLITICA, DIAS_SEMANA, NOME_TURNO,
        chave, separa, copia, rngSemente, turno, situacao, todasChaves, seguidas, indices, gruposEquivalentes, janelaCursos,
        profPodeNaSala, salasPermitidas, blocos, turmasDe, sigla, professoresDe, nomesProfessores, nomeDisc, nomeDe, rotuloHorario,
        gravidadeColisao, relatorios, eventosDoCalendario, datasDoPeriodo, CALENDARIO_URL_2027, calendario2027, lerCalendarioTexto, analisarCalendario, NOME_TIPO_CAL, dataBR, codigoHorario, codigosDisciplina, relacao, normNome, turnosPreferidos, tituloPT, disciplinasDaMatriz, exportarCurso, separarCurso, aulasParaOutros, externoDe, incluirExterno, ocupacoesExternas, conflitos, blocoDe, moverBloco, avaliarMovimento, inserirBloco, faltando, gerar,
        novoId, dadosVazios, horariosPadrao, normalizar, excluir, chavesTurno, remapearConfig
    };
})();

if (typeof module !== 'undefined') module.exports = Nucleo;
