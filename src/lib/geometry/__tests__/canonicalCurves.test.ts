import { describe, expect, it } from "vitest";
import { normalizeSvg } from "../normalize";
import { rescaleCutoutsSvg } from "../frame";

/**
 * שני חצאים של אותה מערכת חלוקים על מה נחשב "קנוני".
 *
 * `normalizeD` מעגל מספרים ואינו נוגע בפקודות, ואילו `rescaleCutoutsSvg` מקבל
 * את מה שכל ארגומנטיו זוגות קואורדינטות (M/L/C/Q/S/T/Z) וזורק על H/V/A. נתיב
 * עם קשת נשמר בשקט כגרסה, ואז מפיל את הקריאה כולה ברגע שהגרסה חוזרת למסגור —
 * עריכה, או אימוץ של שיתוף.
 *
 * הווקטורייזר שלנו פולט `M`/`L`/`C`/`Z` (`core/svg_builder.py`), ולכן מה שנבדק
 * כאן הוא SVG שלא אנחנו ייצרנו: קלט ל-`/api/validate`, או גרסה שנשמרה ממנו.
 */

const L = 40, W = 10;
const svg = (d: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${W}">` +
  `<g id="cutouts"><path d="${d}" fill="black"/></g></svg>`;

/** רק תכולת ה-`d`. מחלקת התווים תופסת גם `black` ו-`xmlns` אם בודקים הכול. */
const pathData = (s: string) => [...s.matchAll(/\sd="([^"]*)"/g)].map((m) => m[1]).join(" ");

const FLAT = "M15 4 L25 4 L25 6 L15 6 Z";
/** אותה טיפה בערך, עם עקומה קובית — תחביר SVG חוקי לגמרי. */
const CURVED = "M15 5 C15 3.5 17 3 20 3 C23 3 25 3.5 25 5 C25 6.5 23 7 20 7 C17 7 15 6.5 15 5 Z";

describe("ה-SVG הקנוני מול מה שהמסגור יודע לקרוא", () => {
  it("נתיב עם עקומה נשמר בצורה שהמסגור מקבל", () => {
    const { canonicalSvg } = normalizeSvg(svg(CURVED), L, W);
    expect(pathData(svg(CURVED))).toMatch(/C/); // הקלט אכן נושא עקומה
    expect(pathData(canonicalSvg)).not.toMatch(/[CcSsQqTtAa]/);
    // זו השורה שנפלה קודם, ואיתה כל הקריאה.
    expect(() => rescaleCutoutsSvg(canonicalSvg, { lengthMm: L * 1.2, widthMm: W })).not.toThrow();
  });

  it("הצורה נשמרת — הופלטו הפוליגונים שהוולידציה מדדה, לא צורה אחרת", () => {
    const { cutouts, canonicalSvg } = normalizeSvg(svg(CURVED), L, W);
    const area = cutouts.flat().reduce((s, poly) => {
      const r = poly[0];
      let a = 0;
      for (let i = 0; i < r.length; i++) {
        const [x0, y0] = r[i];
        const [x1, y1] = r[(i + 1) % r.length];
        a += x0 * y1 - x1 * y0;
      }
      return s + Math.abs(a) / 2;
    }, 0);
    // טיפה ברוחב 10 וגובה 4 — סדר גודל של 25-32 ממ"ר. המספר עצמו לא הנקודה;
    // מה שנבדק הוא שלא נפלט ריק ולא נפלט המלבן החוסם.
    expect(area).toBeGreaterThan(20);
    expect(area).toBeLessThan(40);
    expect(canonicalSvg).toMatch(/<path d="M/);
  });

  it("נתיב שכבר שטוח נשאר מילה במילה — הצינור החי לא זז", () => {
    // הווקטורייזר פולט M/L/Z, וזה המסלול של כל יצירה. כאן נבדק שלא שינינו
    // בשקט את ה-SVG שנשמר בכל גרסה.
    const { canonicalSvg } = normalizeSvg(svg(FLAT), L, W);
    expect(canonicalSvg).toContain(`<path d="${FLAT}" fill="black"/>`);
  });
});
