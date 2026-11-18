/**
 * © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * Documentos .docx (biblioteca docx 8.5, cópia local em js/vendor/docx.umd.js, licença MIT):
 *  - Plano de ensino no modelo do dia a dia (PRG/UFPel): identificação, docência, ementa, objetivos, metodologia, programa,
 *    cronograma (datas do calendário vigente, com feriados), atividades, avaliação, bibliografia, aprovações e assinaturas.
 *  - RAAD do ano corrente, pré-preenchido (resumo no formato do relatório da UFPel).
 *  - Horários do curso no padrão do Centro de Engenharias (capa do colegiado, grade e lista por semestre, pedidos e salas).
 */

'use strict';

/* global LOGOS_PDF */
const DocxDocs = (() => {
    const lib = () => (typeof window !== 'undefined' && window.docx) ? window.docx : require('./vendor/docx.umd.js');
    const bytesDe = (dataUrl) => {
        const b64 = String(dataUrl).split(',')[1] || '';
        if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(b64, 'base64'));
        const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u;
    };
    const logos = () => (typeof LOGOS_PDF !== 'undefined' ? LOGOS_PDF : (typeof global !== 'undefined' && global.LOGOS_PDF) || null);

    function kit() {
        const d = lib();
        const F = 'Arial';
        const run = (t, o = {}) => new d.TextRun({ text: String(t === undefined || t === null ? '' : t), font: F, size: o.size || 21, bold: !!o.bold, italics: !!o.italics, color: o.color });
        const par = (t, o = {}) => new d.Paragraph({ alignment: o.centro ? d.AlignmentType.CENTER : (o.direita ? d.AlignmentType.RIGHT : (o.justo ? d.AlignmentType.JUSTIFIED : d.AlignmentType.LEFT)),
            spacing: { before: o.antes || 0, after: o.depois === undefined ? 60 : o.depois }, indent: o.recuo ? { left: o.recuo } : undefined,
            children: Array.isArray(t) ? t : [run(t, o)] });
        const linhas = (texto, o = {}) => String(texto || '').split(/\n/).map((l) => par(l, o));
        const borda = { style: d.BorderStyle.SINGLE, size: 4, color: '000000' };
        const bordas = { top: borda, bottom: borda, left: borda, right: borda };
        // célula "preguiçosa": a largura é calculada pela tabela (colunas em % da largura útil da página)
        const cel = (filhos, o = {}) => ({ filhos: Array.isArray(filhos) ? (filhos.length ? filhos : [par('')]) : [filhos], o });
        let LARG = 9700; // largura útil em twips (definida por documento)
        const tabela = (linhasT, pcts, opt = {}) => {
            const ncol = pcts ? pcts.length : Math.max(...linhasT.map((cs) => cs.reduce((t, c) => t + (c.o.span || 1), 0)));
            const p = pcts || Array.from({ length: ncol }, () => 100 / ncol);
            const total = opt.largura ? LARG * opt.largura / 100 : LARG;
            const cols = p.map((x) => Math.round(total * x / 100));
            return new d.Table({ alignment: opt.centro ? d.AlignmentType.CENTER : undefined, width: { size: cols.reduce((a, b) => a + b, 0), type: d.WidthType.DXA }, columnWidths: cols, layout: d.TableLayoutType.FIXED,
                rows: linhasT.map((cs) => { let i = 0; return new d.TableRow({ children: cs.map((c) => {
                    const span = c.o.span || 1; const w = cols.slice(i, i + span).reduce((a, b) => a + b, 0); i += span;
                    return new d.TableCell({ children: c.filhos, columnSpan: span > 1 ? span : undefined, borders: bordas, width: { size: w, type: d.WidthType.DXA },
                        verticalAlign: c.o.meio ? d.VerticalAlign.CENTER : undefined, shading: c.o.fundo ? { type: d.ShadingType.CLEAR, fill: c.o.fundo, color: 'auto' } : undefined,
                        margins: { top: 50, bottom: 50, left: 90, right: 90 } });
                }) }); }) });
        };
        const secao = (titulo, filhos) => [tabela([[cel(par(titulo, { bold: true }), { fundo: 'F2F2F2' })], [cel(filhos)]], [100]), par('', { depois: 120 })];
        const largura = (twips) => { LARG = twips; };
        const cabecalhoUFPel = (sub) => {
            const l = logos(), out = [];
            if (l && l.ufpel) out.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [new d.ImageRun({ data: bytesDe(l.ufpel.src), transformation: { width: Math.round(56 * l.ufpel.w / l.ufpel.h), height: 56 } })] }));
            ['MINISTÉRIO DA EDUCAÇÃO', 'UNIVERSIDADE FEDERAL DE PELOTAS', sub].forEach((t) => out.push(par(t, { centro: true, bold: true, depois: 0 })));
            return out;
        };
        return { d, run, par, linhas, cel, tabela, secao, cabecalhoUFPel, largura };
    }

    const marca = (sim) => (sim ? '( X )' : '(    )');

    /** Plano de ensino (objeto de Planos.planoDoSemestre) → Blob/Buffer .docx. */
    async function plano(p) {
        const k = kit(), { d, run, par, linhas, cel, tabela, secao } = k;
        k.largura(9700);
        const carga = `Teórica: ${p.cargaTeorica || 0}    Prática: ${p.cargaPratica || 0}${(p.distribuicao && (p.distribuicao.E || p.distribuicao.D || p.distribuicao.EX)) ? `    E: ${p.distribuicao.E || 0}  D: ${p.distribuicao.D || 0}  EX: ${p.distribuicao.EX || 0}` : ''}`;
        const ident = tabela([
            [cel(par('1. Identificação', { bold: true }), { span: 2, fundo: 'F2F2F2', w: 80 }), cel(par('Código', { bold: true, centro: true }), { fundo: 'F2F2F2', w: 20 })],
            [cel(par([run('1.1 Disciplina: '), run(p.nome, { bold: true }), run(p.turma ? `   Turma: ${p.turma}` : '')]), { span: 2 }), cel(par(p.codigo, { centro: true }))],
            [cel(par([run('1.2 Unidade: '), run(p.unidade, { bold: true })]), { span: 2 }), cel(par(p.codigoUnidade || '', { centro: true }))],
            [cel(par([run('1.3 Responsável: '), run(p.responsavel, { bold: true })]), { span: 2 }), cel(par(''))],
            [cel(par([run('1.4 Curso(s) atendido(s)/semestre do curso: '), run((p.cursosAtendidos || []).join(' / '), { bold: true })]), { span: 2 }), cel(par((p.cursosAtendidos || []).length > 1 ? 'Vários' : '', { centro: true }))],
            [cel(par([run('1.5 Professor regente: '), run(((p.docentes || [])[0] || {}).nome || '', { bold: true })]), { span: 3 })],
            [cel([par('1.6 Carga horária total:'), par(carga, { bold: true })], { w: 45 }),
                cel([par('1.8 Caráter:'), par(`${marca(p.carater === 'obrigatoria')} obrigatória`, { bold: p.carater === 'obrigatoria' }), par(`${marca(p.carater === 'optativa')} optativa`), par(`${marca(p.carater === 'livre')} outro (especificar): ${p.carater === 'livre' ? 'livre' : ''}`)], { w: 35 }),
                cel([par('1.9 Currículo:'), par(`${marca(p.curriculo !== 'anual')} semestral`, { bold: p.curriculo !== 'anual' }), par(`${marca(p.curriculo === 'anual')} anual`)], { w: 20 })],
            [cel(par([run('1.7 Créditos: '), run(p.creditos, { bold: true })]), { span: 3 })],
            [cel(par([run('1.10 Local/horário: '), run(`${(p.localHorario || {}).texto || ''}${(p.localHorario || {}).codigos ? `  (códigos ${p.localHorario.codigos})` : ''}`, { bold: true })]), { span: 3 })],
            [cel(par([run('1.11 Pré-requisito(s): '), run(p.preRequisitos || '—', { bold: true })]), { span: 3 })]
        ], [45, 35, 20]);
        const doc = (p.docentes || []);
        const docencia = tabela([
            [cel(par('2. Docência', { bold: true }), { span: 4, fundo: 'F2F2F2' })],
            [cel(par('2.1 Encargo didático semanal (horas)'), { w: 55 }), cel(par('Teórica', { centro: true }), { w: 15 }), cel(par('Prática', { centro: true }), { w: 15 }), cel(par('Total', { centro: true }), { w: 15 })],
            ...doc.map((x, i) => [cel(par(`${i + 1}. ${x.nome}${x.vinculo && i > 0 ? ` (${x.vinculo})` : ''}`, { bold: true })), cel(par(x.teorica || 0, { centro: true, bold: true })), cel(par(x.pratica || 0, { centro: true, bold: true })), cel(par((Number(x.teorica) || 0) + (Number(x.pratica) || 0), { centro: true }))]),
            [cel([par('2.2 Observações:'), ...linhas(p.observacoesDocencia)], { span: 4 })]
        ], [55, 15, 15, 15]);
        const objetivos = [par([run('4.1. Gerais: ', { bold: true }), run(p.objetivoGeral || '')], { justo: true }), par('4.2. Específicos:', { antes: 60 }),
            ...String(p.objetivosEspecificos || '').split(/\n+/).filter((l) => l.trim()).map((l) => par(`✓  ${l.replace(/^[-•✓*]\s*/, '')}`, { recuo: 360, justo: true }))];
        const cr = (p.cronograma && p.cronograma.linhas) || [];
        const cronoT = tabela([
            [cel(par('Semana', { bold: true, centro: true }), { w: 12, fundo: 'F2F2F2' }), cel(par('Data', { bold: true, centro: true }), { w: 16, fundo: 'F2F2F2' }), cel(par('Tópico abordado', { bold: true, centro: true }), { w: 56, fundo: 'F2F2F2' }), cel(par('Prática/teórica', { bold: true, centro: true }), { w: 16, fundo: 'F2F2F2' })],
            ...cr.map((l) => [cel(par(l.semana, { centro: true, bold: !!l.exame })), cel(par(l.dataBR, { centro: true })), cel(par(l.topico, { centro: true, italics: l.semAula, color: l.semAula ? '666666' : undefined })), cel(par(l.tipo, { centro: true }))])
        ], [12, 16, 56, 16]);
        const assinaturas = [par('ASSINATURAS:', { bold: true, antes: 240, depois: 240 }),
            ...doc.flatMap((x) => [par('_____________________________________________', { centro: true, antes: 360, depois: 0 }), par(`Prof. ${x.nome}`, { centro: true })]),
            ...(p.discenteRepresentante !== false ? [par('_____________________________________________', { centro: true, antes: 360, depois: 0 }), par('Discente Representante da Turma', { centro: true }), ...Array.from({ length: 20 }, (_, i) => par(`${i + 1}-`, { depois: 20 }))] : [])];
        const corpo = [
            ...k.cabecalhoUFPel('PRÓ-REITORIA DE GRADUAÇÃO'), par('', { depois: 120 }), par('PLANO DE ENSINO', { centro: true, bold: true, depois: 120 }),
            tabela([[cel(par('Ano', { bold: true, centro: true })), cel(par('Semestre letivo', { bold: true, centro: true }))], [cel(par(p.ano, { centro: true })), cel(par(p.semestre, { centro: true }))]], [40, 60], { largura: 36, centro: true }),
            par('', { depois: 160 }), ident, par('', { depois: 120 }), docencia, par('', { depois: 120 }),
            ...secao('3. Ementa', linhas(p.ementa, { justo: true })),
            ...secao('4. Objetivos', objetivos),
            ...secao('5. Metodologia de ensino:', linhas(p.metodologia, { justo: true })),
            ...secao('6. Descrição do conteúdo/unidades (programa)', linhas(p.programa)),
            par('7. Cronograma de execução', { bold: true, depois: 80 }), cronoT, par('', { depois: 120 }),
            ...secao('8. Atividades discentes', linhas(p.atividadesDiscentes, { justo: true })),
            ...secao('9. Critérios de avaliação', linhas(p.avaliacao, { justo: true })),
            ...secao('10. Bibliografia', [par('10.1. Básica', { bold: true }), ...linhas(p.bibliografiaBasica), par('10.2. Complementar', { bold: true, antes: 80 }), ...linhas(p.bibliografiaComplementar)]),
            ...secao('11. Aprovações', [...linhas(p.aprovacoes, { justo: true }), ...(p.outrasInformacoes ? [par('Outras informações:', { bold: true, antes: 80 }), ...linhas(p.outrasInformacoes)] : [])]),
            ...assinaturas
        ];
        const documento = new d.Document({ creator: 'Gerador de Horários', title: `Plano de ensino ${p.codigo} ${p.nome} ${p.ano}/${p.semestre}`,
            styles: { default: { document: { run: { font: 'Arial', size: 21 } } } },
            sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children: corpo }] });
        return (typeof window !== 'undefined' && window.Blob) ? d.Packer.toBlob(documento) : d.Packer.toBuffer(documento);
    }

    /** RAAD pré-preenchido (objeto de Planos.raad) → .docx. */
    async function raad(r) {
        const k = kit(), { d, run, par, cel, tabela } = k;
        k.largura(9900);
        const num = (x) => (Number(x) || 0).toFixed(2);
        const campo = (rot, val) => [cel(par(rot, { bold: true }), { w: 35 }), cel(par(val || '—'), { w: 65 })];
        const blocoT = (titulo, linhasT) => [tabela([[cel(par(titulo, { bold: true }), { span: 3, fundo: 'F2F2F2' })], ...linhasT], [74, 13, 13]), par('', { depois: 120 })];
        const linha3 = (desc, ch, pts) => [cel(par(desc), { w: 74 }), cel(par(ch, { centro: true }), { w: 13 }), cel(par(pts, { centro: true }), { w: 13 })];
        const corpo = [
            ...k.cabecalhoUFPel(r.unidade || 'Centro de Engenharias'), par('', { depois: 80 }),
            par(`RAAD ${r.ano} - Resumo (pré-preenchido)`, { centro: true, bold: true, size: 26, depois: 160 }),
            tabela([campo('PROFESSOR', String(r.professor || '').toUpperCase()), campo('SIAPE', r.siape), campo('UNIDADE', r.unidade), campo('DEPARTAMENTO', r.departamento),
                campo('DT. INGRESSO UFPEL', r.ingressoUfpel), campo('DT. INGRESSO CARGO', r.ingressoCargo), campo('JORNADA DE TRABALHO', r.jornada)], [35, 65]),
            par('', { depois: 100 }),
            tabela([campo('CH ENSINO', r.chEnsino), campo('CH PROJETOS (informados)', r.chProjetos), campo('CH TOTAL (ensino + projetos)', r.chTotal),
                campo('HORAS DE ENSINO SEMANAIS (média do ano)', num(r.horasSemanais))], [35, 65]),
            par('', { depois: 160 }),
            tabela([[cel(par('DESCRIÇÃO', { bold: true }), { w: 74 }), cel(par('CARGA HORÁRIA', { bold: true, centro: true }), { w: 13 }), cel(par('PONTOS', { bold: true, centro: true }), { w: 13 })]], [74, 13, 13]),
            par('', { depois: 60 }),
            ...blocoT('AVALIAÇÃO DA CHEFIA', [linha3(`Nota da chefia: ${r.avaliacaoChefia || ''}`, '', r.avaliacaoChefia || '')]),
            ...blocoT('AVALIAÇÃO FINAL DISCENTE', [linha3(`Nota final discente: ${r.avaliacaoDiscente || ''}`, '', '')]),
            ...blocoT('ENSINO', (r.turmas.length ? r.turmas : [{ periodo: '', codigo: '', nome: 'Nenhuma turma no ano.', turma: '', vinculo: '', ch: 0, chP: 0, chT: 0 }]).map((t) => linha3(
                t.codigo ? `Graduação ${t.periodo} - ${t.codigo} - ${String(t.nome).toUpperCase()}${t.turma ? ' - ' + t.turma : ''} (${t.vinculo}, CH_P ${num(t.chP)}, CH_T ${num(t.chT)}, CH_E ${num(t.chE)}, CH_EAD ${num(t.chEAD)}, CH_EX ${num(t.chEX)})` : t.nome,
                t.ch || '', ''))),
            ...blocoT('ENSINO - PONTUAÇÃO', [linha3(`Pontuação gerada para o total de horas de ensino semanal (${num(r.horasSemanais).replace(/0$/, '')}) — estimativa`, '', num(r.pontosEnsinoEstimados))]),
            ...blocoT('PROJETOS UNIFICADOS', (r.projetos.length ? r.projetos : [{ projeto: 'Informe seus projetos na Área do professor.', ch: '' }]).map((p) => linha3(
                `${p.projeto}${p.acao ? ' - Ação: ' + p.acao : ''}${p.papel ? ` (${p.papel})` : ''}`, p.ch || '', ''))),
            par(r.observacao, { italics: true, color: '666666', antes: 120 })
        ];
        const documento = new d.Document({ creator: 'Gerador de Horários', title: `RAAD ${r.ano} ${r.professor}`, styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
            sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children: corpo }] });
        return (typeof window !== 'undefined' && window.Blob) ? d.Packer.toBlob(documento) : d.Packer.toBuffer(documento);
    }

    /**
     * Horários do curso no padrão do Centro de Engenharias (objeto de Nucleo.horariosCeng): A4 paisagem, Times New Roman;
     * capa do colegiado com o calendário; por semestre, cabeçalho (UFPel/CEng | curso, semestre, ano, período), grade
     * manhã/tarde/noite com "código – sigla" e "Nome – turma" e a lista Disciplina | Turma | Professor | SIAPE | Vagas | Observação.
     * No fim: pedidos de vagas e demanda de salas.
     */
    async function horariosCeng(h) {
        const d = lib(), F = 'Times New Roman';
        const LARG = 15100; // 297 mm − margens de 15 mm, em twips
        const run = (t, o = {}) => new d.TextRun({ text: String(t === undefined || t === null ? '' : t), font: F, size: o.size || 18, bold: !!o.bold, color: o.color });
        const par = (filhos, o = {}) => new d.Paragraph({ alignment: o.centro ? d.AlignmentType.CENTER : d.AlignmentType.LEFT, spacing: { before: o.antes || 0, after: o.depois || 0 },
            indent: o.recuo ? { left: o.recuo } : undefined, keepNext: !!o.junto, children: (Array.isArray(filhos) ? filhos : [run(filhos, o)]) });
        const b1 = { style: d.BorderStyle.SINGLE, size: 4, color: '000000' }, b0 = { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
        const tab = (linhas, pcts, o = {}) => {
            const cols = pcts.map((x) => Math.round(LARG * x / 100));
            return new d.Table({ width: { size: cols.reduce((a, b) => a + b, 0), type: d.WidthType.DXA }, columnWidths: cols, layout: d.TableLayoutType.FIXED,
                rows: linhas.map((cs, li) => { let i = 0; return new d.TableRow({ cantSplit: true, tableHeader: !!(o.cabecalho && li === 0), height: o.altura && li >= (o.alturaDesde || 0) ? { value: o.altura, rule: d.HeightRule.ATLEAST } : undefined, children: cs.map((c) => {
                    const span = c.span || 1, w = cols.slice(i, i + span).reduce((a, b) => a + b, 0); i += span;
                    const bb = o.semBorda ? b0 : b1;
                    return new d.TableCell({ children: c.filhos.length ? c.filhos : [par('')], columnSpan: span > 1 ? span : undefined, width: { size: w, type: d.WidthType.DXA },
                        borders: { top: bb, bottom: bb, left: bb, right: bb }, verticalAlign: d.VerticalAlign.CENTER,
                        shading: c.fundo ? { type: d.ShadingType.CLEAR, fill: c.fundo, color: 'auto' } : undefined, margins: { top: 20, bottom: 20, left: 60, right: 60 } });
                }) }); }) });
        };
        const C = (filhos, o = {}) => Object.assign({ filhos: Array.isArray(filhos) ? filhos : [filhos] }, o);
        const rot = (r, v) => par([run(r), run(v, { bold: true })]);
        const cabecalho = (sem) => tab([
            [C(par('UNIVERSIDADE FEDERAL DE PELOTAS')), C(rot('CURSO: ', h.curso.toUpperCase()), { span: 3 })],
            [C(par(h.unidade.toUpperCase())), C(rot('SEMESTRE: ', sem)), C(rot('ANO: ', String(h.ano))), C(rot('PERÍODO: ', h.periodo))]
        ], [45, 19, 18, 18], { semBorda: true });
        const DIAS = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO', 'DOMINGO'];
        const larguraDia = (n) => (100 - 7) / n;
        const gradeTurno = (bloco, comCab, ndias) => {
            const linhas = [];
            if (comCab) linhas.push([C(par('HORA', { centro: true, size: 14 })), ...Array.from({ length: ndias }, (_, i) => C(par(DIAS[i] || '', { centro: true, size: 14 })))]);
            bloco.linhas.forEach((l) => linhas.push([C(par(l.hora, { centro: true, size: 14 })), ...l.dias.map((aulas) => C(aulas.flatMap((a, k) => [
                par(`${a.codigo}${a.codigo ? ' – ' : ''}${a.sigla}`, { centro: true, size: 18, antes: k ? 40 : 0 }),
                par(`${a.nome}${a.turma ? ' – ' + a.turma : ''}`, { centro: true, bold: true, size: 18 })])))]));
            return tab(linhas, [7, ...Array.from({ length: ndias }, () => larguraDia(ndias))], { altura: 330, alturaDesde: comCab ? 1 : 0 });
        };
        const listaSem = (lista) => tab([
            ['Disciplina', 'Turma', 'Professor', 'SIAPE', 'Vagas', 'Observação'].map((x) => C(par(x, { bold: true, size: 18 }), { fundo: 'D9D9D9' })),
            ...lista.map((l) => [C(par(l.disciplina, { bold: true, size: 20 })), C(par(l.turma, { centro: true, size: 20 })), C(par(l.professor, { size: 20 })), C(par(l.siape, { size: 20 })),
                C(par(l.vagas, { centro: true, size: 20 })), C(par(l.observacao, { size: 20 }))])
        ], [26, 6, 22, 9, 7, 30], { cabecalho: true });
        const quebra = () => new d.Paragraph({ children: [new d.PageBreak()] });
        const corpo = [];
        // capa
        [h.universidade, h.unidade, `Curso de ${h.curso}`, `Colegiado do Curso de ${h.curso}`].forEach((x) => corpo.push(par(x, { centro: true, bold: true, size: 18 })));
        corpo.push(par('', { depois: 160 }));
        corpo.push(par(`Colegiado do Curso de ${h.curso}`, { bold: true, size: 26 }));
        [['Coordenador: ', h.colegiado.coordenador], ['Email: ', h.colegiado.email], ['Secretária: ', h.colegiado.secretaria], ['Email: ', h.colegiado.emailSecretaria || h.colegiado.email], ['Site: ', h.colegiado.site]]
            .filter(([, v]) => v).forEach(([r, v]) => corpo.push(par([run(r, { bold: true, size: 18 }), run(v, { size: 18, color: r === 'Site: ' ? '1F4E9E' : undefined })], { recuo: 560 })));
        corpo.push(par('', { depois: 240 }));
        if (h.calendario) corpo.push(par(`CALENDÁRIO ACADÊMICO: Início ${h.calendario.inicio} - Término: ${h.calendario.fim}`, { bold: true, size: 30, color: 'E00000', recuo: 560 }));
        if (h.versao) corpo.push(par(`Prévia dos horários ${h.ano}.${h.periodo.replace('º', '')} ${h.versao}`, { size: 20, recuo: 560, antes: 120 }));
        // semestres
        const ndias = Math.max(1, ...h.paginas.flatMap((p) => p.grade.flatMap((g) => g.linhas.map((l) => l.dias.length))));
        h.paginas.forEach((p) => {
            corpo.push(quebra(), cabecalho(p.semestre), par('', { depois: 40 }));
            p.grade.forEach((g, i) => { if (i) corpo.push(par('Intervalo', { size: 16, recuo: 200, antes: 80, depois: 80 })); corpo.push(gradeTurno(g, i === 0, ndias)); });
            corpo.push(par('', { depois: 120 }));
            corpo.push(p.lista.length ? listaSem(p.lista) : par('Sem disciplinas com horário neste semestre.', { size: 18 }));
        });
        // pedidos de vagas
        const pe = h.pedidos || { enviados: [], recebidos: [] };
        const R = { pendente: 'Pendente', aceito: 'Aceito', 'aceito-vagas': 'Aceito, com redução de vagas', 'aceito-horario': 'Aceito, em outro horário', 'aceito-turma': 'Aceito, com turma extra', negado: 'Negado' };
        const cabT = (xs) => xs.map((x) => C(par(x, { bold: true, size: 18 }), { fundo: 'D9D9D9' }));
        const cel = (x) => C(par(String(x || ''), { size: 18 }));
        if (pe.enviados.length || pe.recebidos.length) {
            corpo.push(quebra(), cabecalho('PEDIDOS'), par('', { depois: 80 }));
            if (pe.enviados.length) {
                corpo.push(par('Pedidos internos (feitos pelo curso)', { bold: true, size: 22, depois: 60 }));
                corpo.push(tab([cabT(['Código', 'Disciplina', 'Turma', 'Vagas', 'Horário', 'Curso', 'Oferta/Reoferta', 'Professor', 'Ciência do professor', 'Resposta']),
                    ...pe.enviados.map((e) => [e.codigo, e.disciplina, e.turma, e.vagas, e.horario, e.curso, e.situacao, e.professor, e.ciencia ? 'ok' : '', `${R[e.resposta] || ''}${e.obs ? ' — ' + e.obs : ''}`].map(cel))],
                [8, 18, 5, 5, 12, 10, 8, 12, 7, 15], { cabecalho: true }), par('', { depois: 160 }));
            }
            if (pe.recebidos.length) {
                corpo.push(par('Pedidos recebidos de outros cursos', { bold: true, size: 22, depois: 60 }));
                corpo.push(tab([cabT(['Curso', 'Código', 'Disciplina', 'Horário', 'Oferta/Reoferta', 'Vagas', 'Resposta']),
                    ...pe.recebidos.map((e) => [e.curso, e.codigo, e.disciplina, e.horario, e.situacao, e.vagas, `${R[e.resposta] || ''}${e.obs ? ' — ' + e.obs : ''}`].map(cel))],
                [10, 10, 24, 14, 10, 7, 25], { cabecalho: true }));
            }
        }
        // demanda de salas
        const dm = h.demanda;
        if (dm && dm.linhas.length) {
            corpo.push(quebra(), cabecalho('SALAS'), par('', { depois: 80 }));
            corpo.push(par(`Demanda de salas — pico de ${dm.picoSalas} sala(s) comum(ns) ao mesmo tempo${dm.horariosPico.length ? ` (horários ${dm.horariosPico.join(' ')})` : ''}.`, { bold: true, size: 22, depois: 60 }));
            corpo.push(tab([cabT(['Disciplina', 'Código', 'Turma', 'Professor', 'Horários (código UFPel)', 'Vagas', 'Sala/laboratório', 'Observação']),
                ...dm.linhas.map((l) => [l.disciplinas.join(' / '), l.codigos.join(' / '), l.turma, l.professores.join(', '), l.horarios.join(' '), l.vagas || '', l.semSala ? 'Não precisa de sala' : (l.sala || 'a definir'), l.observacao].map(cel))],
            [20, 9, 5, 15, 16, 5, 13, 17], { cabecalho: true }));
        }
        const documento = new d.Document({ creator: 'Gerador de Horários', title: `Horários ${h.curso} ${h.ano}.${h.periodo}`, styles: { default: { document: { run: { font: F, size: 18 } } } },
            sections: [{ properties: { page: { size: { orientation: d.PageOrientation.LANDSCAPE, width: 11906, height: 16838 }, margin: { top: 400, bottom: 400, left: 850, right: 850 } } }, children: corpo }] });
        return (typeof window !== 'undefined' && window.Blob) ? d.Packer.toBlob(documento) : d.Packer.toBuffer(documento);
    }

    return { plano, raad, horariosCeng };
})();

if (typeof module !== 'undefined') module.exports = DocxDocs;
