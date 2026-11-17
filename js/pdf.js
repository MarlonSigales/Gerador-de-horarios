/**
 * © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * PDF da grade (A4 deitado) com jsPDF + AutoTable (cópias locais em js/vendor, licença MIT).
 * Uma página por grade: cada curso e semestre, cada professor, cada sala; capa, relação com códigos de horário
 * (padrão UFPel: dia + turno + período, ex.: 621 622 623 624), lista de disciplinas e conflitos.
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
        function grade(filtro, linha2, fechada, sitFixa, pesquisa) {
            const porCel = {};
            alocs.forEach((a, i) => { if (filtro(a)) (porCel[`${a.d}|${a.h}`] = porCel[`${a.d}|${a.h}`] || []).push(i); });
            const marcas = {};
            const body = cfg.horarios.map((h, j) => [`${h.ini}\n${h.fim}\n[${N.codigoHorario(cfg, 0, j).slice(1)}]`, ...cfg.dias.map((_, d) => {
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
                if (!partes.length && pesquisa && pesquisa(k)) { marcas[k] = 'pesquisa'; return 'Pesquisa'; }
                if (!partes.length && fechada && fechada(k)) marcas[k] = 'fechado';
                return txt(partes.join('\n'));
            })]);
            const topo = 25;
            const altLinha = Math.min(11, (H - topo - 34) / cfg.horarios.length);
            doc.autoTable({
                startY: topo, margin: { left: 10, right: 10, bottom: 12 },
                head: [['Horário', ...cfg.dias.map((d, i) => txt(`${d} (${N.codigoHorario(cfg, i, 0).charAt(0)})`))]], body,
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
                    else if (m === 'pesquisa') { h.cell.styles.fillColor = [241, 234, 252]; h.cell.styles.textColor = [91, 63, 160]; h.cell.styles.halign = 'center'; }
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
            doc.text(txt(`${cfg.ano}/${cfg.metade} (${cfg.metade}º semestre do ano): disciplinas dos semestres ${cfg.metade === 1 ? 'ímpares' : 'pares'} do curso são OFERTA e as dos ${cfg.metade === 1 ? 'pares' : 'ímpares'} são REOFERTA.`), 10, 46);
            const total = D.disciplinas.reduce((s, q) => s + (Number(q.aulas) || 0), 0);
            const falt = N.faltando(D).reduce((s, x) => s + x.faltam, 0);
            doc.text(txt(`${alocs.length} de ${total} aulas na grade · ${c.erros} conflito(s) · ${c.avisos} aviso(s) · ${falt} aula(s) sem lugar.`), 10, 52);
            doc.text(txt(`Dias: ${cfg.dias.join(', ')}. Horários: ${cfg.horarios[0].ini} às ${cfg.horarios[cfg.horarios.length - 1].fim} (${cfg.horarios.length} aulas por dia).`), 10, 58);
            doc.autoTable({
                startY: 64, margin: { left: 10, right: 10 },
                head: [['Curso', 'Unidade', 'Semestres', 'Disciplinas na grade', 'Ofertas (semestres)', 'Reofertas (semestres)']],
                body: D.cursos.map((cu) => {
                    const sems = Array.from({ length: cu.semestres }, (_, i) => i + 1);
                    return [cu.nome, (cfg.unidade || {}).nome || '', cu.semestres, D.disciplinas.filter((q) => q.aulas > 0 && q.ofertas.some((o) => o.curso === cu.id && o.semestre > 0)).length,
                        sems.filter((s) => N.situacao(s, cfg.metade) === 'oferta').join(', '), sems.filter((s) => N.situacao(s, cfg.metade) === 'reoferta').join(', ')].map(txt);
                }),
                theme: 'grid', headStyles: { fillColor: VERDE }, styles: { fontSize: 9 }
            });
            if ((D.externos || []).length) doc.autoTable({
                startY: doc.lastAutoTable.finalY + 6, margin: { left: 10, right: 10 },
                head: [['Outros cursos considerados (bloqueios)', 'Unidade', 'Aulas', 'Origem']],
                body: D.externos.map((e) => [e.curso, e.unidade || '—', e.aulas.length, e.origem].map(txt)),
                theme: 'grid', headStyles: { fillColor: VERDE }, styles: { fontSize: 8.5 }
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
            grade((a) => discs.some((q) => q.id === a.disc), (a, q, ds) => `${N.nomeDe(D.salas, a.sala)} · ${turmas(ds)}`, (k) => (p.indisp || []).includes(k), null, (k) => (p.pesquisa || []).includes(k));
            const resp = D.salas.filter((s) => s.responsaveis.includes(p.id)).map((s) => s.nome);
            legenda(`Disciplinas: ${discs.map((q) => `${q.codigo ? q.codigo + ' ' : ''}${q.nome}`).join(' · ') || '—'}.${resp.length ? ` Responsável por: ${resp.join(', ')}.` : ''}  Células cinza: horários em que não pode dar aula; amarelo: reoferta.`);
        });

        // ---------------- salas
        if (op.sala !== false) D.salas.forEach((s) => {
            if (!alocs.some((a) => a.sala === s.id) && !(s.pesquisa || []).length && !op.vazios) return;
            novaPagina();
            cabecalho(`${s.tipo === 'laboratorio' ? 'Laboratório' : 'Sala'}: ${s.nome}`, `${cfg.titulo} — ${periodo}`);
            grade((a) => a.sala === s.id, (a, q, ds) => `${primeiroNome(q.professor)} · ${turmas(ds)}`, (k) => (s.indisp || []).includes(k), null, (k) => (s.pesquisa || []).includes(k));
            legenda(`${s.responsaveis.length ? `Responsáveis: ${s.responsaveis.map(nomeP).join(', ')}. ` : ''}${N.POLITICA[s.politica]}.  Células cinza: horários em que não pode ser usada; amarelo: reoferta.`);
        });

        // ---------------- relação de disciplinas e professores com códigos de horário (sem grade)
        if (op.relacao !== false && D.disciplinas.length) {
            const explica = 'Código do horário = dia + turno + período. Dia: dom 1, seg 2, ter 3, qua 4, qui 5, sex 6, sáb 7. Turno: manhã 1, tarde 2, noite 3. Ex.: 611 = sexta, manhã, 1º período; 621 622 623 624 = sexta à tarde, 4 períodos.';
            D.cursos.forEach((cu) => {
                const linhas = N.relacao(D, cu.id).filter((l) => l.aulas > 0 && l.semestre > 0);
                if (!linhas.length) return;
                novaPagina();
                cabecalho(`Relação de disciplinas e professores — ${cu.nome}`, `${cfg.titulo} — ${periodo}`);
                doc.setFontSize(7.5); doc.setTextColor(...CINZA);
                doc.text(doc.splitTextToSize(txt(explica), W - 20), 10, 26);
                doc.setTextColor(0, 0, 0);
                const body = [];
                let ultimo = null;
                linhas.forEach((l) => {
                    if (l.semestre !== ultimo) { body.push([{ content: txt(`${l.semestre}º semestre (${l.situacao})`), colSpan: 7, styles: { fillColor: VERDE_CLARO, textColor: VERDE, fontStyle: 'bold' } }]); ultimo = l.semestre; }
                    body.push([l.semestre + 'º', l.codigo, l.nome, N.CARATER[l.carater], l.professor || '—', l.salas || '—', (l.horarios || '—') + (l.naGrade < l.aulas ? ` (faltam ${l.aulas - l.naGrade})` : '')].map(txt));
                });
                doc.autoTable({
                    startY: 31, margin: { left: 10, right: 10, bottom: 12 },
                    head: [['Sem.', 'Código', 'Disciplina', 'Caráter', 'Professor responsável', 'Sala', 'Horários (código)']], body,
                    theme: 'grid', headStyles: { fillColor: VERDE, fontSize: 8 }, styles: { fontSize: 8, cellPadding: 1.2 },
                    columnStyles: { 0: { cellWidth: 11, halign: 'center' }, 1: { cellWidth: 18 }, 2: { cellWidth: 70 }, 3: { cellWidth: 20 }, 4: { cellWidth: 50 }, 5: { cellWidth: 45 }, 6: { font: 'courier', fontStyle: 'bold' } }
                });
            });
        }

        // ---------------- disciplinas
        if (op.disciplinas !== false && D.disciplinas.length) {
            novaPagina();
            cabecalho('Disciplinas', `${cfg.titulo} — ${periodo}`);
            doc.autoTable({
                startY: 25, margin: { left: 10, right: 10, bottom: 12 },
                head: [['Código', 'Disciplina', 'Professor responsável', 'Aulas', 'Cursos (semestre, caráter, situação)', 'Sala(s)', 'Horários (código)']],
                body: D.disciplinas.map((q) => {
                    const minhas = alocs.filter((a) => a.disc === q.id).sort((a, b) => a.d - b.d || a.h - b.h);
                    const hs = N.codigosDisciplina(D, q.id);
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

        // ---------------- calendário acadêmico (fim do documento)
        const an = op.calendario !== false ? N.analisarCalendario(D) : null;
        if (an) {
            novaPagina();
            cabecalho(`Calendário acadêmico ${an.ano} — semestre ${cfg.ano}/${cfg.metade}`, `${cfg.titulo} — ${periodo}`);
            doc.setFontSize(8.5);
            const totLet = an.porDia.reduce((t, x) => t + x.letivos + x.parciais, 0), totPerd = an.porDia.reduce((t, x) => t + x.perdidos, 0);
            doc.text(doc.splitTextToSize(txt(`Período letivo: ${N.dataBR(an.inicio)} a ${N.dataBR(an.fim)} (${an.semanas} semanas). Dias de aula da grade (${cfg.dias.join(', ')}): ${totLet} letivos e ${totPerd} sem aula por feriado ou recesso. Fonte: calendário acadêmico vigente da UFPel (CRA), ${an.url}.`), W - 20), 10, 27);
            doc.autoTable({
                startY: 35, margin: { left: 10, right: 10, bottom: 12 },
                head: [['Data', 'Dia', 'Tipo', 'Descrição', 'Efeito na grade']],
                body: an.eventos.map((e) => [N.dataBR(e.data), e.diaSemana, N.NOME_TIPO_CAL[e.tipo] || e.tipo, e.descricao + (e.ateHora ? ` (até ${e.ateHora})` : ''),
                    e.foraDoPeriodo ? 'fora do período letivo' : (e.temAula ? (e.suspende ? (e.ateHora ? `sem aula até ${e.ateHora}` : 'sem aula') : 'há aula (confirmar com a CRA)') : 'dia sem aula na grade')].map(txt)),
                theme: 'grid', headStyles: { fillColor: VERDE, fontSize: 8 }, styles: { fontSize: 7.5, cellPadding: 1 },
                columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 18 }, 2: { cellWidth: 34 }, 4: { cellWidth: 48 } },
                didParseCell: (h) => { if (h.section === 'body' && /sem aula/.test(h.row.raw[4]) && !/dia sem aula/.test(h.row.raw[4])) h.cell.styles.fillColor = VERMELHO_CLARO; if (h.section === 'body' && /fora do/.test(h.row.raw[4])) h.cell.styles.textColor = CINZA; }
            });
            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 5, margin: { left: 10, right: 10, bottom: 12 },
                head: [['Dia da semana', 'Dias no período', 'Sem aula (feriado/recesso)', 'Parciais', 'Dias letivos', 'Datas sem aula']],
                body: an.porDia.map((x) => [x.dia, x.total, x.perdidos, x.parciais, x.letivos + x.parciais, x.datasPerdidas.map(N.dataBR).join(', ') || '—'].map(txt)),
                theme: 'grid', headStyles: { fillColor: VERDE, fontSize: 8 }, styles: { fontSize: 8, cellPadding: 1.1 },
                columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' } }
            });
            novaPagina();
            cabecalho('Disciplinas mais prejudicadas pelo calendário', `${cfg.titulo} — ${periodo}`);
            doc.setFontSize(8);
            doc.text(doc.splitTextToSize(txt('Ordem: mais aulas perdidas primeiro. Aulas = períodos de 50 min. "Carga exigida" vem da matriz (horas) ou de créditos × 15; saldo negativo = a grade não cobre a carga no semestre.'), W - 20), 10, 27);
            doc.autoTable({
                startY: 32, margin: { left: 10, right: 10, bottom: 12 },
                head: [['Código', 'Disciplina', 'Professor', 'Dias', 'Aulas/sem.', 'Previstas', 'Perdidas', '% perdido', 'Dadas', 'Carga exigida', 'Saldo', 'Datas perdidas']],
                body: an.disciplinas.length ? an.disciplinas.map((x) => [x.codigo, x.nome, x.professor || '—', x.dias, x.aulasSemana, x.previstas, x.perdidas, `${String(x.pct).replace('.', ',')}%`, x.dadas, x.exigidas || '—', x.exigidas ? x.saldo : '—', x.datas.join(', ') || '—'].map(txt))
                    : [['—', 'A grade está vazia.', '', '', '', '', '', '', '', '', '', '']],
                theme: 'grid', headStyles: { fillColor: VERDE, fontSize: 7.5 }, styles: { fontSize: 7, cellPadding: 0.9 },
                columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 52 }, 2: { cellWidth: 30 }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'center' }, 8: { halign: 'center' }, 9: { halign: 'center' }, 10: { halign: 'center' } },
                didParseCell: (h) => {
                    if (h.section !== 'body' || !an.disciplinas[h.row.index]) return;
                    const x = an.disciplinas[h.row.index];
                    if (x.exigidas && x.saldo < 0) h.cell.styles.fillColor = VERMELHO_CLARO;
                    else if (h.row.index < 5 && x.perdidas > 0) h.cell.styles.fillColor = AMARELO_CLARO;
                }
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

    /** PDF dos relatórios internos (administrador): carga dos professores, uso das salas e horários de pesquisa. */
    function relatorios(D, op = {}) {
        const N = typeof Nucleo !== 'undefined' ? Nucleo : require('./nucleo.js');
        const JsPDF = (typeof window !== 'undefined' && window.jspdf) ? window.jspdf.jsPDF : op.jsPDF;
        const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
        const cfg = D.config, r = N.relatorios(D);
        const topo = (titulo) => {
            let x = 10;
            ['ufpel', 'ceng', 'ea', 'lia'].forEach((k) => { const l = typeof LOGOS_PDF !== 'undefined' && LOGOS_PDF[k]; if (!l) return; const w = 12 * l.w / l.h; try { doc.addImage(l.src, 'PNG', x, 7, w, 12); } catch (e) { /* ok */ } x += w + 3; });
            doc.setTextColor(...VERDE); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(txt(titulo), W - 10, 12, { align: 'right' });
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...CINZA);
            doc.text(txt(`Relatório interno (uso administrativo) — ${(D.cursos[0] || {}).nome || ''} — ${cfg.ano}/${cfg.metade}`), W - 10, 17.5, { align: 'right' });
            doc.setDrawColor(168, 225, 86); doc.setLineWidth(0.8); doc.line(10, 21.5, W - 10, 21.5); doc.setTextColor(0, 0, 0);
        };
        topo('Carga horária dos professores');
        doc.autoTable({ startY: 25, margin: { left: 10, right: 10, bottom: 12 },
            head: [['#', 'Professor', 'Aulas aqui', 'Horas aqui', 'Horas outros cursos', 'Total h/sem.', 'Pesquisa h/sem.', 'Disciplinas', 'Dias / turnos', 'Responsável por']],
            body: r.professores.map((p, i) => [i + 1, p.nome, p.aulas, p.horas, p.outrosCursosHoras || '—', p.total, p.pesquisaHoras || '—', p.disciplinas.join(', ') || '—', `${p.dias.join(', ')}${p.turnos.length ? ' · ' + p.turnos.join('/') : ''}`, p.responsavelPor.join(', ') || '—'].map(txt)),
            theme: 'grid', headStyles: { fillColor: VERDE, fontSize: 8 }, styles: { fontSize: 7.5, cellPadding: 1 },
            didParseCell: (h) => { if (h.section === 'body' && h.row.index < 3) h.cell.styles.fillColor = AMARELO_CLARO; } });
        doc.addPage(); topo('Uso das salas e laboratórios');
        doc.autoTable({ startY: 25, margin: { left: 10, right: 10, bottom: 12 },
            head: [['#', 'Sala ou laboratório', 'Tipo', 'Ensino aqui (h)', 'Ensino outros cursos (h)', 'Uso p/ ensino', 'Pesquisa (h)', 'Pesquisa', 'Indisponível (h)', 'Livre (h)', 'Responsáveis']],
            body: r.salas.map((s, i) => [i + 1, s.nome, s.tipo === 'laboratorio' ? 'Laboratório' : 'Sala', s.ensinoHoras, s.outrosCursosHoras || '—', `${String(s.pctEnsino).replace('.', ',')}%`, s.pesquisaHoras || '—', `${String(s.pctPesquisa).replace('.', ',')}%`, s.indispHoras || '—', s.livreHoras, s.responsaveis.join(', ') || '—'].map(txt)),
            theme: 'grid', headStyles: { fillColor: VERDE, fontSize: 8 }, styles: { fontSize: 7.5, cellPadding: 1 } });
        const pesq = [...D.salas.map((s) => [s.nome, 'Sala/lab.', s.pesquisa || []]), ...D.professores.map((p) => [p.nome, 'Professor', p.pesquisa || []])].filter((x) => x[2].length);
        doc.autoTable({ startY: doc.lastAutoTable.finalY + 6, margin: { left: 10, right: 10, bottom: 12 },
            head: [['Reservado para pesquisa', '', 'Horários (código: dia + turno + período)']],
            body: pesq.length ? pesq.map(([n, t, l]) => [n, t, l.map((k) => { const [d, h] = N.separa(k); return cfg.horarios[h] && d < cfg.dias.length ? N.codigoHorario(cfg, d, h) : null; }).filter(Boolean).sort().join(' ')].map(txt)) : [['—', '', 'Nenhum horário reservado para pesquisa.']],
            theme: 'grid', headStyles: { fillColor: [91, 63, 160], fontSize: 8 }, styles: { fontSize: 8 }, columnStyles: { 2: { font: 'courier' } } });
        const total = doc.internal.getNumberOfPages();
        for (let i = 1; i <= total; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(...CINZA); doc.text(txt(`Gerador de Horários — relatório interno — gerado em ${new Date().toLocaleDateString('pt-BR')}`), 10, H - 5); doc.text(`Página ${i} de ${total}`, W - 10, H - 5, { align: 'right' }); }
        return doc;
    }

    /** Documento de verificação interna (curso e unidade): médias e desvios padrões das horas dos professores. */
    function verificacao(D, op = {}) {
        const N = typeof Nucleo !== 'undefined' ? Nucleo : require('./nucleo.js');
        const P = typeof Planos !== 'undefined' ? Planos : require('./planos.js');
        const JsPDF = (typeof window !== 'undefined' && window.jspdf) ? window.jspdf.jsPDF : op.jsPDF;
        const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
        const cfg = D.config, v = P.verificacao(D);
        const topo = (titulo, sub) => {
            let x = 10;
            ['ufpel', 'ceng', 'ea', 'lia'].forEach((k) => { const l = typeof LOGOS_PDF !== 'undefined' && LOGOS_PDF[k]; if (!l) return; const w = 12 * l.w / l.h; try { doc.addImage(l.src, 'PNG', x, 7, w, 12); } catch (e) { /* ok */ } x += w + 3; });
            doc.setTextColor(...VERDE); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(txt(titulo), W - 10, 12, { align: 'right' });
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...CINZA); doc.text(txt(sub), W - 10, 17.5, { align: 'right' });
            doc.setDrawColor(168, 225, 86); doc.setLineWidth(0.8); doc.line(10, 21.5, W - 10, 21.5); doc.setTextColor(0, 0, 0);
        };
        const nomes = { sala: 'Sala de aula', lab: 'Laboratório', aula: 'Aula (total)', preparo: 'Preparo de aula', pesquisa: 'Pesquisa (reservada)', total: 'Total', disciplinas: 'Cadeiras (nº)' };
        const fmt = (x) => String(x).replace('.', ',');
        const bloco = (titulo, b, primeiro) => {
            if (!primeiro) doc.addPage();
            topo(`Verificação interna — ${titulo}`, `Uso interno — ${(cfg.unidade || {}).nome || ''} — ${cfg.ano}/${cfg.metade} — preparo = ${fmt(v.fatorPreparo)} h por hora de aula`);
            doc.setFontSize(8.5);
            doc.text(doc.splitTextToSize(txt('Horas por semana de cada professor nesta grade' + (titulo.startsWith('Unidade') ? ' e nos outros cursos da mesma unidade carregados (turma conjunta conta uma vez)' : '') + '. Desvio padrão amostral. Laboratório = aula em sala cadastrada como laboratório (ou com nome iniciado por "Lab").'), W - 20), 10, 27);
            doc.autoTable({ startY: 33, margin: { left: 10, right: 10, bottom: 12 }, head: [['Horas/semana', 'n', 'Média', 'Desvio padrão', 'Mínimo', 'Máximo']],
                body: Object.entries(nomes).map(([k, rot]) => { const e = b.estat[k]; return [rot, e.n, fmt(e.media), fmt(e.desvio), fmt(e.min), fmt(e.max)].map(txt); }),
                theme: 'grid', headStyles: { fillColor: VERDE }, styles: { fontSize: 9 }, columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' } } });
            const m = b.estat.total;
            doc.autoTable({ startY: doc.lastAutoTable.finalY + 6, margin: { left: 10, right: 10, bottom: 12 },
                head: [['Professor', 'Cadeiras', 'Sala (h)', 'Laboratório (h)', 'Aula (h)', 'Preparo (h)', 'Pesquisa (h)', 'Total (h)', 'Desvio do total (z)', 'Cursos']],
                body: b.professores.map((p) => [p.nome, p.disciplinas, fmt(p.sala), fmt(p.lab), fmt(p.aula), fmt(p.preparo), fmt(p.pesquisa), fmt(p.total), m.desvio ? fmt(Math.round((p.total - m.media) / m.desvio * 100) / 100) : '—', p.cursos.join(', ')].map(txt)),
                theme: 'grid', headStyles: { fillColor: VERDE, fontSize: 8 }, styles: { fontSize: 8 },
                didParseCell: (h) => { if (h.section !== 'body' || !m.desvio) return; const p = b.professores[h.row.index]; const z = (p.total - m.media) / m.desvio; if (z >= 1) h.cell.styles.fillColor = AMARELO_CLARO; if (z <= -1) h.cell.styles.fillColor = [232, 243, 250]; } });
            doc.setFontSize(7.5); doc.setTextColor(...CINZA);
            doc.text(txt('Amarelo: total 1 desvio padrão ou mais acima da média; azul: 1 desvio padrão ou mais abaixo.'), 10, Math.min(H - 14, doc.lastAutoTable.finalY + 5));
            doc.setTextColor(0, 0, 0);
        };
        bloco(`Curso: ${(D.cursos[0] || {}).nome || ''}`, v.curso, true);
        bloco(`Unidade: ${(cfg.unidade || {}).nome || ''}`, v.unidade, false);
        const total = doc.internal.getNumberOfPages();
        for (let i = 1; i <= total; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(...CINZA); doc.text(txt(`Gerador de Horários — verificação interna — gerado em ${new Date().toLocaleDateString('pt-BR')}`), 10, H - 5); doc.text(`Página ${i} de ${total}`, W - 10, H - 5, { align: 'right' }); }
        return doc;
    }

    return { gerar, relatorios, verificacao, txt };
})();

if (typeof module !== 'undefined') module.exports = GeradorPDF;
