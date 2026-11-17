<!-- © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE). -->
# Gerador de Horários

Organiza os horários dos professores nas salas de aula e nos laboratórios. Roda no navegador, sem instalar nada.

**Endereço:** https://marlonsigales.github.io/Gerador-de-horarios/

## Como usar
1. **Configuração:** ano, metade do ano (na 1ª metade os semestres ímpares são oferta e os pares, reoferta; na 2ª, o contrário), dias e horários das aulas.
2. **Cursos:** número de semestres e horários de funcionamento para ofertas e para reofertas.
3. **Professores:** horários em que cada um não pode dar aula.
4. **Salas e laboratórios:** horários proibidos, responsáveis e se aceitam aulas de outros professores.
5. **Disciplinas:** professor responsável, aulas por semana, cursos (obrigatória, optativa ou livre em cada um), salas, equivalentes e horários fixos.
6. **Grade:** 🎲 *Aleatorizar* monta a grade pelas regras; ✏️ *Editar* deixa mudar à mão, e o sistema mostra na hora onde há conflito.
7. **PDF:** grades por curso e semestre, por professor e por sala, lista de disciplinas e conflitos.

Os dados ficam no navegador (salvos sozinhos). *Salvar arquivo* baixa um `.json` para guardar ou passar adiante.

## Regras
- Professor e sala/laboratório não têm duas aulas ao mesmo tempo, a não ser que as disciplinas sejam equivalentes (viram uma turma só, no mesmo horário e na mesma sala).
- No mesmo semestre de um curso não há duas aulas no mesmo horário.
- Horários proibidos de professores e salas; horários fixos de disciplinas; horários de funcionamento de cada curso para oferta e reoferta.
- Responsáveis por laboratório têm prioridade e decidem quem mais pode usar o espaço.

## Arquivos
- `js/nucleo.js` — regras, conflitos e gerador (sem tela; testado no Node).
- `js/app.js` — interface. `js/pdf.js` — PDF. `js/exemplo.js` — exemplo pronto.
- `tests/testes.js` — `node tests/testes.js`.
- `todoQA.txt` — diretrizes, o que foi feito, o que falta e o QA.

© 2026 Marlon Sigales. Todos os direitos reservados (ver LICENSE).
