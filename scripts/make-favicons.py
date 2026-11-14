"""PNG favicons matching web/public/favicon.svg (a gold vault door). Run: PYTHONUTF8=1 python scripts/make-favicons.py"""
import os
from PIL import Image, ImageDraw

PUB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'public')


def icon(size):
    s = 8  # draw big, then downscale for smooth edges
    n = 64 * s
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = lambda v: v * s
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=u(14), fill='#131726')
    d.ellipse([u(8), u(8), u(56), u(56)], fill='#2a1a1c', outline='#d4a53a', width=u(5))
    # dashed red ring
    for k in range(16):
        a0 = k * 22.5
        d.arc([u(16), u(16), u(48), u(48)], a0, a0 + 13, fill='#e0344a', width=u(3))
    for x1, y1, x2, y2 in [(32, 17, 32, 25), (32, 39, 32, 47), (17, 32, 25, 32), (39, 32, 47, 32)]:
        d.line([u(x1), u(y1), u(x2), u(y2)], fill='#f0cf7a', width=u(4))
    d.ellipse([u(26), u(26), u(38), u(38)], fill='#d4a53a')
    d.ellipse([u(29.5), u(29.5), u(34.5), u(34.5)], fill='#131726')
    return img.resize((size, size), Image.LANCZOS)


icon(32).save(os.path.join(PUB, 'favicon-32.png'))
icon(180).save(os.path.join(PUB, 'apple-touch-icon.png'))
icon(512).save(os.path.join(PUB, 'icon-512.png'))
icon(48).save(os.path.join(PUB, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
print('favicons written')
