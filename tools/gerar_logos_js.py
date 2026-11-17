# © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
# Gera js/logos.js (logos em PNG base64 para o PDF, que não pode ler arquivos locais). Rodar: python3 tools/gerar_logos_js.py
import base64, io, json, os
from PIL import Image
raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
saida = {}
for nome in ['ufpel', 'ceng', 'ea', 'lia']:
    im = Image.open(os.path.join(raiz, 'img', 'logos', nome + '.png')).convert('RGBA')
    fundo = Image.new('RGBA', im.size, (255, 255, 255, 255)); fundo.alpha_composite(im); im = fundo.convert('RGB')
    alt = 140; im = im.resize((round(im.width * alt / im.height), alt), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True)
    saida[nome] = {'w': im.width, 'h': im.height, 'src': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}
with open(os.path.join(raiz, 'js', 'logos.js'), 'w', encoding='utf-8') as f:
    f.write('/* © 2026 Gerador de Horários — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE). */\n')
    f.write('/* Logos para o PDF (PNG em base64). Gerado por tools/gerar_logos_js.py — não editar à mão. */\n')
    f.write('const LOGOS_PDF = ' + json.dumps(saida) + ';\n')
print({k: (v['w'], v['h'], len(v['src'])) for k, v in saida.items()})
