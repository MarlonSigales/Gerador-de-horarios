/* © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE). */
/* Leitor das páginas públicas do portal institucional da UFPel (cursos e disciplinas). Só usa a API do DOM, então
   roda no robô de atualização (Node + linkedom) e no navegador. Nomes de alunos NUNCA são guardados: só contagens. */
const UfpelLeitor = (() => {
    const BASE = 'https://institucional.ufpel.edu.br';
    const BLOCO = /^(P|DIV|LI|UL|OL|H[1-6]|TR|TABLE|TBODY|SECTION|ARTICLE|BLOCKQUOTE)$/;

    /** Texto com quebras de linha (BR e blocos viram \n), sem espaços sobrando. */
    function texto(no) {
        let s = '';
        (function ir(n) {
            if (n.nodeType === 3) { s += n.nodeValue; return; }
            if (n.nodeType !== 1) return;
            if (n.tagName === 'BR') { s += '\n'; return; }
            if (/^(SCRIPT|STYLE)$/.test(n.tagName)) return;
            const b = BLOCO.test(n.tagName);
            if (b) s += '\n';
            for (const f of n.childNodes) ir(f);
            if (b) s += '\n';
        })(no);
        return s.replace(/[ \t ]+/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
    }
    const linha = (no) => (no ? no.textContent.replace(/\s+/g, ' ').trim() : '');
    const num = (s) => { const n = parseInt(String(s).replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : 0; };

    /** Pares rótulo → valor das fichas (.ficha-label seguido de .ficha-campo). */
    function ficha(doc) {
        const f = {};
        for (const l of doc.querySelectorAll('.ficha-label')) {
            const c = l.nextElementSibling;
            if (!c || !/ficha-campo/.test(c.className || '')) continue;
            const k = linha(l).toUpperCase();
            if (!(k in f)) f[k] = c;
        }
        return f;
    }

    /** Seções "h3 + irmãos até o próximo h3" do conteúdo principal. */
    function secoes(doc) {
        const raiz = doc.querySelector('.conteudo-principal') || doc.body;
        const out = {};
        for (const h of raiz.querySelectorAll('h3')) {
            const nome = linha(h);
            if (!nome || nome in out) continue;
            const partes = [];
            for (let s = h.nextElementSibling; s && s.tagName !== 'H3'; s = s.nextElementSibling) partes.push(s);
            out[nome] = partes;
        }
        return out;
    }
    const textoDe = (partes) => (partes || []).filter((p) => p.tagName !== 'TABLE').map(texto).filter(Boolean).join('\n');

    const DIAS = { DOM: 0, SEG: 1, TER: 2, QUA: 3, QUI: 4, SEX: 5, SAB: 6, 'SÁB': 6 };
    /** Horários de uma grade (td por turno; span.grade-horarios-dia marca o dia, seguido de "hh:mm - hh:mm"). */
    function horarios(grade) {
        const out = [];
        if (!grade) return out;
        for (const td of grade.querySelectorAll('td')) {
            let dia = null;
            for (const n of td.childNodes) {
                if (n.nodeType === 1 && /grade-horarios-dia/.test(n.className || '')) { const d = linha(n).toUpperCase(); if (d) dia = d; continue; }
                const m = (n.nodeType === 3 ? n.nodeValue : '').match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
                if (m && dia) out.push({ dia: DIAS[dia] !== undefined ? DIAS[dia] : dia, ini: m[1].padStart(5, '0'), fim: m[2].padStart(5, '0') });
            }
        }
        return out;
    }

    /** Página de disciplina: /disciplinas/cod/<codigo>. */
    function disciplina(doc) {
        const f = ficha(doc), s = secoes(doc);
        const v = (k) => (f[k] ? linha(f[k]) : '');
        const bib = s['Bibliografia'] || [];
        const bibTxt = textoDe(bib);
        const iB = bibTxt.search(/Bibliografia B[áa]sica:?/i), iC = bibTxt.search(/Bibliografia Complementar:?/i);
        const corta = (a, b) => (a < 0 ? '' : bibTxt.slice(a, b < 0 || b < a ? undefined : b).replace(/^Bibliografia (B[áa]sica|Complementar):?\s*/i, '').trim());
        const turmas = [];
        const tTurmas = (s['Turmas Ofertadas'] || []).map((p) => (p.tagName === 'TABLE' ? p : p.querySelector && p.querySelector('table.tabela-dados'))).find(Boolean);
        if (tTurmas) {
            for (const tr of tTurmas.querySelectorAll('tr')) {
                const c = [...tr.children].filter((x) => x.tagName === 'TD');
                if (c.length < 6) continue;
                const cursos = [...c[4].querySelectorAll('a')].filter((a) => !a.closest('.tooltip')).map(linha).filter(Boolean);
                const profs = [];
                for (const a of c[5].querySelectorAll('a')) {
                    const nome = linha(a); if (!nome) continue;
                    let papel = '';
                    for (let x = a.nextElementSibling; x && x.tagName !== 'A'; x = x.nextElementSibling) if (/ficha-label/.test(x.className || '')) { papel = linha(x); break; }
                    profs.push({ nome, responsavel: /respons/i.test(papel), papel });
                }
                turmas.push({ turma: linha(c[0]), periodo: linha(c[1]).replace(/\s+/g, ''), vagas: num(linha(c[2])), matriculados: num(linha(c[3])),
                    cursos, horarios: horarios(c[4].querySelector('table.grade-horarios')), professores: profs });
            }
        }
        const equivalentes = [];
        const tEq = (s['Disciplinas Equivalentes'] || []).map((p) => (p.tagName === 'TABLE' ? p : p.querySelector && p.querySelector('table'))).find(Boolean);
        if (tEq) for (const tr of tEq.querySelectorAll('tr')) {
            const c = [...tr.children].filter((x) => x.tagName === 'TD');
            if (c.length >= 1) {
                const t = linha(c[0]); const m = t.match(/^(\d{5,9})\s*-?\s*(.*)$/);
                const a = c[0].querySelector('a'); const h = a ? (a.getAttribute('href') || '').match(/\/disciplinas\/(id|cod)\/(\d+)/) : null;
                equivalentes.push({ codigo: m ? m[1] : h && h[1] === 'cod' ? h[2] : '', id: h && h[1] === 'id' ? h[2] : '', nome: m ? m[2] : t, curso: c[1] ? linha(c[1]) : '' });
            }
        }
        return {
            codigo: v('CÓDIGO'), nome: v('NOME DA ATIVIDADE'), cargaHoraria: num(v('CARGA HORÁRIA')), creditos: num(v('CRÉDITOS')),
            cargaTeorica: num(v('CARGA HORÁRIA TEÓRICA')), cargaPratica: num(v('CARGA HORÁRIA PRÁTICA')), tipo: v('TIPO DE ATIVIDADE'),
            modalidade: v('MODALIDADE'), unidade: v('UNIDADE RESPONSÁVEL'), frequencia: v('FREQUÊNCIA APROVAÇÃO'), notaAprovacao: v('NOTA MÉDIA APROVAÇÃO'),
            ementa: textoDe(s['Ementa']), objetivos: textoDe(s['Objetivos']), conteudo: textoDe(s['Conteúdo Programático']),
            bibliografiaBasica: corta(iB, iC), bibliografiaComplementar: corta(iC, -1), turmas, equivalentes
        };
    }

    /** Página de curso: /cursos/cod/<cod>. Só contagens de alunos e egressos (sem nomes). */
    function curso(doc) {
        const f = ficha(doc);
        const v = (k) => { const c = Object.keys(f).find((x) => x.startsWith(k)); return c ? linha(f[c]) : ''; };
        const conceitos = {};
        for (const s of doc.querySelectorAll('.curso-conceito')) {
            const m = linha(s.querySelector('.curso-conceito-nome')).match(/^(.+?)\s*\((\d{4})\)/);
            if (m) conceitos[m[1]] = { ano: +m[2], valor: linha(s.querySelector('.curso-conceito-nota')) };
        }
        const vagas = [];
        const lv = [...doc.querySelectorAll('.ficha-label')].find((l) => /^Vagas/i.test(linha(l)));
        const tabsVagas = [];
        if (lv) for (let x = lv.nextElementSibling; x && !/ficha-label/.test(x.className || ''); x = x.nextElementSibling) {
            if (x.tagName === 'TABLE') tabsVagas.push(x); else if (x.querySelectorAll) tabsVagas.push(...x.querySelectorAll('table'));
        }
        for (const t of tabsVagas) {
            const linhas = [...t.querySelectorAll('tr')].map((tr) => [...tr.children].map(linha));
            const cab = linhas[0] || [];
            const iT = cab.findIndex((x) => /^Total$/i.test(x));
            for (const l of linhas.slice(1)) if (l[0]) vagas.push({ forma: l[0], total: num(l[iT >= 0 ? iT : l.length - 1]) });
        }
        const linhasDe = (id) => { const t = doc.getElementById(id); return t ? [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.children].filter((x) => x.tagName === 'TD')).filter((c) => c.length) : []; };
        const conta = (pares) => pares.reduce((o, k) => { if (k) o[k] = (o[k] || 0) + 1; return o; }, {});
        const al = linhasDe('alunos'), eg = linhasDe('egressos');
        const professores = linhasDe('professores').map((c) => ({ nome: linha(c[0].querySelector('.p-name') || c[0]), unidade: linha(c[0].querySelector('.tabela-detalhe-info')) })).filter((p) => p.nome);
        const matriz = [];
        const cur = doc.getElementById('curriculo');
        if (cur) for (const ac of cur.querySelectorAll('.accordion')) {
            const tit = linha(ac.querySelector('h3'));
            const ms = tit.match(/^(\d+)º/); const sem = ms ? ms[1] : /optativ/i.test(tit) ? 'OPT' : 'COMP';
            for (const tr of ac.querySelectorAll('tr')) {
                const c = [...tr.children].filter((x) => x.tagName === 'TD');
                if (c.length < 5) continue;
                matriz.push({ sem, codigo: linha(c[0]), nome: linha(c[1].querySelector('a') || c[1]), carater: linha(c[2]), creditos: num(linha(c[3])), horas: num(linha(c[4])) });
            }
        }
        const pt = linha((doc.getElementById('turmas') || doc.body).querySelector('h3')).match(/(\d{4})\s*\/\s*(\d)/);
        return {
            nome: v('NOME DO CURSO'), grau: v('NÍVEL'), turno: v('TURNO'), codigo: num(v('CÓDIGO UFPEL')), emec: v('CÓDIGO E-MEC'), unidade: v('UNIDADE'),
            coordenador: v('COORDENADOR'), conceitos, vagas, vagasTotal: vagas.reduce((s, x) => s + x.total, 0),
            alunos: { total: al.length, porIngresso: conta(al.map((c) => (c[1] ? `${linha(c[1])}/${linha(c[2] || '')}` : ''))) },
            egressos: { total: eg.length, porConclusao: conta(eg.map((c) => linha(c[2] || ''))), porIngresso: conta(eg.map((c) => linha(c[1] || ''))) },
            professores, matriz, periodoTurmas: pt ? `${pt[1]}/${pt[2]}` : ''
        };
    }

    return { BASE, texto, disciplina, curso, horarios };
})();
if (typeof module !== 'undefined') module.exports = UfpelLeitor;
