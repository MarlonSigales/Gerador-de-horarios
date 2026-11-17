/**
 * © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * PDF da grade (A4 deitado) com jsPDF + AutoTable (cópias locais em js/vendor, licença MIT).
 * Uma página por grade: cada curso e semestre, cada professor, cada sala; capa, lista de disciplinas e conflitos.
 */

'use strict';

/* global Nucleo, LOGOS_PDF */
const GeradorPDF = (() => {
    const VERDE = [8, 83, 87], VERDE_CLARO = [238, 247, 244], AMARELO_CLARO = [255, 250, 240], VERMELHO_CLARO = [253, 226, 222], CINZA = [95, 111, 109];

    /** As fontes padrão do PDF só têm o alfabeto latino: troca o que não cabe. */
    function txt(s) {
        return String(s === undefined || s === null ? '' : s).replace(/⚠/g, '(!)').replace(/[🔒🔓✓✔]/gu, '')
            .replace(/[^\u0000-ÿ–—‘’“”•…]/gu, '').trim();
    }

    function gerar(D, op = {}) {
        const N = typeof Nucleo !== 'undefined' ? Nucleo : require('./nucleo.js');
        const JsPDF = (typeof window !== 'undefined' && window.jspdf) ? window.jspdf.jsPDF : op.jsPDF;
        const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
        const cfg = D.config, c = N.conflitos(D), eq = N.gruposEquivalentes(D);
        const alocs = D.grade.alocacoes;
        const periodo = `${cfg.ano}/${cfg.metade}`;
        let paginas = 0;

        function novaPagina() { if (paginas++) doc.addPage(); }
        function cabecalho(titulo, subtitulo) {
            let x = 10;
            const alt = 12;
            ['ufpel', 'ceng', 'ea', 'lia'].forEach((k) => {
                const l = typeof LOGOS_PDF !== 'undefined' && LOGOS_PDF[k];
                if (!l) return;
                const w = alt * l.w / l.h;
                try { doc.addImage(l.src, 'PNG', x, 7, w, alt); } catch (e) { /* sem logo */ }
                x += w + 3;
            });
            doc.setTextColor(...VERDE); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
            doc.text(txt(titulo), W - 10, 12, { align: 'right', maxWidth: W - x - 14 });
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...CINZA);
            doc.text(txt(subtitulo || `${cfg.titulo} — ${periodo}`), W - 10, 17.5, { align: 'right', maxWidth: W - x - 14 });
            doc.setDrawColor(168, 225, 86); doc.setLineWidth(0.8); doc.line(10, 21.5, W - 10, 21.5);
            doc.setTextColor(0, 0, 0);
        }

        /** Grade de uma visão: filtro das aulas e texto de cada aula. */
        function grade(filtro, linha2, fechada, sitFixa) {
            const porCel = {};
            alocs.forEach((a, i) => { if (filtro(a)) (porCel[`${a.d}|${a.h}`] = porCel[`${a.d}|${a.h}`] || []).push(i); });
            const marcas = {};
            const body = cfg.horarios.map((h, j) => [`${h.ini}\n${h.fim}`, ...cfg.dias.map((_, d) => {
                const k = `${d}|${j}`;
                const grupos = {};
                (porCel[k] || []).forEach((i) => { const a = alocs[i]; const g = `${eq.grupoDe[a.disc]}|${a.sala}`; (grupos[g] = grupos[g] || []).push(i); });
                const partes = Object.values(grupos).map((ids) => {
                    const discs = [...new Set(ids.map((i) => alocs[i].disc))].map((id) => D.disciplinas.find((x) => x.id === id));
                    const temC = ids.some((i) => (c.porAloc[i] || []).some((x) => x.gravidade === 'erro'));
                    if (temC) marcas[k] = 'erro';
                    else if (!marcas[k] && discs.every((q) => q.ofertas.length && q.ofertas.every((o) => N.situacao(o.semestre, cfg.metade) === 'reoferta'))) marcas[k] = marcas[k] || 'reoferta';
                    return `${temC ? '(!) ' : ''}${discs.map((q) => q.codigo || '').filter(Boolean).join('/')} ${discs[0].nome}\n${linha2(alocs[ids[0]], discs[0], discs)}`;
                });
                if (!partes.length && fechada && fechada(k)) marcas[k] = 'fechado';
                return txt(partes.join('\n'));
            })]);
            const topo = 25;
            const altLinha = Math.min(11, (H - topo - 34) / cfg.horarios.length);
            doc.autoTable({
                startY: topo, margin: { left: 10, right: 10, bottom: 12 },
                head: [['Horário', ...cfg.dias.map(txt)]], body,
                theme: 'grid',
                styles: { fontSize: 6.3, cellPadding: 0.9, valign: 'middle', lineColor: [213, 224, 221], lineWidth: 0.15, minCellHeight: altLinha, overflow: 'linebreak' },
                headStyles: { fillColor: VERDE, textColor: 255, halign: 'center', fontSize: 8 },
                columnStyles: Object.assign({ 0: { cellWidth: 14, halign: 'center', textColor: CINZA, fillColor: [250, 252, 251] } },
                    Object.fromEntries(cfg.dias.map((_, i) => [i + 1, { cellWidth: (W - 34) / cfg.dias.length }]))),
                didParseCell: (h) => {
                    if (h.section !== 'body' || h.column.index === 0) return;
                    const k = `${h.column.index - 1}|${h.row.index}`;
                    const m = marcas[k];
                    if (m === 'erro') { h.cell.styles.fillColor = VERMELHO_CLARO; h.cell.styles.textColor = [120, 20, 15]; }
                    else if (m === 'fechado') h.cell.styles.fillColor = [238, 242, 241];
                    else if (h.cell.raw) h.cell.styles.fillColor = (sitFixa || m) === 'reoferta' ? AMARELO_CLARO : VERDE_CLARO;
                    if (h.row.index > 0 && N.turno(cfg.horarios[h.row.index]) !== N.turno(cfg.horarios[h.row.index - 1])) h.cell.styles.lineWidth = { top: 0.8, bottom: 0.15, left: 0.15, right: 0.15 };
                }
            });
            return Object.keys(porCel).length;
        }
        function legenda(texto) {
            const y = doc.lastAutoTable.finalY + 4;
            if (y > H - 14) return;
            doc.setFontSize(7); doc.setTextColor(...CINZA);
            doc.text(doc.splitTextToSize(txt(texto), W - 20).slice(0, Math.max(1, Math.floor((H - 14 - y) / 3))), 10, y);
            doc.setTextColor(0, 0, 0);
        }
        const nomeP = (id) => N.nomeDe(D.professores, id) || 'sem professor';
        const primeiroNome = (id) => { const n = nomeP(id).split(' '); return n.length > 1 ? `${n[0]} ${n[n.length - 1]}` : n[0]; };
        const turmas = (discs) => discs.flatMap((q) => q.ofertas.map((o) => `${N.sigla(N.nomeDe(D.cursos, o.curso))} ${o.semestre}º`)).join(', ');

        // ---------------- capa
        if (op.capa !== false) {
            novaPagina();
            cabecalho(cfg.titulo, `Período ${periodo}`);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...VERDE);
            doc.text(txt(`${cfg.titulo}`), 10, 38);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
            doc.text(txt(`${cfg.ano} — ${cfg.metade}ª metade do ano: semestres ${cfg.metade === 1 ? 'ímpares' : 'pares'} são OFERTA e os ${cfg.metade === 1 ? 'pares' : 'ímpares'} são REOFERTA.`), 10, 46);
            const total = D.disciplinas.reduce((s, q) => s + (Number(q.aulas) || 0), 0);
            const falt = N.faltando(D).reduce((s, x) => s + x.faltam, 0);
            doc.text(txt(`${alocs.length} de ${total} aulas na grade · ${c.erros} conflito(s) · ${c.avisos} aviso(s) · ${falt} aula(s) sem lugar.`), 10, 52);
            doc.text(txt(`Dias: ${cfg.dias.join(', ')}. Horários: ${cfg.horarios[0].ini} às ${cfg.horarios[cfg.horarios.length - 1].fim} (${cfg.horarios.length} aulas por dia).`), 10, 58);
            doc.autoTable({
                startY: 64, margin: { left: 10, right: 10 },
                head: [['Curso', 'Sigla', 'Semestres', 'Disciplinas', 'Ofertas (semestres)', 'Reofertas (semestres)']],
                body: D.cursos.map((cu) => {
                    const sems = Array.from({ length: cu.semestres }, (_, i) => i + 1);
                    return [cu.nome, N.sigla(cu.nome), cu.semestres, D.disciplinas.filter((q) => q.ofertas.some((o) => o.curso === cu.id)).length,
                        sems.filter((s) => N.situacao(s, cfg.metade) === 'oferta').join(', '), sems.filter((s) => N.situacao(s, cfg.metade) === 'reoferta').join(', ')].map(txt);
                }),
                theme: 'grid', headStyles: { fillColor: VERDE }, styles: { fontSize: 9 }
            });
            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 6, margin: { left: 10, right: 10 },
                head: [['Sala ou laboratório', 'Tipo', 'Responsáveis', 'Aulas de outros professores']],
                body: D.salas.map((s) => [s.nome, s.tipo === 'laboratorio' ? 'Laboratório' : 'Sala', s.responsaveis.map(nomeP).join(', ') || '—',
                    N.POLITICA[s.politica] + (s.politica === 'autorizados' && s.autorizados.length ? ': ' + s.autorizados.map(nomeP).join(', ') : '')].map(txt)),
                theme: 'grid', headStyles: { fillColor: VERDE }, styles: { fontSize: 8.5 }
            });
        }

        // ---------------- cursos e semestres
        if (op.curso !== false) D.cursos.forEach((cu) => {
            for (let s = 1; s <= cu.semestres; s++) {
                const discs = D.disciplinas.filter((q) => q.ofertas.some((o) => o.curso === cu.id && Number(o.semestre) === s));
                if (!discs.length && !op.vazios) continue;
                const sit = N.situacao(s, cfg.metade);
                novaPagina();
                cabecalho(`${cu.nome} — ${s}º semestre (${sit})`, `${cfg.titulo} — ${periodo}`);
                const janela = cu[sit] || [];
                grade((a) => discs.some((q) => q.id === a.disc), (a, q) => `${primeiroNome(q.professor)} · ${N.nomeDe(D.salas, a.sala)}`, (k) => janela.length > 0 && !janela.includes(k), sit);
                legenda('Disciplinas: ' + discs.map((q) => { const o = q.ofertas.find((x) => x.curso === cu.id && Number(x.semestre) === s);
                    return `${q.codigo ? q.codigo + ' ' : ''}${q.nome} (${nomeP(q.professor)}; ${N.CARATER[o.carater].toLowerCase()}; ${q.aulas} aulas)`; }).join(' · ') + '.  Células cinza: fora do funcionamento do curso; vermelho/(!): conflito.');
            }
        });

        // ---------------- professores
        if (op.professor !== false) D.professores.forEach((p) => {
            const discs = D.disciplinas.filter((q) => q.professor === p.id);
            if (!alocs.some((a) => discs.some((q) => q.id === a.disc)) && !op.vazios) return;
            novaPagina();
            cabecalho(`Professor(a): ${p.nome}`, `${cfg.titulo} — ${periodo}`);
            grade((a) => discs.some((q) => q.id === a.disc), (a, q, ds) => `${N.nomeDe(D.salas, a.sala)} · ${turmas(ds)}`, (k) => (p.indisp || []).includes(k));
            const resp = D.salas.filter((s) => s.responsaveis.includes(p.id)).map((s) => s.nome);
            legenda(`Disciplinas: ${discs.map((q) => `${q.codigo ? q.codigo + ' ' : ''}${q.nome}`).join(' · ') || '—'}.${resp.length ? ` Responsável por: ${resp.join(', ')}.` : ''}  Células cinza: horários em que não pode dar aula; amarelo: reoferta.`);
        });

        // ---------------- salas
        if (op.sala !== false) D.salas.forEach((s) => {
            if (!alocs.some((a) => a.sala === s.id) && !op.vazios) return;
            novaPagina();
            cabecalho(`${s.tipo === 'laboratorio' ? 'Laboratório' : 'Sala'}: ${s.nome}`, `${cfg.titulo} — ${periodo}`);
            grade((a) => a.sala === s.id, (a, q, ds) => `${primeiroNome(q.professor)} · ${turmas(ds)}`, (k) => (s.indisp || []).includes(k));
            legenda(`${s.responsaveis.length ? `Responsáveis: ${s.responsaveis.map(nomeP).join(', ')}. ` : ''}${N.POLITICA[s.politica]}.  Células cinza: horários em que não pode ser usada; amarelo: reoferta.`);
        });

        // ---------------- disciplinas
        if (op.disciplinas !== false && D.disciplinas.length) {
            novaPagina();
            cabecalho('Disciplinas', `${cfg.titulo} — ${periodo}`);
            doc.autoTable({
                startY: 25, margin: { left: 10, right: 10, bottom: 12 },
                head: [['Código', 'Disciplina', 'Professor responsável', 'Aulas', 'Cursos (semestre, caráter, situação)', 'Sala(s)', 'Horários na grade']],
                body: D.disciplinas.map((q) => {
                    const minhas = alocs.filter((a) => a.disc === q.id).sort((a, b) => a.d - b.d || a.h - b.h);
                    const hs = minhas.map((a) => `${cfg.dias[a.d].slice(0, 3)} ${cfg.horarios[a.h].ini}`).join(', ');
                    const salas = [...new Set(minhas.map((a) => N.nomeDe(D.salas, a.sala)))].join(', ');
                    return [q.codigo, q.nome, nomeP(q.professor), `${minhas.length}/${q.aulas}`,
                        q.ofertas.map((o) => `${N.sigla(N.nomeDe(D.cursos, o.curso))} ${o.semestre}º ${N.CARATER[o.carater].toLowerCase()} (${N.situacao(o.semestre, cfg.metade)})`).join('; '),
                        salas || '—', hs || '—'].map(txt);
                }),
                theme: 'grid', headStyles: { fillColor: VERDE, fontSize: 8 }, styles: { fontSize: 7.2, cellPadding: 1.1 },
                columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 52 }, 2: { cellWidth: 38 }, 3: { cellWidth: 12, halign: 'center' } }
            });
        }

        // ---------------- conflitos
        if (op.conflitos !== false) {
            novaPagina();
            cabecalho('Conflitos e aulas sem lugar', `${cfg.titulo} — ${periodo}`);
            doc.autoTable({
                startY: 25, margin: { left: 10, right: 10, bottom: 12 },
                head: [['Tipo', 'Descrição']],
                body: c.lista.length ? c.lista.map((x) => [x.gravidade === 'erro' ? 'Conflito' : 'Aviso', txt(x.msg)]) : [['—', 'Nenhum conflito.']],
                theme: 'grid', headStyles: { fillColor: VERDE }, styles: { fontSize: 8 }, columnStyles: { 0: { cellWidth: 22 } },
                didParseCell: (h) => { if (h.section === 'body' && h.row.raw[0] === 'Conflito') h.cell.styles.fillColor = VERMELHO_CLARO; }
            });
            const falt = N.faltando(D);
            const motivos = {};
            (D.grade.naoAlocadas || []).forEach((x) => { motivos[x.disc] = x.motivo; });
            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 6, margin: { left: 10, right: 10, bottom: 12 },
                head: [['Disciplina sem lugar', 'Professor', 'Aulas', 'Motivo']],
                body: falt.length ? falt.map((x) => { const q = D.disciplinas.find((y) => y.id === x.disc); return [N.nomeDisc(q), nomeP(q.professor), x.faltam, motivos[q.id] || 'tirada da grade à mão'].map(txt); })
                    : [['—', '', '', 'Todas as aulas cadastradas estão na grade.']],
                theme: 'grid', headStyles: { fillColor: VERDE }, styles: { fontSize: 8 }
            });
        }

        if (!paginas) { novaPagina(); cabecalho(cfg.titulo); doc.text('Nada selecionado para o PDF.', 10, 35); }

        // rodapé com número de páginas
        const total = doc.internal.getNumberOfPages();
        const quando = new Date().toLocaleDateString('pt-BR');
        for (let i = 1; i <= total; i++) {
            doc.setPage(i);
            doc.setFontSize(7); doc.setTextColor(...CINZA);
            doc.text(txt(`Gerador de Horários — Marlon Soares Sigales · Laboratório de Instrumentação Agrícola · Engenharia Agrícola · CEng/UFPel · gerado em ${quando}`), 10, H - 5);
            doc.text(`Página ${i} de ${total}`, W - 10, H - 5, { align: 'right' });
        }
        return doc;
    }

    return { gerar, txt };
})();

if (typeof module !== 'undefined') module.exports = GeradorPDF;
