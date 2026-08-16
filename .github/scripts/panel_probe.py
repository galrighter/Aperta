#!/usr/bin/env python3
"""בדיקת פאנלים — מה המודל **באמת** צייר, מול מה שהקופסה החזירה.

נקרא מ-`.github/workflows/panel-probe.yml`.

**למה זה קיים.** ביומן יש `plannedCandidates` (כמה ביקשנו) ו-`deliveredPanels`
(כמה פסים הקופסה החזירה), וכשהם נבדלים אי אפשר לדעת מי אשם: המודל צייר פחות
פריטים, או שהקופסה לא הצליחה להפריד ביניהם. שתי המסקנות מובילות לתיקונים
הפוכים לגמרי — האחת בפרומפט, השנייה ב-`split_rows` — ולכן ניחוש כאן הוא בזבוז
של סבב שלם.

הבדיקה קוראת את ההדמיה עצמה (`/api/debug/log/{id}/image/render`) ומודדת שני
דברים, בלי להסתמך על שום שדה ביומן:

  1. **כמה פסים אופקיים של שחור יש בתמונה**, ומה גודל הרווח הלבן ביניהם.
     זו בדיוק השאלה ש-`split_rows` עונה עליה, ולכן זו התשובה שמכריעה.
  2. **הפתח הקטן ביותר בכל פס**, במ"מ. ‏V5 פוסל פתח מתחת ל-0.5 מ"מ, ואם
     הפתח שהפיל מועמד הוא 0.2 מ"מ לצד פתחים של 3 מ"מ — זה רסיס מהמעקב ולא
     החלטת עיצוב.

בלי תלויות חיצוניות מלבד Pillow.
"""

import json
import os
import subprocess
import sys
import tempfile
from collections import deque

from PIL import Image

SITE = os.environ.get("SITE_URL", "https://aperta-designs.com").rstrip("/")
TOKEN = os.environ.get("ADMIN_TOKEN", "")
OUT = os.environ.get("OUT_DIR", "renders")

# מתחת לזה פיקסל נחשב מתכת. ההדמיה היא שחור מלא על לבן טהור (חוזה הווקטורייזר),
# ולכן הסף רחוק משני הקצוות ואינו רגיש.
INK = 128
# שורת פיקסלים נחשבת "ריקה" כשיש בה פחות ממספר הפיקסלים הזה. לא אפס: מעקב
# ו-JPEG-ים של המודל משאירים רסיסים בודדים בשוליים, ושורה עם שני פיקסלים אינה
# פס. הערך נמוך מספיק כדי שפריט אמיתי לעולם לא ייפול מתחתיו.
EMPTY_ROW_MAX = 3
# פס שגובהו פחות מזה אינו פריט אלא רעש.
MIN_BAND_PX = 8

_JAR = tempfile.NamedTemporaryFile(prefix="probe-", suffix=".jar", delete=False).name


def curl(url: str, out: str | None = None, payload=None, timeout: int = 60):
    """`curl` ולא urllib — Cloudflare חוסם את ה-User-Agent של פייתון (נמדד:
    401 מול 403 על אותה קריאה). ראה `story_lab.py`."""
    cmd = ["curl", "-sS", "-L", "-w", "%{http_code}", "-c", _JAR, "-b", _JAR,
           "--max-time", str(timeout), "-o", out or "/dev/null"]
    data = None
    if payload is not None:
        cmd += ["-X", "POST", "-H", "content-type: application/json", "--data-binary", "@-"]
        data = json.dumps(payload)
    cmd.append(url)
    res = subprocess.run(cmd, input=data, capture_output=True, text=True, timeout=timeout + 30)
    return int(res.stdout.strip() or 0)


def bands(img: Image.Image):
    """הפסים האופקיים של שחור, והרווחים ביניהם — בדיוק מה ש-split_rows מחפש."""
    w, h = img.size
    px = img.load()
    ink_per_row = []
    for y in range(h):
        n = 0
        for x in range(w):
            if px[x, y] < INK:
                n += 1
        ink_per_row.append(n)

    out, start = [], None
    for y, n in enumerate(ink_per_row):
        if n > EMPTY_ROW_MAX and start is None:
            start = y
        elif n <= EMPTY_ROW_MAX and start is not None:
            if y - start >= MIN_BAND_PX:
                out.append((start, y - 1))
            start = None
    if start is not None and h - start >= MIN_BAND_PX:
        out.append((start, h - 1))
    return out, ink_per_row


def holes(img: Image.Image, top: int, bottom: int, mm_per_px: float):
    """הפתחים הסגורים בתוך פס אחד, בקוטר משוער במ"מ.

    לבן שנוגע בגבול הפס אינו פתח אלא הרקע סביב הפריט — הצפה מהגבול מסמנת אותו
    החוצה, וכל מה שנשאר לבן הוא פתח שהמתכת סוגרת.
    """
    w = img.size[0]
    px = img.load()
    h = bottom - top + 1
    outside = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if px[x, top + y] >= INK and not outside[y][x]:
                outside[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if px[x, top + y] >= INK and not outside[y][x]:
                outside[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not outside[ny][nx] and px[nx, top + ny] >= INK:
                outside[ny][nx] = True
                q.append((nx, ny))

    seen = [[False] * w for _ in range(h)]
    sizes = []
    for y0 in range(h):
        for x0 in range(w):
            if px[x0, top + y0] < INK or outside[y0][x0] or seen[y0][x0]:
                continue
            seen[y0][x0] = True
            q.append((x0, y0))
            n = 0
            xs, ys = [], []
            while q:
                x, y = q.popleft()
                n += 1
                xs.append(x)
                ys.append(y)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if (0 <= nx < w and 0 <= ny < h and not seen[ny][nx]
                            and px[nx, top + ny] >= INK and not outside[ny][nx]):
                        seen[ny][nx] = True
                        q.append((nx, ny))
            # הקוטר המשוער של פתח: הצלע הקצרה של תיבת התוחם. זה מה ש-V5 בודק
            # בפועל (שחיקה ברדיוס minHole/2), ומספיק כדי להבחין רסיס מחלל.
            short = min(max(xs) - min(xs) + 1, max(ys) - min(ys) + 1)
            sizes.append((short * mm_per_px, n))
    return sorted(sizes)


def main() -> int:
    ids = [s.strip() for s in os.environ.get("RUN_IDS", "").split(",") if s.strip()]
    if not TOKEN or not ids:
        print("::error::RUN_IDS ו-ADMIN_TOKEN נדרשים")
        return 1
    if curl(f"{SITE}/api/admin/session", payload={"token": TOKEN}) != 200:
        print("::error::admin login failed")
        return 1
    os.makedirs(OUT, exist_ok=True)

    for run_id in ids:
        path = os.path.join(OUT, f"{run_id}.png")
        code = curl(f"{SITE}/api/debug/log/{run_id}/image/render", out=path, timeout=90)
        if code != 200:
            print(f"::error::render for {run_id} returned HTTP {code}")
            continue
        img = Image.open(path).convert("L")
        w, h = img.size
        bs, _ = bands(img)
        print("=" * 72)
        print(f"{run_id}   תמונה {w}x{h}   פסי שחור שנמצאו: {len(bs)}")
        prev_end = None
        for i, (a, b) in enumerate(bs, 1):
            gap = "" if prev_end is None else f"  רווח לבן לפני: {a - prev_end - 1}px"
            prev_end = b
            # אורך הפריט על הציר הארוך ≈ רוחב התמונה שהוא תופס. מספיק לצורך
            # המרה גסה של פתחים למ"מ, וזה כל מה שנדרש כדי להבחין רסיס מחלל.
            print(f"   פס {i}: y={a}–{b}  גובה {b - a + 1}px{gap}")
        if not bs:
            continue
        # הפתחים נבדקים על הפס הראשון בלבד — מספיק כדי לענות על שאלת הרסיס,
        # והריצה על כל פס בתמונה של 1.5MP יקרה בלי צורך.
        length_mm = float(os.environ.get("LENGTH_MM", "0") or 0)
        a, b = bs[0]
        if length_mm > 0:
            mm_per_px = length_mm / (w * 0.9)
            hs = holes(img, a, b, mm_per_px)
            print(f"   פתחים בפס 1: {len(hs)}")
            for mm, area in hs[:6]:
                flag = "  ← מתחת ל-0.5 מ\"מ, V5 יפסול" if mm < 0.5 else ""
                print(f"      קוטר ~{mm:.2f} מ\"מ  ({area} פיקסלים){flag}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
