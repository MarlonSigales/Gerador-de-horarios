<!-- © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE). -->
# Gerador de Horários

Organiza os horários dos professores nas salas de aula e nos laboratórios, **um curso por grade**. Roda no navegador, sem instalar nada.

**Endereço:** https://marlonsigales.github.io/Gerador-de-horarios/

## Como usar
1. **Configuração:** ano e semestre do ano (no 1º semestre do ano as disciplinas dos semestres ímpares do curso são oferta e as dos pares, reoferta; no 2º, o contrário), dias e horários (padrão CEng/UFPel, períodos de 50 min).
2. **Curso:** escolha a unidade e o curso no catálogo da UFPel (Centro de Engenharias, unidade 444) e importe as disciplinas da matriz curricular (engenharias). Defina horários de oferta/reoferta e o turno preferido por semestre.
3. **Professores**, 4. **Salas e laboratórios**, 5. **Disciplinas** (professor responsável, aulas, salas, equivalentes, horários fixos).
6. **Outros cursos:** traga do MEGA (ou de JSON) as grades dos outros cursos do período. Professores e laboratórios já alocados por outro curso da mesma unidade ficam bloqueados; salas ficam bloqueadas para qualquer unidade. Mesma disciplina (código), mesmo professor e mesma sala = turma conjunta.
7. **Grade:** 🎲 *Aleatorizar* monta a grade; ✏️ *Editar* mostra na hora onde há conflito. Visões por semestre, professor, sala e relação com códigos de horário (ex.: 621 622 623 624).
8. **PDF.**

**Nuvem (MEGA):** a conta é do grupo; pastas `GeradorDeHorarios/<ano>-<semestre>/<unidade>/<curso>/` (uma versão por salvamento). **JSON:** Exportar baixa só o curso; Importar abre como grade ou usa como outro curso.

## Arquivos
- `js/nucleo.js` — regras, conflitos, gerador, outros cursos, matriz (sem tela; testado no Node).
- `js/app.js` — interface. `js/pdf.js` — PDF. `js/nuvem.js` — MEGA. `js/exemplo.js` — exemplo.
- `js/matrizes.js` — catálogo UFPel (gerado de `tools/matrizes-ceng.txt` por `tools/gerar_matrizes_js.py`).
- `tests/testes.js` — `node tests/testes.js`. `todoQA.txt` — diretrizes, feito, falta e QA.

© 2026 Marlon Sigales. Todos os direitos reservados (ver LICENSE).
