#!/usr/bin/env python3
"""מעבדת מסלול Story — מריצה כמה סיפורים ברצף על פרופיל בודק.

נקרא מ-`.github/workflows/story-lab.yml`, ומשם מגיעים גם הסודות. הוא יושב
כקובץ ולא כסקריפט מוטמע ב-YAML כדי שיהיה אפשר לקרוא אותו, לתקן אותו, ולראות
עליו diff — סקריפט שחי בתוך מחרוזת YAML הוא סקריפט שאיש לא בודק.

**המסלול זהה למה שלקוחה עוברת**: יצירת עיצוב, ואז `/api/generate` עם
`mode: "story"`. ההבדל היחיד הוא הפרופיל שהעיצוב נרשם עליו.
"""

import json
import os
import subprocess
import sys
import tempfile

SITE = os.environ.get("SITE_URL", "https://aperta-designs.com").rstrip("/")
TOKEN = os.environ.get("ADMIN_TOKEN", "")

# המידות של רגע היצירה. במסלול Story אלה **עוגן תכנוני** ולא מידה: האורך נמדד
# רק אחרי שהלקוחה בוחרת תרגום (§4.1 ב-STORY_FLOW_PLAN), והרוחב נגזר מהיחס
# שצויר. הערכים הם בדיוק מה ש-`stripLengthMm` מחזיר על הפריסט הבינוני של
# `INITIAL` — כלומר מה שהאתר שולח — כדי שהשוואה מול סבבים קודמים תהיה על
# משתנה אחד ולא על שניים.
ANCHOR = {
    "ring": {"lengthMm": 54.4, "widthMm": 6, "gapMm": 3},
    "bracelet": {"lengthMm": 160.4, "widthMm": 18, "gapMm": 25.4},
}

# הרצת Story טיפוסית היא 60–150 שניות: שלב טקסט, רנדר, מסגור וולידציה. 420
# מכסה גם ניסיון שני של שלב הטקסט, ועדיין נופל בתוך `maxDuration` של המסלול.
TIMEOUT_S = 420

_JAR = tempfile.NamedTemporaryFile(prefix="story-lab-", suffix=".jar", delete=False).name


def call(path: str, payload=None, timeout: int = 60):
    """קריאה אחת. מחזירה (status, body) — גם על 4xx/5xx, כי הגוף הוא ההסבר.

    **התעבורה היא `curl` ולא `urllib`, וזה נמדד ולא הועדף.** לפני האפליקציה
    יושב Cloudflare, והוא חוסם את ה-User-Agent של `python-urllib` לפני שהבקשה
    מגיעה לקוד: אותה קריאה בדיוק ל-`/api/admin/session` עם טוקן שגוי מחזירה
    401 מ-`curl` (כלומר הגיעה, ונדחתה על הטוקן) ו-403 מ-`urllib` (כלומר לא
    הגיעה). זו גם הסיבה שהקנרית שלצידה עובדת — היא כולה `curl` מאז ומתמיד.

    פייתון נשאר במקום שבו הוא נחוץ: בניית ה-JSON וקריאתו. הגוף נכנס דרך
    stdin (`--data-binary @-`), ולכן אין שום ציטוט סביב סיפור בעברית.
    """
    body_file = tempfile.NamedTemporaryFile(prefix="story-lab-body-", delete=False).name
    cmd = [
        "curl", "-sS", "-o", body_file, "-w", "%{http_code}",
        "-c", _JAR, "-b", _JAR, "--max-time", str(timeout),
    ]
    data = None
    if payload is not None:
        cmd += ["-X", "POST", "-H", "content-type: application/json", "--data-binary", "@-"]
        data = json.dumps(payload)
    cmd.append(f"{SITE}{path}")

    try:
        out = subprocess.run(cmd, input=data, capture_output=True, text=True, timeout=timeout + 30)
    except subprocess.TimeoutExpired:
        return 0, {"raw": "curl timed out"}
    if out.returncode != 0:
        return 0, {"raw": f"curl exit {out.returncode}: {out.stderr[:300]}"}

    status = int(out.stdout.strip() or 0)
    with open(body_file, encoding="utf-8", errors="replace") as fh:
        raw = fh.read()
    os.unlink(body_file)
    try:
        return status, json.loads(raw or "null")
    except ValueError:
        return status, {"raw": raw[:600]}


def parse_stories(text: str):
    """שורה לכל סיפור, `product|story`. שורות ריקות נבלעות."""
    out = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        product, _, story = line.partition("|")
        product, story = product.strip(), story.strip()
        if product not in ANCHOR or not story:
            print(f"::error::שורה שאי אפשר לקרוא: {raw!r}")
            return None
        out.append((product, story))
    return out or None


def main() -> int:
    if not TOKEN:
        print("::error::ADMIN_TOKEN secret is not set — story lab cannot run.")
        return 1
    print(f"note: {os.environ.get('NOTE') or '—'}")

    stories = parse_stories(os.environ.get("STORIES", ""))
    if not stories:
        print("::error::לא נמסר אף סיפור.")
        return 1

    # כניסת אדמין — עוגייה ולא Bearer. `/api/generate` מגיע ל-`assertDesignAccess`,
    # ועיצוב של פרופיל בודק נפתח שם מול `requireAdmin`, שהוא הצד של העוגייה.
    status, _ = call("/api/admin/session", {"token": TOKEN})
    if status != 200:
        print(f"::error::admin login returned HTTP {status}")
        return 1

    status, body = call("/api/profiles")
    if status != 200 or not body.get("profiles"):
        print(f"::error::could not read tester profiles (HTTP {status})")
        return 1
    profile = body["profiles"][0]["id"]
    print(f"tester profile: {profile}")

    failed = 0
    for i, (product, story) in enumerate(stories, 1):
        print(f"\n── [{i}/{len(stories)}] {product} · {story}")

        status, body = call("/api/designs", {
            "profileId": profile,
            "productType": product,
            "name": f"story-lab · {story[:60]}",
            # `mode` נשמר על הרשומה (0024): עיצוב שנוצר במסלול Story חייב
            # לזכור זאת, אחרת חזרה אליו מדלגת על שלב המידה.
            "mode": "story",
            **ANCHOR[product],
        })
        if status != 201 or not body.get("design"):
            print(f"::error::design creation failed (HTTP {status}): {body}")
            failed += 1
            continue
        design_id = body["design"]["id"]
        print(f"   design: {design_id}")

        # היצירה. `mode: story` הוא מה שמפעיל את שלב הטקסט, את גזירת התצורה
        # מהיחסים שהוא מחזיר, ואת המסגור שגוזר רוחב במקום למתוח אליו.
        status, body = call("/api/generate", {
            "designId": design_id,
            "userPrompt": story,
            "mode": "story",
            "currentSvg": None,
            "images": [],
        }, timeout=TIMEOUT_S)
        if status != 200:
            print(f"::error::generation returned HTTP {status}: {json.dumps(body, ensure_ascii=False)[:600]}")
            failed += 1
            continue

        version = (body.get("version") or {}).get("id")
        report = body.get("report") or {}
        print(f"   version: {version} · candidates: {len(body.get('candidates') or [])}"
              f" · status: {report.get('status')}")

    print(f"\nסיכום: {len(stories) - failed}/{len(stories)} הרצות הצליחו.")
    # כשל של סיפור אחד אינו מבטל את השאר — הם כבר רצו ושולם עליהם — אבל ה-job
    # נצבע אדום כדי שלא יעבור בשקט.
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
