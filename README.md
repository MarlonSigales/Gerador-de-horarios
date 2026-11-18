<!-- © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE). -->
# Gerador de Horários

Organiza os horários dos professores nas salas de aula e nos laboratórios, **um curso por grade**. Roda no navegador, sem instalar nada.

**Endereço:** https://marlonsigales.github.io/Gerador-de-horarios/

## Como usar
1. **Configuração:** link do calendário acadêmico vigente, eventos do curso (semana acadêmica etc.), ano e semestre do ano (no 1º semestre do ano as disciplinas dos semestres ímpares do curso são oferta e as dos pares, reoferta; no 2º, o contrário), dias e horários (padrão CEng/UFPel, períodos de 50 min).
2. **Curso:** escolha a unidade e o curso no catálogo da UFPel (Centro de Engenharias, unidade 444) e importe as disciplinas da matriz curricular (9 engenharias e Geoprocessamento; aulas/semana pela carga horária real, horas ÷ 15). Defina horários de oferta/reoferta e o turno preferido por semestre.
3. **Professores**, 4. **Salas e laboratórios**, 5. **Disciplinas** (professor responsável e regentes — todos dão aula; colisão responsável × responsável = erro, responsável × regente = aviso, regente × regente = aviso leve —, aulas, salas, equivalentes, horários fixos).
6. **Outros cursos:** traga do MEGA (ou de JSON) as grades dos outros cursos do período. Professores e laboratórios já alocados por outro curso da mesma unidade ficam bloqueados; salas ficam bloqueadas para qualquer unidade. Mesma disciplina (código), mesmo professor e mesma sala = turma conjunta.
7. **Grade:** entre (🔑) como curso ou professor. 🎲 *Aleatorizar* (curso) sorteia só as aulas não fixadas; ✏️ *Editar*: clique numa célula vazia para colocar uma aula (disciplina, aulas, sala/laboratório) ou mova uma aula; tudo que é colocado à mão fica 🔒 fixado. O professor mexe só nas suas aulas. Visões por semestre, professor, sala e relação com códigos de horário (ex.: 621 622 623 624).
8. **PDF:** grades, relação com códigos e, no fim, o calendário acadêmico vigente (feriados, dias letivos e disciplinas mais prejudicadas).
9. **Área do professor:** cada professor entra com o nome e a senha que cria no primeiro acesso; vê o rendimento (cadeiras, horas em sala, laboratório, preparo, pesquisa) contra as médias e desvios do curso e da unidade; faz os planos de ensino pré-preenchidos (DOCX no modelo do dia a dia, cronograma do calendário vigente com feriados; o conteúdo fica salvo e no próximo semestre só mudam as datas) e o RAAD do ano corrente pré-preenchido (DOCX). Dados individuais só neste navegador e por download (JSON) — nunca no MEGA.
10. **Relatórios internos (adm):** verificação interna (médias e desvios padrões do curso e da unidade, PDF), carga horária dos professores, uso das salas e laboratórios, horários de pesquisa. Login de administrador na própria interface.

**Nuvem (MEGA):** a conta é do grupo; pastas `GeradorDeHorarios/<ano>-<semestre>/<unidade>/<curso>/` (uma versão por salvamento) e `.../<unidade>/_unidade/` (dados da unidade). **JSON:** curso (horários + relação de professores), unidade (salas, professores, cursos, calendário) e individual (só por download).

## Arquivos
- `js/nucleo.js` — regras, conflitos, gerador, outros cursos, matriz (sem tela; testado no Node).
- `js/app.js` — interface. `js/pdf.js` — PDF. `js/nuvem.js` — MEGA. `js/exemplo.js` — exemplo.
- `js/planos.js` — rendimento, verificação interna, plano de ensino, RAAD, dados individuais e da unidade (sem tela). `js/docx-docs.js` — DOCX.
- `js/ufpel-leitor.js` — leitor das páginas públicas do portal institucional (cursos e disciplinas; só contagens de alunos).
- `tools/atualizar-ufpel.mjs` + `.github/workflows/atualizar-ufpel.yml` — robô diário que grava `data/ufpel/` (turmas, professores, ementas, alunos, egressos).
- `js/matrizes.js` — catálogo UFPel (gerado de `tools/matrizes-ceng.txt` por `tools/gerar_matrizes_js.py`).
- `tests/testes.js` — `node tests/testes.js`. `todoQA.txt` — diretrizes, feito, falta e QA.

© 2026 Marlon Sigales. Todos os direitos reservados (ver LICENSE).
