/**
 * © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * NUVEM (MEGA) — mesma ideia dos outros apps: a conta MEGA é do grupo (ex.: da coordenação ou da direção da unidade);
 * só quem tem o e-mail e a senha entra; nada fica público (nunca se cria link). O MEGA criptografa tudo no navegador.
 * A senha é guardada pelo gerenciador de senhas do navegador (não por este sistema).
 *
 * Pastas na conta:
 *   GeradorDeHorarios/<ano>-<semestre do ano>/<unidade>/<curso>/<curso>-<AAAA-MM-DD_HHhMM>.json
 *   GeradorDeHorarios/<ano>-<semestre do ano>/<unidade>/_unidade/unidade-<unidade>-<data>.json   (salas, professores, cursos)
 * Dados individuais dos professores (senha, planos de ensino, RAAD) NUNCA vão para o MEGA: só por download.
 * Cada salvamento é uma versão nova (só o curso, sem as grades dos outros). Para os bloqueios entre cursos, o app lê a
 * versão mais nova de cada outro curso do mesmo período (de todas as unidades: as salas são de todos).
 *
 * Biblioteca: megajs 1.3 (cliente JavaScript do MEGA, código aberto, licença MIT), cópia local em js/vendor/megajs.mjs (o import é relativo a este arquivo),
 * carregada só quando a nuvem é usada.
 */

'use strict';

const Nuvem = (() => {
    const RAIZ = 'GeradorDeHorarios';
    const estado = { mega: null, storage: null, email: '', conectando: null, simulado: null };

    const nomeSeguro = (t) => String(t || 'sem-nome').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .-]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'sem-nome';
    const carimbo = (d = new Date()) => { const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}h${z(d.getMinutes())}`; };
    const filhos = (p) => (p && p.children) || [];

    async function carregarMega() {
        if (estado.simulado) return estado.simulado;
        if (estado.mega) return estado.mega;
        let erro = null;
        for (const u of ['./vendor/megajs.mjs', 'https://cdn.jsdelivr.net/npm/megajs@1/dist/main.browser-es.mjs']) {
            try { const m = await import(u); if (m && m.Storage) { estado.mega = m; return m; } } catch (e) { erro = e; }
        }
        throw new Error('Não consegui carregar o acesso ao MEGA (sem internet ou bloqueado pela rede). ' + (erro ? erro.message : ''));
    }

    async function entrar(email, senha) {
        const mega = await carregarMega();
        const st = new mega.Storage({ email, password: senha, userAgent: 'GeradorDeHorarios/1.0', keepalive: false });
        try { await st.ready; } catch (e) {
            throw new Error(/EBLOCKED|ENOENT|EKEY|-9|-16|password|senha/i.test(String(e && e.message)) ? 'E-mail ou senha do MEGA não conferem.' : 'O MEGA recusou a entrada: ' + ((e && e.message) || e));
        }
        estado.storage = st; estado.email = email;
        try { localStorage.setItem('gh_nuvem_email', email); } catch (e) { /* ok */ }
        return st;
    }
    function sair() {
        try { if (estado.storage && estado.storage.close) estado.storage.close(); } catch (e) { /* ok */ }
        estado.storage = null; estado.email = '';
        try { if (navigator.credentials && navigator.credentials.preventSilentAccess) navigator.credentials.preventSilentAccess().catch(() => {}); } catch (e) { /* ok */ }
    }
    const conectado = () => !!estado.storage;
    const emailLembrado = () => { try { return localStorage.getItem('gh_nuvem_email') || ''; } catch (e) { return ''; } };

    async function senhaDoNavegador() {
        try {
            if (!window.PasswordCredential || !navigator.credentials) return null;
            const c = await navigator.credentials.get({ password: true, mediation: 'optional' });
            return c && c.password ? { email: c.id, senha: c.password } : null;
        } catch (e) { return null; }
    }
    async function guardarNoNavegador(email, senha) {
        try { if (window.PasswordCredential && navigator.credentials) await navigator.credentials.store(new PasswordCredential({ id: email, password: senha, name: 'MEGA (Gerador de Horários)' })); } catch (e) { /* o navegador oferece pelo formulário */ }
    }

    /** Janela de entrada (e-mail e senha da conta MEGA do grupo). */
    function pedirSenha() {
        return new Promise((resolve, reject) => {
            const dlg = document.createElement('dialog');
            dlg.className = 'janela';
            dlg.innerHTML = `<form method="dialog" autocomplete="on">
                <div class="janela-topo"><h2>☁️ Entrar no MEGA</h2><button type="button" data-fechar aria-label="Fechar">×</button></div>
                <div class="janela-corpo">
                    <p class="muted">Use a conta MEGA do grupo (a mesma para todos os cursos que vão dividir professores e salas).
                    Nada fica público. O navegador pode guardar a senha.</p>
                    <div class="campos"><label class="campo"><span>E-mail do MEGA</span><input type="email" name="email" autocomplete="username" required value="${(emailLembrado() || '').replace(/"/g, '&quot;')}"></label>
                    <label class="campo"><span>Senha</span><input type="password" name="senha" autocomplete="current-password" required></label></div>
                    <p class="muted" data-erro style="color:var(--perigo)"></p>
                </div>
                <div class="janela-rodape"><button type="button" class="btn btn-secondary" data-fechar>Cancelar</button><button type="submit" class="btn btn-primary">Entrar</button></div></form>`;
            document.body.appendChild(dlg);
            const fechar = (erro) => { dlg.close(); dlg.remove(); if (erro) reject(erro); };
            dlg.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => fechar(new Error('cancelado'))));
            dlg.querySelector('form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = dlg.querySelector('[name=email]').value.trim(), senha = dlg.querySelector('[name=senha]').value;
                const btn = dlg.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Entrando…';
                try { const st = await entrar(email, senha); await guardarNoNavegador(email, senha); dlg.close(); dlg.remove(); resolve(st); } catch (err) {
                    dlg.querySelector('[data-erro]').textContent = err.message; btn.disabled = false; btn.textContent = 'Entrar';
                }
            });
            dlg.showModal();
            (dlg.querySelector('[name=email]').value ? dlg.querySelector('[name=senha]') : dlg.querySelector('[name=email]')).focus();
        });
    }

    async function garantir() {
        if (estado.storage) return estado.storage;
        if (estado.conectando) return estado.conectando;
        estado.conectando = (async () => {
            const g = await senhaDoNavegador();
            if (g) { try { return await entrar(g.email, g.senha); } catch (e) { /* senha mudou: pergunta */ } }
            return pedirSenha();
        })();
        try { return await estado.conectando; } finally { estado.conectando = null; }
    }

    async function pasta(mae, nome) {
        const ja = filhos(mae).find((f) => f.directory && f.name === nome);
        return ja || mae.mkdir(nome);
    }
    async function pastaPeriodo(dados) {
        const st = await garantir();
        const raiz = await pasta(st.root, RAIZ);
        return pasta(raiz, `${dados.config.ano}-${dados.config.metade}`);
    }
    async function baixarJson(arquivo) {
        const buf = await arquivo.downloadBuffer();
        return JSON.parse(new TextDecoder('utf-8').decode(buf));
    }

    /** Salva uma versão nova da grade deste curso (só o curso). Devolve o caminho. */
    async function salvar(dados, exportar) {
        const curso = dados.cursos[0];
        if (!curso) throw new Error('Cadastre o curso antes de salvar.');
        const per = await pastaPeriodo(dados);
        const uni = await pasta(per, nomeSeguro((dados.config.unidade || {}).nome || 'Unidade'));
        const dir = await pasta(uni, nomeSeguro(curso.nome));
        const nome = `${nomeSeguro(curso.nome)}-${carimbo()}.json`;
        const bytes = new TextEncoder().encode(JSON.stringify(exportar(dados), null, 1));
        await dir.upload({ name: nome, size: bytes.length }, bytes).complete;
        return `${RAIZ}/${per.name}/${uni.name}/${dir.name}/${nome}`;
    }

    /** Lista os cursos salvos no período (todas as unidades), com as versões da mais nova para a mais velha. */
    async function listar(dados) {
        const per = await pastaPeriodo(dados);
        const r = [];
        filhos(per).filter((u) => u.directory).forEach((u) => filhos(u).filter((c) => c.directory && c.name !== '_unidade').forEach((c) => {
            const versoes = filhos(c).filter((f) => !f.directory && /\.json$/i.test(f.name)).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            if (versoes.length) r.push({ unidade: u.name, curso: c.name, versoes });
        }));
        return r;
    }

    /** Salva os dados da unidade (salas, professores, cursos e calendário; nada individual) em <período>/<unidade>/_unidade/. */
    async function salvarUnidade(dados, exportarUnidade) {
        const per = await pastaPeriodo(dados);
        const uni = await pasta(per, nomeSeguro((dados.config.unidade || {}).nome || 'Unidade'));
        const dir = await pasta(uni, '_unidade');
        const nome = `unidade-${nomeSeguro((dados.config.unidade || {}).nome)}-${carimbo()}.json`;
        const bytes = new TextEncoder().encode(JSON.stringify(exportarUnidade(dados), null, 1));
        await dir.upload({ name: nome, size: bytes.length }, bytes).complete;
        return `${RAIZ}/${per.name}/${uni.name}/_unidade/${nome}`;
    }
    /** Versão mais nova dos dados da unidade no MEGA (ou null). */
    async function abrirUnidade(dados) {
        const per = await pastaPeriodo(dados);
        const uni = filhos(per).find((u) => u.directory && u.name === nomeSeguro((dados.config.unidade || {}).nome || 'Unidade'));
        const dir = uni && filhos(uni).find((x) => x.directory && x.name === '_unidade');
        const arq = dir && filhos(dir).filter((f) => !f.directory && /\.json$/i.test(f.name)).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
        return arq ? baixarJson(arq) : null;
    }

    /** Abre uma versão (arquivo do MEGA) e devolve os dados. */
    const abrir = (arquivo) => baixarJson(arquivo);

    /** Versão mais nova de cada outro curso do período (para os bloqueios). Devolve [{dados, unidade, curso, quando}]. */
    async function outrosCursos(dados) {
        const meu = nomeSeguro((dados.cursos[0] || {}).nome);
        const minhaUni = nomeSeguro((dados.config.unidade || {}).nome);
        const lista = (await listar(dados)).filter((x) => !(x.curso === meu && x.unidade === minhaUni));
        const r = [];
        for (const x of lista) {
            try { r.push({ dados: await baixarJson(x.versoes[0]), unidade: x.unidade, curso: x.curso, quando: x.versoes[0].timestamp ? new Date(x.versoes[0].timestamp * 1000) : null }); } catch (e) { /* arquivo ruim: pula */ }
        }
        return r;
    }

    return { estado, nomeSeguro, carimbo, conectado, emailLembrado, entrar, sair, garantir, salvar, listar, abrir, outrosCursos, salvarUnidade, abrirUnidade };
})();

if (typeof module !== 'undefined') module.exports = Nuvem;
