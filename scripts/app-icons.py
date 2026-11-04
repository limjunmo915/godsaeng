# 앱 아이콘: 갓 + 심박(연두 바탕) 원본에서 잉크 모양만 뽑아 크기별로 다시 그림, 시작 화면은 깐족이
import sys, glob
from PIL import Image, ImageDraw
src, proj = sys.argv[1], sys.argv[2]
LIME, INK = (198, 255, 61), (20, 26, 11)
im = Image.open(src).convert('RGB'); w, h = im.size
a = Image.new('L', im.size)
a.putdata([max(0, min(255, int((190 - (0.299*r + 0.587*g + 0.114*b)) / 170 * 255))) for r, g, b in im.getdata()])
mark = Image.new('RGBA', im.size, INK + (255,)); mark.putalpha(a); mark = mark.crop(a.getbbox())
def icon(size, scale, shape='square', bg=True):
    c = Image.new('RGBA', (size, size), (LIME + (255,)) if bg and shape == 'square' else (0, 0, 0, 0))
    if bg and shape == 'round':   # 4배로 그려 줄여서 테두리를 매끈하게
        big = Image.new('RGBA', (size * 4, size * 4), (0, 0, 0, 0)); ImageDraw.Draw(big).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=LIME + (255,))
        c = big.resize((size, size), Image.LANCZOS)
    m = mark.copy(); m.thumbnail((int(size * scale), int(size * scale)), Image.LANCZOS)
    c.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2)); return c
pub = f'{proj}/src/public'
icon(192, .68).convert('RGB').save(f'{pub}/icon-192.png'); icon(512, .68).convert('RGB').save(f'{pub}/icon-512.png')
res = f'{proj}/android/app/src/main/res'
for d, n in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    icon(n, .7).save(f'{res}/mipmap-{d}/ic_launcher.png')
    icon(n, .62, 'round').save(f'{res}/mipmap-{d}/ic_launcher_round.png')
    icon(n * 108 // 48, .5, bg=False).save(f'{res}/mipmap-{d}/ic_launcher_foreground.png')   # 적응형: 가운데 66% 안전 영역 안에
# 시작 화면(splash): 깐족이 그림을 화면 비율에 맞게 가운데 잘라 채움
sp = Image.open(f'{pub}/img/kk/splash.webp').convert('RGB')
for f in glob.glob(f'{res}/drawable*/splash.png'):
    W, H = Image.open(f).size; k = max(W / sp.width, H / sp.height)
    t = sp.resize((round(sp.width * k), round(sp.height * k)), Image.LANCZOS)
    t.crop(((t.width - W) // 2, (t.height - H) // 2, (t.width - W) // 2 + W, (t.height - H) // 2 + H)).save(f)
print('ok', mark.size)
