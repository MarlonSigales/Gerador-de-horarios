/**
 * © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * Interface: navegação, cadastros, grade (aleatorizar e editar com conflitos na hora), arquivo e PDF.
 * As regras e o gerador estão em js/nucleo.js.
 */

'use strict';

/* global Nucleo, Exemplo, GeradorPDF */
(() => {
    const N = Nucleo;
    const CHAVE_LOCAL = 'gerador-horarios-v1';
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];
    const esc = (t) => String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    let D = carregarLocal();
    let historico = [];
    const ui = { pagina: 'inicio', visao: 'curso', item: null, semestre: 1, editando: false, sel: null, ins: null, salaSel: '', destaque: new Set(), novos: [] };

    // ================================================================ armazenamento
    function carregarLocal() {
        try { const t = localStorage.getItem(CHAVE_LOCAL); if (t) return N.normalizar(JSON.parse(t)); } catch (e) { /* sem armazenamento */ }
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
        { id: 'cursos', titulo: 'Cursos', num: 2, conta: () => D.cursos.length },
        { id: 'professores', titulo: 'Professores', num: 3, conta: () => D.professores.length },
        { id: 'salas', titulo: 'Salas e laboratórios', num: 4, conta: () => D.salas.length },
        { id: 'disciplinas', titulo: 'Disciplinas', num: 5, conta: () => D.disciplinas.length },
        { id: 'grade', titulo: 'Grade', num: 6, conta: () => { const c = N.conflitos(D); return c.erros ? { t: `⚠ ${c.erros}`, ruim: true } : (D.grade.alocacoes.length ? '✓' : ''); } },
        { id: 'pdf', titulo: 'PDF', num: 7 }
    ];
    const DESCR = {
        config: 'Ano, metade do ano, dias e horários das aulas.',
        cursos: 'Semestres e horários de oferta e de reoferta.',
        professores: 'Quem dá aula e quando não pode.',
        salas: 'Salas comuns e laboratórios com responsáveis.',
        disciplinas: 'Professor, aulas, cursos, salas e horários fixos.',
        grade: 'Aleatorizar, editar e ver conflitos.',
        pdf: 'Grades por curso, professor e sala.'
    };

    function renderMenu() {
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
        $('#topbar-projeto').textContent = `${D.config.titulo} · ${D.config.ano}/${D.config.metade}`;
        $('#inicio-resumo').textContent = `${D.cursos.length} cursos · ${D.professores.length} professores · ${D.salas.length} salas · ${D.disciplinas.length} disciplinas`;
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
        if (ui.pagina === 'cursos') renderLista('curso');
        if (ui.pagina === 'professores') renderLista('professor');
        if (ui.pagina === 'salas') renderLista('sala');
        if (ui.pagina === 'disciplinas') renderLista('disciplina');
        if (ui.pagina === 'grade') renderGradePagina();
        if (ui.pagina === 'pdf') renderPdfInfo();
    }

    // ================================================================ configuração
    function renderConfig() {
        const c = D.config;
        $('#cfg-titulo').value = c.titulo || '';
        $('#cfg-ano').value = c.ano;
        $('#cfg-metade').value = String(c.metade);
        $('#cfg-dias').innerHTML = N.DIAS_SEMANA.map((d) => `<label><input type="checkbox" value="${esc(d)}"${c.dias.includes(d) ? ' checked' : ''}> ${esc(d)}</label>`).join('');
        $('#cfg-horarios').value = c.horarios.map((h) => `${h.ini}-${h.fim}`).join('\n');
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
        const nova = { titulo: $('#cfg-titulo').value.trim() || 'Grade horária', ano: Number($('#cfg-ano').value) || D.config.ano, metade: Number($('#cfg-metade').value) === 2 ? 2 : 1, dias, horarios };
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
            <div class="seletor-wrap"><table class="seletor${opcoes.vermelho ? ' seletor-vermelho' : ''}"><thead><tr><th></th>${cfg.dias.map((d, i) => `<th data-dia="${i}">${esc(d.slice(0, 3))}</th>`).join('')}</tr></thead>
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
    function abrirJanela(titulo, corpo, aoSalvar, aoAbrir) {
        const dlg = $('#janela');
        dlg.innerHTML = `<form method="dialog" novalidate><div class="janela-topo"><h2>${esc(titulo)}</h2><button type="button" data-fechar aria-label="Fechar">×</button></div>
            <div class="janela-corpo">${corpo}</div>
            <div class="janela-rodape"><button type="button" class="btn btn-secondary" data-fechar>Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div></form>`;
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
            <fieldset><legend>Horários de funcionamento para as REOFERTAS</legend><div id="sel-reoferta"></div><small>Nada marcado = sem restrição.</small></fieldset>`,
        (dlg, ctx) => {
            const nome = val(dlg, 'nome'); if (!nome) { aviso('Informe o nome do curso.'); return false; }
            const novo = { id: c.id || N.novoId('c'), nome, semestres: Math.max(1, Number(val(dlg, 'semestres')) || 10), oferta: ctx.of.valor(), reoferta: ctx.re.valor() };
            if (c.id) Object.assign(D.cursos.find((x) => x.id === c.id), novo); else D.cursos.push(novo);
            return true;
        }, (dlg) => ({ of: montarSeletor($('#sel-oferta', dlg), c.oferta), re: montarSeletor($('#sel-reoferta', dlg), c.reoferta) }));
    }
    // ---------- professor
    function formProfessor(id) {
        const p = D.professores.find((x) => x.id === id) || { id: null, nome: '', email: '', indisp: [] };
        abrirJanela(p.id ? `Professor: ${p.nome}` : 'Novo professor', `
            <div class="campos"><label class="campo"><span>Nome completo</span><input type="text" name="nome" value="${esc(p.nome)}" required></label>
            <label class="campo"><span>E-mail (opcional)</span><input type="email" name="email" value="${esc(p.email)}"></label></div>
            <fieldset><legend>Horários em que NÃO pode dar aula</legend><div id="sel-indisp"></div></fieldset>`,
        (dlg, ctx) => {
            const nome = val(dlg, 'nome'); if (!nome) { aviso('Informe o nome.'); return false; }
            const novo = { id: p.id || N.novoId('p'), nome, email: val(dlg, 'email'), indisp: ctx.s.valor() };
            if (p.id) Object.assign(D.professores.find((x) => x.id === p.id), novo); else D.professores.push(novo);
            return true;
        }, (dlg) => ({ s: montarSeletor($('#sel-indisp', dlg), p.indisp, { vermelho: true }) }));
    }
    // ---------- sala
    function formSala(id) {
        const s = D.salas.find((x) => x.id === id) || { id: null, nome: '', tipo: 'sala', capacidade: 40, responsaveis: [], politica: 'todos', autorizados: [], indisp: [] };
        abrirJanela(s.id ? s.nome : 'Nova sala ou laboratório', `
            <div class="campos"><label class="campo"><span>Nome</span><input type="text" name="nome" value="${esc(s.nome)}" required></label>
            <label class="campo"><span>Tipo</span><select name="tipo"><option value="sala"${s.tipo === 'sala' ? ' selected' : ''}>Sala de aula</option><option value="laboratorio"${s.tipo === 'laboratorio' ? ' selected' : ''}>Laboratório</option></select>
                <small>Laboratório só recebe as disciplinas que o pedem; sala comum recebe qualquer uma.</small></label>
            <label class="campo"><span>Capacidade (alunos)</span><input type="number" name="capacidade" min="0" value="${s.capacidade}"></label></div>
            <fieldset><legend>Professor(es) responsável(is)</legend>${checks('resp', D.professores, s.responsaveis)}<small>Têm prioridade nas aulas deste espaço.</small></fieldset>
            <fieldset><legend>Aulas de outros professores (decisão dos responsáveis)</legend>
                <select name="politica">${Object.entries(N.POLITICA).map(([k, v]) => `<option value="${k}"${s.politica === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>
                <div id="bloco-aut" style="margin-top:.5rem"><small>Professores autorizados:</small>${checks('aut', D.professores, s.autorizados)}</div></fieldset>
            <fieldset><legend>Horários em que NÃO pode ser usada</legend><div id="sel-indisp"></div></fieldset>`,
        (dlg, ctx) => {
            const nome = val(dlg, 'nome'); if (!nome) { aviso('Informe o nome.'); return false; }
            const novo = { id: s.id || N.novoId('s'), nome, tipo: val(dlg, 'tipo'), capacidade: Number(val(dlg, 'capacidade')) || 0, responsaveis: marcados(dlg, 'resp'),
                politica: val(dlg, 'politica'), autorizados: marcados(dlg, 'aut'), indisp: ctx.s.valor() };
            if (s.id) Object.assign(D.salas.find((x) => x.id === s.id), novo); else D.salas.push(novo);
            return true;
        }, (dlg) => {
            const pol = $('[name=politica]', dlg), mostra = () => { $('#bloco-aut', dlg).hidden = pol.value !== 'autorizados'; };
            pol.addEventListener('change', mostra); mostra();
            return { s: montarSeletor($('#sel-indisp', dlg), s.indisp, { vermelho: true }) };
        });
    }
    // ---------- disciplina
    function formDisciplina(id) {
        const q = D.disciplinas.find((x) => x.id === id) || { id: null, codigo: '', nome: '', professor: '', aulas: 4, blocos: '', salas: [], fixos: [], equivalentes: [], ofertas: [] };
        const linhaOferta = (o) => `<div class="linha-oferta">
            <select name="of-curso">${D.cursos.map((c) => `<option value="${esc(c.id)}"${o.curso === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
            <input type="number" name="of-sem" min="1" max="20" value="${o.semestre || 1}" title="Semestre">
            <select name="of-car">${Object.entries(N.CARATER).map(([k, v]) => `<option value="${k}"${o.carater === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
            <span class="etiqueta" data-sit></span>
            <button type="button" class="btn btn-secondary btn-sm" data-tira title="Tirar este curso">×</button></div>`;
        abrirJanela(q.id ? N.nomeDisc(q) : 'Nova disciplina', `
            <div class="campos"><label class="campo"><span>Código</span><input type="text" name="codigo" value="${esc(q.codigo)}"></label>
            <label class="campo" style="grid-column: span 2"><span>Nome</span><input type="text" name="nome" value="${esc(q.nome)}" required></label>
            <label class="campo"><span>Professor responsável</span><select name="professor"><option value="">— escolha —</option>${D.professores.map((p) => `<option value="${esc(p.id)}"${q.professor === p.id ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
            <label class="campo"><span>Aulas por semana</span><input type="number" name="aulas" min="0" max="30" value="${q.aulas}"></label>
            <label class="campo"><span>Blocos de aulas seguidas</span><input type="text" name="blocos" value="${esc(q.blocos)}" placeholder="automático"><small>Ex.: 2+2 ou 3. Vazio: até 3 juntas; acima, blocos de 2.</small></label></div>
            <fieldset><legend>Cursos que usam esta disciplina</legend><div id="ofertas"></div>
                <button type="button" class="btn btn-secondary btn-sm" data-add-oferta${D.cursos.length ? '' : ' disabled'}>+ Curso</button>
                <small class="muted"> Na metade ${D.config.metade} os semestres ${D.config.metade === 1 ? 'ímpares' : 'pares'} são oferta e os demais são reoferta.</small></fieldset>
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
            const novo = { id: novoId, codigo: val(dlg, 'codigo'), nome, professor: val(dlg, 'professor'), aulas: Number(val(dlg, 'aulas')) || 0, blocos: val(dlg, 'blocos'),
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
                const sit = N.situacao($('[name=of-sem]', l).value, D.config.metade);
                const et = $('[data-sit]', l); et.textContent = sit; et.className = `etiqueta ${sit}`;
            });
            caixa.innerHTML = q.ofertas.map(linhaOferta).join('');
            $('[data-add-oferta]', dlg).addEventListener('click', () => { caixa.insertAdjacentHTML('beforeend', linhaOferta({ curso: (D.cursos[0] || {}).id, semestre: 1, carater: 'obrigatoria' })); atualiza(); });
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
                <td>${D.disciplinas.filter((q) => q.professor === p.id).map((q) => `<span class="etiqueta" title="${esc(q.nome)}">${esc(q.codigo || q.nome)}</span>`).join('') || '<small>—</small>'}</td>
                <td>${D.salas.filter((s) => s.responsaveis.includes(p.id)).map((s) => `<span class="etiqueta lab">${esc(s.nome)}</span>`).join('') || '<small>—</small>'}</td>
                <td>${p.indisp.length ? `${p.indisp.length} horários` : '<small>—</small>'}</td>${acoes(p.id)}</tr>`).join('')}</tbody></table>` : '';
        } else if (tipo === 'sala') {
            html = D.salas.length ? `<table class="lista"><thead><tr><th>Sala ou laboratório</th><th>Tipo</th><th>Cap.</th><th>Responsáveis</th><th>Outros professores</th><th>Não pode</th><th></th></tr></thead><tbody>${D.salas.map((s) => `<tr>
                <td><b>${esc(s.nome)}</b></td><td>${s.tipo === 'laboratorio' ? '<span class="etiqueta lab">laboratório</span>' : 'sala'}</td><td>${s.capacidade || '—'}</td>
                <td>${s.responsaveis.map(nomeP).map(esc).join(', ') || '<small>—</small>'}</td>
                <td><small>${esc(N.POLITICA[s.politica])}${s.politica === 'autorizados' && s.autorizados.length ? ': ' + s.autorizados.map(nomeP).map(esc).join(', ') : ''}</small></td>
                <td>${s.indisp.length ? `${s.indisp.length} horários` : '<small>—</small>'}</td>${acoes(s.id)}</tr>`).join('')}</tbody></table>` : '';
        } else {
            const f = ($('#filtro-disc').value || '').toLowerCase();
            const lista = D.disciplinas.filter((q) => !f || [q.codigo, q.nome, nomeP(q.professor), ...q.ofertas.map((o) => N.nomeDe(D.cursos, o.curso))].join(' ').toLowerCase().includes(f));
            html = lista.length ? `<table class="lista"><thead><tr><th>Código</th><th>Disciplina</th><th>Professor</th><th>Aulas</th><th>Cursos</th><th>Salas</th><th>Restrições</th><th>Horários (código)</th><th></th></tr></thead><tbody>${lista.map((q) => `<tr>
                <td>${esc(q.codigo)}</td><td><b>${esc(q.nome)}</b></td><td>${q.professor ? esc(nomeP(q.professor)) : '<span style="color:var(--perigo)">sem professor</span>'}</td>
                <td>${q.aulas} <small>(${N.blocos(q).join('+') || '—'})</small></td>
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
        if (ui.visao === 'relacao') return [{ id: '*', nome: 'Todos os cursos' }, ...D.cursos];
        if (ui.visao === 'curso') return D.cursos;
        if (ui.visao === 'professor') return D.professores;
        return D.salas;
    }
    function aulaNaVisao(a) {
        const q = D.disciplinas.find((x) => x.id === a.disc);
        if (!q) return false;
        if (ui.visao === 'curso') return q.ofertas.some((o) => o.curso === ui.item && Number(o.semestre) === Number(ui.semestre));
        if (ui.visao === 'professor') return q.professor === ui.item;
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

    function renderGradePagina() {
        const c = N.conflitos(D);
        const total = D.disciplinas.reduce((s, q) => s + (Number(q.aulas) || 0), 0);
        const falt = N.faltando(D).reduce((s, x) => s + x.faltam, 0);
        $('#grade-resumo').innerHTML = `<span class="selo"><b>${D.grade.alocacoes.length}</b> de ${total} aulas na grade</span>
            <span class="selo ${c.erros ? 'erro' : 'ok'}"><b>${c.erros}</b> conflito${c.erros === 1 ? '' : 's'}</span>
            ${c.avisos ? `<span class="selo aviso"><b>${c.avisos}</b> aviso${c.avisos === 1 ? '' : 's'}</span>` : ''}
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
            const erro = cs.some((x) => x.gravidade === 'erro'), avis = cs.length && !erro;
            const turmas = discs.flatMap((x) => x.ofertas.map((o) => `${N.sigla(N.nomeDe(D.cursos, o.curso))} ${o.semestre}º`));
            const prof = N.nomeDe(D.professores, q.professor) || 'sem professor';
            const sala = N.nomeDe(D.salas, a.sala);
            const linha2 = ui.visao === 'curso' ? `${prof.split(' ')[0]} · ${sala}` : ui.visao === 'professor' ? `${sala} · ${turmas.join(', ')}` : `${prof.split(' ')[0]} · ${turmas.join(', ')}`;
            const ofertaCurso = ui.visao === 'curso' ? q.ofertas.find((o) => o.curso === ui.item && Number(o.semestre) === Number(ui.semestre)) : null;
            const sit = sitVisao || (q.ofertas.length && q.ofertas.every((o) => N.situacao(o.semestre, cfg.metade) === 'reoferta') ? 'reoferta' : 'oferta');
            const titulo = [discs.map((x) => N.nomeDisc(x)).join(' / ') + (discs.length > 1 ? ' (equivalentes)' : ''), `Professor: ${prof}`, `Sala: ${sala}`, `Turmas: ${turmas.join(', ')}`, `Horários (código): ${N.codigosDisciplina(D, q.id)}`,
                a.travada ? 'Travada (o Aleatorizar não mexe)' : '', ...cs.map((x) => `${x.gravidade === 'erro' ? '⚠' : '•'} ${x.msg}`)].filter(Boolean).join('\n');
            const sel = ui.sel && indices.some((i) => ui.sel.includes(i));
            return `<div class="aula ${sit}${ofertaCurso && ofertaCurso.carater !== 'obrigatoria' ? ' optativa' : ''}${erro ? ' conflito-erro' : ''}${avis ? ' conflito-aviso' : ''}${sel ? ' selecionada' : ''}${indices.some((i) => ui.destaque.has(i)) ? ' piscar' : ''}"
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
                return `<td data-d="${i}" data-h="${j}" class="${celulaFechada(k) ? 'fechado' : ''}">${Object.values(grupos).map(chip).join('')}</td>`;
            }).join('')}</tr>`).join('')}</tbody></table>`;
        $('#legenda').innerHTML = `<span><i style="background:var(--verde-claro);border-left:4px solid var(--verde)"></i>oferta</span>
            <span><i style="background:#fffaf0;border-left:4px solid var(--amarelo)"></i>reoferta</span>
            <span><i style="background:#fdecea;border-color:var(--perigo)"></i>conflito (passe o mouse para ver)</span>
            <span><i style="background:repeating-linear-gradient(45deg,#f6f8f8,#f6f8f8 3px,#e3e9e8 3px,#e3e9e8 6px)"></i>${{ curso: 'fora do funcionamento do curso', professor: 'professor indisponível', sala: 'sala indisponível' }[ui.visao]}</span>
            <span>🔒 travada (o Aleatorizar mantém)</span>
            ${ui.editando ? '<span><b>Editando:</b> clique (ou arraste) uma aula e depois a célula de destino. Verde = sem conflito, amarelo = aviso, vermelho = conflito.</span>' : ''}`;
        ui.destaque = new Set();
        pintarAlvos();
    }

    /** Relação de disciplinas e professores com os códigos de horário (sem grade). */
    function renderRelacao() {
        const linhas = N.relacao(D, ui.item === '*' ? '' : ui.item);
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
                    <td>${esc(l.professor) || '<span style="color:var(--perigo)">sem professor</span>'}</td><td>${esc(l.salas) || '—'}</td>
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
        tds.forEach((td) => { td.classList.remove('alvo-ok', 'alvo-aviso', 'alvo-erro', 'alvo-invalido'); td.removeAttribute('data-alvo'); });
        if (!ui.editando || (!ui.sel && !ui.ins)) return;
        tds.forEach((td) => {
            const d = Number(td.dataset.d), h = Number(td.dataset.h);
            const r = avaliar(d, h);
            if (!r.valido) { td.classList.add('alvo-invalido'); td.title = 'Não cabe aqui (o bloco passaria do fim do turno).'; return; }
            const erro = r.conflitos.some((x) => x.gravidade === 'erro');
            td.classList.add(erro ? 'alvo-erro' : (r.conflitos.length ? 'alvo-aviso' : 'alvo-ok'));
            td.title = r.conflitos.length ? 'Se colocar aqui:\n' + r.conflitos.map((x) => `${x.gravidade === 'erro' ? '⚠' : '•'} ${x.msg}`).join('\n') : 'Sem conflito aqui.';
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
            ? `Movido para ${esc(onde)}. <b>⚠ ${seus.length} conflito${seus.length > 1 ? 's' : ''}:</b><br><small>${seus.slice(0, 3).map((x) => esc(x.msg)).join('<br>')}${seus.length > 3 ? '<br>…veja a lista de conflitos' : ''}</small>`
            : `Movido para ${esc(onde)}, sem conflito. 🔒 Travada para o Aleatorizar.`, seus.length ? 7000 : 3000);
        mudou();
    }

    function renderPainelEdicao() {
        const el = $('#painel-edicao');
        if (!ui.editando) { el.innerHTML = ''; return; }
        if (!ui.sel && !ui.ins) {
            el.innerHTML = '<div class="painel-edicao"><h3>Modo de edição</h3><p class="muted">Clique numa aula (ou arraste) para escolhê-la; depois clique na célula para onde ela vai. As células ficam verdes (sem conflito), amarelas (aviso) ou vermelhas (conflito; passe o mouse para ver o motivo). Mude a visão para ver o mesmo horário pelo professor ou pela sala.</p></div>';
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
            info = `${esc(D.config.dias[a.d])} ${esc(ini.ini)}–${esc(fim.fim)} · ${esc(N.nomeDe(D.professores, discs[0].professor))}`;
            const trav = ui.sel.every((i) => alocs[i].travada);
            botoes = `<button type="button" class="btn btn-secondary btn-sm" data-acao="travar">${trav ? '🔓 Destravar' : '🔒 Travar'}</button>
                <button type="button" class="btn btn-perigo btn-sm" data-acao="remover-bloco">Tirar da grade</button>`;
        } else {
            const q = D.disciplinas.find((x) => x.id === ui.ins.disc);
            titulo = `Colocar: ${N.nomeDisc(q)}`;
            const falta = (N.faltando(D).find((x) => x.disc === q.id) || {}).faltam || 0;
            info = `${esc(N.nomeDe(D.professores, q.professor))} · aulas seguidas: <input type="number" id="ins-n" min="1" max="${falta}" value="${ui.ins.n}" style="width:70px"> de ${falta} que faltam`;
            botoes = '';
        }
        el.innerHTML = `<div class="painel-edicao"><h3>${esc(titulo)}</h3><p class="muted">${info}</p>
            <div class="barra"><label class="campo" style="min-width:240px"><span>Sala para onde vai</span><select id="sala-alvo">${D.salas.map((s) => `<option value="${esc(s.id)}"${s.id === ui.salaSel ? ' selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></label>
            ${botoes}<button type="button" class="btn btn-secondary btn-sm" data-acao="cancelar-sel">Cancelar seleção</button></div>
            <small class="muted">Clique na célula de destino (início do bloco). Trocar a sala aqui e clicar na mesma célula muda só a sala.</small></div>`;
    }

    function renderConflitos(c) {
        const ul = $('#lista-conflitos');
        $('#conflitos-conta').textContent = `${c.erros} erro${c.erros === 1 ? '' : 's'} · ${c.avisos} aviso${c.avisos === 1 ? '' : 's'}`;
        const novosTxt = new Set(ui.novos.map((x) => x.msg));
        const lista = c.lista.slice().sort((a, b) => (novosTxt.has(b.msg) - novosTxt.has(a.msg)) || (a.gravidade === 'erro' ? -1 : 1) - (b.gravidade === 'erro' ? -1 : 1));
        ul.innerHTML = lista.length ? lista.map((x) => `<li class="${x.gravidade}${novosTxt.has(x.msg) ? ' novo' : ''}" data-alocs="${x.alocs.join(',')}" data-tipo="${x.tipo}" title="Clique para ver na grade">${x.gravidade === 'erro' ? '⚠' : '•'} ${esc(x.msg)}</li>`).join('')
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
            return `<tr><td><b>${esc(N.nomeDisc(q))}</b><br><small>${esc(N.nomeDe(D.professores, q.professor))}${motivos[q.id] ? ' — ' + esc(motivos[q.id]) : ''}</small></td>
                <td>${x.faltam} aula${x.faltam > 1 ? 's' : ''}</td>
                <td class="acoes">${ui.editando ? `<button type="button" class="btn btn-secondary btn-sm" data-acao="colocar" data-id="${esc(q.id)}">Colocar</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table>${ui.editando ? '' : '<small class="muted">Entre em ✏️ Editar para colocar à mão (o sistema mostra onde dá conflito).</small>'}`
            : '<p class="vazio">Todas as aulas cadastradas estão na grade.</p>';
    }

    function verConflito(li) {
        const idx = li.dataset.alocs ? li.dataset.alocs.split(',').filter(Boolean).map(Number) : [];
        if (!idx.length) return;
        const a = D.grade.alocacoes[idx[0]], q = D.disciplinas.find((x) => x.id === a.disc);
        const tipo = li.dataset.tipo;
        if (['prof', 'prof-indisp'].includes(tipo) && q.professor) { ui.visao = 'professor'; ui.item = q.professor; }
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
            aviso(sem ? `Grade gerada. <b>${sem} aula(s) sem lugar</b>: veja a lista abaixo da grade e o motivo.` : `Grade gerada: todas as aulas no lugar${c.erros ? `, mas com ${c.erros} conflito(s) das aulas travadas` : ', sem conflito'}.`, 5000);
            mudou();
        }, 30);
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
                case 'editar': ui.editando = !ui.editando; ui.sel = null; ui.ins = null; renderGradePagina(); break;
                case 'desfazer': desfazer(); break;
                case 'destravar-tudo': guardarHistorico(); D.grade.alocacoes.forEach((a) => { a.travada = false; }); mudou(); aviso('Todas as aulas destravadas.'); break;
                case 'limpar-grade':
                    if (confirm('Tirar todas as aulas da grade (inclusive as travadas)? Dá para desfazer.')) { guardarHistorico(); D.grade = { alocacoes: [], naoAlocadas: [], geradaEm: null }; ui.sel = null; mudou(); }
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
                    const bl = N.blocos(q).filter((b) => b <= falta);
                    ui.ins = { disc: id, n: bl.length ? Math.max(...bl) : falta }; ui.sel = null;
                    const perm = N.salasPermitidas(D, q).filter((s) => N.profPodeNaSala(D.salas.find((x) => x.id === s), q.professor));
                    ui.salaSel = perm[0] || (D.salas[0] || {}).id || '';
                    renderGradePagina();
                    $('#painel-edicao').scrollIntoView({ behavior: 'smooth', block: 'start' });
                    aviso('Clique na célula onde a aula vai começar.');
                    break;
                }
                case 'salvar-arquivo': baixar(nomeArquivo('json'), JSON.stringify(D, null, 2), 'application/json'); aviso('Arquivo salvo nos downloads.'); break;
                case 'abrir-arquivo': $('#arquivo-entrada').click(); break;
                case 'novo':
                    if (confirm('Começar do zero? Os dados atuais saem deste navegador (salve o arquivo antes, se quiser guardar).')) { guardarHistorico(); D = N.dadosVazios(); ui.item = null; mudou(); location.hash = '#config'; }
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
            if (chipEl && (!ui.sel && !ui.ins)) { selecionar(Number(chipEl.dataset.i)); return; }
            if (chipEl && ui.sel && ui.sel.includes(Number(chipEl.dataset.i))) {
                // clicar na própria aula: se a sala mudou no painel, aplica; senão, desmarca
                const a = D.grade.alocacoes[ui.sel[0]];
                if (ui.salaSel && ui.salaSel !== a.sala) soltarEm(a.d, Math.min(...ui.sel.map((i) => D.grade.alocacoes[i].h)));
                else cancelarSelecao();
                return;
            }
            if (td && (ui.sel || ui.ins)) soltarEm(Number(td.dataset.d), Number(td.dataset.h));
        }
        const li = e.target.closest('#lista-conflitos li[data-alocs]');
        if (li) verConflito(li);
        if (e.target.closest('.sidebar-toggle')) document.body.classList.toggle('sidebar-aberta');
    });

    document.addEventListener('change', (e) => {
        if (e.target.id === 'visao-item') { ui.item = e.target.value; renderGradePagina(); }
        if (e.target.id === 'visao-semestre') { ui.semestre = Number(e.target.value); renderGradePagina(); }
        if (e.target.id === 'sala-alvo') { ui.salaSel = e.target.value; pintarAlvos(); }
        if (e.target.id === 'ins-n') { ui.ins.n = Math.max(1, Number(e.target.value) || 1); pintarAlvos(); }
        if (e.target.id === 'arquivo-entrada' && e.target.files[0]) {
            const leitor = new FileReader();
            leitor.onload = () => {
                try { guardarHistorico(); D = N.normalizar(JSON.parse(leitor.result)); ui.item = null; mudou(); aviso('Arquivo aberto.'); } catch (err) { aviso('Não consegui ler esse arquivo (precisa ser o .json salvo por este app).'); }
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
        ['capa', 'curso', 'professor', 'sala', 'relacao', 'disciplinas', 'conflitos', 'vazios'].forEach((k) => { op[k] = $(`#pdf-${k}`).checked; });
        try {
            const doc = GeradorPDF.gerar(D, op);
            doc.save(nomeArquivo('pdf'));
            aviso('PDF gerado nos downloads.');
        } catch (err) { console.error(err); aviso('Não consegui gerar o PDF: ' + esc(err.message)); }
    }

    // expõe para os testes no navegador
    window.GeradorApp = { dados: () => D, ui, aleatorizar, soltarEm, selecionar, irPara };

    irPara(location.hash.slice(1) || 'inicio');
})();
