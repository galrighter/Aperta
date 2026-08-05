# בונה את חבילת הגרפיקות לרשתות החברתיות (docs/brand/social/*.jpg / *.png) מאותה
# גאומטריה של הסימן והמילולוגו שמשמשת את האתר (src/components/site/BrandMark.tsx,
# Wordmark.tsx) ואת תצלומי המוצר מ-public/. הרצה:
#
#   python3 docs/brand/social/build-social-assets.py
#
# דורש: תמונת Chromium מקומית (המשתנה CHROME_BIN למטה, או דגל --chrome) וגישת
# רשת ל-fonts.googleapis.com (Archivo + Assistant, כמו שהאתר עצמו טוען אותם).
# משנה רק את docs/brand/social/*.jpg ו-*.png — לא נוגע ב-public/ או בקוד האתר.

import argparse
import os
import shutil
import subprocess
import sys
import tempfile

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PUBLIC_DIR = os.path.join(REPO_ROOT, "public")
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

DEFAULT_CHROME_CANDIDATES = [
    os.environ.get("CHROME_BIN", ""),
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    shutil.which("chromium"),
    shutil.which("chromium-browser"),
    shutil.which("google-chrome"),
]

MARK_PATH = "M56.72 15.01A30 30 0 1 1 23.48 3.24L24.64 6.15A25.91 26.96 0 1 0 53.35 16.73Z"
MARK_ACCENT_PATH = "M42.01 3.72A30 30 0 0 1 56.72 15.01L53.35 16.73A25.91 26.96 0 0 0 40.65 6.59Z"
WORDMARK_PATH = "M10.45 0.05L10.6 0.05L11.35 1.9L11.6 2.4L11.75 2.8L12 3.3L12.25 3.95L12.8 5.1L13.05 5.75L13.3 6.25L14.05 8.05L14.3 8.5C14.5 9 14.5 9 14.5 9.2L14.6 9.2L14.8 9.7L15 10.1L15.25 10.75L15.8 11.95L15.95 12.35L16.2 12.85L17.55 16L17.8 16.5L18.55 18.3L19.1 19.2L19.2 19.2L19.4 19.45L19.5 19.5L19.5 19.6L20.15 19.9L20.15 20.05L16.7 20.05L16.7 19.9L16.95 19.7C17.05 19.5 17.05 19.5 17.05 18.7C16.75 17.9 16.75 17.9 16.5 17.4L16.1 16.45C15.85 15.85 15.85 15.85 15.8 15.6L15.7 15.6L15.45 14.95L15.1 14.2L15.1 13.9L15 13.9C14.8 13.5 14.8 13.5 14.65 13.1L14.5 12.85L14.25 12.2L14.1 11.9L14.1 11.7L14 11.7L13.75 11.05L13.6 10.8L13.35 10.1L13.1 9.6C12.9 9.2 12.9 9.2 12.75 8.8L12.5 8.3L12.25 7.65L11.65 6.3L11.3 5.6L11.05 4.95L10.8 4.45L10.65 4.05L10.2 3.1L9.9 2.4L9.9 2.2L9.75 2.25L9.6 2.65L8.85 4.15L8.7 4.55L8.25 5.4L8 6L7.25 7.5L7.1 7.9L6.65 8.75L6.3 9.6L5.85 10.45L5.5 11.25L4.2 13.9L4.1 13.9L4.05 14.25L2.05 18.5C2 19.25 2 19.25 2.1 19.6L2.15 19.8L2.35 19.9L2.4 20.05L0.05 20.05L0.1 19.9L0.6 19.65C1.1 19.2 1.1 19.2 1.4 18.8L1.5 18.8L1.55 18.6L1.85 18.1L2.2 17.3L4.15 13.25L4.5 12.45L7.95 5.3L8.3 4.5L8.75 3.65L9.1 2.8L9.55 1.95L9.9 1.15L10.45 0.05ZM83.15 2.7L83.3 2.7L83.3 7.6L86.6 7.6L86.65 7.85C86.47 8.04 86.13 7.9 85.88 7.9L83.3 7.9L83.33 16.45C83.34 18.33 83.34 18.33 83.75 19.15L83.8 19.3L83.9 19.3L83.9 19.4L84.6 19.75C85.58 19.81 86.1 19.7 86.95 19.2L87.05 19.45C86.16 20.2 85.17 20.24 84.05 20.2C83.25 19.99 82.88 19.78 82.3 19.2C81.8 18.29 81.75 17.53 81.74 16.5L81.7 6.7C81.35 6.61 80.98 6.65 80.62 6.65L79.75 6.65L79.65 6.5L79.7 6.4L80.35 6.2L81.4 5.7L81.4 5.6L81.8 5.25C82.05 5 82.05 5 82.2 4.8L82.3 4.8L82.4 4.55L82.65 4.2C82.85 3.75 82.85 3.75 83.05 3.05L83.15 2.7ZM101.1 8.1L101.1 8.2L101.3 8.3L101.4 8.5L101.5 8.5C102.35 9.77 102.32 10.96 102.32 12.45L102.33 17.72C102.33 19 102.33 19 102.5 19.5L102.6 19.8L102.7 19.8L102.8 20C102.23 20.15 101.53 20.05 100.95 20.05C100.57 19.29 100.69 18.38 100.7 17.55L100.6 17.55L100.55 17.75L100.2 18.3L100.1 18.3L100 18.5L99.6 18.9L99.5 18.9L99.5 19C97.91 20.06 96.27 20.28 94.4 19.95C93.88 19.8 93.47 19.66 93 19.4L93 19.3L92.75 19.2C92.22 18.66 91.95 18.19 91.8 17.45C91.8 16.62 91.94 16 92.4 15.3L92.5 15.3L92.6 15.1C93.97 13.74 95.79 13.25 97.6 12.75L99.25 12.25C100.38 11.88 100.38 11.88 100.65 11.6C100.68 9.4 100.68 9.4 100.15 8.35C99.45 7.65 98.78 7.47 97.8 7.35C96.35 7.35 95.18 7.75 93.95 8.45L93.8 8.5L93.8 8.6C93.4 8.9 93.4 8.9 93.3 8.9L93.3 9L93.2 9L93.2 9.1L93.1 9.1L93.1 9.2L92.9 9.25L92.85 9.1C93.3 8.2 93.88 7.79 94.8 7.4C96.98 6.78 99.17 6.81 101.1 8.1ZM100 12.25L98.95 12.65L97.7 13C95.6 13.7 95.6 13.7 94.7 14.3L94.7 14.4L94.5 14.5C93.84 15.1 93.49 15.69 93.3 16.55C93.3 17.52 93.45 18.08 94.05 18.85C94.45 19.2 94.45 19.2 94.6 19.2L94.6 19.3C95.75 19.79 96.73 19.82 97.95 19.5L99.1 18.9L99.1 18.8L99.35 18.7C99.9 18.15 99.9 18.15 100 17.9L100.1 17.9C100.58 17.02 100.72 16.38 100.71 15.39L100.7 11.95C100.45 11.95 100.22 12.14 100 12.25ZM56.6 8.65L56.7 8.7L56.7 8.8L56.95 8.9L57.2 9.1L57.2 9.2L57.3 9.2L57.3 9.3L57.5 9.4L57.5 9.5L57.6 9.5C58.4 10.54 59.1 11.7 59.1 13.05C58.98 13.18 58.08 13.11 57.98 13.11L47.4 13.15C47.4 14.8 47.4 14.8 47.7 15.6L47.95 16.3L48.25 16.9L48.3 17.1L48.4 17.1L48.5 17.4L48.6 17.4C48.9 17.8 48.9 17.8 48.9 17.9L49 17.9L49 18L49.1 18L49.1 18.1L49.2 18.1L49.2 18.2L49.3 18.2L49.3 18.3L49.4 18.3L49.4 18.4L49.5 18.4L49.5 18.5L49.7 18.6L50.2 18.95C51 19.35 51 19.35 51.5 19.5L51.95 19.65C53.83 19.96 55.49 19.6 57.1 18.6L57.2 18.6L57.2 18.5L57.75 18.05C58.2 17.6 58.2 17.6 58.35 17.4L58.55 17.45C58.55 17.65 58.55 17.65 58.1 18.2L58 18.2L58 18.3L57.9 18.3L57.9 18.4C57.5 18.7 57.5 18.7 57.4 18.7L57.4 18.8C55.46 20.1 53.35 20.49 51.05 20.1C50.02 19.82 49.2 19.45 48.3 18.9L48.3 18.8L48.05 18.7L47.7 18.4L47.7 18.3L47.6 18.3C47.1 17.73 47.1 17.73 47.1 17.6L47 17.6C45.85 15.75 45.52 14.04 46 11.9C46.27 11.21 46.59 10.61 47 10L47.1 10L47.2 9.75L47.4 9.5L47.5 9.5L47.5 9.4L47.6 9.4L47.6 9.3L47.7 9.3L47.7 9.2C50.27 7.1 53.78 6.67 56.6 8.65ZM49.1 8.9L49.1 9L49 9L49 9.1L48.9 9.1C48.2 10.01 48.2 10.01 48.2 10.2L48.1 10.2C47.69 11.02 47.4 11.88 47.4 12.8L57.3 12.8C57.3 11.5 56.87 10.49 56.2 9.4L56.1 9.4L56 9.2L55.5 8.7L55.4 8.7L55.4 8.6C54.95 8.3 54.95 8.3 54.8 8.3L54.8 8.2C52.73 7.37 50.9 7.51 49.1 8.9ZM37.45 8.65C38.98 9.88 39.77 11.19 40.1 13.15C40.14 15.11 39.76 16.66 38.5 18.2L38.4 18.2L38.3 18.4L38.2 18.4L38.2 18.5L38.1 18.5L38.1 18.6C37.7 18.9 37.7 18.9 37.6 18.9L37.6 19C36.04 20.04 34.55 20.25 32.7 20.2C31.53 19.95 30.58 19.64 29.6 18.95L29.5 18.9L29.5 18.8L29.25 18.7L29.1 18.6L29.1 18.5L29 18.5L29 18.4L28.9 18.4L28.9 18.3L28.8 18.3L28.55 17.95L28.54 25.4C28.54 26.97 28.54 26.97 28.85 27.5L28.85 27.65L26.5 27.65C26.5 27.5 26.5 27.5 26.75 27.05C26.88 26.28 26.86 25.54 26.86 24.76L26.87 9.44C26.86 8.82 26.76 8.38 26.6 7.8L26.5 7.8L26.5 7.7L26.4 7.7L26.4 7.55L28.4 7.55C28.47 8.29 28.51 9.01 28.5 9.75L28.6 9.75L28.7 9.5L29.3 8.9L29.4 8.9L29.4 8.8C29.7 8.6 29.7 8.6 29.8 8.6L29.8 8.5C32.26 7.1 35.06 7.13 37.45 8.65ZM29.9 8.8L29.9 8.9L29.65 9L29.4 9.2L29.4 9.3L29.3 9.3L29.3 9.4L29.2 9.4L29.2 9.5L29.1 9.5C28.4 10.41 28.49 10.66 28.49 11.85L28.5 17.3L28.6 17.3L28.65 17.5L28.9 17.9L29 17.9L29.1 18.1L29.5 18.5L29.6 18.5L29.6 18.6C31.07 19.59 32.48 19.94 34.25 19.8C34.7 19.7 34.7 19.7 35.1 19.55L35.5 19.4C36.17 18.98 36.69 18.6 37.2 18L37.2 17.9L37.3 17.9C37.4 17.75 37.4 17.75 37.4 17.6L37.5 17.6C37.8 17.1 37.8 17.1 38.05 16.45L38.2 16.1C38.59 14.54 38.7 12.91 38.05 11.4L37.8 10.75L37.2 9.8L37.1 9.8L37 9.6C36.03 8.52 34.96 7.96 33.5 7.85C32.15 7.85 31.07 8.13 29.9 8.8ZM75.05 8.2C75.3 8.45 75.3 8.45 75.31 9.04L75.3 9.6L75.1 9.6L74.8 9.2L74.5 9L74.5 8.9L74.25 8.8L73.7 8.5C72.33 8.05 71.17 7.99 69.85 8.65L69.5 8.9L69.4 8.9L69.4 9L69.3 9L69.3 9.1L69.2 9.1L69.2 9.2L69.1 9.2L69.1 9.3L69 9.3L68.9 9.55L68.8 9.7L68.7 9.7L68.6 10L68.5 10L68.45 10.2L68.25 10.65C67.93 11.6 68 12.6 68 13.59L68 18.04C68 18.67 68.02 19.2 68.2 19.8L68.3 19.8L68.4 20.05L65.95 20.05C65.95 19.9 65.95 19.9 66.15 19.65C66.58 18.79 66.36 17.61 66.36 16.67L66.38 9.11C66.35 8.65 66.35 8.65 66.15 8L66.1 7.8L66 7.8L66 7.7L65.9 7.7L65.9 7.55L67.9 7.55C67.97 8.45 68.01 9.35 68 10.25L68.1 10.25L68.15 10L68.5 9.4L68.6 9.4L68.7 9.2C70.41 7.3 72.81 7.08 75.05 8.2Z"
WORDMARK_ACCENT_PATH = "M4.1 13.79L15.05 13.79L15.05 14.05L4.1 14.05Z"

PORCELAIN = "#f4f1eb"
GRAPHITE = "#202326"
LAPIS = "#3f6297"
LAPIS_INK = "#2c4a76"

FONTS_LINK = '''<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Assistant:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">'''

BASE_CSS = f'''
*{{margin:0;padding:0;box-sizing:border-box;}}
:root{{
  --porcelain:{PORCELAIN};
  --graphite:{GRAPHITE};
  --lapis:{LAPIS};
  --lapis-ink:{LAPIS_INK};
}}
'''

def mark_svg(size, fill=GRAPHITE, accent=LAPIS):
    return f'''<svg width="{size}" height="{size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
<path d="{MARK_PATH}" fill="{fill}"/>
<path d="{MARK_ACCENT_PATH}" fill="{accent}"/>
</svg>'''

def wordmark_svg(height, fill=GRAPHITE, accent=LAPIS):
    width = height * 102.7 / 27.6
    return f'''<svg width="{width:.2f}" height="{height}" viewBox="0 0 102.7 27.6" xmlns="http://www.w3.org/2000/svg">
<path d="{WORDMARK_PATH}" fill="{fill}"/>
<path d="{WORDMARK_ACCENT_PATH}" fill="{accent}"/>
</svg>'''

def lockup(height, fill=GRAPHITE, accent=LAPIS, gap="0.55em"):
    mark_size = height * 1.106
    return f'''<div style="display:flex;align-items:center;gap:{gap};" dir="ltr">
{mark_svg(mark_size, fill, accent)}
{wordmark_svg(height, fill, accent)}
</div>'''

def lockup_stacked(height, fill=GRAPHITE, accent=LAPIS, gap="0.22em"):
    mark_size = height * 1.106
    return f'''<div style="display:flex;flex-direction:column;align-items:center;gap:{gap};" dir="ltr">
{mark_svg(mark_size, fill, accent)}
{wordmark_svg(height, fill, accent)}
</div>'''

BUILD_DIR = tempfile.mkdtemp(prefix="aperta-social-")
PAGES = []  # (html filename, png filename, width, height)

def photo_url(webp_name):
    return "file://" + os.path.join(PUBLIC_DIR, webp_name)

def write(name, html, size=None):
    path = os.path.join(BUILD_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    if size:
        PAGES.append((name, size))

# ---------------------------------------------------------------- 1. Profile picture (1000x1000)
profile = f'''<!doctype html><html><head><meta charset="utf-8">{FONTS_LINK}<style>{BASE_CSS}
html,body{{width:1000px;height:1000px;background:var(--porcelain);display:flex;align-items:center;justify-content:center;}}
</style></head><body>
{mark_svg(720)}
</body></html>'''
write("profile.html", profile, size=(1000, 1000))

# ---------------------------------------------------------------- 2/3. Covers
def cover_html(w, h, mark_h):
    return f'''<!doctype html><html><head><meta charset="utf-8">{FONTS_LINK}<style>{BASE_CSS}
html,body{{width:{w}px;height:{h}px;background:var(--porcelain);position:relative;overflow:hidden;font-family:'Assistant',sans-serif;}}
.photo{{position:absolute;top:0;bottom:0;right:0;width:{h*1.05:.0f}px;background-image:url('{photo_url("bracelet-hero.webp")}');background-size:cover;background-position:38% 30%;}}
.fade{{position:absolute;top:0;bottom:0;right:0;width:{h*1.05:.0f}px;background:linear-gradient(to right, var(--porcelain) 0%, rgba(244,241,235,0) 46%);}}
.content{{position:absolute;top:0;bottom:0;left:{h*0.14:.0f}px;display:flex;flex-direction:column;justify-content:center;gap:{h*0.09:.0f}px;}}
.tagline{{font-size:{h*0.088:.0f}px;color:var(--graphite);font-weight:600;letter-spacing:-0.01em;}}
.tagline .accent{{color:var(--lapis-ink);}}
</style></head><body>
<div class="photo"></div>
<div class="fade"></div>
<div class="content">
{lockup(h*0.30)}
<div class="tagline">אינסוף צורות<span class="accent">.</span> אחת שלך<span class="accent">.</span></div>
</div>
</body></html>'''

write("cover-facebook.html", cover_html(820, 312, 312), size=(820, 312))
write("cover-x.html", cover_html(1500, 500, 500), size=(1500, 500))

# ---------------------------------------------------------------- 4. Post: brand intro (ring-hero)
post_intro = f'''<!doctype html><html><head><meta charset="utf-8">{FONTS_LINK}<style>{BASE_CSS}
html,body{{width:1080px;height:1080px;background:var(--porcelain);position:relative;overflow:hidden;font-family:'Assistant',sans-serif;}}
.photo{{position:absolute;inset:0;background-image:url('{photo_url("ring-hero.webp")}');background-size:cover;background-position:50% 38%;}}
.top{{position:absolute;top:88px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:34px;text-align:center;}}
.headline{{font-family:'Archivo',sans-serif;font-weight:700;font-size:64px;color:var(--graphite);letter-spacing:-0.01em;}}
.headline .accent{{color:var(--lapis-ink);}}
.sub{{font-size:27px;color:var(--graphite);opacity:0.72;max-width:820px;font-weight:400;line-height:1.5;}}
</style></head><body>
<div class="photo"></div>
<div class="top">
{lockup(56)}
<div class="headline">אינסוף צורות<span class="accent">.</span> אחת שלך<span class="accent">.</span></div>
<div class="sub">תכשיט לא בוחרים מתוך מדף. הוא מתחיל בקו שרק את רואה — ונגמר בחפץ שאין עוד אחד כמוהו בעולם.</div>
</div>
</body></html>'''
write("post-intro.html", post_intro, size=(1080, 1080))

# ---------------------------------------------------------------- 5. Post: product feature (bracelet)
post_product = f'''<!doctype html><html><head><meta charset="utf-8">{FONTS_LINK}<style>{BASE_CSS}
html,body{{width:1080px;height:1080px;background:var(--porcelain);position:relative;overflow:hidden;font-family:'Assistant',sans-serif;}}
.photo{{position:absolute;inset:0;background-image:url('{photo_url("bracelet-hero.webp")}');background-size:cover;background-position:50% 40%;}}
.top{{position:absolute;top:80px;left:80px;}}
.card{{position:absolute;bottom:80px;left:80px;right:80px;background:rgba(244,241,235,0.92);backdrop-filter:blur(6px);border-radius:28px;padding:44px 52px;display:flex;align-items:center;justify-content:space-between;}}
.name{{font-family:'Archivo',sans-serif;font-weight:700;font-size:46px;color:var(--graphite);}}
.desc{{font-size:26px;color:var(--graphite);opacity:0.7;margin-top:10px;font-weight:400;}}
.price{{font-family:'Archivo',sans-serif;font-weight:700;font-size:40px;color:var(--lapis-ink);white-space:nowrap;}}
</style></head><body>
<div class="photo"></div>
<div class="top">{mark_svg(70)}</div>
<div class="card">
<div>
<div class="name">צמיד פתוח</div>
<div class="desc">פליז 1.5 מ״מ, חיתוך לייזר, עיצוב שלך</div>
</div>
<div class="price">מ-₪399</div>
</div>
</body></html>'''
write("post-product.html", post_product, size=(1080, 1080))

# ---------------------------------------------------------------- 6. Post: how it works (4 steps)
steps = [
    ("01", "מתארים", "סקיצה או מילים — גיאומטרי, אורגני, עדין או נועז"),
    ("02", "הבינה מציירת", "מנוע העיצוב מייצר גרסה, ואפשר לעדן בשיחה"),
    ("03", "בדיקת ייצור", "כל גרסה נבדקת אוטומטית מול מגבלות הייצור"),
    ("04", "מהעיצוב לתכשיט", "חיתוך לייזר, ערגול וליטוש ביד, עד הבית"),
]
step_rows = ""
for num, title, body in steps:
    step_rows += f'''<div style="display:flex;align-items:flex-start;gap:36px;padding:28px 0;border-bottom:1px solid rgba(32,35,38,0.12);">
<div style="font-family:'Archivo',sans-serif;font-weight:700;font-size:34px;color:var(--lapis);min-width:80px;">{num}</div>
<div>
<div style="font-family:'Archivo',sans-serif;font-weight:700;font-size:34px;color:var(--graphite);margin-bottom:8px;">{title}</div>
<div style="font-size:24px;color:var(--graphite);opacity:0.68;max-width:760px;">{body}</div>
</div>
</div>'''

post_how = f'''<!doctype html><html><head><meta charset="utf-8">{FONTS_LINK}<style>{BASE_CSS}
html,body{{width:1080px;height:1080px;background:var(--porcelain);font-family:'Assistant',sans-serif;}}
.wrap{{padding:90px 96px;height:100%;display:flex;flex-direction:column;}}
.header{{display:flex;align-items:center;justify-content:space-between;margin-bottom:46px;}}
.h1{{font-family:'Archivo',sans-serif;font-weight:700;font-size:52px;color:var(--graphite);}}
</style></head><body>
<div class="wrap">
<div class="header">
<div class="h1">איך זה עובד</div>
{lockup(40)}
</div>
{step_rows}
</div>
</body></html>'''
write("post-howitworks.html", post_how, size=(1080, 1080))

# ---------------------------------------------------------------- 7. Story (1080x1920)
story = f'''<!doctype html><html><head><meta charset="utf-8">{FONTS_LINK}<style>{BASE_CSS}
html,body{{width:1080px;height:1920px;background:var(--graphite);position:relative;overflow:hidden;font-family:'Assistant',sans-serif;}}
.bg{{position:absolute;inset:-40px;background-image:url('{photo_url("hand-wrist.webp")}');background-size:cover;background-position:50% 40%;filter:blur(40px) brightness(0.55) saturate(1.05);transform:scale(1.15);}}
.scrim{{position:absolute;inset:0;background:linear-gradient(to bottom, rgba(32,35,38,0.15) 0%, rgba(32,35,38,0) 22%, rgba(32,35,38,0) 62%, rgba(32,35,38,0.75) 100%);}}
.frame{{position:absolute;top:420px;left:60px;right:60px;bottom:520px;border-radius:36px;overflow:hidden;box-shadow:0 40px 90px rgba(0,0,0,0.35);}}
.frame img{{width:100%;height:100%;object-fit:cover;object-position:50% 30%;display:block;}}
.top{{position:absolute;top:130px;left:0;right:0;display:flex;justify-content:center;}}
.bottom{{position:absolute;bottom:150px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:44px;text-align:center;padding:0 90px;}}
.headline{{font-family:'Archivo',sans-serif;font-weight:700;font-size:58px;color:var(--porcelain);letter-spacing:-0.01em;}}
.headline .accent{{color:#8fb0dd;}}
.cta{{font-size:30px;font-weight:600;color:var(--graphite);background:var(--porcelain);padding:26px 64px;border-radius:100px;letter-spacing:0.01em;}}
.url{{font-size:24px;color:rgba(244,241,235,0.72);letter-spacing:0.02em;}}
</style></head><body>
<div class="bg"></div>
<div class="scrim"></div>
<div class="top">{lockup(52, fill="#f4f1eb", accent="#8fb0dd")}</div>
<div class="frame"><img src="{photo_url("hand-wrist.webp")}"></div>
<div class="bottom">
<div class="headline">עצבו את הפתוח<span class="accent"> </span>שלכם</div>
<div class="cta">להתחיל לעצב</div>
<div class="url">aperta-designs.com</div>
</div>
</body></html>'''
write("story-cta.html", story, size=(1080, 1920))

# ---------------------------------------------------------------- render + export
# (name without extension, output format: "png" for flat graphics, "jpg" for photos)
EXPORT_AS = {
    "profile": ("profile-picture", "png"),
    "cover-facebook": ("cover-facebook", "jpg"),
    "cover-x": ("cover-x-twitter", "jpg"),
    "post-intro": ("post-brand-intro", "jpg"),
    "post-product": ("post-product-bracelet", "jpg"),
    "post-howitworks": ("post-how-it-works", "png"),
    "story-cta": ("story-cta", "jpg"),
}

def find_chrome(explicit):
    for candidate in [explicit] + DEFAULT_CHROME_CANDIDATES:
        if candidate and os.path.isfile(candidate):
            return candidate
    sys.exit(
        "Could not find a Chromium/Chrome binary. Pass --chrome <path> or set CHROME_BIN."
    )

def render(chrome, html_name, w, h):
    src = os.path.join(BUILD_DIR, html_name)
    png_name = html_name.replace(".html", ".png")
    dst = os.path.join(BUILD_DIR, png_name)
    subprocess.run(
        [
            chrome, "--headless=new", "--no-sandbox", "--disable-gpu",
            "--hide-scrollbars", "--force-device-scale-factor=1",
            f"--window-size={w},{h}", f"--screenshot={dst}", f"file://{src}",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return dst

def export(png_path, stem, fmt):
    from PIL import Image

    dest = os.path.join(OUT_DIR, f"{stem}.{fmt}")
    im = Image.open(png_path)
    if fmt == "jpg":
        im.convert("RGB").save(dest, "JPEG", quality=90, optimize=True)
    else:
        im.save(dest, "PNG", optimize=True)
    print(f"wrote {dest} ({im.size[0]}x{im.size[1]})")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--chrome", default="", help="Path to a Chromium/Chrome binary")
    args = parser.parse_args()
    chrome = find_chrome(args.chrome)
    try:
        for html_name, (w, h) in PAGES:
            png_path = render(chrome, html_name, w, h)
            stem, fmt = EXPORT_AS[html_name.replace(".html", "")]
            export(png_path, stem, fmt)
    finally:
        shutil.rmtree(BUILD_DIR, ignore_errors=True)

if __name__ == "__main__":
    main()
