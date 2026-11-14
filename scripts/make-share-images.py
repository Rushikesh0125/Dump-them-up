"""Share cards for X / link previews (1200x630 PNG), drawn in The Daily Dump style.

Writes into web/public:
  og.png                         site card (index.html)
  share/<a>-dumps-<t>.png        a cartel won a hit on another
  share/<a>-busted-<t>.png       a cartel's hitter got busted
  b/<slug>/index.html            tiny page with og/twitter tags that forwards people to the game

Run from the repo root:  PYTHONUTF8=1 python scripts/make-share-images.py
Mascot grids and colours mirror web/src/game/config.ts.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'web', 'public')
FONTS = os.path.join(ROOT, 'web', 'node_modules', '@fontsource')
SITE = 'https://dump-them-up.pages.dev'

def font(pkg, file, size):
    return ImageFont.truetype(os.path.join(FONTS, pkg, 'files', file), size)

DISPLAY = lambda s: font('abril-fatface', 'abril-fatface-latin-400-normal.woff', s)
MONO = lambda s: font('courier-prime', 'courier-prime-latin-400-normal.woff', s)
MONO_B = lambda s: font('courier-prime', 'courier-prime-latin-700-normal.woff', s)

NIGHT, PAPER, INK, RED_INK, GREEN_INK, GOLD = '#131726', '#e8dcc0', '#1a1613', '#8a1c2b', '#2f7a46', '#d4a53a'
HAT = ['...HHHHHH...', '...BBBBBB...', '.HHHHHHHHHH.']
CARTELS = {
    'dragon': dict(name='Black Dragon', ticker='$BLACKDRAGON', neon='#ff6a3d',
                   mascot=HAT + ['..K......K..', '..KX....XK..', '...XXXXXX...', '..XXXXXXXX..', '.XXYKXXYKXX.', '.XXXXXXXXXX.', '..XOOOOOOX..', '..XOWOOWOX..', '...XOOOOX...', '....XXXX....', '.....XX.....', '............', '............'],
                   palette=dict(H='#2b2420', B='#c9a24a', X='#a8322a', K='#1a0e10', Y='#ffd54a', O='#ff7a3d', W='#fff3e0')),
    'shitzu': dict(name='Shitzu', ticker='$SHITZU', neon='#d4a53a',
                   mascot=HAT + ['XXXX....XXXX', 'XXXXXXXXXXXX', '.XXXXXXXXXX.', '.XKXXXXXXKX.', '.XXXXXXXXXX.', '.XXXWWWWXXX.', '..XWWKKWWX..', '..XWWWWWWX..', '...XWOOWX...', '....XXXX....', '............', '............', '............'],
                   palette=dict(H='#2b2420', B='#e0344a', X='#e0a43a', K='#2a1a10', Y='#ffd54a', O='#ff6f8a', W='#fff1d0')),
    'neko': dict(name='NEKO', ticker='$NEKO', neon='#ff5fae',
                 mascot=HAT + ['XX........XX', 'XXX......XXX', 'XXXXXXXXXXXX', 'XKKXXXXXXKKX', 'XKKXXXXXXKKX', 'XXXXXOOXXXXX', 'XXXXWWWWXXXX', '.XXXXXXXXXX.', '..XXXXXXXX..', '............', '............', '............', '............'],
                 palette=dict(H='#2b2420', B='#efe6d2', X='#ff5fae', K='#2a0f22', Y='#ffd54a', O='#ffd0e6', W='#ffffff')),
}
ORDER = ['dragon', 'shitzu', 'neko']


def mascot(d: ImageDraw.ImageDraw, cid, x, y, px):
    c = CARTELS[cid]
    for r, row in enumerate(c['mascot']):
        for col, ch in enumerate(row):
            if ch in c['palette']:
                d.rectangle([x + col * px, y + r * px, x + (col + 1) * px - 1, y + (r + 1) * px - 1], fill=c['palette'][ch])


def portrait(img, cid, x, y, px=13, label=None):
    """Mascot in a neon-framed door panel, like the vault cards in the game."""
    d = ImageDraw.Draw(img)
    c = CARTELS[cid]
    w, h = 12 * px + 36, 13 * px + 36  # last rows of the grid are empty
    d.rounded_rectangle([x, y, x + w, y + h], radius=12, fill=NIGHT, outline=c['neon'], width=6)
    mascot(d, cid, x + 18, y + 18, px)
    if label:
        f = DISPLAY(28)
        tw = d.textlength(label, font=f)
        d.rounded_rectangle([x + w / 2 - tw / 2 - 12, y + h + 10, x + w / 2 + tw / 2 + 12, y + h + 52], radius=6, fill=NIGHT, outline=c['neon'], width=3)
        d.text((x + w / 2, y + h + 31), label, font=f, fill=c['neon'], anchor='mm')
    return w, h


def skyline(d):
    import random
    rnd = random.Random(7)
    x = 0
    while x < 1200:
        w, h = rnd.randint(40, 110), rnd.randint(60, 190)
        d.rectangle([x, 630 - h, x + w, 630], fill='#1b2033')
        x += w + rnd.randint(2, 10)
    d.ellipse([1070, 26, 1140, 96], fill='#efe0b8')
    d.ellipse([1052, 18, 1120, 86], fill=NIGHT)


def stamp(img, text, color, cx, cy, angle=-12, size=58):
    f = DISPLAY(size)
    tmp = Image.new('RGBA', (560, 180), (0, 0, 0, 0))
    td = ImageDraw.Draw(tmp)
    tw = td.textlength(text, font=f)
    td.rounded_rectangle([280 - tw / 2 - 22, 40, 280 + tw / 2 + 22, 140], radius=10, outline=color, width=8)
    td.text((280, 90), text, font=f, fill=color, anchor='mm')
    rot = tmp.rotate(angle, resample=Image.BICUBIC, expand=True)
    img.alpha_composite(rot, (int(cx - rot.width / 2), int(cy - rot.height / 2)))


def fit_lines(d, text, f, max_w):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=f) <= max_w:
            cur = t
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def card(headline, color, sub, attacker=None, target=None, won=None):
    img = Image.new('RGBA', (1200, 630), NIGHT)
    d = ImageDraw.Draw(img)
    skyline(d)
    # newspaper sheet: masthead + headline on top, the faceoff underneath
    d.rectangle([48, 26, 1152, 548], fill=PAPER)
    d.text((80, 44), 'THE DAILY DUMP', font=MONO_B(24), fill=INK)
    d.text((1120, 44), 'EXTRA EDITION', font=MONO_B(24), fill=INK, anchor='ra')
    d.line([80, 78, 1120, 78], fill=INK, width=4)
    hf = DISPLAY(66)
    lines = fit_lines(d, headline, hf, 1040)
    y = 90
    for ln in lines:
        d.text((600, y), ln, font=hf, fill=color, anchor='ma')
        y += hf.size + 8
    d.text((600, y + 18), sub, font=MONO(24), fill='#3a2f24', anchor='ma')
    d.line([80, y + 58, 1120, y + 58], fill='#b9a985', width=2)
    if attacker:
        px = 11
        w = 12 * px + 36
        top = y + 74
        portrait(img, attacker, 600 - 110 - w, top, px=px)
        portrait(img, target, 600 + 110, top, px=px)
        mid = top + (13 * px + 36) / 2
        d.text((600, mid), 'VS', font=DISPLAY(54), fill=INK, anchor='mm')
        stamp(img, 'DUMPED!' if won else 'BUSTED', GREEN_INK if won else RED_INK, 600 + 110 + w / 2, mid, size=50)
    # bottom band
    d.rectangle([0, 562, 1200, 630], fill='#0c0f1a')
    d.text((48, 596), 'DUMP THEM UP', font=DISPLAY(34), fill='#efe6d2', anchor='lm')
    d.text((1152, 596), 'play free · dump-them-up.pages.dev', font=MONO_B(24), fill=GOLD, anchor='rm')
    return img.convert('RGB')


def site_card():
    img = Image.new('RGBA', (1200, 630), NIGHT)
    d = ImageDraw.Draw(img)
    skyline(d)
    f = DISPLAY(110)
    parts = [('DUMP ', '#efe6d2'), ('THEM ', '#e0344a'), ('UP', '#efe6d2')]
    total = sum(d.textlength(t, font=f) for t, _ in parts)
    x = 600 - total / 2
    for t, c in parts:
        d.text((x, 60), t, font=f, fill=c)
        x += d.textlength(t, font=f)
    d.text((600, 210), 'Memecoin cartels hit each other’s vaults.', font=MONO_B(32), fill='#ddd0b6', anchor='mm')
    for i, cid in enumerate(ORDER):
        portrait(img, cid, 150 + i * 330, 260, px=13, label=CARTELS[cid]['ticker'])
    d.rectangle([0, 560, 1200, 630], fill='#0c0f1a')
    d.text((600, 595), 'Play free · no wallet needed · dump-them-up.pages.dev', font=MONO_B(26), fill=GOLD, anchor='mm')
    return img.convert('RGB')


PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title} · Dump Them Up</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Dump Them Up">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{site}/share/{slug}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="{site}/b/{slug}/">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{site}/share/{slug}.png">
<meta http-equiv="refresh" content="0; url=/">
</head>
<body style="background:#131726;color:#efe6d2;font-family:monospace">
<p><a href="/" style="color:#d4a53a">Play Dump Them Up</a></p>
</body>
</html>
"""


def main():
    os.makedirs(os.path.join(PUB, 'share'), exist_ok=True)
    site_card().save(os.path.join(PUB, 'og.png'), optimize=True)
    n = 0
    for a in ORDER:
        for t in ORDER:
            if a == t:
                continue
            A, T = CARTELS[a], CARTELS[t]
            for won in (True, False):
                slug = f"{a}-{'dumps' if won else 'busted'}-{t}"
                if won:
                    head = f"{A['name'].upper()} CARTEL DUMPS {T['name'].upper()}!"
                    sub = f"{T['ticker']} dumped through the pool, loot cleaned into {A['ticker']}"
                    title = f"{A['name']} cartel dumps the {T['name']} vault"
                else:
                    head = f"{A['name'].upper()} HITTER BUSTED AT {T['name'].upper()} DOOR"
                    sub = f"The hitter's stake just bought {T['ticker']} for its stakers"
                    title = f"{A['name']} hitter busted at the {T['name']} door"
                card(head, INK if won else RED_INK, sub, a, t, won).save(os.path.join(PUB, 'share', f'{slug}.png'), optimize=True)
                page_dir = os.path.join(PUB, 'b', slug)
                os.makedirs(page_dir, exist_ok=True)
                desc = 'Memecoin cartels hit each other’s vaults. Pick a side and play free, no wallet needed.'
                with open(os.path.join(page_dir, 'index.html'), 'w', encoding='utf-8') as fh:
                    fh.write(PAGE.format(title=title, desc=desc, site=SITE, slug=slug))
                n += 1
    print(f'wrote og.png + {n} result cards and share pages')


if __name__ == '__main__':
    main()
