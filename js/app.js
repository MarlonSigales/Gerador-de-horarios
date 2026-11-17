/**
 * © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * Interface: navegação, cadastros, grade (aleatorizar e editar com conflitos na hora), arquivo e PDF.
 * As regras e o gerador estão em js/nucleo.js.
 */

'use strict';

/* global Nucleo, Exemplo, GeradorPDF, Nuvem, CATALOGO_UFPEL, Planos, DocxDocs */
(() => {
    const N = Nucleo;
    const CHAVE_LOCAL = 'gerador-horarios-v1';
    const SIMB = { erro: '⚠', aviso: '•', leve: '·' }; // erro (vermelho), aviso (amarelo), aviso leve (azul)
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];
    const esc = (t) => String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    let D = carregarLocal();
    let historico = [];
    const ui = { pagina: 'inicio', visao: 'curso', item: null, semestre: 1, editando: false, sel: null, ins: null, salaSel: '', destaque: new Set(), novos: [] };

    // ================================================================ armazenamento
    function carregarLocal() {
        try {
            const t = localStorage.getItem(CHAVE_LOCAL);
            if (t) {
                let d = N.normalizar(JSON.parse(t));
                if (d.cursos.length > 1) { // versão antiga, com vários cursos: fica o primeiro; os outros viram bloqueios
                    const todos = d; d = N.separarCurso(todos, todos.cursos[0].id);
                    todos.cursos.slice(1).forEach((c) => N.incluirExterno(d, N.externoDe(N.separarCurso(todos, c.id), c.id, 'arquivo')));
                }
                return d;
            }
        } catch (e) { /* sem armazenamento */ }
        return Exemplo.criar(N);
    }
    function salvarLocal() { try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(D)); } catch (e) { /* cheio ou bloqueado */ } }
    function mudou() { salvarLocal(); renderTudo(); }

    let avisoTempo = null;
    function aviso(html, ms = 3500) {
        const el = $('#aviso');
        el.innerHTML = html; el.classList.add('visivel');
        clearTimeout(avisoTempo); avisoTempo = setTimeout(() => el.classList.remove('visivel'), ms);
    }

    // ================================================================ navegação
    const PAGINAS = [
        { id: 'inicio', titulo: 'Início', icone: '🏠' },
        { id: 'config', titulo: 'Configuração', num: 1, conta: () => `${D.config.ano}/${D.config.metade}` },
        { id: 'cursos', titulo: 'Curso', num: 2, conta: () => (D.cursos[0] ? N.sigla(D.cursos[0].nome) : '') },
        { id: 'professores', titulo: 'Professores', num: 3, conta: () => D.professores.length },
        { id: 'salas', titulo: 'Salas e laboratórios', num: 4, conta: () => D.salas.length },
        { id: 'disciplinas', titulo: 'Disciplinas', num: 5, conta: () => D.disciplinas.length },
        { id: 'outros', titulo: 'Outros cursos', num: 6, conta: () => (D.externos || []).length },
        { id: 'grade', titulo: 'Grade', num: 7, conta: () => { const c = N.conflitos(D); return c.erros ? { t: `⚠ ${c.erros}`, ruim: true } : (D.grade.alocacoes.length ? '✓' : ''); } },
        { id: 'pdf', titulo: 'PDF', num: 8 },
        { id: 'professor', titulo: 'Área do professor', icone: '👤' },
        { id: 'relatorios', titulo: 'Relatórios (adm)', icone: '🔒' }
    ];
    const DESCR = {
        config: 'Ano, semestre do ano, dias e horários das aulas.',
        cursos: 'O curso (catálogo da UFPel), matriz, horários e turnos preferidos.',
        outros: 'Grades dos outros cursos: bloqueiam professores e salas.',
        professores: 'Quem dá aula e quando não pode.',
        salas: 'Salas comuns e laboratórios com responsáveis.',
        disciplinas: 'Professor, aulas, cursos, salas e horários fixos.',
        grade: 'Aleatorizar, editar e ver conflitos.',
        pdf: 'Grades por curso, professor e sala.'
    };

    function renderMenu() {
        renderPapel();
        $('#sidebar-nav').innerHTML = PAGINAS.map((p) => {
            let c = p.conta ? p.conta() : '';
            const ruim = c && typeof c === 'object' && c.ruim; if (c && typeof c === 'object') c = c.t;
            return `<a class="sidebar-link${ui.pagina === p.id ? ' ativo' : ''}" href="#${p.id}"><span class="sidebar-num">${p.num || p.icone}</span>${esc(p.titulo)}${c !== '' && c !== undefined ? `<span class="sidebar-conta${ruim ? ' ruim' : ''}">${esc(c)}</span>` : ''}</a>`;
        }).join('');
        $('#passos').innerHTML = PAGINAS.filter((p) => p.num).map((p) => `<li><a href="#${p.id}"><span class="sidebar-num">${p.num}</span><span><b>${esc(p.titulo)}</b><small>${esc(DESCR[p.id])}</small></span></a></li>`).join('');
        const c = N.conflitos(D);
        const selo = $('#topbar-selo');
        selo.textContent = !D.grade.alocacoes.length ? 'grade vazia' : (c.erros ? `⚠ ${c.erros} conflito${c.erros > 1 ? 's' : ''}` : '✓ sem conflitos');
        selo.style.color = c.erros ? 'var(--perigo)' : '';
        $('#topbar-projeto').textContent = `${D.cursos[0] ? D.cursos[0].nome : 'sem curso'} · ${(D.config.unidade || {}).nome || ''} · ${D.config.ano}/${D.config.metade}`;
        $('#inicio-resumo').textContent = `${D.cursos[0] ? D.cursos[0].nome : 'sem curso'} · ${D.professores.length} professores · ${D.salas.length} salas · ${D.disciplinas.length} disciplinas · ${(D.externos || []).length} outros cursos`;
    }

    function irPara(id) {
        if (!PAGINAS.some((p) => p.id === id)) id = 'inicio';
        ui.pagina = id;
        $$('.pagina').forEach((s) => { s.hidden = s.id !== `p-${id}`; });
        document.body.classList.remove('sidebar-aberta');
        renderTudo();
        window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', () => irPara(location.hash.slice(1)));

    function renderTudo() {
        renderMenu();
        if (ui.pagina === 'config') renderConfig();
        if (ui.pagina === 'cursos') renderCurso();
        if (ui.pagina === 'outros') renderOutros();
        if (ui.pagina === 'professores') renderLista('professor');
        if (ui.pagina === 'salas') renderLista('sala');
        if (ui.pagina === 'disciplinas') renderLista('disciplina');
        if (ui.pagina === 'grade') renderGradePagina();
        if (ui.pagina === 'pdf') renderPdfInfo();
        if (ui.pagina === 'relatorios') renderRelatorios();
        if (ui.pagina === 'professor') renderProfessor();
    }

    // ================================================================ configuração
    function renderConfig() {
        const c = D.config;
        $('#cfg-titulo').value = c.titulo || '';
        $('#cfg-ano').value = c.ano;
        $('#cfg-metade').value = String(c.metade);
        $('#cfg-divisao').innerHTML = Object.entries(N.DIVISAO).filter(([k]) => k !== 'manual').map(([k, v]) => `<option value="${k}"${(c.divisaoPadrao || 'auto') === k ? ' selected' : ''}>${esc(v)}</option>`).join('');
        $('#cfg-dias').innerHTML = N.DIAS_SEMANA.map((d) => `<label><input type="checkbox" value="${esc(d)}"${c.dias.includes(d) ? ' checked' : ''}> ${esc(d)}</label>`).join('');
        $('#cfg-horarios').value = c.horarios.map((h) => `${h.ini}-${h.fim}`).join('\n');
        renderCalendario();
        renderEventosCurso();
        $('#cfg-codigos').innerHTML = `<table class="lista" style="font-size:.82rem"><thead><tr><th>Horário</th>${c.dias.map((d) => `<th>${esc(d)}</th>`).join('')}</tr></thead><tbody>
            ${c.horarios.map((h, j) => `<tr><td>${esc(h.ini)}–${esc(h.fim)}</td>${c.dias.map((_, i) => `<td><b>${N.codigoHorario(c, i, j)}</b></td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    function lerHorarios(txt) {
        const r = [];
        txt.split(/\n+/).forEach((l) => {
            const m = l.match(/(\d{1,2}):(\d{2})\s*(?:-|–|a|às)\s*(\d{1,2}):(\d{2})/);
            if (m) r.push({ ini: `${m[1].padStart(2, '0')}:${m[2]}`, fim: `${m[3].padStart(2, '0')}:${m[4]}` });
        });
        const min = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
        return r.sort((a, b) => min(a.ini) - min(b.ini));
    }
    function salvarConfig() {
        const dias = $$('#cfg-dias input:checked').map((i) => i.value);
        const horarios = lerHorarios($('#cfg-horarios').value);
        if (!dias.length) return aviso('Marque pelo menos um dia.');
        if (!horarios.length) return aviso('Informe os horários no formato 07:30-08:20, um por linha.');
        const nova = { divisaoPadrao: $('#cfg-divisao').value || 'auto', titulo: $('#cfg-titulo').value.trim() || 'Grade horária', ano: Number($('#cfg-ano').value) || D.config.ano, metade: Number($('#cfg-metade').value) === 2 ? 2 : 1, dias, horarios };
        const r = N.remapearConfig(D, nova);
        if (r.perdidas && !confirm(`${r.perdidas} aula(s) da grade estão em dias ou horários que deixam de existir e serão retiradas. Continuar?`)) return;
        guardarHistorico();
        D = r.dados;
        mudou();
        aviso('Configuração salva.' + (Number(nova.metade) !== Number(D.config.metade) ? '' : ''));
    }

    // ================================================================ seletor de horários (marcar células)
    /** Monta uma tabela dias × horários em que se marca/desmarca clicando ou arrastando. */
    function montarSeletor(el, marcadas, opcoes = {}) {
        const cfg = D.config;
        const set = new Set(marcadas || []);
        const turnos = cfg.horarios.map((h) => N.turno(h));
        el.innerHTML = `<div class="seletor-barra">
            ${['manha', 'tarde', 'noite'].filter((t) => turnos.includes(t)).map((t) => `<button type="button" class="btn btn-secondary" data-t="${t}">${N.NOME_TURNO[t]}</button>`).join('')}
            <button type="button" class="btn btn-secondary" data-t="tudo">Tudo</button><button type="button" class="btn btn-secondary" data-t="nada">Limpar</button>
            <small class="muted" style="align-self:center">Clique ou arraste nas células; clique no dia ou na hora para marcar a coluna ou a linha.</small></div>
            <div class="seletor-wrap"><table class="seletor${opcoes.vermelho ? ' seletor-vermelho' : ''}${opcoes.roxo ? ' seletor-roxo' : ''}"><thead><tr><th></th>${cfg.dias.map((d, i) => `<th data-dia="${i}">${esc(d.slice(0, 3))}</th>`).join('')}</tr></thead>
            <tbody>${cfg.horarios.map((h, j) => `<tr class="${j && turnos[j] !== turnos[j - 1] ? 'quebra' : ''}"><th data-hora="${j}">${esc(h.ini)}</th>${cfg.dias.map((_, i) => `<td data-k="${i}|${j}" class="${set.has(`${i}|${j}`) ? 'on' : ''}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        const pinta = () => $$('td', el).forEach((td) => td.classList.toggle('on', set.has(td.dataset.k)));
        const alterna = (lista) => { const todas = lista.every((k) => set.has(k)); lista.forEach((k) => (todas ? set.delete(k) : set.add(k))); pinta(); };
        let pintando = null;
        el.addEventListener('pointerdown', (e) => {
            const td = e.target.closest('td[data-k]');
            if (!td) return;
            e.preventDefault();
            pintando = !set.has(td.dataset.k);
            pintando ? set.add(td.dataset.k) : set.delete(td.dataset.k); pinta();
        });
        el.addEventListener('pointerover', (e) => {
            if (pintando === null) return;
            const td = e.target.closest('td[data-k]');
            if (td) { pintando ? set.add(td.dataset.k) : set.delete(td.dataset.k); pinta(); }
        });
        document.addEventListener('pointerup', () => { pintando = null; });
        el.addEventListener('click', (e) => {
            const b = e.target.closest('[data-t]'), dia = e.target.closest('[data-dia]'), hora = e.target.closest('[data-hora]');
            if (b) {
                const t = b.dataset.t;
                if (t === 'tudo') { N.todasChaves(cfg).forEach((k) => set.add(k)); pinta(); }
                else if (t === 'nada') { set.clear(); pinta(); }
                else alterna(N.chavesTurno(cfg, t));
            } else if (dia) alterna(cfg.horarios.map((_, j) => `${dia.dataset.dia}|${j}`));
            else if (hora) alterna(cfg.dias.map((_, i) => `${i}|${hora.dataset.hora}`));
        });
        return { valor: () => [...set] };
    }

    // ================================================================ janela de formulário
    function abrirJanela(titulo, corpo, aoSalvar, aoAbrir, rotulo = 'Salvar') {
        const dlg = $('#janela');
        dlg.innerHTML = `<form method="dialog" novalidate><div class="janela-topo"><h2>${esc(titulo)}</h2><button type="button" data-fechar aria-label="Fechar">×</button></div>
            <div class="janela-corpo">${corpo}</div>
            <div class="janela-rodape"><button type="button" class="btn btn-secondary" data-fechar>Cancelar</button><button type="submit" class="btn btn-primary">${esc(rotulo)}</button></div></form>`;
        const form = $('form', dlg);
        $$('[data-fechar]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
        const ctx = aoAbrir ? aoAbrir(dlg) : {};
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (aoSalvar(dlg, ctx) !== false) { dlg.close(); mudou(); }
        });
        if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
        const primeiro = $('input[type=text]', dlg); if (primeiro) primeiro.focus();
    }
    const val = (dlg, nome) => { const el = $(`[name="${nome}"]`, dlg); return el ? el.value.trim() : ''; };
    const marcados = (dlg, nome) => $$(`[name="${nome}"]:checked`, dlg).map((i) => i.value);
    const checks = (nome, itens, escolhidos) => itens.length
        ? `<div class="checks">${itens.map((x) => `<label><input type="checkbox" name="${nome}" value="${esc(x.id)}"${(escolhidos || []).includes(x.id) ? ' checked' : ''}> ${esc(x.nome)}</label>`).join('')}</div>`
        : '<p class="vazio">Nada cadastrado ainda.</p>';

    // ---------- curso
    function formCurso(id) {
        const c = D.cursos.find((x) => x.id === id) || { id: null, nome: '', semestres: 10, oferta: [...N.chavesTurno(D.config, 'manha'), ...N.chavesTurno(D.config, 'tarde')], reoferta: [] };
        abrirJanela(c.id ? `Curso: ${c.nome}` : 'Novo curso', `
            <div class="campos"><label class="campo"><span>Nome</span><input type="text" name="nome" value="${esc(c.nome)}" required></label>
            <label class="campo"><span>Número de semestres</span><input type="number" name="semestres" min="1" max="20" value="${c.semestres}"><small>Engenharias: 10.</small></label></div>
            <fieldset><legend>Horários de funcionamento para as OFERTAS</legend><div id="sel-oferta"></div></fieldset>
            <fieldset><legend>Horários de funcionamento para as REOFERTAS</legend><div id="sel-reoferta"></div><small>Nada marcado = sem restrição.</small></fieldset>
            <fieldset><legend>Turno preferido por semestre (o gerador tenta; se não der, avisa)</legend>
                <div class="tabela-wrap"><table class="lista" id="tab-pref"><thead><tr><th>Semestre</th><th>Situação</th>${Object.entries(N.NOME_TURNO).map(([k, v]) => `<th>${v}</th>`).join('')}</tr></thead><tbody></tbody></table></div>
                <small>Ex.: semestres 1 e 3 de manhã; 5 e 7 à tarde. Nada marcado = sem preferência.</small></fieldset>`,
        (dlg, ctx) => {
            const nome = val(dlg, 'nome'); if (!nome) { aviso('Informe o nome do curso.'); return false; }
            const preferencias = {};
            $$('#tab-pref input:checked', dlg).forEach((i) => { (preferencias[i.dataset.sem] = preferencias[i.dataset.sem] || []).push(i.dataset.t); });
            const novo = { id: c.id || N.novoId('c'), cod: c.cod || null, nome, semestres: Math.max(1, Number(val(dlg, 'semestres')) || 10), oferta: ctx.of.valor(), reoferta: ctx.re.valor(), preferencias };
            if (c.id) Object.assign(D.cursos.find((x) => x.id === c.id), novo); else D.cursos = [novo];
            return true;
        }, (dlg) => {
            const pinta = () => {
                const n = Math.max(1, Number(val(dlg, 'semestres')) || 10);
                const atual = {};
                $$('#tab-pref input:checked', dlg).forEach((i) => { (atual[i.dataset.sem] = atual[i.dataset.sem] || []).push(i.dataset.t); });
                const fonte = Object.keys(atual).length || $('#tab-pref tbody', dlg).children.length ? atual : (c.preferencias || {});
                $('#tab-pref tbody', dlg).innerHTML = Array.from({ length: n }, (_, i) => i + 1).map((sem) => { const sit = N.situacao(sem, D.config.metade);
                    return `<tr><td>${sem}º</td><td><span class="etiqueta ${sit}">${sit}</span></td>${Object.keys(N.NOME_TURNO).map((t) => `<td><input type="checkbox" data-sem="${sem}" data-t="${t}"${(fonte[sem] || []).includes(t) ? ' checked' : ''}></td>`).join('')}</tr>`; }).join('');
            };
            pinta();
            $('[name=semestres]', dlg).addEventListener('change', pinta);
            return { of: montarSeletor($('#sel-oferta', dlg), c.oferta), re: montarSeletor($('#sel-reoferta', dlg), c.reoferta) };
        });
    }
    // ---------- professor
    function formProfessor(id) {
        const p = D.professores.find((x) => x.id === id) || { id: null, nome: '', email: '', indisp: [], pesquisa: [] };
        abrirJanela(p.id ? `Professor: ${p.nome}` : 'Novo professor', `
            <div class="campos"><label class="campo"><span>Nome completo</span><input type="text" name="nome" value="${esc(p.nome)}" required></label>
            <label class="campo"><span>E-mail (opcional)</span><input type="email" name="email" value="${esc(p.email)}"></label></div>
            <fieldset><legend>Horários em que NÃO pode dar aula</legend><div id="sel-indisp"></div></fieldset>
            <fieldset><legend>Horários reservados para pesquisa</legend><div id="sel-pesq"></div><small>Não recebem aula; aparecem nos relatórios internos.</small></fieldset>`,
        (dlg, ctx) => {
            const nome = val(dlg, 'nome'); if (!nome) { aviso('Informe o nome.'); return false; }
            const novo = { id: p.id || N.novoId('p'), nome, email: val(dlg, 'email'), indisp: ctx.s.valor(), pesquisa: ctx.pq.valor() };
            if (p.id) Object.assign(D.professores.find((x) => x.id === p.id), novo); else D.professores.push(novo);
            return true;
        }, (dlg) => ({ s: montarSeletor($('#sel-indisp', dlg), p.indisp, { vermelho: true }), pq: montarSeletor($('#sel-pesq', dlg), p.pesquisa || [], { roxo: true }) }));
    }
    // ---------- sala
    function formSala(id) {
        const s = D.salas.find((x) => x.id === id) || { id: null, nome: '', tipo: 'sala', capacidade: 40, responsaveis: [], politica: 'todos', autorizados: [], indisp: [], pesquisa: [] };
        abrirJanela(s.id ? s.nome : 'Nova sala ou laboratório', `
            <div class="campos"><label class="campo"><span>Nome</span><input type="text" name="nome" value="${esc(s.nome)}" required></label>
            <label class="campo"><span>Tipo</span><select name="tipo"><option value="sala"${s.tipo === 'sala' ? ' selected' : ''}>Sala de aula</option><option value="laboratorio"${s.tipo === 'laboratorio' ? ' selected' : ''}>Laboratório</option></select>
                <small>Laboratório só recebe as disciplinas que o pedem; sala comum recebe qualquer uma.</small></label>
            <label class="campo"><span>Capacidade (alunos)</span><input type="number" name="capacidade" min="0" value="${s.capacidade}"></label></div>
            <fieldset><legend>Professor(es) responsável(is)</legend>${checks('resp', D.professores, s.responsaveis)}<small>Têm prioridade nas aulas deste espaço.</small></fieldset>
            <fieldset><legend>Aulas de outros professores (decisão dos responsáveis)</legend>
                <select name="politica">${Object.entries(N.POLITICA).map(([k, v]) => `<option value="${k}"${s.politica === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>
                <div id="bloco-aut" style="margin-top:.5rem"><small>Professores autorizados:</small>${checks('aut', D.professores, s.autorizados)}</div></fieldset>
            <fieldset><legend>Horários em que NÃO pode ser usada</legend><div id="sel-indisp"></div></fieldset>
            <fieldset><legend>Horários reservados para pesquisa</legend><div id="sel-pesq"></div><small>Não recebem aula; aparecem na grade da sala e nos relatórios internos.</small></fieldset>`,
        (dlg, ctx) => {
            const nome = val(dlg, 'nome'); if (!nome) { aviso('Informe o nome.'); return false; }
            const novo = { id: s.id || N.novoId('s'), nome, tipo: val(dlg, 'tipo'), capacidade: Number(val(dlg, 'capacidade')) || 0, responsaveis: marcados(dlg, 'resp'),
                politica: val(dlg, 'politica'), autorizados: marcados(dlg, 'aut'), indisp: ctx.s.valor(), pesquisa: ctx.pq.valor() };
            if (s.id) Object.assign(D.salas.find((x) => x.id === s.id), novo); else D.salas.push(novo);
            return true;
        }, (dlg) => {
            const pol = $('[name=politica]', dlg), mostra = () => { $('#bloco-aut', dlg).hidden = pol.value !== 'autorizados'; };
            pol.addEventListener('change', mostra); mostra();
            return { s: montarSeletor($('#sel-indisp', dlg), s.indisp, { vermelho: true }), pq: montarSeletor($('#sel-pesq', dlg), s.pesquisa || [], { roxo: true }) };
        });
    }
    // ---------- disciplina
    function formDisciplina(id) {
        const q = D.disciplinas.find((x) => x.id === id) || { id: null, codigo: '', nome: '', professor: '', regentes: [], aulas: 4, blocos: '', salas: [], fixos: [], equivalentes: [], ofertas: [] };
        const linhaOferta = (o) => `<div class="linha-oferta">
            <input type="hidden" name="of-curso" value="${esc((D.cursos[0] || {}).id || '')}"><span>${esc((D.cursos[0] || {}).nome || 'Curso')} — semestre</span>
            <input type="number" name="of-sem" min="0" max="20" value="${o.semestre === undefined ? 1 : o.semestre}" title="Semestre (0 = optativa ainda sem semestre)">
            <select name="of-car">${Object.entries(N.CARATER).map(([k, v]) => `<option value="${k}"${o.carater === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
            <span class="etiqueta" data-sit></span>
            <button type="button" class="btn btn-secondary btn-sm" data-tira title="Tirar este curso">×</button></div>`;
        abrirJanela(q.id ? N.nomeDisc(q) : 'Nova disciplina', `
            <div class="campos"><label class="campo"><span>Código</span><input type="text" name="codigo" value="${esc(q.codigo)}"></label>
            <label class="campo" style="grid-column: span 2"><span>Nome</span><input type="text" name="nome" value="${esc(q.nome)}" required></label>
            <label class="campo"><span>Professor responsável</span><select name="professor"><option value="">— escolha —</option>${D.professores.map((p) => `<option value="${esc(p.id)}"${q.professor === p.id ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
            <label class="campo"><span>Aulas por semana</span><input type="number" name="aulas" min="0" max="30" value="${q.aulas}"></label>
            <label class="campo"><span>Divisão das aulas na semana</span><select name="divisao">
                <option value=""${!q.divisao ? ' selected' : ''}>Padrão do curso (${esc(N.DIVISAO[D.config.divisaoPadrao || 'auto'].split(' (')[0].toLowerCase())})</option>
                ${Object.entries(N.DIVISAO).map(([k, v]) => `<option value="${k}"${q.divisao === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>
                <small data-prev-blocos></small></label>
            <label class="campo" data-campo-blocos><span>Blocos (personalizado)</span><input type="text" name="blocos" value="${esc(q.blocos)}" placeholder="ex.: 3+2"><small>A soma tem que dar as aulas por semana.</small></label></div>
            <fieldset><legend>Professores regentes (também dão aula)</legend>${checks('regentes', D.professores, q.regentes || [])}
                <small>O responsável e os regentes dão aula juntos: todos ficam ocupados nos horários da disciplina (conflitos, laboratórios, carga horária, plano de ensino e RAAD).</small></fieldset>
            <fieldset><legend>Semestre(s) e caráter no curso</legend><div id="ofertas"></div>
                <button type="button" class="btn btn-secondary btn-sm" data-add-oferta${D.cursos.length ? '' : ' disabled'}>+ Semestre</button>
                <small class="muted"> Semestre 0 = optativa ainda sem semestre (fica fora da grade). Disciplina com 0 aulas também fica fora (estágio, TCC, EAD).</small>
                <small class="muted"> No ${D.config.metade}º semestre do ano, as disciplinas dos semestres ${D.config.metade === 1 ? 'ímpares' : 'pares'} do curso são oferta e as dos ${D.config.metade === 1 ? 'pares' : 'ímpares'} são reoferta (no próximo, inverte).</small></fieldset>
            <fieldset><legend>Salas ou laboratórios onde pode ocorrer</legend>${checks('salas', D.salas.map((s) => ({ id: s.id, nome: s.nome + (s.tipo === 'laboratorio' ? ' (lab.)' : '') })), q.salas)}
                <small>Nada marcado = qualquer sala comum. Laboratório só aceita quem os responsáveis autorizam.</small></fieldset>
            <fieldset><legend>Disciplinas equivalentes (mesma turma, mesmo horário e mesma sala)</legend>${checks('equiv', D.disciplinas.filter((x) => x.id !== q.id).map((x) => ({ id: x.id, nome: N.nomeDisc(x) })), q.equivalentes)}</fieldset>
            <details${q.fixos.length ? ' open' : ''}><summary style="cursor:pointer;font-weight:600;color:var(--teal)">Horários fixos (opcional): a disciplina só ocorre nos horários marcados</summary><div id="sel-fixos" style="margin-top:.4rem"></div></details>`,
        (dlg, ctx) => {
            const nome = val(dlg, 'nome'); if (!nome) { aviso('Informe o nome da disciplina.'); return false; }
            const linhas = $$('.linha-oferta', dlg);
            const ofertas = linhas.map((l) => ({ curso: $('[name=of-curso]', l).value, semestre: Number($('[name=of-sem]', l).value) || 1, carater: $('[name=of-car]', l).value }));
            const novoId = q.id || N.novoId('d');
            const equivalentes = marcados(dlg, 'equiv');
            const professor = val(dlg, 'professor');
            const divisao = val(dlg, 'divisao');
            if (divisao === 'manual') { const pt = val(dlg, 'blocos').split(/[+,; ]+/).map(Number).filter((x) => x > 0); if (pt.reduce((a, b) => a + b, 0) !== (Number(val(dlg, 'aulas')) || 0)) { aviso('No personalizado, a soma dos blocos precisa dar as aulas por semana (ex.: 3+2 = 5).'); return false; } }
            const novo = { id: novoId, codigo: val(dlg, 'codigo'), nome, professor, regentes: marcados(dlg, 'regentes').filter((p) => p !== professor), aulas: Number(val(dlg, 'aulas')) || 0, blocos: divisao === 'manual' ? val(dlg, 'blocos') : '', divisao,
                salas: marcados(dlg, 'salas'), fixos: ctx.f.valor(), equivalentes, ofertas };
            if (q.id) Object.assign(D.disciplinas.find((x) => x.id === q.id), novo); else D.disciplinas.push(novo);
            // equivalência vale nos dois sentidos
            D.disciplinas.forEach((x) => {
                if (x.id === novoId) return;
                const tem = x.equivalentes.includes(novoId), deve = equivalentes.includes(x.id);
                if (deve && !tem) x.equivalentes.push(novoId);
                if (!deve && tem) x.equivalentes = x.equivalentes.filter((e) => e !== novoId);
            });
            return true;
        }, (dlg) => {
            const caixa = $('#ofertas', dlg);
            const atualiza = () => $$('.linha-oferta', dlg).forEach((l) => {
                const sem = Number($('[name=of-sem]', l).value);
                const sit = sem > 0 ? N.situacao(sem, D.config.metade) : 'a definir';
                const et = $('[data-sit]', l); et.textContent = sit; et.className = `etiqueta ${sem > 0 ? sit : ''}`;
            });
            caixa.innerHTML = q.ofertas.map(linhaOferta).join('');
            const prevB = () => { // mostra como as aulas ficam divididas
                const dv = val(dlg, 'divisao');
                $('[data-campo-blocos]', dlg).hidden = dv !== 'manual';
                const bl = N.blocos({ aulas: Number(val(dlg, 'aulas')) || 0, blocos: dv === 'manual' ? val(dlg, 'blocos') : '', divisao: dv }, D.config.divisaoPadrao);
                $('[data-prev-blocos]', dlg).textContent = bl.length ? `Na grade: ${bl.join(' + ')} aula${bl.length > 1 ? 's (em dias diferentes, se der)' : (bl[0] > 1 ? 's seguidas' : '')}.` : '';
            };
            ['divisao', 'aulas', 'blocos'].forEach((nm) => { const el = $(`[name=${nm}]`, dlg); el.addEventListener('input', prevB); el.addEventListener('change', prevB); });
            prevB();
            $('[data-add-oferta]', dlg).addEventListener('click', () => { caixa.insertAdjacentHTML('beforeend', linhaOferta({ curso: (D.cursos[0] || {}).id, semestre: 1, carater: 'obrigatoria' })); atualiza(); });
            if (!q.id && !q.ofertas.length && D.cursos[0]) $('[data-add-oferta]', dlg).click();
            caixa.addEventListener('click', (e) => { if (e.target.closest('[data-tira]')) { e.target.closest('.linha-oferta').remove(); } });
            caixa.addEventListener('input', atualiza);
            atualiza();
            return { f: montarSeletor($('#sel-fixos', dlg), q.fixos) };
        });
    }
    const FORMS = { curso: formCurso, professor: formProfessor, sala: formSala, disciplina: formDisciplina };

    // ================================================================ listas de cadastro
    function renderLista(tipo) {
        const el = $(`#lista-${tipo}`);
        const acoes = (id) => `<td class="acoes"><button type="button" class="btn btn-secondary btn-sm" data-acao="editar-item" data-tipo="${tipo}" data-id="${esc(id)}">Editar</button>
            <button type="button" class="btn btn-perigo btn-sm" data-acao="excluir-item" data-tipo="${tipo}" data-id="${esc(id)}" title="Excluir">×</button></td>`;
        const nomeP = (id) => N.nomeDe(D.professores, id);
        let html = '';
        if (tipo === 'curso') {
            html = D.cursos.length ? `<table class="lista"><thead><tr><th>Curso</th><th>Semestres</th><th>Oferta</th><th>Reoferta</th><th>Disciplinas</th><th></th></tr></thead><tbody>${D.cursos.map((c) => `<tr>
                <td><b>${esc(c.nome)}</b> <span class="etiqueta">${esc(N.sigla(c.nome))}</span></td><td>${c.semestres}</td>
                <td>${resumoHorarios(c.oferta)}</td><td>${resumoHorarios(c.reoferta)}</td>
                <td>${D.disciplinas.filter((q) => q.ofertas.some((o) => o.curso === c.id)).length}</td>${acoes(c.id)}</tr>`).join('')}</tbody></table>` : '';
        } else if (tipo === 'professor') {
            html = D.professores.length ? `<table class="lista"><thead><tr><th>Professor</th><th>Disciplinas</th><th>Responsável por</th><th>Não pode</th><th></th></tr></thead><tbody>${D.professores.map((p) => `<tr>
                <td><b>${esc(p.nome)}</b></td>
                <td>${D.disciplinas.filter((q) => N.professoresDe(q).includes(p.id)).map((q) => `<span class="etiqueta" title="${esc(q.nome)}${q.professor === p.id ? ' (responsável)' : ' (regente)'}">${esc(q.codigo || q.nome)}${q.professor === p.id ? '' : ' ʳ'}</span>`).join('') || '<small>—</small>'}</td>
                <td>${D.salas.filter((s) => s.responsaveis.includes(p.id)).map((s) => `<span class="etiqueta lab">${esc(s.nome)}</span>`).join('') || '<small>—</small>'}</td>
                <td>${p.indisp.length ? `${p.indisp.length} horários` : '<small>—</small>'}${(p.pesquisa || []).length ? ` <span class="etiqueta pesq">pesquisa: ${p.pesquisa.length}</span>` : ''}</td>${acoes(p.id)}</tr>`).join('')}</tbody></table>` : '';
        } else if (tipo === 'sala') {
            html = D.salas.length ? `<table class="lista"><thead><tr><th>Sala ou laboratório</th><th>Tipo</th><th>Cap.</th><th>Responsáveis</th><th>Outros professores</th><th>Não pode</th><th></th></tr></thead><tbody>${D.salas.map((s) => `<tr>
                <td><b>${esc(s.nome)}</b></td><td>${s.tipo === 'laboratorio' ? '<span class="etiqueta lab">laboratório</span>' : 'sala'}</td><td>${s.capacidade || '—'}</td>
                <td>${s.responsaveis.map(nomeP).map(esc).join(', ') || '<small>—</small>'}</td>
                <td><small>${esc(N.POLITICA[s.politica])}${s.politica === 'autorizados' && s.autorizados.length ? ': ' + s.autorizados.map(nomeP).map(esc).join(', ') : ''}</small></td>
                <td>${s.indisp.length ? `${s.indisp.length} horários` : '<small>—</small>'}${(s.pesquisa || []).length ? ` <span class="etiqueta pesq">pesquisa: ${s.pesquisa.length}</span>` : ''}</td>${acoes(s.id)}</tr>`).join('')}</tbody></table>` : '';
        } else {
            const f = ($('#filtro-disc').value || '').toLowerCase();
            const lista = D.disciplinas.filter((q) => !f || [q.codigo, q.nome, N.nomesProfessores(D, q), ...q.ofertas.map((o) => N.nomeDe(D.cursos, o.curso))].join(' ').toLowerCase().includes(f));
            html = lista.length ? `<table class="lista"><thead><tr><th>Código</th><th>Disciplina</th><th>Professor</th><th>Aulas</th><th>Cursos</th><th>Salas</th><th>Restrições</th><th>Horários (código)</th><th></th></tr></thead><tbody>${lista.map((q) => `<tr>
                <td>${esc(q.codigo)}</td><td><b>${esc(q.nome)}</b></td><td>${q.professor ? esc(nomeP(q.professor)) : '<span style="color:var(--perigo)">sem responsável</span>'}${(q.regentes || []).length ? `<br><small>regentes: ${esc(q.regentes.map(nomeP).join(', '))}</small>` : ''}</td>
                <td>${q.aulas ? `${q.aulas} <small title="${esc(q.divisao ? N.DIVISAO[q.divisao] : 'Padrão do curso')}">(${N.blocos(q, D.config.divisaoPadrao).join('+')})</small>` : '<span class="etiqueta" title="0 aulas ou semestre 0: fica fora da grade">fora da grade</span>'}${q.horas ? `<br><small title="Carga horária da matriz curricular">${q.creditos || '?'} cr. · ${q.horas} h</small>` : ''}</td>
                <td>${q.ofertas.map((o) => { const c = D.cursos.find((x) => x.id === o.curso); const sit = N.situacao(o.semestre, D.config.metade);
                    return `<span class="etiqueta ${sit}" title="${esc(c ? c.nome : '')} — ${o.semestre}º semestre, ${N.CARATER[o.carater]}, ${sit}">${esc(c ? N.sigla(c.nome) : '?')} ${o.semestre}º ${N.CARATER[o.carater].slice(0, 3).toLowerCase()}.</span>`; }).join('') || '<small>—</small>'}</td>
                <td>${q.salas.map((s) => `<span class="etiqueta lab">${esc(N.nomeDe(D.salas, s))}</span>`).join('') || '<small>salas comuns</small>'}</td>
                <td><small>${[q.fixos.length ? `fixa em ${q.fixos.length} horários` : '', q.equivalentes.length ? `equivalente a ${q.equivalentes.map((e) => esc((D.disciplinas.find((x) => x.id === e) || {}).codigo || e)).join(', ')}` : ''].filter(Boolean).join('; ') || '—'}</small></td>
                <td class="codigos">${esc(N.codigosDisciplina(D, q.id)) || '<small>—</small>'}</td>${acoes(q.id)}</tr>`).join('')}</tbody></table>` : '';
        }
        el.innerHTML = html || '<p class="vazio">Nada cadastrado ainda. Use o botão “+ Novo” acima ou carregue o exemplo no menu.</p>';
    }
    function resumoHorarios(lista) {
        if (!lista || !lista.length) return '<small>sem restrição</small>';
        const cfg = D.config, porTurno = {};
        lista.forEach((k) => { const [, h] = N.separa(k); const t = N.turno(cfg.horarios[h] || {}); porTurno[t] = (porTurno[t] || 0) + 1; });
        const total = (t) => N.chavesTurno(cfg, t).length;
        return Object.keys(N.NOME_TURNO).filter((t) => porTurno[t]).map((t) => `<span class="etiqueta">${N.NOME_TURNO[t]}${porTurno[t] < total(t) ? ` (${porTurno[t]})` : ''}</span>`).join('');
    }

    // ================================================================ grade
    function guardarHistorico() { historico.push(JSON.stringify(D)); if (historico.length > 60) historico.shift(); }
    function desfazer() {
        if (!historico.length) return aviso('Nada para desfazer.');
        D = N.normalizar(JSON.parse(historico.pop()));
        ui.sel = null; ui.ins = null; ui.destaque = new Set(); ui.novos = [];
        mudou(); aviso('Desfeito.');
    }

    function itensDaVisao() {
        if (ui.visao === 'relacao') return D.cursos;
        if (ui.visao === 'curso') return D.cursos;
        if (ui.visao === 'professor') return D.professores;
        return D.salas;
    }
    function aulaNaVisao(a) {
        const q = D.disciplinas.find((x) => x.id === a.disc);
        if (!q) return false;
        if (ui.visao === 'curso') return q.ofertas.some((o) => o.curso === ui.item && Number(o.semestre) === Number(ui.semestre));
        if (ui.visao === 'professor') return N.professoresDe(q).includes(ui.item);
        return a.sala === ui.item;
    }
    function celulaFechada(k) {
        if (ui.visao === 'curso') {
            const c = D.cursos.find((x) => x.id === ui.item); if (!c) return false;
            const l = c[N.situacao(ui.semestre, D.config.metade)] || [];
            return l.length > 0 && !l.includes(k);
        }
        const lista = ui.visao === 'professor' ? D.professores : D.salas;
        const x = lista.find((y) => y.id === ui.item);
        return !!(x && (x.indisp || []).includes(k));
    }

    function celulaPesquisa(k) {
        if (ui.visao !== 'professor' && ui.visao !== 'sala') return false;
        const x = (ui.visao === 'professor' ? D.professores : D.salas).find((y) => y.id === ui.item);
        return !!(x && (x.pesquisa || []).includes(k));
    }
    function renderGradePagina() {
        const c = N.conflitos(D);
        const total = D.disciplinas.reduce((s, q) => s + (Number(q.aulas) || 0), 0);
        const falt = N.faltando(D).reduce((s, x) => s + x.faltam, 0);
        $('#grade-resumo').innerHTML = `<span class="selo"><b>${D.grade.alocacoes.length}</b> de ${total} aulas na grade</span>
            <span class="selo ${c.erros ? 'erro' : 'ok'}"><b>${c.erros}</b> conflito${c.erros === 1 ? '' : 's'}</span>
            ${c.avisos ? `<span class="selo aviso"><b>${c.avisos}</b> aviso${c.avisos === 1 ? '' : 's'}</span>` : ''}
            ${c.leves ? `<span class="selo leve" title="Colisões só de regência (o regente apoia mais de uma disciplina)"><b>${c.leves}</b> aviso${c.leves === 1 ? '' : 's'} leve${c.leves === 1 ? '' : 's'}</span>` : ''}
            ${falt ? `<span class="selo aviso"><b>${falt}</b> sem lugar</span>` : ''}`;
        $('#btn-editar').classList.toggle('ativo', ui.editando);
        $('#btn-editar').textContent = ui.editando ? '✔ Concluir edição' : '✏️ Editar';
        $('#btn-desfazer').disabled = !historico.length;

        $$('#visao-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.visao === ui.visao));
        const itens = itensDaVisao();
        if (!itens.some((x) => x.id === ui.item)) ui.item = itens.length ? itens[0].id : null;
        $('#visao-rotulo').textContent = { curso: 'Curso', professor: 'Professor', sala: 'Sala ou laboratório', relacao: 'Curso' }[ui.visao];
        $('#visao-item').innerHTML = itens.map((x) => `<option value="${esc(x.id)}"${x.id === ui.item ? ' selected' : ''}>${esc(x.nome)}</option>`).join('');
        $('#visao-sem-campo').hidden = ui.visao !== 'curso';
        if (ui.visao === 'curso') {
            const curso = D.cursos.find((x) => x.id === ui.item);
            const n = curso ? curso.semestres : 0;
            if (ui.semestre > n) ui.semestre = 1;
            $('#visao-semestre').innerHTML = Array.from({ length: n }, (_, i) => i + 1).map((s) => {
                const qtd = D.disciplinas.filter((q) => q.ofertas.some((o) => o.curso === ui.item && Number(o.semestre) === s)).length;
                return `<option value="${s}"${s === Number(ui.semestre) ? ' selected' : ''}>${s}º semestre — ${N.situacao(s, D.config.metade)} (${qtd} disc.)</option>`;
            }).join('');
        }
        if (ui.visao === 'relacao') renderRelacao(); else renderGrade(c);
        renderPainelEdicao();
        renderConflitos(c);
        renderFaltam();
    }

    function renderGrade(c) {
        const cfg = D.config, wrap = $('#grade-wrap');
        if (!ui.item) { wrap.innerHTML = '<p class="vazio" style="padding:1rem">Cadastre cursos, professores e salas para ver a grade.</p>'; return; }
        const eq = N.gruposEquivalentes(D);
        const alocs = D.grade.alocacoes;
        const porCel = {};
        alocs.forEach((a, i) => { if (aulaNaVisao(a)) (porCel[`${a.d}|${a.h}`] = porCel[`${a.d}|${a.h}`] || []).push(i); });
        const turnos = cfg.horarios.map((h) => N.turno(h));
        const sitVisao = ui.visao === 'curso' ? N.situacao(ui.semestre, cfg.metade) : null;
        const chip = (indices) => {
            const a = alocs[indices[0]];
            const discs = [...new Set(indices.map((i) => alocs[i].disc))].map((id) => D.disciplinas.find((x) => x.id === id));
            const q = discs[0];
            const cs = [...new Set(indices.flatMap((i) => c.porAloc[i] || []))];
            const erro = cs.some((x) => x.gravidade === 'erro'), avis = !erro && cs.some((x) => x.gravidade === 'aviso'), leve = cs.length && !erro && !avis;
            const turmas = discs.flatMap((x) => x.ofertas.map((o) => `${N.sigla(N.nomeDe(D.cursos, o.curso))} ${o.semestre}º`));
            const profsQ = N.professoresDe(q).map((p) => N.nomeDe(D.professores, p));
            const prof = profsQ.length ? profsQ[0] + (profsQ.length > 1 ? ` +${profsQ.length - 1}` : '') : 'sem professor';
            const sala = N.nomeDe(D.salas, a.sala);
            const linha2 = ui.visao === 'curso' ? `${prof.split(' ')[0]} · ${sala}` : ui.visao === 'professor' ? `${sala} · ${turmas.join(', ')}` : `${prof.split(' ')[0]} · ${turmas.join(', ')}`;
            const ofertaCurso = ui.visao === 'curso' ? q.ofertas.find((o) => o.curso === ui.item && Number(o.semestre) === Number(ui.semestre)) : null;
            const sit = sitVisao || (q.ofertas.length && q.ofertas.every((o) => N.situacao(o.semestre, cfg.metade) === 'reoferta') ? 'reoferta' : 'oferta');
            const titulo = [discs.map((x) => N.nomeDisc(x)).join(' / ') + (discs.length > 1 ? ' (equivalentes)' : ''), `Professor${profsQ.length > 1 ? 'es' : ''}: ${profsQ.join(', ') || 'sem professor'}${profsQ.length > 1 ? ' (o 1º é o responsável)' : ''}`, `Sala: ${sala}`, `Turmas: ${turmas.join(', ')}`, `Horários (código): ${N.codigosDisciplina(D, q.id)}`,
                a.travada ? 'Fixada (o Aleatorizar não mexe)' : '', ...cs.map((x) => `${SIMB[x.gravidade]} ${x.msg}`)].filter(Boolean).join('\n');
            const sel = ui.sel && indices.some((i) => ui.sel.includes(i));
            return `<div class="aula ${sit}${ofertaCurso && ofertaCurso.carater !== 'obrigatoria' ? ' optativa' : ''}${erro ? ' conflito-erro' : ''}${avis ? ' conflito-aviso' : ''}${leve ? ' conflito-leve' : ''}${sel ? ' selecionada' : ''}${indices.some((i) => ui.destaque.has(i)) ? ' piscar' : ''}"
                data-i="${indices[0]}" title="${esc(titulo)}"${ui.editando ? ' draggable="true"' : ''}>
                ${cs.length ? `<span class="alerta">⚠</span>` : ''}<b>${esc(discs.map((x) => x.codigo || x.nome.slice(0, 8)).join('/'))}</b>${a.travada ? ' 🔒' : ''}
                <span class="nome">${esc(q.nome)}</span><small>${esc(linha2)}</small></div>`;
        };
        wrap.innerHTML = `<table class="grade${ui.editando ? ' editando' : ''}"><thead><tr><th class="hora">Horário</th>${cfg.dias.map((d, i) => `<th>${esc(d)} <small class="cod">(${N.codigoHorario(cfg, i, 0).charAt(0)})</small></th>`).join('')}</tr></thead><tbody>
            ${cfg.horarios.map((h, j) => `<tr class="${j && turnos[j] !== turnos[j - 1] ? 'quebra' : ''}"><td class="hora">${esc(h.ini)}–${esc(h.fim)}<small class="cod">·${N.codigoHorario(cfg, 0, j).slice(1)}</small></td>
            ${cfg.dias.map((_, i) => {
                const k = `${i}|${j}`;
                const grupos = {};
                (porCel[k] || []).forEach((idx) => { const a = alocs[idx]; const g = `${eq.grupoDe[a.disc]}|${a.sala}`; (grupos[g] = grupos[g] || []).push(idx); });
                const pesq = celulaPesquisa(k);
                return `<td data-d="${i}" data-h="${j}" class="${celulaFechada(k) ? 'fechado' : ''}${pesq ? ' pesquisa' : ''}"${pesq ? ' title="Reservado para pesquisa"' : ''}>${pesq && !grupos.length && !Object.keys(grupos).length ? '<small class="rotulo-pesq">pesquisa</small>' : ''}${Object.values(grupos).map(chip).join('')}</td>`;
            }).join('')}</tr>`).join('')}</tbody></table>`;
        $('#legenda').innerHTML = `<span><i style="background:var(--verde-claro);border-left:4px solid var(--verde)"></i>oferta</span>
            <span><i style="background:#fffaf0;border-left:4px solid var(--amarelo)"></i>reoferta</span>
            <span><i style="background:#fdecea;border-color:var(--perigo)"></i>erro</span><span><i style="background:#fff;box-shadow:0 0 0 2px #e8c35a"></i>aviso</span><span><i style="background:#fff;box-shadow:0 0 0 2px #8cb8e0"></i>aviso leve (só regência) — passe o mouse para ver</span>
            <span><i style="background:repeating-linear-gradient(45deg,#f6f8f8,#f6f8f8 3px,#e3e9e8 3px,#e3e9e8 6px)"></i>${{ curso: 'fora do funcionamento do curso', professor: 'professor indisponível', sala: 'sala indisponível' }[ui.visao]}</span>
            ${ui.visao !== 'curso' ? '<span><i style="background:#f1eafc;border-color:#c9b3ef"></i>reservado para pesquisa</span>' : ''}
            <span>🔒 fixada (o Aleatorizar não mexe)</span>
            ${ui.editando ? '<span><b>Editando:</b> clique (ou arraste) uma aula e depois a célula de destino. Verde = sem conflito, amarelo = aviso, vermelho = conflito.</span>' : ''}`;
        ui.destaque = new Set();
        pintarAlvos();
    }

    /** Relação de disciplinas e professores com os códigos de horário (sem grade). */
    function renderRelacao() {
        const linhas = N.relacao(D, ui.item).filter((l) => l.aulas > 0 && l.semestre > 0);
        const c = N.conflitos(D);
        const comConflito = new Set();
        D.grade.alocacoes.forEach((a, i) => { if ((c.porAloc[i] || []).some((x) => x.gravidade === 'erro')) comConflito.add(a.disc); });
        let ultimo = '';
        $('#grade-wrap').innerHTML = linhas.length ? `<table class="lista relacao"><thead><tr><th>Curso / sem.</th><th>Código</th><th>Disciplina</th><th>Caráter</th><th>Professor</th><th>Sala</th><th>Horários (código)</th></tr></thead><tbody>
            ${linhas.map((l) => {
                const grupo = `${l.curso}|${l.semestre}`;
                const cab = grupo !== ultimo ? `<tr class="grupo"><td colspan="7"><b>${esc(l.cursoNome)}</b> — ${l.semestre}º semestre <span class="etiqueta ${l.situacao}">${l.situacao}</span></td></tr>` : '';
                ultimo = grupo;
                const falta = l.naGrade < l.aulas ? ` <span class="etiqueta reoferta" title="Aulas que faltam na grade">faltam ${l.aulas - l.naGrade}</span>` : '';
                return `${cab}<tr><td>${esc(N.sigla(l.cursoNome))} ${l.semestre}º</td><td>${esc(l.codigo)}</td><td><b>${esc(l.nome)}</b></td><td>${esc(N.CARATER[l.carater])}</td>
                    <td>${esc(l.professor) || '<span style="color:var(--perigo)">sem professor</span>'}${l.regentes && l.regentes.length ? `<br><small>regentes: ${esc(l.regentes.join(', '))}</small>` : ''}</td><td>${esc(l.salas) || '—'}</td>
                    <td class="codigos">${esc(l.horarios) || '—'}${comConflito.has(l.disc) ? ' <span style="color:var(--perigo)" title="Tem conflito: veja a lista de conflitos">⚠</span>' : ''}${falta}</td></tr>`;
            }).join('')}</tbody></table>` : '<p class="vazio" style="padding:1rem">Nenhuma disciplina neste curso.</p>';
        $('#legenda').innerHTML = '<span><b>Código do horário</b> = dia + turno + período. Dia: dom 1, seg 2, ter 3, qua 4, qui 5, sex 6, sáb 7. Turno: manhã 1, tarde 2, noite 3. Ex.: 611 = sexta, manhã, 1º período; 621 622 623 624 = sexta à tarde, 4 períodos.</span>'
            + (ui.editando ? '<span><b>Para editar, use uma visão em grade</b> (curso, professor ou sala).</span>' : '');
    }

    /** Sala usada no movimento/inserção: a escolhida no painel. */
    function salaAlvo() { return ui.salaSel || null; }

    /** Pinta as células de destino conforme os conflitos que o movimento causaria. */
    function pintarAlvos() {
        const tds = $$('#grade-wrap td[data-d]');
        tds.forEach((td) => { td.classList.remove('alvo-ok', 'alvo-aviso', 'alvo-leve', 'alvo-erro', 'alvo-invalido'); td.removeAttribute('data-alvo'); });
        if (!ui.editando || (!ui.sel && !ui.ins)) return;
        tds.forEach((td) => {
            const d = Number(td.dataset.d), h = Number(td.dataset.h);
            const r = avaliar(d, h);
            if (!r.valido) { td.classList.add('alvo-invalido'); td.title = 'Não cabe aqui (o bloco passaria do fim do turno).'; return; }
            const erro = r.conflitos.some((x) => x.gravidade === 'erro');
            const avisoS = r.conflitos.some((x) => x.gravidade === 'aviso');
            td.classList.add(erro ? 'alvo-erro' : (avisoS ? 'alvo-aviso' : (r.conflitos.length ? 'alvo-leve' : 'alvo-ok')));
            td.title = r.conflitos.length ? 'Se colocar aqui:\n' + r.conflitos.map((x) => `${SIMB[x.gravidade]} ${x.msg}`).join('\n') : 'Sem conflito aqui.';
        });
    }
    function avaliar(d, h) {
        if (ui.sel) return N.avaliarMovimento(D, ui.sel, d, h, salaAlvo());
        const r = N.inserirBloco(D, ui.ins.disc, ui.ins.n, d, h, salaAlvo());
        if (!r) return { valido: false, conflitos: [] };
        const set = new Set(r.indices);
        return { valido: true, conflitos: N.conflitos(r.dados).lista.filter((x) => x.alocs.some((i) => set.has(i))) };
    }

    function selecionar(i) {
        const bloco = N.blocoDe(D, i);
        if (ui.sel && ui.sel.includes(i)) { cancelarSelecao(); return; }
        ui.sel = bloco; ui.ins = null;
        ui.salaSel = D.grade.alocacoes[i].sala;
        $$('#grade-wrap .aula').forEach((el) => el.classList.toggle('selecionada', bloco.includes(Number(el.dataset.i))));
        renderPainelEdicao(); pintarAlvos();
    }
    function cancelarSelecao() { ui.sel = null; ui.ins = null; renderGradePagina(); }

    function soltarEm(d, h) {
        if (!ui.sel && !ui.ins) return;
        let novo, envolvidos;
        if (ui.sel) {
            novo = N.moverBloco(D, ui.sel, d, h, salaAlvo());
            if (!novo) return aviso('Não cabe aqui: o bloco passaria do fim do turno.');
            ui.sel.forEach((j) => { novo.grade.alocacoes[j].travada = true; });
            envolvidos = ui.sel.slice();
        } else {
            const r = N.inserirBloco(D, ui.ins.disc, ui.ins.n, d, h, salaAlvo());
            if (!r) return aviso('Não cabe aqui: o bloco passaria do fim do turno.');
            novo = r.dados; envolvidos = r.indices;
            envolvidos.forEach((j) => { novo.grade.alocacoes[j].travada = true; });
        }
        guardarHistorico();
        D = novo;
        ui.sel = envolvidos; ui.ins = null;
        const c = N.conflitos(D);
        const set = new Set(envolvidos);
        const seus = c.lista.filter((x) => x.alocs.some((i) => set.has(i)));
        ui.novos = seus;
        ui.destaque = new Set(seus.flatMap((x) => x.alocs));
        const onde = N.rotuloHorario(D.config, `${d}|${h}`);
        aviso(seus.length
            ? `Colocado em ${esc(onde)} (🔒 fixada). <b>⚠ ${seus.length} conflito${seus.length > 1 ? 's' : ''}:</b><br><small>${seus.slice(0, 3).map((x) => esc(x.msg)).join('<br>')}${seus.length > 3 ? '<br>…veja a lista de conflitos' : ''}</small>`
            : `Colocado em ${esc(onde)}, sem conflito. 🔒 Fixada: o Aleatorizar não mexe.`, seus.length ? 7000 : 3000);
        mudou();
    }

    function renderPainelEdicao() {
        const el = $('#painel-edicao');
        if (!ui.editando) { el.innerHTML = ''; return; }
        if (!ui.sel && !ui.ins) {
            const p = papelAtual();
            el.innerHTML = `<div class="painel-edicao"><h3>Modo de edição — ${esc(p ? p.rotulo : '')}</h3><p class="muted">${p && p.tipo === 'prof' ? 'Você muda só as suas aulas. ' : 'Você muda as aulas de todos. '}<b>Clique numa célula vazia</b> para colocar uma aula ali (disciplina, aulas seguidas e sala ou laboratório). Ou clique numa aula (ou arraste) para escolhê-la e depois clique na célula para onde ela vai. As células ficam verdes (sem conflito), amarelas (aviso) ou vermelhas (conflito; passe o mouse para ver o motivo). Toda aula colocada ou movida fica 🔒 fixada: o Aleatorizar só sorteia as que não estão fixadas.</p></div>`;
            return;
        }
        const alocs = D.grade.alocacoes;
        let titulo, info, botoes;
        if (ui.sel) {
            const a = alocs[ui.sel[0]];
            const discs = [...new Set(ui.sel.map((i) => alocs[i].disc))].map((id) => D.disciplinas.find((x) => x.id === id));
            const hs = ui.sel.map((i) => alocs[i].h);
            const ini = D.config.horarios[Math.min(...hs)], fim = D.config.horarios[Math.max(...hs)];
            titulo = discs.map((x) => N.nomeDisc(x)).join(' / ');
            info = `${esc(D.config.dias[a.d])} ${esc(ini.ini)}–${esc(fim.fim)} · ${esc(N.nomesProfessores(D, discs[0]))}`;
            const trav = ui.sel.every((i) => alocs[i].travada);
            botoes = `<button type="button" class="btn btn-secondary btn-sm" data-acao="travar">${trav ? '🔓 Soltar (volta a ser sorteada)' : '🔒 Fixar'}</button>
                <button type="button" class="btn btn-perigo btn-sm" data-acao="remover-bloco">Tirar da grade</button>`;
        } else {
            const q = D.disciplinas.find((x) => x.id === ui.ins.disc);
            titulo = `Colocar: ${N.nomeDisc(q)}`;
            const falta = (N.faltando(D).find((x) => x.disc === q.id) || {}).faltam || 0;
            info = `${esc(N.nomesProfessores(D, q))} · aulas seguidas: <input type="number" id="ins-n" min="1" max="${falta}" value="${ui.ins.n}" style="width:70px"> de ${falta} que faltam`;
            botoes = '';
        }
        el.innerHTML = `<div class="painel-edicao"><h3>${esc(titulo)}</h3><p class="muted">${info}</p>
            <div class="barra"><label class="campo" style="min-width:240px"><span>Sala para onde vai</span><select id="sala-alvo">${D.salas.map((s) => `<option value="${esc(s.id)}"${s.id === ui.salaSel ? ' selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></label>
            ${botoes}<button type="button" class="btn btn-secondary btn-sm" data-acao="cancelar-sel">Cancelar seleção</button></div>
            <small class="muted">Clique na célula de destino (início do bloco). Trocar a sala aqui e clicar na mesma célula muda só a sala.</small></div>`;
    }

    function renderConflitos(c) {
        const ul = $('#lista-conflitos');
        $('#conflitos-conta').textContent = `${c.erros} erro${c.erros === 1 ? '' : 's'} · ${c.avisos} aviso${c.avisos === 1 ? '' : 's'} · ${c.leves} leve${c.leves === 1 ? '' : 's'}`;
        const novosTxt = new Set(ui.novos.map((x) => x.msg));
        const ordemG = { erro: 0, aviso: 1, leve: 2 };
        const lista = c.lista.slice().sort((a, b) => (novosTxt.has(b.msg) - novosTxt.has(a.msg)) || ordemG[a.gravidade] - ordemG[b.gravidade]);
        ul.innerHTML = lista.length ? lista.map((x) => `<li class="${x.gravidade}${novosTxt.has(x.msg) ? ' novo' : ''}" data-alocs="${x.alocs.join(',')}" data-tipo="${x.tipo}" title="Clique para ver na grade">${SIMB[x.gravidade]} ${esc(x.msg)}</li>`).join('')
            : `<li class="aviso" style="border-left-color:var(--verde);background:#eef7e3;cursor:default">${D.grade.alocacoes.length ? '✓ Nenhum conflito.' : 'A grade está vazia: clique em Aleatorizar.'}</li>`;
        ui.novos = [];
    }

    function renderFaltam() {
        const falt = N.faltando(D);
        const motivos = {};
        (D.grade.naoAlocadas || []).forEach((x) => { motivos[x.disc] = x.motivo; });
        $('#faltam-conta').textContent = falt.length ? `${falt.reduce((s, x) => s + x.faltam, 0)} aulas` : '';
        $('#lista-faltam').innerHTML = falt.length ? `<table class="lista"><tbody>${falt.map((x) => {
            const q = D.disciplinas.find((y) => y.id === x.disc);
            return `<tr><td><b>${esc(N.nomeDisc(q))}</b><br><small>${esc(N.nomesProfessores(D, q))}${motivos[q.id] ? ' — ' + esc(motivos[q.id]) : ''}</small></td>
                <td>${x.faltam} aula${x.faltam > 1 ? 's' : ''}</td>
                <td class="acoes">${ui.editando && podeEditarDisc(q.id) ? `<button type="button" class="btn btn-secondary btn-sm" data-acao="colocar" data-id="${esc(q.id)}">Colocar</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table>${ui.editando ? '' : '<small class="muted">Entre em ✏️ Editar para colocar à mão (o sistema mostra onde dá conflito).</small>'}`
            : '<p class="vazio">Todas as aulas cadastradas estão na grade.</p>';
    }

    function verConflito(li) {
        const idx = li.dataset.alocs ? li.dataset.alocs.split(',').filter(Boolean).map(Number) : [];
        if (!idx.length) return;
        const a = D.grade.alocacoes[idx[0]], q = D.disciplinas.find((x) => x.id === a.disc);
        const tipo = li.dataset.tipo;
        const profMsg = D.professores.find((p) => li.textContent.includes(p.nome));
        if (['prof', 'prof-indisp', 'pesquisa-prof', 'externo-prof'].includes(tipo) && (profMsg || q.professor)) { ui.visao = 'professor'; ui.item = (profMsg || {}).id || q.professor; }
        else if (['sala-dupla', 'sala-indisp', 'lab-permissao', 'sala-pref'].includes(tipo) && a.sala) { ui.visao = 'sala'; ui.item = a.sala; }
        else if (q.ofertas.length) {
            let o = q.ofertas[0];
            if (tipo === 'turma' && idx[1] !== undefined) {
                const q2 = D.disciplinas.find((x) => x.id === D.grade.alocacoes[idx[1]].disc);
                o = q.ofertas.find((x) => q2.ofertas.some((y) => y.curso === x.curso && Number(y.semestre) === Number(x.semestre))) || o;
            }
            ui.visao = 'curso'; ui.item = o.curso; ui.semestre = Number(o.semestre);
        } else if (q.professor) { ui.visao = 'professor'; ui.item = q.professor; }
        ui.destaque = new Set(idx);
        renderGradePagina();
        $('#grade-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function aleatorizar() {
        if (!D.disciplinas.length) return aviso('Cadastre as disciplinas primeiro.');
        if (!podeCurso()) { aviso('Só o curso (coordenação) aleatoriza a grade. Professores colocam e fixam os próprios horários em ✏️ Editar.', 6000); if (!papelAtual()) pedirLogin('Entre como curso para aleatorizar.'); return; }
        const btn = $('[data-acao=aleatorizar]');
        btn.disabled = true; btn.textContent = '⏳ Gerando…';
        setTimeout(() => {
            const r = N.gerar(D, { tentativas: 150 });
            guardarHistorico();
            D.grade = { alocacoes: r.alocacoes, naoAlocadas: r.naoAlocadas, geradaEm: new Date().toISOString() };
            ui.sel = null; ui.ins = null;
            btn.disabled = false; btn.textContent = '🎲 Aleatorizar';
            const sem = r.naoAlocadas.reduce((s, x) => s + x.aulas, 0);
            const c = N.conflitos(D);
            const fixas = D.grade.alocacoes.filter((a) => a.travada).length;
            aviso((fixas ? `${fixas} aula(s) fixada(s) mantida(s); só as outras foram sorteadas. ` : '') + (sem ? `Grade gerada. <b>${sem} aula(s) sem lugar</b>: veja a lista abaixo da grade e o motivo.` : `Grade gerada: todas as aulas no lugar${c.erros ? `, mas com ${c.erros} conflito(s) das aulas fixadas` : ', sem conflito'}.`), 6000);
            mudou();
        }, 30);
    }



    // ================================================================ calendário acadêmico
    function renderCalendario() {
        const cal = D.config.calendario || {};
        $('#cal-url').value = cal.url || '';
        $('#cal-abrir').href = cal.url || '#';
        const s1 = (cal.semestres || {})[1] || {}, s2 = (cal.semestres || {})[2] || {};
        $('#cal-s1-ini').value = s1.inicio || ''; $('#cal-s1-fim').value = s1.fim || '';
        $('#cal-s2-ini').value = s2.inicio || ''; $('#cal-s2-fim').value = s2.fim || '';
        const a = N.analisarCalendario(D);
        $('#cal-resumo').textContent = `${cal.origem === 'embutido' ? 'dados embutidos' : 'lido do link'} em ${cal.obtidoEm ? N.dataBR(cal.obtidoEm) : '?'} · ${(cal.eventos || []).length} datas`
            + (Number(cal.ano) !== Number(D.config.ano) ? ` · ATENÇÃO: calendário de ${cal.ano}, grade de ${D.config.ano}` : '');
        $('#cal-eventos').innerHTML = (cal.eventos || []).length ? `<table class="lista"><thead><tr><th>Data</th><th>Dia</th><th>Tipo</th><th>Descrição</th><th>No semestre ${D.config.ano}/${D.config.metade}?</th></tr></thead><tbody>
            ${(a ? a.eventos : cal.eventos).map((e) => `<tr><td>${N.dataBR(e.data)}</td><td>${esc(e.diaSemana || '')}</td><td><span class="etiqueta ${e.tipo === 'evento' ? '' : 'reoferta'}">${esc(N.NOME_TIPO_CAL[e.tipo] || e.tipo)}</span></td>
                <td>${esc(e.descricao)}${e.ateHora ? ` <small>(até ${esc(e.ateHora)})</small>` : ''}</td>
                <td>${e.foraDoPeriodo ? '<small>fora do período letivo</small>' : (e.temAula ? (e.suspende ? '<b style="color:var(--perigo)">sim, sem aula</b>' : 'sim, há aula') : '<small>dia sem aula na grade</small>')}</td></tr>`).join('')}</tbody></table>`
            : '<p class="vazio">Nenhuma data carregada.</p>';
    }
    function aplicarCalendario(cal, origem) {
        if (!cal.eventos.length && !Object.keys(cal.semestres).length) return aviso('Não achei datas no texto. Confira se copiou a página do calendário inteira.');
        guardarHistorico();
        const velho = D.config.calendario || {};
        cal.url = $('#cal-url').value.trim() || velho.url;
        cal.origem = origem;
        [1, 2].forEach((k) => { if (!cal.semestres[k] && velho.semestres && velho.semestres[k] && Number(velho.ano) === Number(cal.ano)) cal.semestres[k] = velho.semestres[k]; });
        D.config.calendario = cal;
        mudou();
        aviso(`Calendário ${cal.ano}: ${cal.eventos.length} datas (feriados, recessos, pontos) e ${Object.keys(cal.semestres).length} semestre(s) com início e fim.`, 6000);
    }
    async function buscarCalendario() {
        const url = $('#cal-url').value.trim();
        if (!/^https?:\/\//.test(url)) return aviso('Informe o link do calendário acadêmico vigente.');
        D.config.calendario.url = url; salvarLocal();
        try {
            const r = await fetch(url, { mode: 'cors' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const html = await r.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            aplicarCalendario(N.lerCalendarioTexto(doc.body ? doc.body.innerText || doc.body.textContent : html, D.config.ano, url), 'link');
        } catch (e) {
            $('#cal-colar').open = true;
            aviso('O site da UFPel não deixa outra página ler o calendário direto (bloqueio do navegador). Abra o link, copie a página e cole no campo que abriu.', 8000);
        }
    }


    // ================================================================ relatórios internos (só administrador)
    // Atenção: o login é só uma porta na interface (o app roda inteiro no navegador); não protege os dados do arquivo.
    const ADM = { usuario: 'admin', senha: 'admin' };
    const ehAdmin = () => { try { return sessionStorage.getItem('gh_admin') === '1'; } catch (e) { return !!ui.admin; } };
    function entrarAdmin(u, s) {
        if (u !== ADM.usuario || s !== ADM.senha) return false;
        ui.admin = true; try { sessionStorage.setItem('gh_admin', '1'); } catch (e) { /* ok */ }
        return true;
    }
    function sairAdmin() { ui.admin = false; try { sessionStorage.removeItem('gh_admin'); } catch (e) { /* ok */ } renderRelatorios(); }
    function htmlVerificacao() {
        const v = Planos.verificacao(D);
        const nomes = { sala: 'Sala de aula', lab: 'Laboratório', aula: 'Aula (total)', preparo: 'Preparo de aula', pesquisa: 'Pesquisa', total: 'Total', disciplinas: 'Cadeiras' };
        const tab = (b) => `<div class="tabela-wrap"><table class="lista"><thead><tr><th>Horas/semana por professor</th><th>n</th><th>Média</th><th>Desvio padrão</th><th>Mínimo</th><th>Máximo</th></tr></thead><tbody>
            ${Object.entries(nomes).map(([k, rot]) => { const e = b.estat[k]; return `<tr><td><b>${rot}</b></td><td>${e.n}</td><td>${e.media}</td><td>${e.desvio}</td><td>${e.min}</td><td>${e.max}</td></tr>`; }).join('')}</tbody></table></div>`;
        return `<div class="card"><div class="card-topo"><h2>Verificação interna — médias e desvios padrões</h2>
            <button type="button" class="btn btn-primary btn-sm" data-acao="verificacao-pdf">📄 Documento de verificação (PDF)</button></div>
            <div class="campos" style="max-width:520px"><label class="campo"><span>Horas de preparo por hora de aula</span><input type="number" step="0.1" min="0" id="fator-preparo" value="${v.fatorPreparo}">
            <small>Estimativa usada para "preparo de aula" (aqui e na área do professor).</small></label></div>
            <div class="duas-colunas"><div><h3>Curso (${esc(D.cursos[0] ? D.cursos[0].nome : '')})</h3>${tab(v.curso)}</div><div><h3>Unidade (este curso + ${(D.externos || []).length} outro(s))</h3>${tab(v.unidade)}</div></div></div>`;
    }
    const barra = (pct, cor) => `<span class="barra-uso"><i style="width:${Math.min(100, pct)}%;background:${cor}"></i></span>`;
    function renderRelatorios() {
        const el = $('#relatorios-conteudo');
        if (!ehAdmin()) {
            el.innerHTML = `<form class="card" id="form-admin" autocomplete="on" style="max-width:420px">
                <h2>🔒 Acesso do administrador</h2><p class="muted">Relatórios internos: carga horária dos professores, uso das salas e laboratórios e horários de pesquisa.</p>
                <div class="campos"><label class="campo"><span>Usuário</span><input type="text" name="usuario" autocomplete="username"></label>
                <label class="campo"><span>Senha</span><input type="password" name="senha" autocomplete="current-password"></label></div>
                <p class="muted" id="adm-erro" style="color:var(--perigo)"></p>
                <button type="submit" class="btn btn-primary">Entrar</button></form>`;
            $('#form-admin').addEventListener('submit', (e) => {
                e.preventDefault();
                if (entrarAdmin($('#form-admin [name=usuario]').value.trim(), $('#form-admin [name=senha]').value)) renderRelatorios();
                else $('#adm-erro').textContent = 'Usuário ou senha não conferem.';
            });
            return;
        }
        const r = N.relatorios(D);
        const maxP = Math.max(1, ...r.professores.map((p) => p.total));
        el.innerHTML = `<div class="card"><div class="card-topo"><h2>Relatórios internos</h2>
            <div class="barra" style="margin:0"><button type="button" class="btn btn-primary btn-sm" data-acao="pdf-relatorios">📄 PDF dos relatórios</button>
            <button type="button" class="btn btn-secondary btn-sm" data-acao="sair-admin">Sair</button></div></div>
            <p class="muted">${esc(D.cursos[0] ? D.cursos[0].nome : '')} · ${D.config.ano}/${D.config.metade} · semana com ${r.horasSemana} h de aula possíveis por sala (${D.config.dias.length} dias × ${D.config.horarios.length} períodos).
            Professores: carga nesta grade + horários ocupados nos outros cursos da mesma unidade carregados. Aulas = períodos.</p></div>
            ${htmlVerificacao()}
            <div class="card"><h2>Professores — quem trabalha mais</h2><div class="tabela-wrap"><table class="lista"><thead><tr><th>#</th><th>Professor</th><th>Aulas aqui</th><th>Horas aqui</th><th>Horas em outros cursos</th><th>Total (h/sem.)</th><th></th><th>Pesquisa (h/sem.)</th><th>Disciplinas</th><th>Dias / turnos</th><th>Responsável por</th></tr></thead><tbody>
            ${r.professores.map((p, i) => `<tr><td>${i + 1}</td><td><b>${esc(p.nome)}</b></td><td>${p.aulas}</td><td>${p.horas}</td><td>${p.outrosCursosHoras || '—'}</td><td><b>${p.total}</b></td>
                <td style="min-width:110px">${barra(100 * p.total / maxP, 'var(--verde)')}</td><td>${p.pesquisaHoras ? `<span class="etiqueta pesq">${p.pesquisaHoras}</span>` : '—'}</td>
                <td><small>${esc(p.disciplinas.join(', ')) || '—'}</small></td><td><small>${esc(p.dias.join(', '))}${p.turnos.length ? ' · ' + esc(p.turnos.join('/')) : ''}</small></td>
                <td><small>${esc(p.responsavelPor.join(', ')) || '—'}</small></td></tr>`).join('')}</tbody></table></div></div>
            <div class="card"><h2>Salas e laboratórios — os mais usados para ensino</h2><div class="tabela-wrap"><table class="lista"><thead><tr><th>#</th><th>Sala ou laboratório</th><th>Tipo</th><th>Ensino aqui (h)</th><th>Ensino outros cursos (h)</th><th>Uso p/ ensino</th><th></th><th>Pesquisa (h)</th><th>Indisponível (h)</th><th>Livre (h)</th><th>Responsáveis</th></tr></thead><tbody>
            ${r.salas.map((s, i) => `<tr><td>${i + 1}</td><td><b>${esc(s.nome)}</b></td><td>${s.tipo === 'laboratorio' ? '<span class="etiqueta lab">laboratório</span>' : 'sala'}</td>
                <td>${s.ensinoHoras}</td><td>${s.outrosCursosHoras || '—'}</td><td><b>${String(s.pctEnsino).replace('.', ',')}%</b></td>
                <td style="min-width:130px"><span class="barra-uso"><i style="width:${s.pctEnsino}%;background:var(--verde)"></i><i style="width:${s.pctPesquisa}%;background:#9b7bd8"></i></span></td>
                <td>${s.pesquisaHoras ? `<span class="etiqueta pesq">${s.pesquisaHoras}</span>` : '—'}</td><td>${s.indispHoras || '—'}</td><td>${s.livreHoras}</td><td><small>${esc(s.responsaveis.join(', ')) || '—'}</small></td></tr>`).join('')}</tbody></table></div>
            <div class="legenda"><span><i style="background:var(--verde)"></i>ensino</span><span><i style="background:#9b7bd8"></i>pesquisa</span></div></div>
            <div class="card"><h2>Quando está reservado para pesquisa</h2>${(() => {
                const linhas = [...D.salas.map((s) => ({ quem: s.nome, tipo: 'Sala/lab.', l: s.pesquisa || [] })), ...D.professores.map((p) => ({ quem: p.nome, tipo: 'Professor', l: p.pesquisa || [] }))].filter((x) => x.l.length);
                return linhas.length ? `<table class="lista"><thead><tr><th>Quem</th><th></th><th>Horários (código)</th></tr></thead><tbody>${linhas.map((x) => `<tr><td><b>${esc(x.quem)}</b></td><td>${x.tipo}</td>
                    <td class="codigos" style="white-space:normal">${x.l.map((k) => { const [d, h] = N.separa(k); return D.config.horarios[h] && d < D.config.dias.length ? N.codigoHorario(D.config, d, h) : null; }).filter(Boolean).sort().join(' ')}</td></tr>`).join('')}</tbody></table>`
                    : '<p class="vazio">Nenhum horário reservado para pesquisa. Marque em Salas e laboratórios ou em Professores (campo “Horários reservados para pesquisa”).</p>';
            })()}</div>`;
    }



    // ================================================================ papéis: curso (coordenação), professor, administrador
    // A senha do curso é criada no primeiro acesso e fica (só o resumo/hash) nos dados do curso.
    // Atenção: como tudo roda no navegador, os papéis organizam o uso; não são uma proteção forte dos arquivos.
    const ehCurso = () => { try { return !!D.cursos[0] && sessionStorage.getItem('gh_curso') === N.normNome(D.cursos[0].nome); } catch (e) { return !!ui.curso; } };
    const podeCurso = () => ehAdmin() || ehCurso();
    const profIdLogado = () => { const ind = profLogado(); if (!ind) return null; const p = D.professores.find((x) => N.normNome(x.nome) === N.normNome(ind.nome)); return p ? p.id : null; };
    function papelAtual() {
        if (ehAdmin()) return { tipo: 'admin', rotulo: 'Administrador' };
        if (ehCurso()) return { tipo: 'curso', rotulo: `Curso: ${N.sigla(D.cursos[0].nome)}` };
        const ind = profLogado(); if (ind) return { tipo: 'prof', rotulo: ind.nome.split(' ')[0] };
        return null;
    }
    /** O papel atual pode mexer nesta aula? Curso e administrador: todas; professor: só as dele. */
    function podeEditarAloc(i) {
        if (podeCurso()) return true;
        const a = D.grade.alocacoes[i], q = a && D.disciplinas.find((x) => x.id === a.disc);
        const pid = profIdLogado();
        return !!(pid && q && N.professoresDe(q).includes(pid));
    }
    function podeEditarDisc(discId) {
        if (podeCurso()) return true;
        const q = D.disciplinas.find((x) => x.id === discId), pid = profIdLogado();
        return !!(pid && q && N.professoresDe(q).includes(pid));
    }
    function sairPapel() {
        try { sessionStorage.removeItem('gh_curso'); sessionStorage.removeItem('gh_prof'); sessionStorage.removeItem('gh_admin'); } catch (e) { /* ok */ }
        ui.curso = false; ui.prof = null; ui.admin = false; ui.editando = false; ui.sel = null; ui.ins = null;
        renderTudo(); aviso('Você saiu.');
    }
    /** Janela de entrada: curso (coordenação), professor ou administrador. */
    function pedirLogin(msg) {
        const curso = D.cursos[0];
        const temSenhaCurso = !!(D.config.acessoCurso && D.config.acessoCurso.hash);
        const nomes = D.professores.map((p) => p.nome).sort((a, b) => a.localeCompare(b));
        abrirJanela('Entrar', `${msg ? `<p class="muted">${esc(msg)}</p>` : ''}
            <div class="checks" style="flex-direction:column;margin-bottom:.6rem">
                <label><input type="radio" name="papel" value="curso" checked> <b>Curso</b> (coordenação: coloca e muda os horários de todos)${curso ? ` — ${esc(curso.nome)}` : ''}</label>
                <label><input type="radio" name="papel" value="prof"> <b>Professor</b> (coloca e muda só os seus horários e laboratórios)</label>
                <label><input type="radio" name="papel" value="admin"> <b>Administrador</b></label></div>
            <div data-p="curso">${!curso ? '<p class="vazio">Escolha o curso da grade primeiro (página Curso).</p>' : temSenhaCurso
                ? '<div class="campos"><label class="campo"><span>Senha do curso</span><input type="password" name="sc" autocomplete="current-password"></label></div>'
                : '<p class="muted"><b>Primeiro acesso do curso:</b> crie a senha da coordenação (ela vai, só como resumo, junto com os dados do curso).</p><div class="campos"><label class="campo"><span>Nova senha</span><input type="password" name="sc" autocomplete="new-password"></label><label class="campo"><span>Repita</span><input type="password" name="sc2" autocomplete="new-password"></label></div>'}</div>
            <div data-p="prof" hidden><div class="campos"><label class="campo"><span>Seu nome</span><select name="pn">${nomes.map((n) => `<option>${esc(n)}</option>`).join('')}</select></label></div><div data-senhas-prof></div></div>
            <div data-p="admin" hidden><div class="campos"><label class="campo"><span>Usuário</span><input type="text" name="au" autocomplete="username"></label><label class="campo"><span>Senha</span><input type="password" name="as" autocomplete="current-password"></label></div></div>
            <p class="muted" data-erro style="color:var(--perigo)"></p>`,
        (dlg) => {
            const papel = $('[name=papel]:checked', dlg).value, erro = (t) => { $('[data-erro]', dlg).textContent = t; };
            (async () => {
                if (papel === 'curso') {
                    if (!curso) return erro('Escolha o curso primeiro.');
                    const s1 = val(dlg, 'sc');
                    if (!temSenhaCurso) {
                        if (s1.length < 4 || s1 !== val(dlg, 'sc2')) return erro('A senha precisa ter 4+ caracteres e as duas precisam conferir.');
                        const sal = Math.random().toString(36).slice(2);
                        D.config.acessoCurso = { sal, hash: await Planos.hashSenha(s1, sal) }; salvarLocal();
                    } else if (await Planos.hashSenha(s1, D.config.acessoCurso.sal) !== D.config.acessoCurso.hash) return erro('Senha do curso não confere.');
                    ui.curso = true; try { sessionStorage.setItem('gh_curso', N.normNome(curso.nome)); } catch (e) { /* ok */ }
                } else if (papel === 'prof') {
                    const nome = val(dlg, 'pn'), s1 = val(dlg, 'ps');
                    let ind = carregarInd(nome);
                    if (!ind || !ind.senhaHash) {
                        if (s1.length < 4 || s1 !== val(dlg, 'ps2')) return erro('A senha precisa ter 4+ caracteres e as duas precisam conferir.');
                        ind = ind || Planos.individualVazio(nome); ind.senhaHash = await Planos.hashSenha(s1, ind.sal);
                    } else if (await Planos.hashSenha(s1, ind.sal) !== ind.senhaHash) return erro('Senha não confere.');
                    Planos.registrarSemestre(ind, D); salvarInd(ind); entrarComo(nome);
                } else {
                    if (!entrarAdmin(val(dlg, 'au'), val(dlg, 'as'))) return erro('Usuário ou senha não conferem.');
                }
                $('#janela').close(); renderTudo();
                const p = papelAtual(); aviso(`Entrou como ${esc(p ? p.rotulo : '')}.${ui.pagina === 'grade' ? ' Clique em ✏️ Editar e depois numa célula ou numa aula.' : ''}`, 5000);
            })();
            return false; // a janela fecha quando a senha confere
        }, (dlg) => {
            const troca = () => { const v = $('[name=papel]:checked', dlg).value; $$('[data-p]', dlg).forEach((x) => { x.hidden = x.dataset.p !== v; }); };
            const senhasProf = () => {
                const nome = val(dlg, 'pn'), ind = nome && carregarInd(nome);
                $('[data-senhas-prof]', dlg).innerHTML = ind && ind.senhaHash ? '<div class="campos"><label class="campo"><span>Senha</span><input type="password" name="ps" autocomplete="current-password"></label></div>'
                    : '<p class="muted"><b>Primeiro acesso neste navegador:</b> crie sua senha.</p><div class="campos"><label class="campo"><span>Nova senha</span><input type="password" name="ps" autocomplete="new-password"></label><label class="campo"><span>Repita</span><input type="password" name="ps2" autocomplete="new-password"></label></div>';
            };
            $$('[name=papel]', dlg).forEach((r) => r.addEventListener('change', troca));
            if ($('[name=pn]', dlg)) { $('[name=pn]', dlg).addEventListener('change', senhasProf); senhasProf(); }
            if (!curso) { $('[name=papel][value=prof]', dlg).checked = true; troca(); }
            return {};
        }, 'Entrar');
    }
    function renderPapel() {
        const b = $('#topbar-entrar'); if (!b) return;
        const p = papelAtual();
        b.innerHTML = p ? `👤<span class="rot"> ${esc(p.rotulo)} · sair</span>` : '🔑<span class="rot"> Entrar</span>';
        b.dataset.acao = p ? 'sair-papel' : 'entrar';
        b.title = p ? 'Sair' : 'Entrar como curso (coordenação), professor ou administrador';
    }

    /** Clique numa célula vazia (editando): colocar uma aula aqui (disciplina, aulas seguidas, sala/laboratório). */
    function colocarAqui(d, h) {
        const cfg = D.config;
        const permitidas = D.disciplinas.filter((q) => q.aulas > 0 && q.ofertas.some((o) => o.semestre > 0) && podeEditarDisc(q.id));
        if (!permitidas.length) return aviso(podeCurso() ? 'Não há disciplinas com aula para colocar.' : 'Você não tem disciplinas com aula nesta grade.');
        const falta = (id) => (N.faltando(D).find((x) => x.disc === id) || {}).faltam || 0;
        // na visão de curso/semestre, primeiro as disciplinas daquele semestre; na do professor, as dele; na da sala, quem pode usá-la
        const daVisao = (q) => (ui.visao === 'curso' ? q.ofertas.some((o) => o.curso === ui.item && Number(o.semestre) === Number(ui.semestre)) : ui.visao === 'professor' ? N.professoresDe(q).includes(ui.item) : true);
        const ordem = permitidas.slice().sort((a, b) => (daVisao(b) - daVisao(a)) || (falta(b.id) > 0) - (falta(a.id) > 0) || N.nomeDisc(a).localeCompare(N.nomeDisc(b)));
        const onde = `${cfg.dias[d]} ${cfg.horarios[h].ini} (código ${N.codigoHorario(cfg, d, h)})`;
        abrirJanela(`Colocar aula — ${onde}`, `
            <div class="campos"><label class="campo" style="grid-column:1/-1"><span>Disciplina</span><select name="disc">${ordem.map((q) => `<option value="${esc(q.id)}">${esc(N.nomeDisc(q))} — ${esc(N.nomesProfessores(D, q) || 'sem professor')}${falta(q.id) ? ` (faltam ${falta(q.id)})` : ' (já toda na grade)'}</option>`).join('')}</select></label>
            <label class="campo"><span>Aulas seguidas a partir daqui</span><input type="number" name="n" min="1" max="8" value="2"></label>
            <label class="campo"><span>Sala ou laboratório</span><select name="sala"></select></label></div>
            <div data-mover></div>
            <div data-previa class="muted"></div>`,
        (dlg) => {
            const id = val(dlg, 'disc'), n = Math.max(1, Number(val(dlg, 'n')) || 1), sala = val(dlg, 'sala');
            const mover = $('[name=mover]', dlg) && $('[name=mover]', dlg).value;
            ui.salaSel = sala;
            if (mover) { ui.sel = mover.split(',').map(Number); ui.ins = null; } else { ui.ins = { disc: id, n }; ui.sel = null; }
            soltarEm(d, h);
            return true;
        }, (dlg) => {
            const atualiza = () => {
                const id = val(dlg, 'disc'), q = D.disciplinas.find((x) => x.id === id);
                const salas = D.salas.filter((s) => N.professoresDe(q).every((p) => N.profPodeNaSala(s, p)));
                const pref = N.salasPermitidas(D, q);
                const selSala = $('[name=sala]', dlg), antes = selSala.value;
                selSala.innerHTML = salas.sort((a, b) => pref.includes(b.id) - pref.includes(a.id)).map((s) => `<option value="${esc(s.id)}">${esc(s.nome)}${s.tipo === 'laboratorio' ? ' (lab.)' : ''}${pref.includes(s.id) ? '' : ' — fora da lista da disciplina'}</option>`).join('');
                const f = falta(id);
                if (salas.some((s) => s.id === antes) && selSala.dataset.mexido) selSala.value = antes;
                else { // sugere a primeira sala/laboratório (da lista da disciplina) sem conflito neste horário
                    const n0 = Math.max(1, Number($('[name=n]', dlg).value) || 1);
                    const livre = [...selSala.options].map((o) => o.value).find((sid) => {
                        if (!f) return false;
                        const x = N.inserirBloco(D, id, n0, d, h, sid); if (!x) return false;
                        const set = new Set(x.indices); return !N.conflitos(x.dados).lista.some((c) => c.gravidade === 'erro' && c.alocs.some((i) => set.has(i)));
                    });
                    if (livre) selSala.value = livre;
                }
                const bl = N.blocos(q, D.config.divisaoPadrao).filter((b) => b <= Math.max(f, 1));
                const nEl = $('[name=n]', dlg);
                if (!nEl.dataset.mexido) nEl.value = f ? (bl.length ? Math.max(...bl) : f) : 2;
                // já toda na grade: escolher um bloco para mover para cá
                const blocos = [];
                if (!f) D.grade.alocacoes.forEach((a, i) => { if (a.disc === id && !blocos.some((b) => b.includes(i))) blocos.push(N.blocoDe(D, i)); });
                $('[data-mover]', dlg).innerHTML = !f ? `<label class="campo"><span>Esta disciplina já está toda na grade. Mover qual bloco para cá?</span><select name="mover">${blocos.map((b) => {
                    const a0 = D.grade.alocacoes[b[0]], hs = b.map((i) => D.grade.alocacoes[i].h);
                    return `<option value="${b.join(',')}">${esc(cfg.dias[a0.d])} ${esc(cfg.horarios[Math.min(...hs)].ini)}–${esc(cfg.horarios[Math.max(...hs)].fim)}, ${esc(N.nomeDe(D.salas, a0.sala))}</option>`; }).join('')}</select></label>` : '';
                $('[name=n]', dlg).closest('.campo').hidden = !f;
                previa();
            };
            const previa = () => {
                const id = val(dlg, 'disc'), n = Math.max(1, Number(val(dlg, 'n')) || 1), sala = val(dlg, 'sala');
                const mover = $('[name=mover]', dlg) && $('[name=mover]', dlg).value;
                const r = mover ? N.avaliarMovimento(D, mover.split(',').map(Number), d, h, sala) : (() => { const x = N.inserirBloco(D, id, n, d, h, sala); if (!x) return { valido: false, conflitos: [] }; const set = new Set(x.indices); return { valido: true, conflitos: N.conflitos(x.dados).lista.filter((c) => c.alocs.some((i) => set.has(i))) }; })();
                $('[data-previa]', dlg).innerHTML = !r.valido ? '<p style="color:var(--perigo)">Não cabe aqui: o bloco passaria do fim do turno.</p>'
                    : r.conflitos.length ? `<p><b style="color:${r.conflitos.some((c) => c.gravidade === 'erro') ? 'var(--perigo)' : '#7a5a00'}">${r.conflitos.some((c) => c.gravidade === 'erro') ? '⚠' : '•'} ${r.conflitos.length} conflito(s)/aviso(s) se colocar aqui:</b></p><ul>${r.conflitos.map((c) => `<li>${({ erro: '<b>erro</b>', aviso: 'aviso', leve: 'aviso leve' })[c.gravidade]}: ${esc(c.msg)}</li>`).join('')}</ul><small>Dá para colocar mesmo assim; os conflitos ficam marcados na grade.</small>`
                        : '<p style="color:#3d6b12"><b>✓ Sem conflito aqui.</b> A aula fica fixada (o Aleatorizar não mexe).</p>';
            };
            $('[name=disc]', dlg).addEventListener('change', () => { delete $('[name=n]', dlg).dataset.mexido; atualiza(); });
            $('[name=n]', dlg).addEventListener('input', () => { $('[name=n]', dlg).dataset.mexido = '1'; previa(); });
            $('[name=sala]', dlg).addEventListener('change', () => { $('[name=sala]', dlg).dataset.mexido = '1'; previa(); });
            dlg.addEventListener('change', (e) => { if (e.target.name === 'mover') previa(); });
            // sala inicial: na visão de sala, a sala da visão
            atualiza();
            if (ui.visao === 'sala' && [...$('[name=sala]', dlg).options].some((o) => o.value === ui.item)) { $('[name=sala]', dlg).value = ui.item; previa(); }
            return {};
        }, 'Colocar e fixar');
    }

    // ================================================================ área do professor (dados individuais: só neste navegador e por download)
    const CHAVE_IND = (nome) => 'gh_ind_' + N.normNome(nome).replace(/\s+/g, '_');
    function carregarInd(nome) { try { const t = localStorage.getItem(CHAVE_IND(nome)); if (t) return Object.assign(Planos.individualVazio(nome), JSON.parse(t)); } catch (e) { /* ok */ } return null; }
    function salvarInd(ind) { ind.atualizadoEm = new Date().toISOString(); try { localStorage.setItem(CHAVE_IND(ind.nome), JSON.stringify(ind)); } catch (e) { aviso('Não consegui guardar neste navegador (armazenamento cheio ou bloqueado). Baixe seus dados.'); } }
    const profLogado = () => { try { const n = sessionStorage.getItem('gh_prof'); return n ? carregarInd(n) : null; } catch (e) { return ui.prof ? carregarInd(ui.prof) : null; } };
    function sairProfessor() { ui.prof = null; try { sessionStorage.removeItem('gh_prof'); } catch (e) { /* ok */ } renderProfessor(); }
    function entrarComo(nome) { ui.prof = nome; try { sessionStorage.setItem('gh_prof', nome); } catch (e) { /* ok */ } }
    let abaProf = 'rendimento';

    function renderProfessor() {
        const el = $('#professor-conteudo');
        const ind = profLogado();
        if (!ind) {
            const nomes = D.professores.map((p) => p.nome).sort((a, b) => a.localeCompare(b));
            el.innerHTML = `<form class="card" id="form-prof" autocomplete="on" style="max-width:520px"><h2>👤 Área do professor</h2>
                <p class="muted">Veja seu rendimento, prepare os planos de ensino (pré-preenchidos, com o cronograma do calendário vigente) e o RAAD do ano.
                Seus dados ficam só neste navegador e no arquivo que você baixar — nunca vão para o MEGA.</p>
                <div class="campos"><label class="campo"><span>Seu nome</span><select name="nome" autocomplete="username">${nomes.map((n) => `<option>${esc(n)}</option>`).join('')}</select></label></div>
                <div id="prof-senhas"></div><p class="muted" id="prof-erro" style="color:var(--perigo)"></p>
                <div class="barra"><button type="submit" class="btn btn-primary">Entrar</button>
                <button type="button" class="btn btn-secondary btn-sm" data-acao="ind-importar">⬆ Trazer meus dados (JSON)</button></div></form>`;
            const pinta = () => {
                const nome = $('#form-prof [name=nome]').value, ind0 = nome && carregarInd(nome);
                $('#prof-senhas').innerHTML = ind0 && ind0.senhaHash ? `<div class="campos"><label class="campo"><span>Senha</span><input type="password" name="senha" autocomplete="current-password"></label></div>`
                    : `<p class="muted"><b>Primeiro acesso neste navegador:</b> crie sua senha.</p><div class="campos"><label class="campo"><span>Nova senha</span><input type="password" name="senha" autocomplete="new-password"></label>
                       <label class="campo"><span>Repita a senha</span><input type="password" name="senha2" autocomplete="new-password"></label></div>`;
            };
            if (!nomes.length) { el.innerHTML = '<div class="card"><p class="vazio">Cadastre os professores primeiro.</p></div>'; return; }
            pinta();
            $('#form-prof [name=nome]').addEventListener('change', pinta);
            $('#form-prof').addEventListener('submit', async (e) => {
                e.preventDefault();
                const nome = $('#form-prof [name=nome]').value, senha = $('#form-prof [name=senha]').value;
                let ind1 = carregarInd(nome);
                if (!ind1 || !ind1.senhaHash) {
                    const s2 = ($('#form-prof [name=senha2]') || {}).value;
                    if (!senha || senha.length < 4) { $('#prof-erro').textContent = 'A senha precisa ter pelo menos 4 caracteres.'; return; }
                    if (senha !== s2) { $('#prof-erro').textContent = 'As senhas não conferem.'; return; }
                    ind1 = ind1 || Planos.individualVazio(nome);
                    ind1.senhaHash = await Planos.hashSenha(senha, ind1.sal);
                } else if (await Planos.hashSenha(senha, ind1.sal) !== ind1.senhaHash) { $('#prof-erro').textContent = 'Senha não confere.'; return; }
                Planos.registrarSemestre(ind1, D); salvarInd(ind1); entrarComo(nome); renderProfessor();
            });
            return;
        }
        const abas = [['rendimento', '📊 Rendimento'], ['planos', '📝 Planos de ensino'], ['ausencias', '📅 Ausências'], ['raad', '📄 RAAD'], ['dados', '💾 Meus dados']];
        let corpo = '';
        if (abaProf === 'rendimento') corpo = htmlRendimento(ind);
        if (abaProf === 'planos') corpo = htmlPlanos(ind);
        if (abaProf === 'raad') corpo = htmlRaad(ind);
        if (abaProf === 'ausencias') corpo = htmlAusencias(ind);
        if (abaProf === 'dados') corpo = htmlDados(ind);
        el.innerHTML = `<div class="card"><div class="card-topo"><h2>👤 ${esc(ind.nome)}</h2><button type="button" class="btn btn-secondary btn-sm" data-acao="prof-sair">Sair</button></div>
            <div class="abas">${abas.map(([k, t]) => `<button type="button" data-aba-prof="${k}" class="${abaProf === k ? 'ativo' : ''}">${t}</button>`).join('')}</div></div>${corpo}`;
    }
    function htmlRendimento(ind) {
        const r = Planos.rendimento(D, ind.nome);
        const linha = (rot, campo, un) => {
            const eu = (r.curso.eu || {})[campo] || 0, ue = (r.unidade.eu || {})[campo] || 0;
            const mc = r.curso.estat[campo] || {}, mu = r.unidade.estat[campo] || {};
            const mx = Math.max(eu, ue, mc.max || 0, mu.max || 0, 0.01);
            const b = (v, cor) => `<span class="barra-uso" title="${v}"><i style="width:${100 * v / mx}%;background:${cor}"></i></span>`;
            return `<tr><td><b>${rot}</b></td><td>${eu}${un}</td><td>${mc.media || 0}${un} <small>± ${mc.desvio || 0}</small></td><td>${ue}${un}</td><td>${mu.media || 0}${un} <small>± ${mu.desvio || 0}</small></td>
                <td style="min-width:140px">${b(eu, 'var(--teal)')}${b(mc.media || 0, 'var(--verde)')}${b(mu.media || 0, 'var(--limao)')}</td></tr>`;
        };
        return `<div class="card"><h2>Seu rendimento em ${D.config.ano}/${D.config.metade}</h2>
            <p class="muted">Horas por semana. Preparo = ${r.fatorPreparo} h por hora de aula (fator definido pela administração). Unidade = este curso + outros cursos da mesma unidade carregados (${(D.externos || []).length}).
            ${r.curso.posicao ? `Em horas de aula você é o ${r.curso.posicao}º de ${r.curso.de} no curso` : 'Você não tem aula neste curso'}${r.unidade.posicao ? ` e o ${r.unidade.posicao}º de ${r.unidade.de} na unidade` : ''}.</p>
            <div class="tabela-wrap"><table class="lista"><thead><tr><th></th><th>Você (curso)</th><th>Média do curso ± desvio</th><th>Você (unidade)</th><th>Média da unidade ± desvio</th><th></th></tr></thead><tbody>
            ${linha('Cadeiras (disciplinas)', 'disciplinas', '')}${linha('Horas em sala de aula', 'sala', ' h')}${linha('Horas em laboratório', 'lab', ' h')}${linha('Horas de aula (total)', 'aula', ' h')}
            ${linha('Horas preparando aula', 'preparo', ' h')}${linha('Horas de pesquisa (reservadas)', 'pesquisa', ' h')}${linha('Total', 'total', ' h')}</tbody></table></div>
            <div class="legenda"><span><i style="background:var(--teal)"></i>você</span><span><i style="background:var(--verde)"></i>média do curso</span><span><i style="background:var(--limao)"></i>média da unidade</span></div></div>`;
    }
    const minhasDisc = (ind) => { const p = D.professores.find((x) => N.normNome(x.nome) === N.normNome(ind.nome)); return p ? D.disciplinas.filter((q) => N.professoresDe(q).includes(p.id) && q.aulas > 0) : []; };
    function htmlPlanos(ind) {
        const lista = minhasDisc(ind);
        return `<div class="card"><h2>Planos de ensino ${D.config.ano}/${D.config.metade}</h2>
            <p class="muted">O plano vem pré-preenchido (identificação, cursos atendidos, local/horário, carga, docência) e o cronograma sai das datas do calendário acadêmico vigente, pulando feriados,
            recessos e pontos facultativos. O conteúdo que você escrever (ementa, objetivos, programa, roteiro de tópicos, avaliação, bibliografia) fica salvo: no próximo semestre só as datas mudam.</p>
            ${lista.length ? `<div class="tabela-wrap"><table class="lista"><thead><tr><th>Código</th><th>Disciplina</th><th>Horários</th><th>Plano</th><th></th></tr></thead><tbody>${lista.map((q) => {
                const salvo = (ind.planos || {})[q.codigo || q.id];
                const pidL = profIdLogado();
                return `<tr><td>${esc(q.codigo)}</td><td><b>${esc(q.nome)}</b>${pidL && q.professor !== pidL ? ' <span class="etiqueta">regente</span>' : ''}</td><td class="codigos">${esc(N.codigosDisciplina(D, q.id)) || '<small>fora da grade</small>'}</td>
                    <td>${salvo ? `<span class="etiqueta oferta">salvo${salvo.salvoEm ? ' em ' + esc(new Date(salvo.salvoEm).toLocaleDateString('pt-BR')) : ''}</span>` : '<span class="etiqueta">pré-preenchido</span>'}</td>
                    <td class="acoes"><button type="button" class="btn btn-secondary btn-sm" data-acao="plano-editar" data-id="${esc(q.id)}">Editar</button>
                    <button type="button" class="btn btn-primary btn-sm" data-acao="plano-docx" data-id="${esc(q.id)}">⬇ DOCX</button></td></tr>`;
            }).join('')}</tbody></table></div>` : '<p class="vazio">Nenhuma disciplina sua com aula nesta grade.</p>'}</div>`;
    }
    function editarPlano(ind, discId) {
        const q = D.disciplinas.find((x) => x.id === discId);
        const c = Planos.conteudo(D, q, (ind.planos || {})[q.codigo || q.id]);
        const t = (nome, rot, linhas = 4, dica = '') => `<label class="campo" style="grid-column:1/-1"><span>${rot}</span><textarea name="${nome}" rows="${linhas}" style="font-family:inherit">${esc(c[nome] || '')}</textarea>${dica ? `<small>${dica}</small>` : ''}</label>`;
        const i = (nome, rot, dica = '') => `<label class="campo"><span>${rot}</span><input type="text" name="${nome}" value="${esc(c[nome] === undefined ? '' : c[nome])}">${dica ? `<small>${dica}</small>` : ''}</label>`;
        abrirJanela(`Plano de ensino — ${N.nomeDisc(q)}`, `
            <p class="muted">${D.config.ano}/${D.config.metade} · cursos atendidos: ${esc(Planos.cursosAtendidos(D, q).join(' / ') || '—')} · local/horário: ${esc(Planos.localHorario(D, q).texto || '—')}</p>
            <fieldset><legend>1. Identificação</legend><div class="campos">${i('turma', 'Turma (Cobalto)', 'ex.: M2')}${i('codigoUnidade', 'Código da unidade')}${i('responsavel', '1.3 Responsável')}
                ${i('creditos', '1.7 Créditos')}${i('cargaTeorica', 'Carga teórica (h)')}${i('cargaPratica', 'Carga prática (h)')}${i('preRequisitos', '1.11 Pré-requisito(s)')}
                <label class="campo"><span>1.9 Currículo</span><select name="curriculo"><option value="semestral"${c.curriculo !== 'anual' ? ' selected' : ''}>semestral</option><option value="anual"${c.curriculo === 'anual' ? ' selected' : ''}>anual</option></select></label></div></fieldset>
            <fieldset><legend>2. Docência (encargo didático semanal, horas)</legend>
                <textarea name="docentes" rows="3" spellcheck="false">${esc((c.docentes || []).map((d) => `${d.nome} | ${d.teorica || 0} | ${d.pratica || 0} | ${d.vinculo || ''}`).join('\n'))}</textarea>
                <small>Um por linha: Nome | teórica | prática | vínculo. O primeiro é o professor regente.</small>
                ${t('observacoesDocencia', '2.2 Observações', 2)}</fieldset>
            <div class="campos">${t('ementa', '3. Ementa', 3)}${t('objetivoGeral', '4.1 Objetivo geral', 2)}${t('objetivosEspecificos', '4.2 Objetivos específicos', 4, 'Um por linha.')}
                ${t('metodologia', '5. Metodologia de ensino', 3)}${t('programa', '6. Programa (conteúdo/unidades)', 8)}</div>
            <fieldset><legend>7. Cronograma — roteiro de tópicos</legend>
                ${t('roteiro', 'Um tópico por encontro, na ordem (no fim da linha: | T, | P ou | T/P)', 8, 'As datas saem do calendário vigente; feriados, recessos e pontos facultativos viram "Não haverá aula" e os tópicos seguem no próximo encontro.')}
                <div class="campos"><label class="campo"><span>Eventos do calendário (SIIEPE, Mostra de Cursos…)</span><select name="eventosSemAula">
                    <option value="siiepe"${c.eventosSemAula === 'siiepe' || c.eventosSemAula === true ? ' selected' : ''}>Só a SIIEPE é sem aula</option><option value="todos"${c.eventosSemAula === 'todos' ? ' selected' : ''}>Todos sem aula</option><option value="nenhum"${c.eventosSemAula === 'nenhum' || c.eventosSemAula === false ? ' selected' : ''}>Há aula em todos</option></select></label>
                ${t('datasSemAula', 'Outras datas sem aula (DD/MM motivo, uma por linha)', 2, 'Ex.: 29/10 Semana Acadêmica')}</div>
                <button type="button" class="btn btn-secondary btn-sm" data-ver-crono>Ver cronograma</button><div id="crono-previa" class="tabela-wrap" style="margin-top:.4rem"></div></fieldset>
            <div class="campos">${t('atividadesDiscentes', '8. Atividades discentes', 2)}${t('avaliacao', '9. Critérios de avaliação', 5)}
                ${t('bibliografiaBasica', '10.1 Bibliografia básica', 4)}${t('bibliografiaComplementar', '10.2 Bibliografia complementar', 4)}
                ${t('aprovacoes', '11. Aprovações', 3)}${t('outrasInformacoes', 'Outras informações (Cobalto)', 2)}</div>`,
        (dlg) => { ind.planos = ind.planos || {}; ind.planos[q.codigo || q.id] = lerPlanoForm(dlg, c); Planos.registrarSemestre(ind, D); salvarInd(ind); aviso('Plano salvo (fica para os próximos semestres; só as datas mudam).'); return true; },
        (dlg) => {
            $('[data-ver-crono]', dlg).addEventListener('click', () => {
                const cr = Planos.cronograma(D, q, lerPlanoForm(dlg, c), ind.ausencias);
                $('#crono-previa', dlg).innerHTML = `${cr.avisos.map((a) => `<p class="muted" style="color:#7a5a00">⚠ ${esc(a)}</p>`).join('')}<table class="lista"><thead><tr><th>Semana</th><th>Data</th><th>Tópico</th><th>T/P</th></tr></thead><tbody>
                    ${cr.linhas.map((l) => `<tr style="${l.semAula ? 'color:var(--suave);font-style:italic' : ''}"><td>${l.semana}</td><td>${l.dataBR}</td><td>${esc(l.topico)}</td><td>${l.tipo}</td></tr>`).join('')}</tbody></table>`;
            });
            return {};
        });
    }
    function lerPlanoForm(dlg, base) {
        const c = Object.assign({}, base);
        $$('[name]', dlg).forEach((el) => { if (el.name !== 'docentes') c[el.name] = el.value; });
        ['creditos', 'cargaTeorica', 'cargaPratica'].forEach((k) => { c[k] = Number(String(c[k]).replace(',', '.')) || 0; });
        c.docentes = $('[name=docentes]', dlg).value.split(/\n+/).map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0]).map(([nome, t, p, v], i) => ({ nome, teorica: Number(t) || 0, pratica: Number(p) || 0, vinculo: v || (i ? '' : 'Professor Regente') }));
        c.salvoEm = new Date().toISOString();
        return c;
    }
    async function baixarPlanoDocx(ind, discId) {
        const q = D.disciplinas.find((x) => x.id === discId);
        try {
            const blob = await DocxDocs.plano(Planos.planoDoSemestre(D, q, (ind.planos || {})[q.codigo || q.id], ind.ausencias));
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `plano-de-ensino-${q.codigo || 'disciplina'}-${D.config.ano}-${D.config.metade}.docx`; document.body.appendChild(a); a.click(); a.remove();
            aviso('Plano de ensino (.docx) baixado.');
        } catch (e) { aviso('Não consegui gerar o DOCX: ' + esc(e.message)); }
    }
    const linhaPeriodo = (e, i, alvo, comSemAula) => `<tr><td><input type="date" data-${alvo}="${i}" data-campo="inicio" value="${esc(e.inicio || '')}"></td><td><input type="date" data-${alvo}="${i}" data-campo="fim" value="${esc(e.fim || '')}"></td>
        <td><input type="text" data-${alvo}="${i}" data-campo="${comSemAula ? 'descricao' : 'motivo'}" value="${esc((comSemAula ? e.descricao : e.motivo) || '')}" placeholder="${comSemAula ? 'ex.: Semana Acadêmica da Engenharia Agrícola' : 'ex.: Congresso CONBEA (ausência justificada)'}"></td>
        ${comSemAula ? `<td><select data-${alvo}="${i}" data-campo="semAula"><option value="1"${e.semAula !== false ? ' selected' : ''}>sem aula</option><option value="0"${e.semAula === false ? ' selected' : ''}>há aula</option></select></td>` : ''}
        <td class="acoes"><button type="button" class="btn btn-perigo btn-sm" data-acao="${alvo}-tirar" data-i="${i}">×</button></td></tr>`;
    function lerPeriodos(alvo) {
        const l = {};
        $$(`[data-${alvo}]`).forEach((el) => { const i = el.getAttribute(`data-${alvo}`); (l[i] = l[i] || {})[el.dataset.campo] = el.value; });
        return Object.keys(l).sort((a, b) => a - b).map((i) => l[i]).filter((e) => e.inicio).map((e) => Object.assign(e, { fim: e.fim || e.inicio, semAula: e.semAula === undefined ? undefined : e.semAula !== '0' }));
    }
    function renderProfessorSemSalvar(ind) { // mostra a linha nova sem gravar ainda
        const el = $('#professor-conteudo .card + .card') || null;
        const tmp = Object.assign({}, ind);
        const html = htmlAusencias(tmp);
        if (el) el.outerHTML = html;
    }
    function renderEventosCurso() {
        const el = $('#cal-eventos-curso'); if (!el) return;
        const l = D.config.eventosCurso || [];
        el.innerHTML = `<div class="tabela-wrap"><table class="lista"><thead><tr><th>Início</th><th>Fim</th><th>Descrição</th><th>Aulas</th><th></th></tr></thead><tbody>
            ${l.map((e, i) => linhaPeriodo(e, i, 'evc', true)).join('') || '<tr><td colspan="5" class="vazio">Nenhum evento do curso.</td></tr>'}</tbody></table></div>`;
    }
    function htmlAusencias(ind) {
        const l = ind.ausencias || [];
        return `<div class="card"><div class="card-topo"><h2>Ausências justificadas, congressos etc.</h2><div class="barra" style="margin:0">
            <button type="button" class="btn btn-secondary btn-sm" data-acao="aus-mais">+ Período</button><button type="button" class="btn btn-primary btn-sm" data-acao="aus-salvar">Salvar</button></div></div>
            <p class="muted">Nestas datas não há aula sua: os planos de ensino marcam "Não haverá aula — motivo" e os tópicos seguem no próximo encontro. Ficam só com você (dados individuais).</p>
            <div class="tabela-wrap"><table class="lista"><thead><tr><th>Início</th><th>Fim</th><th>Motivo</th><th></th></tr></thead><tbody>
            ${l.map((e, i) => linhaPeriodo(e, i, 'aus', false)).join('') || '<tr><td colspan="4" class="vazio">Nenhuma ausência. Clique em “+ Período”.</td></tr>'}</tbody></table></div></div>`;
    }
    function htmlRaad(ind) {
        const r = Planos.raad(D, ind), p = ind.perfil || {};
        const i = (nome, rot, val) => `<label class="campo"><span>${rot}</span><input type="text" data-perfil="${nome}" value="${esc(val || '')}"></label>`;
        const anos = Object.keys(ind.historico || {}).filter((k) => Number(k.split('/')[0]) === r.ano).sort();
        return `<div class="card"><div class="card-topo"><h2>RAAD ${r.ano} (pré-preenchido)</h2><div class="barra" style="margin:0">
            <button type="button" class="btn btn-secondary btn-sm" data-acao="raad-salvar">Salvar</button><button type="button" class="btn btn-primary btn-sm" data-acao="raad-docx">⬇ RAAD (DOCX)</button></div></div>
            <p class="muted">Sempre do ano corrente da grade (${r.ano}). O ensino vem das turmas dos semestres guardados no seu histórico (${anos.join(', ') || 'só o atual'}): CH da turma = créditos × 18,
            dividida em teórica/prática pela proporção do plano de ensino. Para entrar o outro semestre do ano, abra a grade dele e entre aqui (o semestre é registrado ao entrar).
            A pontuação de ensino é estimada (10 pontos por hora semanal, como no RAAD de referência); a oficial é do Cobalto.</p>
            <div class="campos">${i('siape', 'SIAPE', p.siape)}${i('departamento', 'Departamento', p.departamento || (D.config.unidade || {}).nome)}${i('ingressoUfpel', 'Data de ingresso na UFPel', p.ingressoUfpel)}
                ${i('ingressoCargo', 'Data de ingresso no cargo', p.ingressoCargo)}${i('jornada', 'Jornada de trabalho (h)', p.jornada || '40')}
                <label class="campo"><span>Nota da chefia</span><input type="text" data-aval="chefia" value="${esc((ind.avaliacoes || {}).chefia || '')}"></label>
                <label class="campo"><span>Nota final discente</span><input type="text" data-aval="discente" value="${esc((ind.avaliacoes || {}).discente || '')}"></label></div>
            <label class="campo"><span>Projetos unificados (um por linha: Projeto | Ação | Papel | CH)</span><textarea id="raad-projetos" rows="5" spellcheck="false">${esc((ind.projetos || []).map((x) => `${x.projeto} | ${x.acao || ''} | ${x.papel || ''} | ${x.ch || ''}`).join('\n'))}</textarea>
                <small>Ficam guardados de um ano para o outro; ajuste as CHs.</small></label>
            <h3>Ensino ${r.ano}: ${r.chEnsino} h · média ${String(r.horasSemanais).replace('.', ',')} h/semana · pontos estimados ${String(r.pontosEnsinoEstimados).replace('.', ',')}</h3>
            <div class="tabela-wrap"><table class="lista"><thead><tr><th>Período</th><th>Código</th><th>Disciplina</th><th>Créditos</th><th>CH</th><th>CH_T</th><th>CH_P</th></tr></thead><tbody>
            ${r.turmas.map((x) => `<tr><td>${x.periodo}</td><td>${esc(x.codigo)}</td><td>${esc(x.nome)}</td><td>${x.creditos}</td><td><b>${x.ch}</b></td><td>${x.chT}</td><td>${x.chP}</td></tr>`).join('') || '<tr><td colspan="7" class="vazio">Nenhuma turma no ano.</td></tr>'}</tbody></table></div>
            <p><b>CH total (ensino + projetos):</b> ${r.chTotal} h</p></div>`;
    }
    function salvarRaadForm(ind) {
        ind.perfil = ind.perfil || {}; ind.avaliacoes = ind.avaliacoes || {};
        $$('[data-perfil]').forEach((el) => { ind.perfil[el.dataset.perfil] = el.value.trim(); });
        $$('[data-aval]').forEach((el) => { ind.avaliacoes[el.dataset.aval] = el.value.trim(); });
        ind.projetos = $('#raad-projetos').value.split(/\n+/).map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0]).map(([projeto, acao, papel, ch]) => ({ projeto, acao: acao || '', papel: papel || '', ch: Number(String(ch || '').replace(',', '.')) || 0 }));
        salvarInd(ind);
    }
    function htmlDados(ind) {
        return `<div class="card"><h2>Meus dados</h2>
            <p class="muted">Ficam só neste navegador (com senha) e no arquivo que você baixar. Nunca vão para o MEGA. Para usar em outro computador, baixe e depois traga o arquivo lá.</p>
            <div class="barra"><button type="button" class="btn btn-primary btn-sm" data-acao="ind-exportar">⬇ Baixar meus dados (JSON)</button>
            <button type="button" class="btn btn-secondary btn-sm" data-acao="ind-importar">⬆ Trazer meus dados (JSON)</button>
            <button type="button" class="btn btn-secondary btn-sm" data-acao="ind-senha">Trocar senha</button></div>
            <p class="muted">O arquivo traz: perfil, disciplinas e horários, rendimento, planos de ensino (conteúdo e do semestre), histórico e RAAD. A senha não vai no arquivo.</p></div>`;
    }
    let indImportando = false;
    function importarIndividual(x) {
        if (!x || x.tipo !== 'individual' || !x.nome) return aviso('Esse arquivo não é de dados individuais (exportado na Área do professor).');
        const atual = carregarInd(x.nome) || Planos.individualVazio(x.nome);
        Object.assign(atual, { planos: Object.assign({}, atual.planos, x.planos || {}), historico: Object.assign({}, atual.historico, x.historico || {}),
            perfil: Object.assign({}, atual.perfil, x.perfilFuncional || {}), projetos: (x.projetos && x.projetos.length) ? x.projetos : atual.projetos,
            avaliacoes: Object.assign({}, atual.avaliacoes, x.avaliacoes || {}), ausencias: (x.ausencias && x.ausencias.length) ? x.ausencias : (atual.ausencias || []) });
        salvarInd(atual);
        aviso(`Dados de ${esc(x.nome)} trazidos.${atual.senhaHash ? '' : ' Entre e crie sua senha.'}`, 5000);
        renderProfessor();
    }

    // ================================================================ unidade (JSON e MEGA)
    function unidadeImportar(u) {
        if (!u || u.tipo !== 'unidade') return aviso('Esse arquivo não é de unidade (exportado em Curso → Unidade).');
        guardarHistorico();
        const r = Planos.importarUnidade(D, u);
        mudou();
        aviso(`Unidade ${esc((u.unidade || {}).nome || '')}: ${r.salas} sala(s) e ${r.professores} professor(es) novos; horários indisponíveis e de pesquisa somados.`, 6000);
    }

    // ================================================================ curso (catálogo da UFPel)
    const unidadesCat = () => (typeof CATALOGO_UFPEL !== 'undefined' ? CATALOGO_UFPEL.unidades : []);
    const cursoCat = (cod) => { for (const u of unidadesCat()) { const c = u.cursos.find((x) => String(x.cod) === String(cod)); if (c) return c; } return null; };

    function renderCurso() {
        const el = $('#curso-pagina'), c = D.cursos[0];
        const uni = unidadesCat().find((u) => u.nome === (D.config.unidade || {}).nome) || unidadesCat()[0];
        const cat = c && c.cod ? cursoCat(c.cod) : null;
        const prefs = c ? Object.entries(c.preferencias || {}).filter(([, v]) => v.length) : [];
        const temMatriz = cat && cat.matriz;
        const naGrade = D.disciplinas.filter((q) => q.aulas > 0 && q.ofertas.some((o) => o.semestre > 0)).length;
        el.innerHTML = `<div class="campos">
            <label class="campo"><span>Unidade</span><select id="cur-unidade">${unidadesCat().map((u) => `<option value="${u.id}"${uni && u.id === uni.id ? ' selected' : ''}>${esc(u.nome)}</option>`).join('')}</select>
                <small>Cada unidade é autônoma; as salas não podem conflitar entre unidades.</small></label>
            <label class="campo"><span>Curso (graduação na UFPel)</span><select id="cur-cat"><option value="">— escolha —</option>${(uni ? uni.cursos : []).map((x) => `<option value="${x.cod}"${c && String(c.cod) === String(x.cod) ? ' selected' : ''}>${esc(x.nome)} (${esc(x.grau)})</option>`).join('')}</select>
                <small>Fonte: <a href="https://institucional.ufpel.edu.br/unidades/id/${uni ? uni.id : 444}" target="_blank" rel="noopener">página da unidade</a>.</small></label>
            </div>
            <div class="barra"><button type="button" class="btn btn-primary btn-sm" data-acao="usar-curso">${c ? 'Trocar para o curso escolhido' : 'Usar este curso'}</button></div>
            ${c ? `<div class="card" style="margin:0;border-left:4px solid var(--verde)"><div class="card-topo"><h2>${esc(c.nome)} <span class="etiqueta">${esc(N.sigla(c.nome))}</span>${c.cod ? ` <small>código ${esc(c.cod)}</small>` : ''}</h2>
                <button type="button" class="btn btn-secondary btn-sm" data-acao="editar-item" data-tipo="curso" data-id="${esc(c.id)}">Editar horários e turnos preferidos</button></div>
                <p>${c.semestres} semestres · ${D.disciplinas.length} disciplinas cadastradas (${naGrade} vão para a grade) · oferta: ${resumoHorarios(c.oferta)} · reoferta: ${resumoHorarios(c.reoferta)}</p>
                <p>Turnos preferidos: ${prefs.length ? prefs.sort((a, b) => a[0] - b[0]).map(([sem, v]) => `<span class="etiqueta">${sem}º: ${v.map((t) => N.NOME_TURNO[t]).join('/')}</span>`).join(' ') : '<small>nenhum (o gerador usa qualquer turno do funcionamento)</small>'}</p>
                <div class="barra">${temMatriz ? `<button type="button" class="btn btn-primary btn-sm" data-acao="importar-matriz">📥 Importar disciplinas da matriz curricular</button>` : '<small class="muted">Este curso não tem a matriz no catálogo: cadastre as disciplinas à mão.</small>'}
                ${cat ? `<a class="btn btn-secondary btn-sm" href="${esc(cat.url)}" target="_blank" rel="noopener">↗ Página do curso na UFPel</a>` : ''}</div>
                ${temMatriz ? `<small class="muted">A importação traz código, nome, semestre e créditos (aulas por semana = créditos). Estágio, TCC, EAD e extensão entram com 0 aulas (fora da grade);
                    optativas entram com 0 aulas e semestre 0: quando forem ofertadas, informe semestre e aulas. Não repete disciplinas que já existem (pelo código). Depois, escolha o professor de cada uma.</small>` : ''}</div>`
            : '<p class="vazio">Escolha a unidade e o curso acima.</p>'}`;
    }
    function usarCurso() {
        const cat = cursoCat($('#cur-cat').value);
        if (!cat) return aviso('Escolha um curso da lista.');
        const uni = unidadesCat().find((u) => String(u.id) === $('#cur-unidade').value);
        const c = D.cursos[0];
        if (c && c.cod === cat.cod) return aviso('Este já é o curso da grade.');
        if (c && D.disciplinas.length && !confirm(`Trocar ${c.nome} por ${cat.nome}? As disciplinas e a grade atuais saem (salve ou exporte antes, se quiser guardar).`)) return;
        guardarHistorico();
        const noite = cat.turno === 'noturno';
        const T = (t) => N.chavesTurno(D.config, t);
        D.config.unidade = { id: uni.id, nome: uni.nome };
        D.cursos = [{ id: N.novoId('c'), cod: cat.cod, nome: cat.nome, semestres: cat.semestres || 10,
            oferta: noite ? T('noite') : [...T('manha'), ...T('tarde')], reoferta: noite ? T('noite') : [...T('tarde'), ...T('noite')], preferencias: {} }];
        if (c) { D.disciplinas = []; D.grade = { alocacoes: [], naoAlocadas: [], geradaEm: null }; }
        D.externos = (D.externos || []).filter((e) => N.normNome(e.curso) !== N.normNome(cat.nome)); // o próprio curso não bloqueia a si mesmo
        D.config.titulo = `Grade horária — ${cat.nome}`;
        mudou();
        aviso(`Curso escolhido: ${esc(cat.nome)}.${cat.matriz ? ' Agora importe as disciplinas da matriz curricular.' : ''}`, 5000);
    }
    function importarMatriz() {
        const c = D.cursos[0], cat = c && cursoCat(c.cod);
        if (!cat || !cat.matriz) return;
        const novas = N.disciplinasDaMatriz(cat, c.id, D.disciplinas);
        if (!novas.length) return aviso('Todas as disciplinas da matriz já estão cadastradas.');
        guardarHistorico();
        D.disciplinas.push(...novas);
        const comAula = novas.filter((q) => q.aulas > 0).length;
        mudou();
        aviso(`${novas.length} disciplinas importadas: ${comAula} vão para a grade; ${novas.length - comAula} ficam com 0 aulas (optativas, estágio, TCC, EAD). Falta escolher os professores.`, 7000);
    }

    // ================================================================ outros cursos
    function renderOutros() {
        const ext = N.ocupacoesExternas(D);
        const profsUsados = new Set(Object.keys(ext.prof)), salasUsadas = new Set(Object.keys(ext.sala));
        const lista = D.externos || [];
        $('#lista-outros').innerHTML = lista.length ? `<table class="lista"><thead><tr><th>Curso</th><th>Unidade</th><th>Aulas</th><th>Professores daqui</th><th>Salas daqui</th><th>Origem</th><th></th></tr></thead><tbody>${lista.map((e, i) => {
            const mesma = !e.unidade || N.normNome(e.unidade) === N.normNome((D.config.unidade || {}).nome);
            const profs = [...new Set(e.aulas.flatMap((a) => (a.professores && a.professores.length ? a.professores : [a.professor])))].filter((n) => D.professores.some((p) => N.normNome(p.nome) === N.normNome(n)));
            const salas = [...new Set(e.aulas.map((a) => a.sala))].filter((n) => D.salas.some((x) => N.normNome(x.nome) === N.normNome(n)));
            return `<tr><td><b>${esc(e.curso)}</b></td><td>${esc(e.unidade || '—')}${mesma ? '' : ' <span class="etiqueta" title="Outra unidade: só as salas bloqueiam">só salas</span>'}</td><td>${e.aulas.length}</td>
                <td>${mesma ? (profs.map((n) => `<span class="etiqueta">${esc(n)}</span>`).join('') || '<small>nenhum em comum</small>') : '<small>— (outra unidade)</small>'}</td>
                <td>${salas.map((n) => `<span class="etiqueta lab">${esc(n)}</span>`).join('') || '<small>nenhuma em comum</small>'}</td>
                <td><small>${esc(e.origem)}${e.versao ? ' · ' + esc(new Date(e.versao).toLocaleDateString('pt-BR')) : ''}</small></td>
                <td class="acoes"><button type="button" class="btn btn-perigo btn-sm" data-acao="tirar-outro" data-i="${i}" title="Tirar este curso dos bloqueios">×</button></td></tr>`;
        }).join('')}</tbody></table><p class="muted" style="margin-top:.5rem">${profsUsados.size} professor(es) e ${salasUsadas.size} sala(s) deste curso têm horários bloqueados por outros cursos. Na grade, esses bloqueios aparecem como conflito e o gerador não usa esses horários.</p>`
            : '<p class="vazio">Nenhum outro curso carregado. Busque no MEGA (os cursos que já salvaram a grade deste período) ou importe o JSON exportado por outro curso.</p>';
    }
    function incluirOutros(arquivos, origem) {
        const ok = [], nao = [];
        arquivos.forEach((x) => {
            const dd = N.normalizar(x);
            dd.cursos.forEach((c) => {
                const so = dd.cursos.length > 1 ? N.separarCurso(dd, c.id) : dd;
                const r = N.incluirExterno(D, N.externoDe(so, c.id, origem));
                (r.ok ? ok : nao).push(r.ok ? c.nome : r.motivo);
            });
        });
        return { ok, nao };
    }
    async function megaOutros() {
        try {
            aviso('Buscando os outros cursos no MEGA…', 20000);
            const lista = await Nuvem.outrosCursos(D);
            guardarHistorico();
            const r = incluirOutros(lista.map((x) => x.dados), 'MEGA');
            mudou();
            aviso(lista.length ? `${r.ok.length} curso(s) carregado(s) do MEGA.${r.nao.length ? '<br><small>' + r.nao.map(esc).join('<br>') + '</small>' : ''}` : `Nenhum outro curso salvo no MEGA para ${D.config.ano}/${D.config.metade}.`, 7000);
        } catch (e) { if (e.message !== 'cancelado') aviso(esc(e.message), 7000); }
    }
    async function megaSalvar() {
        if (!D.cursos[0]) return aviso('Escolha o curso antes de salvar.');
        try { aviso('Salvando no MEGA…', 20000); const caminho = await Nuvem.salvar(D, N.exportarCurso); aviso(`Salvo no MEGA:<br><small>${esc(caminho)}</small>`, 6000); } catch (e) { if (e.message !== 'cancelado') aviso(esc(e.message), 7000); }
    }
    async function megaAbrir() {
        let lista;
        try { aviso('Listando o MEGA…', 20000); lista = await Nuvem.listar(D); } catch (e) { if (e.message !== 'cancelado') aviso(esc(e.message), 7000); return; }
        $('#aviso').classList.remove('visivel');
        if (!lista.length) return aviso(`Nada salvo no MEGA para ${D.config.ano}/${D.config.metade}. (O período vem da Configuração.)`, 6000);
        abrirJanela('Abrir grade do MEGA', `<p class="muted">Período ${D.config.ano}/${D.config.metade}. Escolha o curso e a versão (a mais nova primeiro). A grade aberta substitui a deste navegador.</p>
            <label class="campo"><span>Curso e versão</span><select name="versao">${lista.map((x, i) => x.versoes.map((v, j) => `<option value="${i}|${j}">${esc(x.unidade)} · ${esc(x.curso)} · ${esc(v.name)}</option>`).join('')).join('')}</select></label>`,
        (dlg) => {
            const [i, j] = val(dlg, 'versao').split('|').map(Number);
            Nuvem.abrir(lista[i].versoes[j]).then((x) => { guardarHistorico(); const externos = D.externos; D = N.normalizar(x); if (!D.externos.length) D.externos = externos; ui.item = null; mudou(); aviso('Grade aberta do MEGA.'); })
                .catch((e) => aviso('Não consegui abrir: ' + esc(e.message)));
            return true;
        }, null, 'Abrir');
    }

    // ================================================================ importar e exportar JSON
    let modoImportar = 'perguntar';
    function exportarJson() {
        if (!D.cursos[0]) return aviso('Escolha o curso antes de exportar.');
        baixar(`grade-${N.sigla(D.cursos[0].nome)}-${D.config.ano}-${D.config.metade}.json`, JSON.stringify(N.exportarCurso(D), null, 2), 'application/json');
        aviso(`Exportado só o curso ${esc(D.cursos[0].nome)} (cadastros e grade; sem as grades dos outros cursos).`, 5000);
    }
    function importarJson(x) {
        const dd = N.normalizar(x);
        if (!dd.cursos.length) return aviso('Esse arquivo não tem curso. Precisa ser um JSON exportado por este app.');
        if (modoImportar === 'outro') { guardarHistorico(); const r = incluirOutros([x], 'arquivo'); mudou(); aviso(`${r.ok.length} curso(s) incluído(s) nos bloqueios.${r.nao.length ? '<br><small>' + r.nao.map(esc).join('<br>') + '</small>' : ''}`, 6000); return; }
        const varios = dd.cursos.length > 1;
        abrirJanela('Importar JSON', `<p>Arquivo de <b>${esc((dd.config.unidade || {}).nome || '')}</b>, período ${dd.config.ano}/${dd.config.metade}, com ${dd.cursos.length} curso(s): ${dd.cursos.map((c) => esc(c.nome)).join(', ')}.</p>
            ${varios ? `<label class="campo"><span>Curso desta grade</span><select name="curso">${dd.cursos.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('')}</select><small>Cada grade é de um curso só.</small></label>` : ''}
            <fieldset style="margin-top:.6rem"><legend>Como usar</legend><div class="checks" style="flex-direction:column">
                <label><input type="radio" name="modo" value="abrir" checked> Abrir como a grade deste navegador (substitui a atual)</label>
                <label><input type="radio" name="modo" value="outro"> Usar como outro curso (só bloqueia professores e salas)</label>
                ${varios ? '<label><input type="checkbox" name="demais" checked> Os demais cursos do arquivo entram como outros cursos (bloqueios)</label>' : ''}</div></fieldset>`,
        (dlg) => {
            const modo = ($('[name=modo]:checked', dlg) || {}).value;
            guardarHistorico();
            if (modo === 'outro') { const r = incluirOutros([x], 'arquivo'); mudou(); aviso(`${r.ok.length} curso(s) incluído(s) nos bloqueios.${r.nao.length ? '<br><small>' + r.nao.map(esc).join('<br>') + '</small>' : ''}`, 6000); return true; }
            const id = varios ? val(dlg, 'curso') : dd.cursos[0].id;
            const novo = varios ? N.separarCurso(dd, id) : dd;
            if (varios && $('[name=demais]', dlg).checked) dd.cursos.filter((c) => c.id !== id).forEach((c) => N.incluirExterno(novo, N.externoDe(N.separarCurso(dd, c.id), c.id, 'arquivo')));
            D = novo; ui.item = null;
            aviso('JSON importado.');
            return true;
        }, null, 'Importar');
    }

    // ================================================================ arquivo
    function baixar(nome, conteudo, tipo) {
        const blob = new Blob([conteudo], { type: tipo });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = nome;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    function nomeArquivo(ext) { return `grade-horaria-${D.config.ano}-${D.config.metade}.${ext}`; }

    function renderPdfInfo() {
        const c = N.conflitos(D);
        $('#pdf-info').textContent = !D.grade.alocacoes.length ? 'A grade está vazia: gere ou monte a grade antes.' : (c.erros ? `Atenção: a grade tem ${c.erros} conflito(s); eles saem marcados no PDF.` : 'Grade sem conflitos.');
    }

    // ================================================================ eventos
    document.addEventListener('click', (e) => {
        const alvo = e.target.closest('[data-acao]');
        const acao = alvo && alvo.dataset.acao;
        if (acao) {
            const tipo = alvo.dataset.tipo, id = alvo.dataset.id;
            switch (acao) {
                case 'fechar-menu': document.body.classList.remove('sidebar-aberta'); break;
                case 'salvar-config': salvarConfig(); break;
                case 'horarios-padrao': $('#cfg-horarios').value = N.horariosPadrao().map((h) => `${h.ini}-${h.fim}`).join('\n'); break;
                case 'novo-item':
                    if (tipo === 'disciplina' && !D.cursos[0]) { aviso('Escolha o curso primeiro.'); location.hash = '#cursos'; break; }
                    if (tipo === 'disciplina' && !D.professores.length) aviso('Dica: cadastre os professores antes, para escolher o responsável.');
                    FORMS[tipo](null); break;
                case 'editar-item': FORMS[tipo](id); break;
                case 'excluir-item': {
                    const lista = { curso: D.cursos, professor: D.professores, sala: D.salas, disciplina: D.disciplinas }[tipo];
                    const x = lista.find((y) => y.id === id);
                    if (x && confirm(`Excluir “${x.nome}”? O que depende dele também é ajustado (por exemplo, aulas na grade).`)) { guardarHistorico(); N.excluir(D, tipo, id); mudou(); }
                    break;
                }
                case 'aleatorizar': aleatorizar(); break;
                case 'editar':
                    if (!ui.editando && !papelAtual()) { pedirLogin('Para editar, entre como curso (todos os horários) ou como professor (só os seus).'); break; }
                    ui.editando = !ui.editando; ui.sel = null; ui.ins = null; renderGradePagina(); break;
                case 'entrar': pedirLogin(); break;
                case 'sair-papel': sairPapel(); break;
                case 'desfazer': desfazer(); break;
                case 'destravar-tudo': if (!podeCurso()) { aviso('Só o curso (coordenação) solta todas as aulas.'); pedirLogin(); break; } guardarHistorico(); D.grade.alocacoes.forEach((a) => { a.travada = false; }); mudou(); aviso('Todas as aulas soltas: o Aleatorizar pode mexer em todas.'); break;
                case 'limpar-grade':
                    if (!podeCurso()) { aviso('Só o curso (coordenação) limpa a grade.'); pedirLogin(); break; }
                    if (confirm('Tirar todas as aulas da grade (inclusive as fixadas)? Dá para desfazer.')) { guardarHistorico(); D.grade = { alocacoes: [], naoAlocadas: [], geradaEm: null }; ui.sel = null; mudou(); }
                    break;
                case 'cancelar-sel': cancelarSelecao(); break;
                case 'travar': {
                    guardarHistorico();
                    const trav = ui.sel.every((i) => D.grade.alocacoes[i].travada);
                    ui.sel.forEach((i) => { D.grade.alocacoes[i].travada = !trav; });
                    mudou(); break;
                }
                case 'remover-bloco': {
                    guardarHistorico();
                    const tira = new Set(ui.sel);
                    D.grade.alocacoes = D.grade.alocacoes.filter((_, i) => !tira.has(i));
                    ui.sel = null; mudou(); aviso('Aula tirada da grade. Ela aparece em “Aulas sem lugar” para colocar em outro horário.'); break;
                }
                case 'colocar': {
                    const q = D.disciplinas.find((x) => x.id === id);
                    const falta = (N.faltando(D).find((x) => x.disc === id) || {}).faltam || 1;
                    const bl = N.blocos(q, D.config.divisaoPadrao).filter((b) => b <= falta);
                    ui.ins = { disc: id, n: bl.length ? Math.max(...bl) : falta }; ui.sel = null;
                    const perm = N.salasPermitidas(D, q).filter((s) => N.professoresDe(q).every((p) => N.profPodeNaSala(D.salas.find((x) => x.id === s), p)));
                    ui.salaSel = perm[0] || (D.salas[0] || {}).id || '';
                    renderGradePagina();
                    $('#painel-edicao').scrollIntoView({ behavior: 'smooth', block: 'start' });
                    aviso('Clique na célula onde a aula vai começar.');
                    break;
                }
                case 'exportar-json': exportarJson(); break;
                case 'prof-sair': sairProfessor(); break;
                case 'aus-mais': { const ind = profLogado(); if (!ind) break; ind.ausencias = $$('[data-aus]').length ? lerPeriodos('aus') : (ind.ausencias || []); ind.ausencias.push({ inicio: '', fim: '', motivo: '' }); renderProfessorSemSalvar(ind); break; }
                case 'aus-tirar': { const ind = profLogado(); if (!ind) break; ind.ausencias = lerPeriodos('aus'); ind.ausencias.splice(Number(alvo.dataset.i), 1); salvarInd(ind); renderProfessor(); break; }
                case 'aus-salvar': { const ind = profLogado(); if (!ind) break; ind.ausencias = lerPeriodos('aus').map(({ inicio, fim, motivo }) => ({ inicio, fim, motivo })); salvarInd(ind); aviso(`${ind.ausencias.length} período(s) de ausência salvos; os planos de ensino já consideram.`); renderProfessor(); break; }
                case 'evc-mais': if (!podeCurso()) { aviso('Só o curso (coordenação) mexe nos eventos do curso.'); pedirLogin(); break; } D.config.eventosCurso = $$('[data-evc]').length ? lerPeriodos('evc') : (D.config.eventosCurso || []); D.config.eventosCurso.push({ inicio: '', fim: '', descricao: '', semAula: true }); renderEventosCurso(); break;
                case 'evc-tirar': if (!podeCurso()) { pedirLogin(); break; } guardarHistorico(); D.config.eventosCurso = lerPeriodos('evc'); D.config.eventosCurso.splice(Number(alvo.dataset.i), 1); mudou(); break;
                case 'evc-salvar': if (!podeCurso()) { aviso('Só o curso (coordenação) mexe nos eventos do curso.'); pedirLogin(); break; } guardarHistorico(); D.config.eventosCurso = lerPeriodos('evc'); mudou(); aviso(`${D.config.eventosCurso.length} evento(s) do curso salvos; entram no calendário, no PDF e nos planos de ensino.`); break;
                case 'plano-editar': { const ind = profLogado(); if (ind) editarPlano(ind, id); break; }
                case 'plano-docx': { const ind = profLogado(); if (ind) baixarPlanoDocx(ind, id); break; }
                case 'raad-salvar': { const ind = profLogado(); if (ind) { salvarRaadForm(ind); aviso('RAAD salvo.'); renderProfessor(); } break; }
                case 'raad-docx': {
                    const ind = profLogado(); if (!ind) break;
                    salvarRaadForm(ind);
                    DocxDocs.raad(Planos.raad(D, ind)).then((blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `RAAD-${D.config.ano}-${N.sigla(ind.nome)}-pre-preenchido.docx`; document.body.appendChild(a); a.click(); a.remove(); aviso('RAAD (.docx) baixado.'); })
                        .catch((e) => aviso('Não consegui gerar: ' + esc(e.message)));
                    break;
                }
                case 'ind-exportar': { const ind = profLogado(); if (ind) { baixar(`meus-dados-${N.sigla(ind.nome)}-${D.config.ano}-${D.config.metade}.json`, JSON.stringify(Planos.exportarIndividual(D, ind), null, 2), 'application/json'); aviso('Seus dados foram baixados (só no seu computador).'); } break; }
                case 'ind-importar': indImportando = true; modoImportar = 'individual'; $('#arquivo-entrada').click(); break;
                case 'ind-senha': {
                    const ind = profLogado(); if (!ind) break;
                    abrirJanela('Trocar senha', `<div class="campos"><label class="campo"><span>Senha atual</span><input type="password" name="a" autocomplete="current-password"></label>
                        <label class="campo"><span>Nova senha</span><input type="password" name="b" autocomplete="new-password"></label><label class="campo"><span>Repita</span><input type="password" name="c" autocomplete="new-password"></label></div>`,
                    (dlg) => { (async () => {
                        if (await Planos.hashSenha(val(dlg, 'a'), ind.sal) !== ind.senhaHash) return aviso('Senha atual não confere.');
                        if (val(dlg, 'b').length < 4 || val(dlg, 'b') !== val(dlg, 'c')) return aviso('A nova senha precisa ter 4+ caracteres e conferir.');
                        ind.senhaHash = await Planos.hashSenha(val(dlg, 'b'), ind.sal); salvarInd(ind); aviso('Senha trocada.');
                    })(); return true; }, null, 'Trocar');
                    break;
                }
                case 'unidade-exportar': baixar(`unidade-${N.sigla((D.config.unidade || {}).nome)}-${D.config.ano}-${D.config.metade}.json`, JSON.stringify(Planos.exportarUnidade(D), null, 2), 'application/json'); aviso('Dados da unidade exportados (sem dados individuais).'); break;
                case 'unidade-importar': modoImportar = 'unidade'; $('#arquivo-entrada').click(); break;
                case 'unidade-mega-salvar': (async () => { try { aviso('Salvando a unidade no MEGA…', 20000); const c = await Nuvem.salvarUnidade(D, Planos.exportarUnidade); aviso(`Unidade salva no MEGA:<br><small>${esc(c)}</small>`, 6000); } catch (e) { if (e.message !== 'cancelado') aviso(esc(e.message), 7000); } })(); break;
                case 'unidade-mega-abrir': (async () => { try { aviso('Buscando a unidade no MEGA…', 20000); const u = await Nuvem.abrirUnidade(D); if (u) unidadeImportar(u); else aviso('Nenhum dado da unidade no MEGA para este período.'); } catch (e) { if (e.message !== 'cancelado') aviso(esc(e.message), 7000); } })(); break;
                case 'verificacao-pdf': try { GeradorPDF.verificacao(D).save(`verificacao-interna-${D.config.ano}-${D.config.metade}.pdf`); aviso('Documento de verificação interna gerado.'); } catch (e) { aviso('Não consegui gerar: ' + esc(e.message)); } break;
                case 'sair-admin': sairAdmin(); break;
                case 'pdf-relatorios': try { GeradorPDF.relatorios(D).save(`relatorios-internos-${D.config.ano}-${D.config.metade}.pdf`); aviso('PDF dos relatórios gerado.'); } catch (e) { aviso('Não consegui gerar: ' + esc(e.message)); } break;
                case 'cal-buscar': buscarCalendario(); break;
                case 'cal-2027': guardarHistorico(); D.config.calendario = N.calendario2027(); mudou(); aviso('Calendário acadêmico 2027 (dados embutidos, extraídos do link da CRA em 17/11/2026).'); break;
                case 'cal-ler-texto': aplicarCalendario(N.lerCalendarioTexto($('#cal-texto').value, D.config.ano, $('#cal-url').value.trim()), 'texto colado do link'); break;
                case 'cal-salvar-datas': {
                    const ok = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
                    const sem = {}; [[1, 's1'], [2, 's2']].forEach(([k, id]) => { const i = $(`#cal-${id}-ini`).value.trim(), f = $(`#cal-${id}-fim`).value.trim(); if (ok(i) && ok(f)) sem[k] = { inicio: i, fim: f }; });
                    guardarHistorico(); D.config.calendario.semestres = sem; D.config.calendario.url = $('#cal-url').value.trim() || D.config.calendario.url; mudou(); aviso('Datas do semestre salvas.'); break;
                }
                case 'importar-json': modoImportar = 'perguntar'; $('#arquivo-entrada').click(); break;
                case 'importar-json-outro': modoImportar = 'outro'; $('#arquivo-entrada').click(); break;
                case 'mega-salvar': megaSalvar(); break;
                case 'mega-abrir': megaAbrir(); break;
                case 'mega-outros': megaOutros(); break;
                case 'tirar-outro': guardarHistorico(); D.externos.splice(Number(alvo.dataset.i), 1); mudou(); break;
                case 'usar-curso': usarCurso(); break;
                case 'importar-matriz': importarMatriz(); break;
                case 'novo':
                    if (confirm('Começar a grade de um curso do zero? Os dados atuais saem deste navegador (salve no MEGA ou exporte antes, se quiser guardar).')) { guardarHistorico(); D = N.dadosVazios(); ui.item = null; mudou(); location.hash = '#cursos'; }
                    break;
                case 'exemplo':
                    if (confirm('Carregar o exemplo? Os dados atuais serão substituídos (dá para desfazer na Grade).')) { guardarHistorico(); D = Exemplo.criar(N); ui.item = null; mudou(); aviso('Exemplo carregado. Vá em Grade e clique em Aleatorizar.'); }
                    break;
                case 'gerar-pdf': gerarPdf(); break;
                default: break;
            }
            return;
        }
        // grade: selecionar e mover
        if (ui.pagina === 'grade' && ui.editando && ui.visao !== 'relacao') {
            const chipEl = e.target.closest('#grade-wrap .aula');
            const td = e.target.closest('#grade-wrap td[data-d]');
            if (chipEl && (!ui.sel && !ui.ins)) {
                if (!podeEditarAloc(Number(chipEl.dataset.i))) { aviso(papelAtual() && papelAtual().tipo === 'prof' ? 'Esta aula não é sua: só o curso (coordenação) ou o professor dela pode mudar.' : 'Entre como curso ou como o professor da aula para mudar.'); return; }
                selecionar(Number(chipEl.dataset.i)); return;
            }
            if (td && !chipEl && !ui.sel && !ui.ins) { colocarAqui(Number(td.dataset.d), Number(td.dataset.h)); return; }
            if (chipEl && ui.sel && ui.sel.includes(Number(chipEl.dataset.i))) {
                // clicar na própria aula: se a sala mudou no painel, aplica; senão, desmarca
                const a = D.grade.alocacoes[ui.sel[0]];
                if (ui.salaSel && ui.salaSel !== a.sala) soltarEm(a.d, Math.min(...ui.sel.map((i) => D.grade.alocacoes[i].h)));
                else cancelarSelecao();
                return;
            }
            if (td && (ui.sel || ui.ins)) soltarEm(Number(td.dataset.d), Number(td.dataset.h));
        }
        const abaP = e.target.closest('[data-aba-prof]');
        if (abaP) { abaProf = abaP.dataset.abaProf; renderProfessor(); return; }
        const li = e.target.closest('#lista-conflitos li[data-alocs]');
        if (li) verConflito(li);
        if (e.target.closest('.sidebar-toggle')) document.body.classList.toggle('sidebar-aberta');
    });

    document.addEventListener('change', (e) => {
        if (e.target.id === 'fator-preparo') { D.config.fatorPreparo = Math.max(0, Number(e.target.value) || 0); salvarLocal(); renderRelatorios(); }
        if (e.target.id === 'cur-unidade') { const u = unidadesCat().find((x) => String(x.id) === e.target.value); if (u) { D.config.unidade = { id: u.id, nome: u.nome }; salvarLocal(); renderCurso(); renderMenu(); } }
        if (e.target.id === 'visao-item') { ui.item = e.target.value; renderGradePagina(); }
        if (e.target.id === 'visao-semestre') { ui.semestre = Number(e.target.value); renderGradePagina(); }
        if (e.target.id === 'sala-alvo') { ui.salaSel = e.target.value; pintarAlvos(); }
        if (e.target.id === 'ins-n') { ui.ins.n = Math.max(1, Number(e.target.value) || 1); pintarAlvos(); }
        if (e.target.id === 'arquivo-entrada' && e.target.files[0]) {
            const leitor = new FileReader();
            leitor.onload = () => {
                let x = null;
                try { x = JSON.parse(leitor.result); } catch (err) { aviso('Não consegui ler esse arquivo (precisa ser o .json exportado por este app).'); }
                if (x && modoImportar === 'individual') importarIndividual(x);
                else if (x && modoImportar === 'unidade') unidadeImportar(x);
                else if (x && x.tipo === 'individual') importarIndividual(x);
                else if (x && x.tipo === 'unidade') unidadeImportar(x);
                else if (x) importarJson(x);
                modoImportar = 'perguntar';
                e.target.value = '';
            };
            leitor.readAsText(e.target.files[0]);
        }
    });
    document.addEventListener('input', (e) => { if (e.target.id === 'filtro-disc') renderLista('disciplina'); });
    $('#visao-abas').addEventListener('click', (e) => {
        const b = e.target.closest('[data-visao]'); if (!b) return;
        ui.visao = b.dataset.visao; ui.item = null; renderGradePagina();
    });
    // arrastar e soltar (computador)
    document.addEventListener('dragstart', (e) => {
        const chipEl = e.target.closest && e.target.closest('#grade-wrap .aula');
        if (!chipEl || !ui.editando) return;
        if (!podeEditarAloc(Number(chipEl.dataset.i))) { e.preventDefault(); aviso('Esta aula não é sua: só o curso ou o professor dela pode mudar.'); return; }
        e.dataTransfer.setData('text/plain', chipEl.dataset.i);
        e.dataTransfer.effectAllowed = 'move';
        const i = Number(chipEl.dataset.i);
        if (!(ui.sel && ui.sel.includes(i))) {
            ui.sel = N.blocoDe(D, i); ui.ins = null; ui.salaSel = D.grade.alocacoes[i].sala;
            setTimeout(() => { renderPainelEdicao(); pintarAlvos(); $$('#grade-wrap .aula').forEach((el) => el.classList.toggle('selecionada', ui.sel.includes(Number(el.dataset.i)))); }, 0);
        }
    });
    document.addEventListener('dragover', (e) => { if (ui.editando && e.target.closest && e.target.closest('#grade-wrap td[data-d]')) e.preventDefault(); });
    document.addEventListener('drop', (e) => {
        const td = e.target.closest && e.target.closest('#grade-wrap td[data-d]');
        if (!td || !ui.editando) return;
        e.preventDefault();
        soltarEm(Number(td.dataset.d), Number(td.dataset.h));
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && ui.editando && (ui.sel || ui.ins)) cancelarSelecao();
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && ui.pagina === 'grade' && !e.target.closest('input, textarea')) { e.preventDefault(); desfazer(); }
    });

    function gerarPdf() {
        if (typeof GeradorPDF === 'undefined' || !window.jspdf) return aviso('A biblioteca de PDF não carregou. Recarregue a página.');
        const op = {};
        ['capa', 'curso', 'professor', 'sala', 'relacao', 'disciplinas', 'conflitos', 'calendario', 'vazios'].forEach((k) => { op[k] = $(`#pdf-${k}`).checked; });
        try {
            const doc = GeradorPDF.gerar(D, op);
            doc.save(nomeArquivo('pdf'));
            aviso('PDF gerado nos downloads.');
        } catch (err) { console.error(err); aviso('Não consegui gerar o PDF: ' + esc(err.message)); }
    }

    // expõe para os testes no navegador
    window.GeradorApp = { dados: () => D, ui, aleatorizar, soltarEm, selecionar, irPara, podeEditarAloc: (i) => podeEditarAloc(i) };

    irPara(location.hash.slice(1) || 'inicio');
})();
