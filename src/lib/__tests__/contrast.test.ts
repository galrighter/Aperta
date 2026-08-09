import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * חוזה הניגודיות של שפת העיצוב — WCAG 1.4.3 ברמה AA, שהיא מה שת"י 5568 דורש.
 *
 * **למה הבדיקה קוראת את ה-CSS ולא מחזיקה עותק של הצבעים.** בדיוק העותק השני
 * הוא מה שנשבר: `globals.css` פסל את #4a8f5c על 3.47 והחליף אותו, ובאותו זמן
 * `ResultScreen.tsx` החזיק קבוע קשיח עם אותו ערך — והוא זה שצבע את שורת
 * "ניתן לייצור". התיקון הוחל על מקור אחד מתוך שניים, שום דבר לא נשבר, ואיש
 * לא ידע (docs/ACCESSIBILITY_PLAN.md §B2). בדיקה שמחזיקה עותק משלה הייתה
 * מוסיפה מקור שלישי לאותה בעיה.
 *
 * **למה כל טקסט מול כל משטח.** כיול מול porcelain בלבד נותן מספר נכון בתנאי
 * מעבדה שאינו קיים באתר: `ArchBackground` היא שכבה קבועה מתחת לכל התוכן,
 * והרקע בפועל מתחת למילה נתונה הוא מה שיצא מהצטברות הצורות באותה נקודה.
 * `.ap-surface` מבטיח שהרקע הוא טוקן משטח ידוע — והבדיקה הזו מבטיחה שכל
 * שילוב של טוקן משטח וטוקן טקסט עובר. יחד הם הופכים את הניגודיות לתכונה של
 * הקוד ולא של מיקום הגלילה.
 */

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** קורא `--color-<name>: #rrggbb` מתוך בלוק ה-@theme. */
function token(name: string): string {
  const m = CSS.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`טוקן --color-${name} לא נמצא ב-globals.css`);
  return m[1].toLowerCase();
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** המשטחים שטקסט מותר לשבת עליהם. כל אחד מהם אטום — זו כל הנקודה. */
const SURFACES = {
  porcelain: token("porcelain"),
  "porcelain-slab": token("porcelain-slab"),
  white: "#ffffff",
} as const;

/** טוקני הטקסט. `mist` הוא הבהיר שבהם, ולכן הוא הגבול התחתון בפועל. */
const TEXT = {
  graphite: token("graphite"),
  ink80: token("ink80"),
  ink60: token("ink60"),
  mist: token("mist"),
  lapis: token("lapis"),
  "lapis-ink": token("lapis-ink"),
} as const;

/** צבעי מצב הייצור. הם נצבעים על כרטיס לבן בלבד (ResultScreen). */
const STATUS = {
  successgreen: token("successgreen"),
  warnamber: token("warnamber"),
  failred: token("failred"),
} as const;

const AA = 4.5;

describe("חוזה הניגודיות", () => {
  for (const [textName, textHex] of Object.entries(TEXT)) {
    for (const [surfaceName, surfaceHex] of Object.entries(SURFACES)) {
      it(`${textName} על ${surfaceName} עובר ${AA}:1`, () => {
        const ratio = contrast(textHex, surfaceHex);
        expect(
          ratio,
          `${textName} (${textHex}) על ${surfaceName} (${surfaceHex}) נותן ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  for (const [name, hex] of Object.entries(STATUS)) {
    it(`${name} על לבן עובר ${AA}:1`, () => {
      const ratio = contrast(hex, "#ffffff");
      expect(ratio, `${name} (${hex}) נותן ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
    });
  }

  it("porcelain כטקסט על graphite עובר — זה ה-CTA הראשי", () => {
    expect(contrast(TEXT.graphite, SURFACES.porcelain)).toBeGreaterThanOrEqual(AA);
  });

  /**
   * שומר על הדבר עצמו, ולא רק על התוצאה: הערכים שנפסלו פעם אחת ונשארו בקוד
   * בעותק שני הם דפוס הכשל שהבדיקה הזו נולדה בגללו.
   */
  it("הערכים שנפסלו אינם חוזרים לשום מקום בקוד הציבורי", async () => {
    const { globSync } = await import("node:fs");
    const REJECTED = ["#aab4b8", "#6b6f73", "#4a8f5c", "#b9762e"];
    const files = globSync("src/{components/{create,site},app/(site)}/**/*.tsx", {
      cwd: process.cwd(),
    });
    const hits: string[] = [];
    for (const f of files) {
      const body = readFileSync(join(process.cwd(), f), "utf8");
      for (const line of body.split("\n")) {
        // הערות מותר להן להזכיר ערך פסול — הן מסבירות למה הוא פסול. גם
        // `{/* … */}` של JSX, שהיא הצורה שבה רוב ההערות בקוד הזה כתובות.
        if (/^\s*(\{?\/\*|\/\/|\*)/.test(line)) continue;
        for (const bad of REJECTED) if (line.includes(bad)) hits.push(`${f}: ${bad}`);
      }
    }
    expect(hits, `ערכים שנפסלו על ניגודיות חזרו לקוד:\n${hits.join("\n")}`).toEqual([]);
  });
});
