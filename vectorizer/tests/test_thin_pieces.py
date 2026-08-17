"""‏`MIN_IMAGE_DIMENSION` הוא תקרת פרופורציה, ולא רצפת גודל קובץ.

**למה הקובץ הזה קיים.** הסף נראה כמו חוזה קלט — "אל תעלה תמונה זעירה" — והוא
בפועל קבע כמה דק פריט מותר להיות, בשקט. הקישור אינו גלוי בקוד: הוא עובר דרך
`conditioning`, שרץ **לפני** הוולידציה, חותך למתכת ומגדיל ל-‏`target_px = 3600`
לרוחב. כלומר כשהוולידציה מודדת `min(w, h)` היא מודדת ‎3600 חלקי הפרופורציה.

הנזק היה מדוד: ב-256 התקרה היא 14.06, וב-345 המועמדים ביומן הדק ביותר שנמסר
אי פעם הוא **בדיוק 14.06** בטבעת ו-14.00 בצמיד, ואף אחד מעליו. מה שנראה כמו
מודל התמונה שמסרב לצייר דק היה השורה הזו מוחקת את הדקים — ומכיוון שה-`except`
ב-`generate.py` בלע את החריגה, האובדן לא הותיר עקבה.

לכן שתי הטענות כאן. הראשונה קושרת את הסף לפרופורציה, כדי שהקישור לא יתגלה שוב
מהנתונים; השנייה קושרת את **הערך** לרצפת המוצר, כדי ששינוי שלו ידרוש החלטה.
"""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image

from app.config import SETTINGS
from app.core.conditioning import condition_png
from app.core.validation import InputError, load_and_validate

# רצפות הרוחב ואורכי העוגן שמהם נגזר הסף (src/lib/story/ratio.ts, החלטת גל).
BRACELET_MIN_MM, BRACELET_LENGTH_MM = 3.5, 160.4
RING_MIN_MM, RING_LENGTH_MM = 2.0, 54.4
TARGET_PX = 3600


def strip(ratio: float, width_px: int = 900) -> bytes:
    """פס מתכת שחור על לבן בפרופורציה נתונה, עם שוליים לבנים סביבו."""
    ink_h = max(2, round(width_px / ratio))
    pad = 20
    rgba = np.full((ink_h + 2 * pad, width_px + 2 * pad, 4), 255, dtype=np.uint8)
    rgba[pad : pad + ink_h, pad : pad + width_px, :3] = 0
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG")
    return buf.getvalue()


def measured_min_dim(ratio: float) -> int:
    """הצלע הקצרה שהוולידציה תראה בפועל, אחרי הקונדישנינג."""
    data, width_mm, _, _ = condition_png(strip(ratio), 10.0)
    with Image.open(io.BytesIO(data)) as img:
        return min(img.size)


def test_the_threshold_is_a_proportion_ceiling():
    """‏`min(w, h)` שהוולידציה מודדת הוא ‎3600/פרופורציה — לא גודל הקובץ שנשלח."""
    for ratio in (5.0, 14.06, 45.8):
        assert measured_min_dim(ratio) == pytest.approx(TARGET_PX / ratio, rel=0.03)


def test_the_value_is_the_product_floor():
    """הסף הוא רצפת הרוחב של הצמיד, מתורגמת: ‎3.5 מ"מ על פריסה של ‎160.4."""
    thinnest_allowed = BRACELET_LENGTH_MM / BRACELET_MIN_MM  # 45.8
    assert SETTINGS.min_image_dimension == pytest.approx(
        TARGET_PX / thinnest_allowed, abs=1
    )
    # ובטבעת הסף רחוק — ‎2 מ"מ על ‎54.4 הוא פרופורציה 27.2, כלומר 132 פיקסלים,
    # הרבה מעל 78. הסף אינו אוכף את רצפת הטבעת, והוא גם לא אמור.
    assert TARGET_PX / (RING_LENGTH_MM / RING_MIN_MM) > SETTINGS.min_image_dimension


def test_a_bracelet_at_its_minimum_width_survives():
    """הרגרסיה עצמה: ‎3.5 מ"מ על ‎160.4 עבר דרך הסף הישן ונמחק בשקט."""
    data, width_mm, _, _ = condition_png(strip(BRACELET_LENGTH_MM / BRACELET_MIN_MM), 10.0)
    image = load_and_validate(data, width_mm, 10.0)
    assert min(image.width_px, image.height_px) >= SETTINGS.min_image_dimension


def test_thinner_than_the_floor_is_still_rejected():
    """הסף לא בוטל — פריט דק מהרצפה עדיין נדחה, וזו הפסילה שגל ביקש.

    ‏60 ולא יותר: הפרופורציה מוכפלת ב-`height_mm` כדי לקבל את האורך, ומעל
    ‎100 המבחן היה נופל קודם על `max_dim_mm` — כלומר על הטענה הלא נכונה.
    """
    data, width_mm, _, _ = condition_png(strip(60.0), 10.0)
    with pytest.raises(InputError) as exc:
        load_and_validate(data, width_mm, 10.0)
    assert exc.value.code == "IMAGE_TOO_SMALL"
