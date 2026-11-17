/**
 * © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * Exemplo pronto: a grade da Engenharia Agrícola (10 semestres), salas comuns e três laboratórios com responsáveis.
 * As grades de Controle e Automação e de Civil entram como "outros cursos" (já montadas): seus professores e
 * laboratórios ficam bloqueados nos horários delas, como viria do MEGA.
 * Os professores, exceto o autor, são fictícios (marcados com "exemplo").
 */

'use strict';

/* global Nucleo */
const Exemplo = (() => {
    function criarCompleto(N) {
        N = N || (typeof Nucleo !== 'undefined' ? Nucleo : require('./nucleo.js'));
        const d = N.dadosVazios();
        d.config.titulo = 'Grade horária — Centro de Engenharias';
        d.config.ano = 2027;
        d.config.metade = 1;
        const cfg = d.config;
        const T = (t, dias) => N.chavesTurno(cfg, t, dias);
        const seg2sex = [0, 1, 2, 3, 4];

        d.cursos = [
            { id: 'eagri', nome: 'Engenharia Agrícola', semestres: 10, oferta: [...T('manha', seg2sex), ...T('tarde', seg2sex)], reoferta: [...T('tarde', seg2sex), ...T('noite', seg2sex)] },
            { id: 'ecaut', nome: 'Engenharia de Controle e Automação', semestres: 10, oferta: [...T('manha', seg2sex), ...T('tarde', seg2sex)], reoferta: [...T('tarde', seg2sex), ...T('noite', seg2sex)] },
            { id: 'ecivil', nome: 'Engenharia Civil', semestres: 10, oferta: [...T('manha', seg2sex), ...T('tarde', seg2sex)], reoferta: [...T('tarde', seg2sex)] }
        ];

        d.professores = [
            { id: 'marlon', nome: 'Marlon Soares Sigales', email: '', indisp: [] },
            { id: 'ana', nome: 'Ana Lima (exemplo)', email: '', indisp: T('manha', [0]) }, // não dá aula segunda de manhã
            { id: 'bruno', nome: 'Bruno Costa (exemplo)', email: '', indisp: T('noite', seg2sex) },
            { id: 'carla', nome: 'Carla Souza (exemplo)', email: '', indisp: T('tarde', [4]) },
            { id: 'diego', nome: 'Diego Rocha (exemplo)', email: '', indisp: [] },
            { id: 'elisa', nome: 'Elisa Martins (exemplo)', email: '', indisp: T('manha', [2]) },
            { id: 'fabio', nome: 'Fábio Nunes (exemplo)', email: '', indisp: [] }
        ];

        d.salas = [
            { id: 's101', nome: 'Sala 101', tipo: 'sala', capacidade: 50, responsaveis: [], politica: 'todos', autorizados: [], indisp: [] },
            { id: 's102', nome: 'Sala 102', tipo: 'sala', capacidade: 50, responsaveis: [], politica: 'todos', autorizados: [], indisp: [] },
            { id: 's103', nome: 'Sala 103', tipo: 'sala', capacidade: 40, responsaveis: [], politica: 'todos', autorizados: [], indisp: T('noite', seg2sex) },
            { id: 's201', nome: 'Sala 201', tipo: 'sala', capacidade: 60, responsaveis: [], politica: 'todos', autorizados: [], indisp: [] },
            { id: 'lia', nome: 'Lab. de Instrumentação Agrícola (401)', tipo: 'laboratorio', capacidade: 20, responsaveis: ['marlon'], politica: 'autorizados', autorizados: ['diego'], indisp: [], pesquisa: T('tarde', [4]) }, // sexta à tarde: pesquisa
            { id: 'lpc', nome: 'Lab. de Pós-Colheita (400)', tipo: 'laboratorio', capacidade: 20, responsaveis: ['bruno'], politica: 'responsaveis', autorizados: [], indisp: [] },
            { id: 'linfo', nome: 'Lab. de Informática', tipo: 'laboratorio', capacidade: 30, responsaveis: ['carla', 'fabio'], politica: 'todos', autorizados: [], indisp: [] }
        ];

        const o = (curso, semestre, carater) => ({ curso, semestre, carater: carater || 'obrigatoria' });
        const q = (id, codigo, nome, professor, aulas, blocos, salas, ofertas, extra) => Object.assign(
            { id, codigo, nome, professor, aulas, blocos, salas: salas || [], fixos: [], equivalentes: [], ofertas }, extra || {});
        d.disciplinas = [
            q('calc1', 'MAT001', 'Cálculo I', 'ana', 4, '2+2', [], [o('eagri', 1), o('ecaut', 1), o('ecivil', 1)]),
            q('alg-ea', 'EAG010', 'Algoritmos e Programação (Agrícola)', 'carla', 4, '2+2', ['linfo'], [o('eagri', 1)], { equivalentes: ['alg-cca'] }),
            q('alg-cca', 'ECA010', 'Algoritmos e Programação (Automação)', 'carla', 4, '2+2', ['linfo'], [o('ecaut', 1)], { equivalentes: ['alg-ea'] }),
            q('fis1', 'FIS001', 'Física I', 'elisa', 4, '2+2', [], [o('eagri', 2), o('ecaut', 2), o('ecivil', 2)]),
            q('calc2', 'MAT002', 'Cálculo II', 'ana', 4, '2+2', [], [o('eagri', 3), o('ecaut', 3), o('ecivil', 3)]),
            q('eletrot', 'ENG040', 'Eletrotécnica', 'marlon', 3, '3', [], [o('eagri', 4), o('ecivil', 5)]),
            q('circ', 'ECA030', 'Circuitos Elétricos', 'diego', 4, '2+2', [], [o('ecaut', 3)]),
            q('instr', 'EAG050', 'Instrumentação Agrícola', 'marlon', 3, '3', ['lia'], [o('eagri', 5)]),
            q('emb1', 'EAG061', 'Eletrônica Embarcada para Agricultura I', 'marlon', 3, '3', ['lia'], [o('eagri', 6, 'optativa')], { fixos: N.chavesTurno(cfg, 'tarde', [3]).slice(2, 5) }),
            q('embsis', 'ECA070', 'Sistemas Embarcados', 'diego', 4, '2+2', ['lia', 'linfo'], [o('ecaut', 7)]),
            q('posc', 'EAG070', 'Pós-Colheita de Grãos', 'bruno', 3, '3', ['lpc'], [o('eagri', 7)]),
            q('secag', 'EAG071', 'Secagem e Armazenagem', 'bruno', 4, '2+2', [], [o('eagri', 8)], { regentes: ['elisa'] }), // 1 responsável + 1 regente
            q('instal', 'EAG081', 'Projeto de Instalações Elétricas Agroindustriais', 'marlon', 3, '3', [], [o('eagri', 8)]),
            q('energ', 'EAG082', 'Energização Rural', 'marlon', 3, '3', [], [o('eagri', 8)]),
            q('ctrl', 'ECA080', 'Controle e Automação Industrial', 'fabio', 4, '2+2', [], [o('ecaut', 8), o('eagri', 9, 'optativa')]),
            q('estr', 'ECV050', 'Teoria das Estruturas', 'fabio', 4, '2+2', [], [o('ecivil', 5)]),
            q('hidr', 'ECV060', 'Hidráulica', 'elisa', 4, '2+2', [], [o('ecivil', 6), o('eagri', 6)]),
            q('empr', 'ENG090', 'Empreendedorismo', 'diego', 2, '2', [], [o('eagri', 9, 'livre'), o('ecaut', 9, 'livre'), o('ecivil', 9, 'livre')]),
            q('tcc', 'ENG100', 'Trabalho de Conclusão de Curso', 'ana', 2, '2', [], [o('eagri', 10), o('ecaut', 10), o('ecivil', 10)])
        ];
        return d;
    }
    /** Grade de um curso só (Eng. Agrícola) com os outros dois como ocupações externas. */
    function criar(N) {
        N = N || (typeof Nucleo !== 'undefined' ? Nucleo : require('./nucleo.js'));
        const todos = criarCompleto(N);
        const r = N.gerar(todos, { semente: 11 });
        todos.grade = { alocacoes: r.alocacoes, naoAlocadas: r.naoAlocadas, geradaEm: '2026-11-16T12:00:00.000Z' };
        const d = N.separarCurso(todos, 'eagri');
        d.config.titulo = 'Grade horária — Engenharia Agrícola';
        d.externos = ['ecaut', 'ecivil'].map((c) => N.externoDe(N.separarCurso(todos, c), c, 'exemplo'));
        d.grade = { alocacoes: [], naoAlocadas: [], geradaEm: null };
        return N.normalizar(d); // mesmo formato de um arquivo aberto (ex.: divisão das aulas pelo padrão do curso)
    }
    return { criar, criarCompleto };
})();

if (typeof module !== 'undefined') module.exports = Exemplo;
