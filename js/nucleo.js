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
 *  - cada disciplina tem professor responsável; cada laboratório tem um ou mais responsáveis;
 *  - responsáveis do laboratório têm prioridade nele e decidem se aceitam aulas de outros professores
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
        return (disc.ofertas || []).map((o) => ({
            id: `${o.curso}|${o.semestre}|${situacao(o.semestre, dados.config.metade)}`,
            curso: o.curso, semestre: Number(o.semestre), situacao: situacao(o.semestre, dados.config.metade), carater: o.carater || 'obrigatoria'
        }));
    }

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
                carater: o.carater, disc: q.id, codigo: q.codigo, nome: q.nome, professor: nomeDe(dados.professores, q.professor) || '',
                salas: porSala.map((x) => nomeDe(dados.salas, x.sala)).join('; '),
                horarios: porSala.length > 1 ? porSala.map((x) => `${x.codigos} (${nomeDe(dados.salas, x.sala)})`).join('; ') : (porSala[0] ? porSala[0].codigos : ''),
                aulas: Number(q.aulas) || 0, naGrade: porSala.reduce((t, x) => t + x.codigos.split(' ').length, 0)
            });
        }));
        return linhas.sort((a, b) => a.cursoNome.localeCompare(b.cursoNome) || a.semestre - b.semestre || String(a.codigo).localeCompare(String(b.codigo)) || a.nome.localeCompare(b.nome));
    }

    // ================================================================ CONFLITOS

    /**
     * Lista todos os conflitos da grade.
     * Cada conflito: { tipo, gravidade: 'erro'|'aviso', msg, alocs: [índices em grade.alocacoes] }.
     * Devolve também porAloc: índice → [conflitos] (para pintar a grade).
     */
    function conflitos(dados) {
        const cfg = dados.config, idx = indices(dados), eq = gruposEquivalentes(dados);
        const alocs = (dados.grade && dados.grade.alocacoes) || [];
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
            const prof = idx.prof[disc.professor], sala = idx.sala[a.sala];
            if (!sala) add('sala', 'erro', `${nomeDisc(disc)} em ${onde}: sem sala (ou sala removida).`, [i]);
            if (prof && (prof.indisp || []).includes(k)) add('prof-indisp', 'erro', `${prof.nome} não pode dar aula em ${onde} (${nomeDisc(disc)}).`, [i]);
            if (sala && (sala.indisp || []).includes(k)) add('sala-indisp', 'erro', `${sala.nome} não pode ser usada em ${onde} (${nomeDisc(disc)}).`, [i]);
            if ((disc.fixos || []).length && !disc.fixos.includes(k)) add('fixo', 'erro', `${nomeDisc(disc)} só pode ocorrer nos horários fixos dela; está em ${onde}.`, [i]);
            const jan = janelaCursos(dados, disc, idx);
            if (jan && !jan.has(k)) add('curso', 'erro', `${nomeDisc(disc)} em ${onde}: fora do horário de funcionamento do(s) curso(s) para ${turmasDe(dados, disc).map((t) => t.situacao).filter((v, j, s) => s.indexOf(v) === j).join('/')}.`, [i]);
            if (sala && disc.professor && !profPodeNaSala(sala, disc.professor)) {
                add('lab-permissao', 'erro', `${sala.nome}: ${prof ? prof.nome : 'o professor'} não está autorizado pelo(s) responsável(is) (${(sala.responsaveis || []).map((p) => nomeDe(dados.professores, p)).join(', ') || 'sem responsável'}).`, [i]);
            }
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
                if (da.professor && da.professor === db.professor) {
                    add('prof', 'erro', `${nomeDe(dados.professores, da.professor)} tem duas aulas em ${onde}: ${nomeDisc(da)} e ${nomeDisc(db)}.`, [quais[x], quais[y]]);
                }
                if (a.sala && a.sala === b.sala) {
                    const sala = idx.sala[a.sala];
                    const resp = (sala && sala.responsaveis) || [];
                    const ra = resp.includes(da.professor), rb = resp.includes(db.professor);
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
        return { lista, porAloc, erros: lista.filter((c) => c.gravidade === 'erro').length, avisos: lista.filter((c) => c.gravidade === 'aviso').length };
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

        // unidades = grupos de equivalentes
        const unidades = Object.entries(eq.grupos).map(([lider, ids]) => {
            const discs = ids.map((i) => idx.disc[i]);
            const profs = [...new Set(discs.map((d) => d.professor).filter(Boolean))];
            // salas: interseção das listas não vazias; se todas vazias, salas comuns
            let salas = null;
            discs.forEach((d) => {
                if (!(d.salas || []).length) return;
                const s = new Set(salasPermitidas(dados, d));
                salas = salas === null ? s : new Set([...salas].filter((x) => s.has(x)));
            });
            salas = salas === null ? salasPermitidas(dados, discs[0]) : [...salas];
            salas = salas.filter((s) => profs.every((p) => profPodeNaSala(idx.sala[s], p)));
            // horários permitidos estáticos: fixos ∩ janela dos cursos ∩ disponibilidade dos professores
            let permitidos = new Set(todas);
            let semJanela = false;
            discs.forEach((d) => {
                if ((d.fixos || []).length) { const f = new Set(d.fixos); permitidos = new Set([...permitidos].filter((k) => f.has(k))); }
                const jan = janelaCursos(dados, d, idx);
                if (jan) { if (!jan.size) semJanela = true; permitidos = new Set([...permitidos].filter((k) => jan.has(k))); }
            });
            const antesProf = permitidos.size;
            profs.forEach((p) => { const ind = new Set((idx.prof[p] && idx.prof[p].indisp) || []); permitidos = new Set([...permitidos].filter((k) => !ind.has(k))); });
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
            const descTurmas = [];
            discs.forEach((d) => turmasDe(dados, d).forEach((t) => descTurmas.push(`${nomeDe(dados.cursos, t.curso)} (${t.semestre}º, ${t.situacao})`)));
            return { lider, ids, profs, salas, permitidos, turmas, turmasTodas, blocos: bl, prioridade, fixos: discs.some((d) => (d.fixos || []).length), semJanela, antesProf, descTurmas };
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
            const profOc = {}, salaOc = {}, turmaOc = {}, turmaTodasOc = {};
            const ocupa = (mapa, id, k) => { (mapa[id] = mapa[id] || new Set()).add(k); };
            const livre = (mapa, id, k) => !(mapa[id] && mapa[id].has(k));
            const alocacoes = travadas.map((a) => copia(a));
            alocacoes.forEach((a) => {
                const d = idx.disc[a.disc], k = chave(a.d, a.h);
                if (d.professor) ocupa(profOc, d.professor, k);
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
                                if (!u.permitidos.has(k) || (h < h0 + n - 1 && !seguidas(cfg, h))
                                    || !u.profs.every((p) => livre(profOc, p, k)) || !u.turmas.every((tu) => livre(turmaOc, tu, k))) { okH = false; break; }
                            }
                            if (!okH) continue;
                            u.salas.forEach((s) => {
                                const sala = idx.sala[s];
                                for (let h = h0; h < h0 + n; h++) { const k = chave(d, h); if (!livre(salaOc, s, k) || (sala.indisp || []).includes(k)) return; }
                                let choqueLeve = false; // optativa/livre na mesma turma: evitar se der
                                for (let h = h0; h < h0 + n && !choqueLeve; h++) { const k = chave(d, h); choqueLeve = u.turmasTodas.some((tu) => !livre(turmaTodasOc, tu, k)); }
                                const c = { d, h0, s, choqueLeve };
                                if (diasUsados[u.lider] && diasUsados[u.lider].has(d)) candsMesmoDia.push(c); else cands.push(c);
                            });
                        }
                    }
                    const semChoque = (l) => { const x = l.filter((c) => !c.choqueLeve); return x.length ? x : l; };
                    const usar = semChoque(cands.length ? cands : candsMesmoDia);
                    if (!usar.length) { naoAlocadas.push({ disc: u.lider, aulas: n, motivo: diagnostico(u, n) }); custo += 1000 * n; return; }
                    if (!cands.length) custo += 1;
                    if (usar[0].choqueLeve) custo += 1;
                    // responsáveis preferem o próprio laboratório
                    const proprios = usar.filter((c) => (idx.sala[c.s].responsaveis || []).some((p) => u.profs.includes(p)));
                    const pool = proprios.length && rng() < 0.85 ? proprios : usar;
                    const c = pool[Math.floor(rng() * pool.length)];
                    (diasUsados[u.lider] = diasUsados[u.lider] || new Set()).add(c.d);
                    for (let h = c.h0; h < c.h0 + n; h++) {
                        const k = chave(c.d, h);
                        u.profs.forEach((p) => ocupa(profOc, p, k));
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
            config: { titulo: 'Grade horária', ano: new Date().getFullYear() + 1, metade: 1, dias: DIAS_SEMANA.slice(0, 5), horarios: horariosPadrao() },
            cursos: [], professores: [], salas: [], disciplinas: [],
            grade: { alocacoes: [], naoAlocadas: [], geradaEm: null }
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
        d.cursos = arr(x.cursos).map((c) => ({ id: c.id || novoId('c'), nome: c.nome || 'Curso', semestres: Number(c.semestres) || 10, oferta: arr(c.oferta), reoferta: arr(c.reoferta) }));
        d.professores = arr(x.professores).map((p) => ({ id: p.id || novoId('p'), nome: p.nome || 'Professor', email: p.email || '', indisp: arr(p.indisp) }));
        d.salas = arr(x.salas).map((s) => ({ id: s.id || novoId('s'), nome: s.nome || 'Sala', tipo: s.tipo === 'laboratorio' ? 'laboratorio' : 'sala', capacidade: Number(s.capacidade) || 0,
            responsaveis: arr(s.responsaveis), politica: POLITICA[s.politica] ? s.politica : 'todos', autorizados: arr(s.autorizados), indisp: arr(s.indisp) }));
        d.disciplinas = arr(x.disciplinas).map((q) => ({ id: q.id || novoId('d'), codigo: q.codigo || '', nome: q.nome || 'Disciplina', professor: q.professor || '',
            aulas: Number(q.aulas) || 0, blocos: q.blocos || '', salas: arr(q.salas), fixos: arr(q.fixos), equivalentes: arr(q.equivalentes),
            ofertas: arr(q.ofertas).map((o) => ({ curso: o.curso, semestre: Number(o.semestre) || 1, carater: CARATER[o.carater] ? o.carater : 'obrigatoria' })) }));
        const g = x.grade || {};
        d.grade = { alocacoes: arr(g.alocacoes).map((a) => ({ disc: a.disc, d: Number(a.d), h: Number(a.h), sala: a.sala, travada: !!a.travada })), naoAlocadas: arr(g.naoAlocadas), geradaEm: g.geradaEm || null };
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
            d.disciplinas.forEach((q) => { if (q.professor === id) q.professor = ''; });
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
        novo.professores.forEach((p) => { p.indisp = lista(p.indisp); });
        novo.salas.forEach((s) => { s.indisp = lista(s.indisp); });
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
        profPodeNaSala, salasPermitidas, blocos, turmasDe, sigla, nomeDisc, nomeDe, rotuloHorario,
        codigoHorario, codigosDisciplina, relacao, conflitos, blocoDe, moverBloco, avaliarMovimento, inserirBloco, faltando, gerar,
        novoId, dadosVazios, horariosPadrao, normalizar, excluir, chavesTurno, remapearConfig
    };
})();

if (typeof module !== 'undefined') module.exports = Nucleo;
