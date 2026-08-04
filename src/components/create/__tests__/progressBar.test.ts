import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CEILING, FILL_MS, progressAt } from "../ProgressBar";

describe("קצב המילוי", () => {
  it("לא מגיע לתקרה לפני דקה וחצי", () => {
    // זה כל השינוי: הקצב הקודם (צעד של ‎(96-p)*0.035 + 0.35 כל 240ms) הגיע
    // לתקרה תוך ~16 שניות, והפס עמד מלא כמעט כל ההמתנה.
    expect(FILL_MS).toBeGreaterThanOrEqual(90_000);
    expect(progressAt(FILL_MS - 1)).toBeLessThan(CEILING);
    expect(progressAt(FILL_MS)).toBeCloseTo(CEILING, 6);
  });

  it("אחרי 16 שניות — הזמן שבו הפס היה נגמר — הוא עוד לא באמצע", () => {
    expect(progressAt(16_000)).toBeLessThan(50);
  });

  it("עולה תמיד, ולא חורג מהתקרה גם אחרי המתנה ארוכה", () => {
    let prev = -1;
    for (let ms = 0; ms <= FILL_MS; ms += 250) {
      const p = progressAt(ms);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
    // ההרצה יכולה לקחת יותר מדקה וחצי; הפס נעצר ומחכה למנוע.
    expect(progressAt(FILL_MS * 5)).toBe(CEILING);
  });

  it("מתחיל מעל אפס — פס ריק לגמרי נראה כמו כשל", () => {
    expect(progressAt(0)).toBeGreaterThan(0);
  });
});

describe("איפה הפס מופיע", () => {
  const CREATE = join(process.cwd(), "src/components/create");

  it("גם בעריכה, לא רק ביצירה הראשונה", () => {
    // עד כאן ההמתנה בעריכה הייתה כפתור שכתוב עליו "מחיל…" ומשפט הסבר, ושום
    // דבר על המסך לא זז בזמן שהמנוע רץ.
    const result = readFileSync(join(CREATE, "ResultScreen.tsx"), "utf8");
    expect(result).toContain("ProgressBar");
    expect(result).toMatch(/s\.applying && \([\s\S]*ProgressBar/);
  });

  it("מסך העיבוד משתמש באותו פס ולא בעותק משלו", () => {
    const proc = readFileSync(join(CREATE, "ProcessingScreen.tsx"), "utf8");
    expect(proc).toContain("<ProgressBar");
    expect(proc).not.toContain('role="progressbar"');
  });
});
