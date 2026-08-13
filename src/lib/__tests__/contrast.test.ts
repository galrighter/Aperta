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
  chalk: token("chalk"),
  white: "#ffffff",
} as const;

/** מרכיב צבע באטימות `alpha` מעל רקע אטום, ומחזיר את התוצאה כ-hex. */
function composite(fg: string, alpha: number, bg: string): string {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [f, b] = [parse(fg), parse(bg)];
  return `#${f
    .map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** עוצמת קווי האריגה של `.ap-surface`, מתוך ה-CSS. מקור אחד, כמו הצבעים. */
function textureAlpha(): number {
  const m = CSS.match(/--ap-texture-alpha:\s*([\d.]+)/);
  if (!m) throw new Error("--ap-texture-alpha לא נמצא ב-globals.css");
  return Number(m[1]);
}

/** טוקני הטקסט. `mist` הוא הבהיר שבהם, ולכן הוא הגבול התחתון בפועל. */
const TEXT = {
  graphite: token("graphite"),
  ink80: token("ink80"),
  ink60: token("ink60"),
  mist: token("mist"),
  lapis: token("lapis"),
  "lapis-ink": token("lapis-ink"),
} as const;

/** צבעי מצב הייצור. הם נצבעים על כרטיס בלבד (ResultScreen) — היום `chalk`. */
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

  /**
   * האריגה של `.ap-surface` מוסיפה קווי גרפיט דקים *מעל* המשטח האטום, כלומר
   * מזיזה את הרקע בפועל מתחת לטקסט. ההזזה קטנה, אבל "קטנה" היא בדיוק הטענה
   * שהחוזה הזה קיים כדי לא להאמין לה על סמך עין. הנקודה הכהה ביותר של משטח
   * ארוג היא צומת של שני קווים — ושם, ולא בממוצע, נמדדת הניגודיות.
   */
  const ALPHA = textureAlpha();
  for (const [textName, textHex] of Object.entries(TEXT)) {
    for (const [surfaceName, surfaceHex] of Object.entries(SURFACES)) {
      const woven = composite(TEXT.graphite, ALPHA, surfaceHex);
      it(`${textName} על ${surfaceName} ארוג עובר ${AA}:1`, () => {
        const ratio = contrast(textHex, woven);
        expect(
          ratio,
          `${textName} (${textHex}) על ${surfaceName} ארוג (${woven}) נותן ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  for (const [name, hex] of Object.entries(STATUS)) {
    for (const surfaceName of ["white", "chalk"] as const) {
      it(`${name} על ${surfaceName} עובר ${AA}:1`, () => {
        const surface = SURFACES[surfaceName];
        const ratio = contrast(hex, surface);
        expect(ratio, `${name} (${hex}) על ${surfaceName} נותן ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  it("porcelain כטקסט על graphite עובר — זה ה-CTA הראשי", () => {
    expect(contrast(TEXT.graphite, SURFACES.porcelain)).toBeGreaterThanOrEqual(AA);
  });

  /**
   * `.ap-veil` מחליף את המשטח האטום בכתם מטושטש, ולכן האטימות מתחת לטקסט אינה
   * 100% אלא פונקציה של שני מספרים. קצה חד שעבר גאוסיאן ב-σ מגיע ל-97.7%
   * אטימות במרחק 2σ פנימה, ולכן הגלישה מחוץ לתיבת התוכן חייבת להיות ≥2×הטשטוש
   * — אחרת הטקסט יושב על משטח שקוף למחצה, שהוא בדיוק המצב ש-§B1 תיאר.
   *
   * הבדיקה על היחס ולא על הערכים: מותר לכוון את הרכות, אסור לנתק את הקשר.
   */
  it("הגלישה של ap-veil מכסה את הטשטוש — הטקסט יושב על אטימות מלאה", () => {
    const px = (name: string): number => {
      const m = CSS.match(new RegExp(`--ap-veil-${name}:\\s*([\\d.]+)px`));
      if (!m) throw new Error(`--ap-veil-${name} לא נמצא ב-globals.css`);
      return Number(m[1]);
    };
    const blur = px("blur");
    const bleed = px("bleed");
    expect(
      bleed,
      `גלישה ${bleed}px מול טשטוש ${blur}px — צריך לפחות ${2 * blur}px`,
    ).toBeGreaterThanOrEqual(2 * blur);
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
