# © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
# Gera js/matrizes.js a partir de tools/matrizes-ceng.txt. Rodar: python3 tools/gerar_matrizes_js.py
import json, os
raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cursos, atual = [], None
for linha in open(os.path.join(raiz, 'tools', 'matrizes-ceng.txt'), encoding='utf-8'):
    linha = linha.rstrip('\n')
    if not linha or linha.startswith('#'): continue
    if linha.startswith('@CURSO '):
        p = linha[7:].split('|') + ['', '', '', '']
        atual = {'cod': int(p[0]), 'nome': p[1], 'grau': p[2], 'turno': p[3] or 'integral', 'semestres': 10 if 'sem-matriz' not in p[4] else 0,
                 'url': f'https://institucional.ufpel.edu.br/cursos/cod/{p[0]}', 'matriz': [] if 'sem-matriz' not in p[4] else None}
        cursos.append(atual); continue
    sem, cod, nome, cr, h, car = linha.split('|')
    if sem not in ('OPT',) and not sem.isdigit(): continue  # atividades complementares e de extensão: sem aula
    atual['matriz'].append({'sem': 0 if sem == 'OPT' else int(sem), 'codigo': cod, 'nome': nome, 'creditos': int(cr) if cr.strip().isdigit() else 0,
                            'horas': int(h) if h.strip().isdigit() else 0, 'carater': 'optativa' if sem == 'OPT' else 'obrigatoria'})
cat = {'fonte': 'https://institucional.ufpel.edu.br/unidades/id/444', 'extraidoEm': '2026-11-17',
       'unidades': [{'id': 444, 'nome': 'Centro de Engenharias', 'sigla': 'CEng', 'cursos': cursos}]}
with open(os.path.join(raiz, 'js', 'matrizes.js'), 'w', encoding='utf-8') as f:
    f.write('/* © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE). */\n')
    f.write('/* Cursos de graduação da UFPel por unidade e matrizes curriculares das engenharias. Gerado por tools/gerar_matrizes_js.py — não editar à mão. */\n')
    f.write('const CATALOGO_UFPEL = ' + json.dumps(cat, ensure_ascii=False) + ';\n')
    f.write("if (typeof module !== 'undefined') module.exports = CATALOGO_UFPEL;\n")
for c in cursos:
    m = c['matriz']
    print(c['cod'], c['nome'], 'sem matriz' if m is None else f"{sum(1 for x in m if x['sem'])} obrig., {sum(1 for x in m if not x['sem'])} opt., semestres {sorted(set(x['sem'] for x in m if x['sem']))[-1]}")
