/**
 * © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * ÁREA DO PROFESSOR E DOCUMENTOS: rendimento individual, estatísticas (médias e desvios), plano de ensino (conteúdo
 * reaproveitável + cronograma gerado do calendário, cuidando dos feriados) e exportação da unidade.
 * Sem tela: roda no navegador e no Node (tests/testes.js).
 *
 * Plano de ensino = conteúdo (fica salvo com o professor e volta no semestre seguinte) + dados do semestre (ano, cursos,
 * local/horário e as datas do cronograma, sempre recalculados da grade e do calendário acadêmico vigente).
 * Campos: a união do modelo do dia a dia (PRG, .docx) e do relatório do Cobalto (turma, créditos E/D/EX, vínculo, outras informações).
 */

'use strict';

/* global Nucleo */
const Planos = (() => {
    const N = () => (typeof Nucleo !== 'undefined' ? Nucleo : require('./nucleo.js'));

    // ================================================================ estatística
    function estatistica(valores) {
        const v = valores.filter((x) => Number.isFinite(x));
        const n = v.length;
        if (!n) return { n: 0, media: 0, desvio: 0, min: 0, max: 0 };
        const media = v.reduce((a, b) => a + b, 0) / n;
        const desvio = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1)) : 0; // desvio padrão amostral
        const r = (x) => Math.round(x * 100) / 100;
        return { n, media: r(media), desvio: r(desvio), min: r(Math.min(...v)), max: r(Math.max(...v)) };
    }

    /**
     * Horas semanais por professor, separadas em sala de aula, laboratório, pesquisa e preparo de aula
     * (preparo = fator × horas de aula; fator em dados.config.fatorPreparo, padrão 1).
     * escopo 'curso': só esta grade; 'unidade': esta grade + outros cursos da mesma unidade (dados.externos).
     */
    function horasProfessores(dados, escopo) {
        const n = N(), cfg = dados.config, idx = n.indices(dados), eq = n.gruposEquivalentes(dados);
        const fator = Number(cfg.fatorPreparo) >= 0 && cfg.fatorPreparo !== '' && cfg.fatorPreparo !== undefined ? Number(cfg.fatorPreparo) : 1;
        const dur = (ini, fim) => Math.max(0, (min(fim) - min(ini)) / 60);
        const min = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
        const salaPorNome = {};
        (dados.salas || []).forEach((s) => { salaPorNome[n.normNome(s.nome)] = s; });
        const ehLab = (nomeSala) => { const s = salaPorNome[n.normNome(nomeSala)]; return s ? s.tipo === 'laboratorio' : /^lab/i.test(String(nomeSala || '')); };
        const pessoas = {};
        const pessoa = (nome) => { const k = n.normNome(nome); return (pessoas[k] = pessoas[k] || { nome, sala: 0, lab: 0, disciplinas: new Set(), cursos: new Set(), vistos: new Set(), pesquisa: 0, turmas: new Map() }); };
        // turma = grupo de equivalentes (códigos dados juntos contam uma turma; os alunos de todos os códigos somam)
        const alunosGrupo = {};
        (dados.disciplinas || []).forEach((q) => { const g = eq.grupoDe[q.id] || q.id; alunosGrupo[g] = (alunosGrupo[g] || 0) + (Number(q.alunos) || 0); });
        const meuCurso = (dados.cursos[0] || {}).nome || '';
        // esta grade (turma conjunta conta uma vez)
        ((dados.grade && dados.grade.alocacoes) || []).forEach((a) => {
            const q = idx.disc[a.disc], h = cfg.horarios[a.h];
            if (!q || !h) return;
            n.professoresDe(q).forEach((pid) => { // responsável e regentes: todos dão aula
                const p = pessoa(n.nomeDe(dados.professores, pid));
                const ch = `${cfg.dias[a.d]}|${h.ini}`;
                if (p.vistos.has(ch)) return; p.vistos.add(ch);
                const horas = dur(h.ini, h.fim);
                if (ehLab(n.nomeDe(dados.salas, a.sala))) p.lab += horas; else p.sala += horas;
                p.disciplinas.add(q.codigo || q.nome); p.cursos.add(meuCurso);
                const g = eq.grupoDe[q.id] || q.id;
                p.turmas.set(`${meuCurso}|${g}`, alunosGrupo[g] || 0);
            });
        });
        if (escopo === 'unidade') {
            const minha = n.normNome((cfg.unidade || {}).nome);
            (dados.externos || []).forEach((ex) => {
                if (ex.unidade && minha && n.normNome(ex.unidade) !== minha) return;
                (ex.aulas || []).forEach((au) => {
                    (au.professores && au.professores.length ? au.professores : [au.professor]).filter(Boolean).forEach((nome) => {
                        const p = pessoa(nome);
                        p.cursos.add(ex.curso);
                        const ch = `${au.dia}|${au.ini}`;
                        if (p.vistos.has(ch)) return; p.vistos.add(ch); // turma conjunta: mesmo horário conta uma vez
                        p.turmas.set(`${ex.curso}|${au.codigo || au.disciplina}|${au.turma || ''}`, Number(au.alunos) || 0); // só horário novo: conjunta não soma de novo
                        const horas = dur(au.ini, au.fim) || 50 / 60;
                        if (ehLab(au.sala)) p.lab += horas; else p.sala += horas;
                        p.disciplinas.add(au.codigo || au.disciplina);
                    });
                });
            });
        }
        (dados.professores || []).forEach((pr) => {
            const p = pessoas[n.normNome(pr.nome)];
            if (!p) return;
            p.pesquisa = (pr.pesquisa || []).reduce((t, k) => { const [, h] = n.separa(k); const ho = cfg.horarios[h]; return ho ? t + dur(ho.ini, ho.fim) : t; }, 0);
        });
        const r2 = (x) => Math.round(x * 100) / 100;
        return Object.values(pessoas).map((p) => {
            const aula = p.sala + p.lab;
            const turmas = p.turmas.size, alunos = [...p.turmas.values()].reduce((s, x) => s + x, 0);
            return { nome: p.nome, sala: r2(p.sala), lab: r2(p.lab), aula: r2(aula), preparo: r2(aula * fator), pesquisa: r2(p.pesquisa),
                total: r2(aula + aula * fator + p.pesquisa), disciplinas: p.disciplinas.size, cursos: [...p.cursos],
                turmas, alunos, alunosTurma: turmas ? r2(alunos / turmas) : 0, horasPorAluno: alunos ? r2(aula / alunos) : 0 };
        }).sort((a, b) => b.total - a.total);
    }

    /** Campos com média e desvio padrão na verificação (horas, turmas e alunos). */
    const CAMPOS_VERIF = ['sala', 'lab', 'aula', 'preparo', 'pesquisa', 'total', 'disciplinas', 'turmas', 'alunos', 'alunosTurma'];
    /** Verificação interna: médias e desvios padrões das horas dos professores (curso e unidade). */
    function verificacao(dados) {
        const bloco = (lista) => ({ professores: lista, estat: Object.fromEntries(CAMPOS_VERIF.map((k) => [k, estatistica(lista.map((p) => p[k]))])) });
        return { curso: bloco(horasProfessores(dados, 'curso')), unidade: bloco(horasProfessores(dados, 'unidade')), fatorPreparo: Number(dados.config.fatorPreparo ?? 1) };
    }

    /** Rendimento de um professor comparado à média do curso e da unidade. */
    function rendimento(dados, nomeProfessor) {
        const v = verificacao(dados), k = N().normNome(nomeProfessor);
        const eu = (lista) => lista.find((p) => N().normNome(p.nome) === k) || null;
        const pos = (lista, campo) => { const ord = lista.slice().sort((a, b) => b[campo] - a[campo]); const i = ord.findIndex((p) => N().normNome(p.nome) === k); return i < 0 ? null : i + 1; };
        return {
            nome: nomeProfessor,
            curso: { eu: eu(v.curso.professores), estat: v.curso.estat, posicao: pos(v.curso.professores, 'aula'), de: v.curso.professores.length },
            unidade: { eu: eu(v.unidade.professores), estat: v.unidade.estat, posicao: pos(v.unidade.professores, 'aula'), de: v.unidade.professores.length },
            fatorPreparo: v.fatorPreparo
        };
    }

    // ================================================================ plano de ensino
    const TEXTO_APROVACOES = 'Os casos omissos neste Plano de Ensino serão previamente resolvidos entre os discentes e o Professor Regente, ou sob sua supervisão, e, posteriormente, pelo corpo docente da instância responsável pela disciplina.';
    const TEXTO_AVALIACAO = 'Alunos com Média Semestral >= 7,0 serão aprovados, desde que mantenham frequência de pelo menos 75%.\nOs alunos que não obtiverem a nota mínima para aprovação (Média Semestral < 7,0 e >= 3,0) e tiverem frequência de pelo menos 75% serão submetidos a um exame. Alunos com Média Semestral < 3,0 serão reprovados, sem possibilidade de realização de exame.';

    /** Ementa e objetivos publicados no portal, separando o objetivo geral dos específicos quando o texto marca. */
    function objetivosDoPortal(disc) {
        const u = disc.ufpel || {};
        const txt = String(u.objetivos || '').replace(/^\s*Objetivo Geral:\s*\n(Objetivo geral:\s*\n)?/i, 'Objetivo Geral:\n');
        const m = txt.match(/Objetivo Geral:?\s*\n?([\s\S]*?)(?:\n\s*(?:Objetivos? Espec[íi]ficos?:?|Espec[íi]ficos?:)\s*\n?([\s\S]*))?$/i);
        return { ementa: u.ementa || '', objetivoGeral: m ? (m[1] || '').trim() : txt.trim(), objetivosEspecificos: m ? (m[2] || '').trim() : '' };
    }

    /** Conteúdo padrão (pré-preenchido) de um plano para a disciplina. Campos de texto ficam para o professor. */
    function conteudoPadrao(dados, disc) {
        const n = N();
        const horas = Number(disc.horas) || (Number(disc.creditos) || Number(disc.aulas) || 0) * 15;
        const aulasSemana = ((dados.grade && dados.grade.alocacoes) || []).filter((a) => a.disc === disc.id).length || Number(disc.aulas) || 0;
        return {
            codigo: disc.codigo || '', nome: disc.nome, turma: disc.turma || '', codigoUnidade: '', responsavel: `Câmara de Ensino do ${(dados.config.unidade || {}).nome || 'Centro'}`,
            curriculo: 'semestral', creditos: Number(disc.creditos) || Number(disc.aulas) || 0, cargaTeorica: horas, cargaPratica: 0,
            distribuicao: { E: 0, D: 0, EX: 0 }, preRequisitos: '',
            // responsável primeiro, depois os regentes (todos dão aula; o encargo de cada um pode ser ajustado no plano)
            docentes: n.professoresDe(disc).map((p, i) => ({ nome: n.nomeDe(dados.professores, p), teorica: aulasSemana, pratica: 0, vinculo: i === 0 && disc.professor === p ? 'Professor Responsável' : 'Professor Regente' })),
            observacoesDocencia: '', ...objetivosDoPortal(disc), metodologia: '', programa: (disc.ufpel && disc.ufpel.conteudo) || '',
            roteiro: '', eventosSemAula: 'siiepe', datasSemAula: '', atividadesDiscentes: '', avaliacao: TEXTO_AVALIACAO,
            bibliografiaBasica: (disc.ufpel && disc.ufpel.bibliografiaBasica) || '', bibliografiaComplementar: (disc.ufpel && disc.ufpel.bibliografiaComplementar) || '', outrasInformacoes: '', aprovacoes: TEXTO_APROVACOES, discenteRepresentante: true
        };
    }
    /** Junta o conteúdo salvo (de outro semestre) com o padrão: o salvo manda; o que faltar vem do padrão. */
    function conteudo(dados, disc, salvo) {
        const base = conteudoPadrao(dados, disc);
        if (!salvo) return base;
        const c = Object.assign({}, base, salvo);
        c.nome = disc.nome; c.codigo = disc.codigo || c.codigo; // identificação sempre da disciplina atual
        return c;
    }

    /** Cursos atendidos: este curso e os outros cursos (outros cursos carregados) que têm a mesma disciplina (código). */
    function cursosAtendidos(dados, disc) {
        const n = N(), lista = [];
        (disc.ofertas || []).forEach((o) => { const c = dados.cursos.find((x) => x.id === o.curso); if (c) lista.push(`${c.nome}${o.semestre ? ` (${o.semestre}º sem.)` : ''}`); });
        if (disc.codigo) (dados.externos || []).forEach((e) => { if (e.aulas.some((a) => a.codigo === disc.codigo) && !lista.some((x) => x.startsWith(e.curso))) lista.push(e.curso); });
        return lista;
    }
    /** Local e horário da disciplina na grade (ex.: "Quinta 19:00–22:30, Sala 312"; e códigos 531 532 …). */
    function localHorario(dados, disc) {
        const n = N(), cfg = dados.config;
        const alocs = ((dados.grade && dados.grade.alocacoes) || []).filter((a) => a.disc === disc.id).sort((a, b) => a.d - b.d || a.h - b.h);
        const grupos = [];
        alocs.forEach((a) => {
            const g = grupos.find((x) => x.d === a.d && x.sala === a.sala && x.hf === a.h - 1);
            if (g) { g.hf = a.h; } else grupos.push({ d: a.d, sala: a.sala, hi: a.h, hf: a.h });
        });
        return {
            texto: grupos.map((g) => `${cfg.dias[g.d]} ${cfg.horarios[g.hi].ini}–${cfg.horarios[g.hf].fim}, ${n.nomeDe(dados.salas, g.sala)}`).join('; '),
            codigos: n.codigosDisciplina(dados, disc.id)
        };
    }

    const isoDe = (dt) => dt.toISOString().slice(0, 10);
    const dataUTC = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
    const NOMES_DIA_JS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    /** "DD/MM motivo" por linha → {iso: motivo} (ano do semestre). */
    function lerDatasSemAula(texto, ano) {
        const r = {};
        String(texto || '').split(/\n+/).forEach((l) => {
            const m = l.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*[-–:]?\s*(.*)/);
            if (m) r[`${m[3] || ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`] = m[4].trim() || 'sem aula';
        });
        return r;
    }
    /** Roteiro: um tópico por linha; "| P", "| T" ou "| T/P" no fim diz o tipo (padrão T/P). */
    function lerRoteiro(texto) {
        return String(texto || '').split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => {
            const m = l.match(/^(.*?)\s*\|\s*(T\/P|T|P|EAD)\s*$/i);
            return m ? { topico: m[1].trim(), tipo: m[2].toUpperCase() } : { topico: l, tipo: 'T/P' };
        });
    }

    /**
     * Cronograma do semestre: uma linha por encontro (data em que a disciplina tem aula na grade). Feriados, recessos e
     * pontos facultativos do calendário vigente viram "Não haverá aula" (ponto até as 14h só se a aula começa antes);
     * eventos (SIIEPE etc.) também, se o plano pedir; e as datas sem aula do professor. Os tópicos do roteiro seguem
     * na ordem, só nos encontros com aula. No fim, o exame (primeiro encontro no período de exames, se houver).
     */
    function cronograma(dados, disc, cont, ausencias) {
        const n = N(), cfg = dados.config, cal = cfg.calendario || {};
        const sem = (cal.semestres || {})[String(cfg.metade)];
        const alocs = ((dados.grade && dados.grade.alocacoes) || []).filter((a) => a.disc === disc.id);
        if (!sem || !sem.inicio || !sem.fim || !alocs.length) return { linhas: [], avisos: [!sem ? 'Sem datas do semestre no calendário acadêmico.' : 'A disciplina não está na grade.'] };
        const porDia = {};
        alocs.forEach((a) => { const nome = cfg.dias[a.d]; (porDia[nome] = porDia[nome] || []).push(cfg.horarios[a.h]); });
        const ev = {};
        n.eventosDoCalendario(dados, ausencias).forEach((e) => { (ev[e.data] = ev[e.data] || []).push(e); });
        const proprias = lerDatasSemAula(cont.datasSemAula, cal.ano || cfg.ano);
        const roteiro = lerRoteiro(cont.roteiro);
        const ini = dataUTC(sem.inicio), fim = dataUTC(sem.fim);
        const segunda0 = new Date(ini); segunda0.setUTCDate(segunda0.getUTCDate() - ((segunda0.getUTCDay() + 6) % 7));
        const linhas = [];
        let t = 0;
        for (let dt = new Date(ini); dt <= fim; dt.setUTCDate(dt.getUTCDate() + 1)) {
            const iso = isoDe(dt), nome = NOMES_DIA_JS[dt.getUTCDay()];
            if (!porDia[nome]) continue;
            const semana = Math.floor((dt - segunda0) / 6048e5) + 1;
            const inicioAula = porDia[nome].map((h) => h.ini).sort()[0];
            const eventoTira = (e) => cont.eventosSemAula === 'todos' || cont.eventosSemAula === true ? true : (cont.eventosSemAula === 'nenhum' || cont.eventosSemAula === false ? false : /SIIEPE|SIIPE/i.test(e.descricao));
            const motivos = (ev[iso] || []).filter((e) => (e.tipo !== 'evento' || eventoTira(e)) && (!e.ateHora || inicioAula < e.ateHora))
                .map((e) => `${n.NOME_TIPO_CAL[e.tipo] && !['evento', 'curso', 'ausencia'].includes(e.tipo) ? n.NOME_TIPO_CAL[e.tipo] + ': ' : ''}${e.descricao}`);
            if (proprias[iso]) motivos.push(proprias[iso]);
            if (motivos.length) { linhas.push({ semana, data: iso, dataBR: n.dataBR(iso), topico: `Não haverá aula — ${motivos.join('; ')}`, tipo: '—', semAula: true }); continue; }
            const r = roteiro[t++];
            linhas.push({ semana, data: iso, dataBR: n.dataBR(iso), topico: r ? r.topico : 'A definir', tipo: r ? r.tipo : 'T/P', semAula: false });
        }
        const avisos = [];
        if (roteiro.length > t) avisos.push(`O roteiro tem ${roteiro.length} tópicos e o semestre tem ${t} encontros com aula: sobram ${roteiro.length - t}.`);
        if (roteiro.length && roteiro.length < t) avisos.push(`Faltam ${t - roteiro.length} tópicos no roteiro (ficam "A definir").`);
        const ex = sem.exames;
        if (ex && ex.inicio) {
            for (let dt = dataUTC(ex.inicio); dt <= dataUTC(ex.fim || ex.inicio); dt.setUTCDate(dt.getUTCDate() + 1)) {
                if (porDia[NOMES_DIA_JS[dt.getUTCDay()]]) { linhas.push({ semana: 'EXAME', data: isoDe(dt), dataBR: n.dataBR(isoDe(dt)), topico: 'Exame', tipo: 'T/P', semAula: false, exame: true }); break; }
            }
        }
        return { linhas, encontros: t, avisos, semAula: linhas.filter((l) => l.semAula).length };
    }

    /** Plano completo do semestre (conteúdo + dados do semestre) — é o que vai para o DOCX e para o JSON. */
    function planoDoSemestre(dados, disc, salvo, ausencias) {
        const cont = conteudo(dados, disc, salvo);
        const carater = ((disc.ofertas || [])[0] || {}).carater || 'obrigatoria';
        return Object.assign({}, cont, {
            ano: dados.config.ano, semestre: dados.config.metade, unidade: (dados.config.unidade || {}).nome || '', carater,
            cursosAtendidos: cursosAtendidos(dados, disc), localHorario: localHorario(dados, disc), cronograma: cronograma(dados, disc, cont, ausencias)
        });
    }

    // ================================================================ dados individuais (só no navegador e por download)
    /** Resumo (hash) da senha: SHA-256 com sal, quando o navegador oferece; senão um hash simples (o app roda local). */
    async function hashSenha(senha, sal) {
        const texto = `${sal}|${senha}`;
        try {
            const c = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto : (typeof require !== 'undefined' ? require('crypto').webcrypto : null);
            if (c && c.subtle) {
                const buf = await c.subtle.digest('SHA-256', new TextEncoder().encode(texto));
                return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
            }
        } catch (e) { /* cai no simples */ }
        let h = 2166136261; for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
        return 'f' + (h >>> 0).toString(16);
    }
    function individualVazio(nome) {
        return { tipo: 'individual', versao: 1, nome, sal: Math.random().toString(36).slice(2), senhaHash: '', planos: {}, historico: {},
            perfil: { siape: '', departamento: '', ingressoUfpel: '', ingressoCargo: '', jornada: '40' }, projetos: [], ausencias: [], avaliacoes: { chefia: '', discente: '' }, atualizadoEm: null };
    }

    /** JSON individual para baixar: perfil (do cadastro), rendimento, planos de ensino (conteúdo + do semestre). Sem a senha. */
    function exportarIndividual(dados, ind) {
        const n = N(), k = n.normNome(ind.nome);
        const prof = (dados.professores || []).find((p) => n.normNome(p.nome) === k) || { nome: ind.nome };
        const minhas = (dados.disciplinas || []).filter((q) => prof.id && n.professoresDe(q).includes(prof.id));
        const cfg = dados.config;
        const comoCodigos = (l) => (l || []).map((ch) => { const [d, h] = n.separa(ch); return cfg.horarios[h] && d < cfg.dias.length ? n.codigoHorario(cfg, d, h) : null; }).filter(Boolean).sort();
        return {
            tipo: 'individual', nome: ind.nome, exportadoEm: new Date().toISOString(), periodo: `${cfg.ano}/${cfg.metade}`, curso: (dados.cursos[0] || {}).nome || '', unidade: (cfg.unidade || {}).nome || '',
            perfil: { nome: prof.nome, email: prof.email || '', indisponivel: comoCodigos(prof.indisp), pesquisa: comoCodigos(prof.pesquisa), responsavelPor: (dados.salas || []).filter((s) => prof.id && (s.responsaveis || []).includes(prof.id)).map((s) => s.nome) },
            disciplinas: minhas.map((q) => ({ codigo: q.codigo, nome: q.nome, aulas: q.aulas, horarios: n.codigosDisciplina(dados, q.id) })),
            rendimento: rendimento(dados, ind.nome),
            perfilFuncional: ind.perfil || {}, projetos: ind.projetos || [], avaliacoes: ind.avaliacoes || {}, historico: ind.historico || {},
            planos: Object.fromEntries(Object.entries(ind.planos || {})),
            ausencias: ind.ausencias || [],
            planosDoSemestre: minhas.map((q) => planoDoSemestre(dados, q, (ind.planos || {})[q.codigo || q.id], ind.ausencias)),
            raad: raad(dados, ind)
        };
    }

    // ================================================================ RAAD (Relatório Anual de Atividades Docentes), pré-preenchido
    /**
     * Turmas do professor neste semestre (para o histórico do ano). CH da turma = créditos × 18 (como no RAAD da UFPel:
     * 4 créditos → 72 h; 2 créditos → 36 h), dividida em teórica/prática pela proporção do plano de ensino.
     */
    function turmasDoSemestre(dados, nomeProfessor, planosSalvos) {
        const n = N(), k = n.normNome(nomeProfessor);
        const prof = (dados.professores || []).find((p) => n.normNome(p.nome) === k);
        if (!prof) return [];
        const eq = n.gruposEquivalentes(dados);
        const minhas = (dados.disciplinas || []).filter((q) => n.professoresDe(q).includes(prof.id) && ((dados.grade && dados.grade.alocacoes) || []).some((a) => a.disc === q.id));
        // vários códigos dados juntos (equivalentes, mesmo horário): uma turma só, com a maior carga; os outros códigos vão junto
        const porGrupo = {};
        minhas.forEach((q) => { const g = eq.grupoDe[q.id] || q.id; if (!porGrupo[g] || n.cargaDe(q) > n.cargaDe(porGrupo[g])) porGrupo[g] = q; });
        return Object.values(porGrupo).map((q) => {
            const juntos = minhas.filter((x) => (eq.grupoDe[x.id] || x.id) === (eq.grupoDe[q.id] || q.id) && x.id !== q.id).map((x) => x.codigo).filter(Boolean);
            const c = conteudo(dados, q, (planosSalvos || {})[q.codigo || q.id]);
            const creditos = Number(c.creditos) || Number(q.creditos) || Number(q.aulas) || 0;
            const ch = creditos * 18;
            const tot = (Number(c.cargaTeorica) || 0) + (Number(c.cargaPratica) || 0);
            const chP = tot ? Math.round(ch * (Number(c.cargaPratica) || 0) / tot * 100) / 100 : 0;
            return { periodo: `${dados.config.ano}/${dados.config.metade}`, codigo: [q.codigo || '', ...juntos].filter(Boolean).join(' / '), nome: q.nome, turma: c.turma || q.turma || '', vinculo: q.professor === prof.id ? 'Professor responsável pela turma' : 'Professor regente',
                creditos, ch, chT: Math.round((ch - chP) * 100) / 100, chP, chE: 0, chEAD: 0, chEX: 0 };
        });
    }
    /** Guarda no histórico individual as turmas deste semestre (substitui o mesmo período). */
    function registrarSemestre(ind, dados) {
        ind.historico = ind.historico || {};
        ind.historico[`${dados.config.ano}/${dados.config.metade}`] = turmasDoSemestre(dados, ind.nome, ind.planos);
        return ind;
    }
    /**
     * RAAD do ano corrente (ano da grade): cabeçalho, ensino (turmas dos dois semestres guardados no histórico),
     * projetos e avaliações informados pelo professor. Pontuação do ensino é estimada (10 pontos por hora semanal média,
     * como no RAAD 2024 de referência: 4,0 h → 40 pontos); as demais pontuações ficam para o sistema da UFPel.
     */
    function raad(dados, ind) {
        const ano = Number(dados.config.ano);
        const hist = Object.assign({}, ind.historico || {});
        hist[`${ano}/${dados.config.metade}`] = turmasDoSemestre(dados, ind.nome, ind.planos); // semestre atual sempre recalculado
        const turmas = Object.entries(hist).filter(([per]) => Number(per.split('/')[0]) === ano).sort(([a], [b]) => a.localeCompare(b)).flatMap(([, l]) => l);
        const chEnsino = turmas.reduce((t, x) => t + x.ch, 0);
        const semestres = new Set(turmas.map((x) => x.periodo)).size || 1;
        const horasSemanais = Math.round(chEnsino / 18 / 2 * 100) / 100; // média semanal no ano (2 semestres de 18 semanas)
        const projetos = (ind.projetos || []).filter((p) => p.projeto);
        const chProjetos = projetos.reduce((t, p) => t + (Number(p.ch) || 0), 0);
        const perfil = ind.perfil || {};
        return { tipo: 'raad', ano, professor: ind.nome, siape: perfil.siape || '', unidade: (dados.config.unidade || {}).nome || '', departamento: perfil.departamento || (dados.config.unidade || {}).nome || '',
            ingressoUfpel: perfil.ingressoUfpel || '', ingressoCargo: perfil.ingressoCargo || '', jornada: perfil.jornada || '40',
            chEnsino, chProjetos, chTotal: chEnsino + chProjetos, horasSemanais, semestresComTurma: semestres,
            pontosEnsinoEstimados: Math.round(horasSemanais * 10 * 100) / 100,
            avaliacaoChefia: (ind.avaliacoes || {}).chefia || '', avaliacaoDiscente: (ind.avaliacoes || {}).discente || '',
            turmas, projetos, observacao: 'Pré-preenchido pelo Gerador de Horários a partir das grades e dos planos de ensino; conferir e lançar no Cobalto.' };
    }

    // ================================================================ unidade (pode ir para o MEGA)
    /** Dados da unidade: salas, professores (horários em código, sem dados individuais), cursos e calendário. */
    function exportarUnidade(dados) {
        const n = N(), cfg = dados.config;
        const comoHorarios = (l) => (l || []).map((ch) => { const [d, h] = n.separa(ch); const ho = cfg.horarios[h]; return ho && cfg.dias[d] ? { dia: cfg.dias[d], ini: ho.ini, fim: ho.fim } : null; }).filter(Boolean);
        const cursos = [{ nome: (dados.cursos[0] || {}).nome || '', aulas: ((dados.grade && dados.grade.alocacoes) || []).length,
            professores: [...new Set((dados.disciplinas || []).flatMap((q) => n.professoresDe(q).map((p) => n.nomeDe(dados.professores, p))).filter(Boolean))] }];
        (dados.externos || []).forEach((e) => { if (!e.unidade || n.normNome(e.unidade) === n.normNome((cfg.unidade || {}).nome)) cursos.push({ nome: e.curso, aulas: e.aulas.length, professores: [...new Set(e.aulas.flatMap((a) => (a.professores && a.professores.length ? a.professores : [a.professor])).filter(Boolean))] }); });
        return {
            tipo: 'unidade', versao: 1, unidade: cfg.unidade, ano: cfg.ano, metade: cfg.metade, exportadoEm: new Date().toISOString(),
            calendario: cfg.calendario, horarios: cfg.horarios, dias: cfg.dias,
            salas: (dados.salas || []).map((s) => ({ nome: s.nome, tipo: s.tipo, capacidade: s.capacidade, responsaveis: (s.responsaveis || []).map((p) => n.nomeDe(dados.professores, p)),
                politica: s.politica, autorizados: (s.autorizados || []).map((p) => n.nomeDe(dados.professores, p)), indisponivel: comoHorarios(s.indisp), pesquisa: comoHorarios(s.pesquisa) })),
            professores: (dados.professores || []).map((p) => ({ nome: p.nome, email: p.email || '', indisponivel: comoHorarios(p.indisp), pesquisa: comoHorarios(p.pesquisa) })),
            cursos
        };
    }
    /**
     * Junta os dados de uma unidade (JSON ou MEGA) nesta grade: inclui salas e professores que faltam (pelo nome) e soma
     * os horários indisponíveis e de pesquisa. Devolve { salas: n novas, professores: n novos }.
     */
    function importarUnidade(dados, u) {
        const n = N(), cfg = dados.config;
        const chaves = (l) => (l || []).map((x) => { const d = cfg.dias.indexOf(x.dia), h = cfg.horarios.findIndex((y) => y.ini === x.ini); return d >= 0 && h >= 0 ? n.chave(d, h) : null; }).filter(Boolean);
        const r = { salas: 0, professores: 0 };
        (u.professores || []).forEach((p) => {
            let meu = dados.professores.find((x) => n.normNome(x.nome) === n.normNome(p.nome));
            if (!meu) { meu = { id: n.novoId('p'), nome: p.nome, email: p.email || '', indisp: [], pesquisa: [] }; dados.professores.push(meu); r.professores++; }
            meu.indisp = [...new Set([...(meu.indisp || []), ...chaves(p.indisponivel)])];
            meu.pesquisa = [...new Set([...(meu.pesquisa || []), ...chaves(p.pesquisa)])];
        });
        const idDe = (nome) => (dados.professores.find((x) => n.normNome(x.nome) === n.normNome(nome)) || {}).id;
        (u.salas || []).forEach((s) => {
            let meu = dados.salas.find((x) => n.normNome(x.nome) === n.normNome(s.nome));
            if (!meu) {
                meu = { id: n.novoId('s'), nome: s.nome, tipo: s.tipo === 'laboratorio' ? 'laboratorio' : 'sala', capacidade: Number(s.capacidade) || 0, responsaveis: [], politica: s.politica || 'todos', autorizados: [], indisp: [], pesquisa: [] };
                dados.salas.push(meu); r.salas++;
                meu.responsaveis = (s.responsaveis || []).map(idDe).filter(Boolean);
                meu.autorizados = (s.autorizados || []).map(idDe).filter(Boolean);
            }
            meu.indisp = [...new Set([...(meu.indisp || []), ...chaves(s.indisponivel)])];
            meu.pesquisa = [...new Set([...(meu.pesquisa || []), ...chaves(s.pesquisa)])];
        });
        return r;
    }

    return { CAMPOS_VERIF, objetivosDoPortal, estatistica, horasProfessores, verificacao, rendimento, conteudoPadrao, conteudo, cursosAtendidos, localHorario, lerRoteiro, lerDatasSemAula,
        cronograma, planoDoSemestre, hashSenha, individualVazio, exportarIndividual, turmasDoSemestre, registrarSemestre, raad, exportarUnidade, importarUnidade, TEXTO_APROVACOES };
})();

if (typeof module !== 'undefined') module.exports = Planos;
