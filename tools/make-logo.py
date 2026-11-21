"""Builds every Light icon from one drawing (icons/icon.svg) using headless Chrome (or Edge).

python tools/make-logo.py

Writes: icons/icon-192.png, icon-512.png, maskable-512.png, mark.svg and the Android
launcher (adaptive foreground/background/monochrome, legacy icons) and splash images.
"""
import os
import re
import shutil
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
BROWSERS = [r'C:\Program Files\Google\Chrome\Application\chrome.exe', r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
            '/usr/bin/google-chrome', '/usr/bin/chromium']

src = open(os.path.join(ROOT, 'icons', 'icon.svg'), encoding='utf-8').read()
defs = re.search(r'<defs>.*?</defs>', src, re.S).group(0)
body = src.split('</defs>', 1)[1].rsplit('</svg>', 1)[0]
tiles = '\n'.join(l for l in body.splitlines() if 'rx="116"' in l)          # background + glow
mark = '\n'.join(l for l in body.splitlines() if l.strip() and 'rx="116"' not in l and '<title>' not in l)
CX, CY = 256, 262  # visual centre of the mark


def svg(inner, extra_defs=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{defs.replace("</defs>", extra_defs + "</defs>")}{inner}</svg>'


def scaled(s, inner=mark):
    return f'<g transform="translate(256 256) scale({s}) translate({-CX} {-CY})">{inner}</g>'


full_bg = tiles.replace(' rx="116"', '')
variants = {
    'tile': svg(body),                                   # rounded tile (favicon, legacy launcher, PWA "any")
    'maskable': svg(full_bg + scaled(0.78)),             # full-bleed square, mark inside the safe circle
    'fg': svg(scaled(0.7)),                              # Android adaptive foreground (transparent)
    'bg': svg(full_bg),                                  # Android adaptive background
    'mono': svg(scaled(0.7, re.sub(r'(fill|stroke)="url\(#\w+\)"', r'\1="#ffffff"', mark).replace('opacity="0.75"', '').replace('opacity="0.5"', ''))),
    'splash': svg(scaled(0.86)),                         # Android 12+ splash icon (transparent)
}
open(os.path.join(ROOT, 'icons', 'mark.svg'), 'w', encoding='utf-8').write(svg(scaled(1.0)))

browser = next((b for b in BROWSERS if os.path.exists(b)), None)
assert browser, 'Need Edge or Chrome to render the icons'
tmp = os.path.realpath(tempfile.mkdtemp())


def render(name, size, out):
    page = os.path.join(tmp, f'{name}.html')
    with open(page, 'w', encoding='utf-8') as f:
        f.write(f'<!doctype html><style>html,body{{margin:0;background:transparent}}svg{{display:block;width:{size}px;height:{size}px}}</style>{variants[name]}')
    png = os.path.join(tmp, f'{name}-{size}.png')
    subprocess.run([browser, '--headless=new', f'--user-data-dir={os.path.join(tmp, "profile")}', '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
                    f'--window-size={size},{size}', '--default-background-color=00000000', f'--screenshot={png}', 'file:///' + page.replace('\\', '/')],
                   check=True, capture_output=True)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    shutil.copy(png, out)
    print('wrote', os.path.relpath(out, ROOT))


for s in (192, 512):
    render('tile', s, os.path.join(ROOT, 'icons', f'icon-{s}.png'))
render('maskable', 512, os.path.join(ROOT, 'icons', 'maskable-512.png'))
render('tile', 180, os.path.join(ROOT, 'icons', 'apple-touch-icon.png'))

for dpi, mult in (('xxhdpi', 3), ('xxxhdpi', 4)):
    d = os.path.join(RES, f'mipmap-{dpi}')
    render('tile', 48 * mult, os.path.join(d, 'ic_launcher.png'))
    render('fg', 108 * mult, os.path.join(d, 'ic_launcher_foreground.png'))
    render('bg', 108 * mult, os.path.join(d, 'ic_launcher_background.png'))
    render('mono', 108 * mult, os.path.join(d, 'ic_launcher_monochrome.png'))
    render('splash', 160 * mult, os.path.join(RES, f'drawable-{dpi}', 'splash_mark.png'))
shutil.rmtree(tmp, ignore_errors=True)
