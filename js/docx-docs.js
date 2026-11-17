/**
 * © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * Documentos .docx (biblioteca docx 8.5, cópia local em js/vendor/docx.umd.js, licença MIT):
 *  - Plano de ensino no modelo do dia a dia (PRG/UFPel): identificação, docência, ementa, objetivos, metodologia, programa,
 *    cronograma (datas do calendário vigente, com feriados), atividades, avaliação, bibliografia, aprovações e assinaturas.
 *  - RAAD do ano corrente, pré-preenchido (resumo no formato do relatório da UFPel).
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

    return { plano, raad };
})();

if (typeof module !== 'undefined') module.exports = DocxDocs;
