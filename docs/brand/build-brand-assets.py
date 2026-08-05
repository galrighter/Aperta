#!/usr/bin/env python3
"""בונה את נכסי המותג של Aperta מקובץ אחד: docs/brand/aperta-logo.png.

הלוגו הגיע כתמונה, לא כווקטור. הסקריפט הזה הוא הדרך שבה התמונה הופכת לנכסים
שהאתר באמת מגיש — כדי שהמסלול יהיה חוזר על עצמו: מי שיחליף את `aperta-logo.png`
מריץ אותו שוב ומקבל את כל הנכסים מסונכרנים, במקום להתחיל לרדוף אחרי עשרה
קבצים ביד.

מה הוא מוציא:
  1. נתיבי SVG למילולוגו ("Aperta") — מודפסים למסך, ומודבקים לתוך
     src/components/site/Wordmark.tsx.
  2. הסימן (הטבעת הפתוחה) — גאומטריה מחושבת, לא מותווה: המעגל בלוגו הוא מעגל
     מושלם, וניתוב שלו היה מכניס עיוותים במקום לשמר אותו.
  3. אייקוני PNG (public/icon-*.png, src/app/apple-icon.png).
  4. תמונת השיתוף (src/app/opengraph-image.png).

הרצה:  python3 docs/brand/build-brand-assets.py
תלויות: pillow, numpy, vtracer, resvg-py  (+ הגופנים למטה, אם מייצרים OG).

הגופנים ל-OG מגיעים מ-Google Fonts (אותם שמות שה-layout טוען דרך next/font).
הם לא נשמרים ברפו; הסקריפט מוריד אותם ל-cache מקומי בהרצה.
"""
from __future__ import annotations

import io
import math
import os
import re
import subprocess
import sys

import numpy as np
import resvg_py
import vtracer
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BRAND = os.path.join(ROOT, "docs", "brand")
SOURCE = os.path.join(BRAND, "aperta-logo.png")
CACHE = os.path.join(BRAND, ".cache")

PORCELAIN = "#f4f1eb"
GRAPHITE = "#202326"
LAPIS = "#3f6297"
MIST = "#667074"

# ---------------------------------------------------------------- הסימן -----
# נמדד מ-aperta-logo.png: מרכז (728,316), רדיוס חיצוני 143, פנים אליפטי
# 123.5×128.5 — הטבעת עבה יותר באגפים. הפתח 253.5°–289.5°, קשת הכחול אחריו
# עד 325.5° (מעלות שעון, 0° = מזרח).
RING_R = 30.0
RING_RX, RING_RY = round(30 * 123.5 / 143, 2), round(30 * 128.5 / 143, 2)
GAP = (253.5, 289.5)
ACCENT = (289.5, 325.5)


def ring_arc(a1: float, a2: float, cx: float = 32.0, cy: float = 32.0) -> str:
    """טבעת חלקית כנתיב סגור: קשת חיצונית, חתך רדיאלי, קשת פנימית חזרה."""
    def p(deg: float, u: float, v: float) -> tuple[float, float]:
        return cx + u * math.cos(math.radians(deg)), cy + v * math.sin(math.radians(deg))

    large = 1 if (a2 - a1) % 360 > 180 else 0
    f = lambda t: f"{round(t[0], 2):g} {round(t[1], 2):g}"
    return (
        f"M{f(p(a1, RING_R, RING_R))}A{RING_R:g} {RING_R:g} 0 {large} 1 {f(p(a2, RING_R, RING_R))}"
        f"L{f(p(a2, RING_RX, RING_RY))}A{RING_RX:g} {RING_RY:g} 0 {large} 0 {f(p(a1, RING_RX, RING_RY))}Z"
    )


RING_ARC = ring_arc(ACCENT[1], GAP[0])
RING_ACCENT_ARC = ring_arc(*ACCENT)

# ------------------------------------------------------------ המילולוגו -----
# תיבות התיחום נמדדו מ-aperta-logo.png (ראו README.md באותה תיקייה).
WORD_BOX = (517, 793, 217, 1244)   # y0, y1, x0, x1 של "Aperta"
UNIT = 10.0                        # פיקסלים במקור ליחידת viewBox


def _masks() -> tuple[np.ndarray, np.ndarray]:
    a = np.asarray(Image.open(SOURCE).convert("RGB")).astype(float)
    darkness = np.clip((0.92 - a.sum(2) / 765.0) / 0.55, 0, 1)
    return darkness, (a[:, :, 2] - a[:, :, 0]) > 25


def trace_wordmark(scale: int = 2, pad: int = 6, length_threshold: float = 20.0) -> str:
    """מנתב את "Aperta" לנתיב אחד ב-viewBox 0 0 102.7 27.6."""
    darkness, isblue = _masks()
    y0, y1, x0, x1 = WORD_BOX
    d = np.where(~isblue[y0 : y1 + 1, x0 : x1 + 1], darkness[y0 : y1 + 1, x0 : x1 + 1], 0.0)
    h, w = d.shape
    canvas = np.zeros((h + 2 * pad, w + 2 * pad))
    canvas[pad : pad + h, pad : pad + w] = d
    im = Image.fromarray((canvas * 255).astype("uint8"), "L")
    im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    arr = np.asarray(im).astype(int)
    os.makedirs(CACHE, exist_ok=True)
    src_png, out_svg = os.path.join(CACHE, "_word.png"), os.path.join(CACHE, "_word.svg")
    Image.fromarray(np.where(arr >= 128, 0, 255).astype("uint8"), "L").convert("RGB").save(src_png)
    vtracer.convert_image_to_svg_py(
        src_png, out_svg, colormode="binary", mode="spline", filter_speckle=4 * scale,
        corner_threshold=60, length_threshold=length_threshold, splice_threshold=45,
        path_precision=1,
    )
    svg = open(out_svg).read()
    px0, py0 = x0 - pad, y0 - pad
    parts = []
    for m in re.finditer(r"<path[^>]*>", svg):
        tag = m.group(0)
        dm = re.search(r'\sd="([^"]+)"', tag)
        t = re.search(r'transform="translate\(([-\d.]+)[ ,]+([-\d.]+)\)"', tag)
        tx, ty = (float(t.group(1)), float(t.group(2))) if t else (0.0, 0.0)
        parts.append(_remap(dm.group(1), tx, ty, px0, py0, scale, x0, y0))
    return _simplify("".join(parts), eps=0.02)


def _remap(d: str, tx: float, ty: float, px0: int, py0: int, scale: int, ox: int, oy: int) -> str:
    toks = re.findall(r"[MmLlCcZzHhVv]|-?\d*\.?\d+", d)
    res, i, cmd = [], 0, None
    fx = lambda v: round(((float(v) + tx) / scale + px0 - ox) / UNIT, 2)
    fy = lambda v: round(((float(v) + ty) / scale + py0 - oy) / UNIT, 2)
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t
            res.append(t)
            i += 1
            continue
        n = {"M": 2, "L": 2, "C": 6}.get(cmd, 2)
        for k, v in enumerate(toks[i : i + n]):
            res.append(f"{fx(v) if k % 2 == 0 else fy(v):g}")
        i += n
    return re.sub(r"\s*([MLCZ])\s*", r"\1", " ".join(res))


def _simplify(d: str, eps: float) -> str:
    """קוביות שנשענות על המיתר שלהן הופכות לקווים, וקווים רצופים מתמזגים.

    הניתוב פולט אלפי קוביות זעירות שהן בפועל קווים ישרים; בלי המעבר הזה הנתיב
    שוקל פי שניים וחצי בלי שום הבדל שנראה לעין (נבדק ברינדור מול המקור).
    """
    def dist(p, a, b):
        (px, py), (ax, ay), (bx, by) = p, a, b
        dx, dy = bx - ax, by - ay
        length = dx * dx + dy * dy
        if length == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

    toks = re.findall(r"[MLCZ]|-?\d*\.?\d+", d)
    subs, cur, i = [], None, 0
    while i < len(toks):
        t = toks[i]
        if t == "M":
            cur = [("M", (float(toks[i + 1]), float(toks[i + 2])))]
            subs.append(cur)
            i += 3
        elif t == "L":
            cur.append(("L", (float(toks[i + 1]), float(toks[i + 2]))))
            i += 3
        elif t == "C":
            cur.append(("C", *[(float(toks[i + 1 + 2 * k]), float(toks[i + 2 + 2 * k])) for k in range(3)]))
            i += 7
        else:
            i += 1

    fmt = lambda v: f"{round(v, 2):g}"
    out = []
    for sub in subs:
        pos = sub[0][1]
        segs: list[tuple] = []
        for s in sub[1:]:
            if s[0] == "L":
                segs.append(("L", pos, s[1]))
                pos = s[1]
            else:
                c1, c2, end = s[1], s[2], s[3]
                straight = dist(c1, pos, end) < eps and dist(c2, pos, end) < eps
                segs.append(("L", pos, end) if straight else ("C", pos, end, c1, c2))
                pos = end
        merged: list[tuple] = []
        for s in segs:
            if s[0] == "L" and merged and merged[-1][0] == "L" and dist(merged[-1][2], merged[-1][1], s[2]) < eps:
                merged[-1] = ("L", merged[-1][1], s[2])
            else:
                merged.append(s)
        path = f"M{fmt(sub[0][1][0])} {fmt(sub[0][1][1])}"
        for s in merged:
            if s[0] == "L":
                path += f"L{fmt(s[2][0])} {fmt(s[2][1])}"
            else:
                path += f"C{fmt(s[3][0])} {fmt(s[3][1])} {fmt(s[4][0])} {fmt(s[4][1])} {fmt(s[2][0])} {fmt(s[2][1])}"
        out.append(path + "Z")
    return re.sub(r"(?<=[\d.])\s+-", "-", "".join(out))


# -------------------------------------------------------------- אייקונים -----
def mark_svg(size: int, ring_radius: float, background: str | None) -> str:
    """הסימן בקופסה מרובעת. `ring_radius` ביחידות של viewBox 64."""
    scale = ring_radius / RING_R
    bg = f'<rect width="64" height="64" rx="4" fill="{background}"/>' if background else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="{size}" height="{size}">'
        f"{bg}"
        f'<g transform="translate(32 32) scale({scale:.4f}) translate(-32 -32)">'
        f'<path fill="{GRAPHITE}" d="{RING_ARC}"/><path fill="{LAPIS}" d="{RING_ACCENT_ARC}"/>'
        f"</g></svg>"
    )


def rasterise(svg: str, size: int) -> Image.Image:
    return Image.open(io.BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=svg, width=size)))).convert("RGBA")


# --------------------------------------------------------- תמונת שיתוף -----
GOOGLE_FONTS = {
    "assistant.ttf": "ofl/assistant/Assistant%5Bwght%5D.ttf",
    "archivo.ttf": "ofl/archivo/Archivo%5Bwdth,wght%5D.ttf",
}


def font(name: str, size: int, weight: float | None = None) -> ImageFont.FreeTypeFont:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        url = f"https://raw.githubusercontent.com/google/fonts/main/{GOOGLE_FONTS[name]}"
        subprocess.run(["curl", "-sSLf", "-o", path, url], check=True)
    f = ImageFont.truetype(path, size)
    if weight is not None:
        axes = f.get_variation_axes()
        f.set_variation_by_axes([weight if b"wght" in ax["name"] else ax["default"] for ax in axes])
    return f


def build_og(path: str) -> None:
    """1200×630: תצלום מוצר משמאל, בלוק המותג מימין. אותו פריסה כמו קודם —
    מה שהשתנה הוא הזהות שבתוכה."""
    W, H, PHOTO_W = 1200, 630, 430
    im = Image.new("RGB", (W, H), PORCELAIN)
    d = ImageDraw.Draw(im)

    photo = Image.open(os.path.join(ROOT, "public", "bracelet-hero.webp")).convert("RGB")
    ratio = max(PHOTO_W / photo.width, H / photo.height)
    photo = photo.resize((round(photo.width * ratio), round(photo.height * ratio)), Image.LANCZOS)
    # חיתוך משמאל ולא מהמרכז: הקובייה הכחולה בתצלום היא עדיין הכחול הישן,
    # והיא נופלת מחוץ לפריים בחיתוך הזה. התצלומים עצמם עדיין לא הוחלפו.
    im.paste(photo.crop((0, 0, PHOTO_W, H)), (0, 0))
    d.rectangle([22, 22, PHOTO_W - 78, H - 22], outline=LAPIS, width=1)

    # רשת עדינה מאחורי בלוק המותג — אותו רמז גריד שיש באתר עצמו.
    for x in range(PHOTO_W + 60, W, 60):
        d.line([(x, 0), (x, H)], fill="#e7e1d6", width=1)
    for y in range(0, H, 60):
        d.line([(PHOTO_W, y), (W, y)], fill="#e7e1d6", width=1)

    right, margin = W - 70, PHOTO_W + 40
    mark = rasterise(mark_svg(96, RING_R, None), 96)
    im.paste(mark, (right - 96, 58), mark)

    lock = rasterise(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 102.7 27.6" width="380">'
        f'<path fill="{GRAPHITE}" d="{WORDMARK}"/><path fill="{LAPIS}" d="{WORDMARK_ACCENT}"/></svg>',
        380,
    )
    im.paste(lock, (right - lock.width, 175), lock)

    # שורת ה-DESIGNS קטנה בהרבה מהשם, כמו בלוגו המקורי: שם גובה האות שלה הוא
    # עשירית מגובה הרישית של "Aperta", והמרווח בין האותיות גדול מרוחב האות.
    # מרווח אותיות ביד — PIL לא יודע tracking.
    sub = font("archivo.ttf", 13, 300)
    text, spaced = "DESIGNS", 14.6
    tw = sum(d.textlength(c, font=sub) + spaced for c in text) - spaced
    x = right - tw
    for c in text:
        d.text((x, 292), c, font=sub, fill=GRAPHITE)
        x += d.textlength(c, font=sub) + spaced
    for bx in (right - tw - 26, right + 26):
        d.line([(bx, 291), (bx, 303)], fill=LAPIS, width=2)

    head = font("assistant.ttf", 62, 700)
    for i, line in enumerate(["אינסוף צורות.", "אחת שלך."]):
        d.text((right, 372 + i * 76), line, font=head, fill=GRAPHITE, anchor="ra",
               direction="rtl", language="he")

    tag = font("archivo.ttf", 18, 500)
    tagline = "PRECISION JEWELRY, FORMED AROUND YOU"
    # מרווח אותיות ביד: PIL לא יודע tracking, והשורה הזו חיה על המרווח.
    spaced = 3.0
    width = sum(d.textlength(c, font=tag) + spaced for c in tagline) - spaced
    x = right - width
    for c in tagline:
        d.text((x, 540), c, font=tag, fill=MIST)
        x += d.textlength(c, font=tag) + spaced
    d.line([(right - 190, 578), (right, 578)], fill=LAPIS, width=3)
    im.save(path)


if __name__ == "__main__":
    WORDMARK = trace_wordmark()
    WORDMARK_ACCENT = "M4.1 13.79L15.05 13.79L15.05 14.05L4.1 14.05Z"

    print("RING_ARC        =", RING_ARC)
    print("RING_ACCENT_ARC =", RING_ACCENT_ARC)
    print(f"WORDMARK ({len(WORDMARK)} bytes) =", WORDMARK)

    if "--paths-only" in sys.argv:
        raise SystemExit(0)

    # הרגיל כמעט ממלא את הריבוע; ה-maskable נשאר בתוך אזור הבטיחות (80%
    # מהקוטר) כדי שמשגר אנדרואיד לא יחתוך לו את הטבעת בעיגול.
    for out, size, radius, bg in [
        ("public/icon-192.png", 192, 26.0, PORCELAIN),
        ("public/icon-512.png", 512, 26.0, PORCELAIN),
        ("public/icon-maskable-512.png", 512, 21.0, PORCELAIN),
        ("src/app/apple-icon.png", 180, 26.0, PORCELAIN),
    ]:
        rasterise(mark_svg(size, radius, bg), size).save(os.path.join(ROOT, out))
        print("wrote", out)

    build_og(os.path.join(ROOT, "src", "app", "opengraph-image.png"))
    print("wrote src/app/opengraph-image.png")
