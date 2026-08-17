import { describe, it, expect } from "vitest";
import { FAB } from "@/lib/fabrication.config";
import { svgFrame } from "@/lib/geometry/frame";
import { multiPolygonArea } from "@/lib/geometry/poly";
import { validateDesign } from "@/lib/geometry/validate";
import { SHOWCASE, showcaseMaterial } from "@/lib/story/showcase";

// הוויטרינה של דף הבית מציגה את העיצובים האלה כמוצר — "כל צורה כאן נחתכת
// בדיוק כמו שהיא". הבדיקה הזו היא מה שמחזיק את המשפט: כל גרסה עוברת את
// אותה ולידציה בדיוק שגרסה אמיתית עוברת, ולא בדיקה מקבילה שנכתבה לצידה.
//
// מאז 16.8 הנתונים הם עיצובים אמיתיים מהסטודיו (ראו scripts/story-showcase.mjs),
// ולכן ההנחות של הדוגמאות הפרמטריות ירדו: המידות הן של העיצוב ולא ברירות
// המחדל של המוצר, יש עיצובים עם גרסה אחת בלבד, והחיתוכים גוזרים גם את קו
// המתאר — גוף החומר מחושב מראש במחולל, והבדיקה כאן היא על התוצאה.

describe("showcase — הנתונים", () => {
  it("יש עיצובים, ולכל אחד גרסאות ואחת נבחרת", () => {
    expect(SHOWCASE.length).toBeGreaterThanOrEqual(3);
    for (const st of SHOWCASE) {
      expect(st.options.length).toBeGreaterThanOrEqual(1);
      expect(st.chosen).toBeGreaterThanOrEqual(0);
      expect(st.chosen).toBeLessThan(st.options.length);
      expect(st.story.length).toBeGreaterThan(10);
      expect(st.serial).toBeGreaterThan(0);
      expect(st.tag.length).toBeGreaterThan(0);
    }
  });

  it("מזהי העיצובים ייחודיים", () => {
    expect(new Set(SHOWCASE.map((s) => s.id)).size).toBe(SHOWCASE.length);
    expect(new Set(SHOWCASE.map((s) => s.serial)).size).toBe(SHOWCASE.length);
  });

  it("ה-viewBox של כל גרסה תואם למידות שהרשומה מצהירה עליהן", () => {
    // ההדמיה מקבלת את המידות מהרשומה ואת הצורה מה-SVG. פער ביניהם היה מותח
    // את הצורה על קשת בגודל אחר — בלי שדבר ייכשל.
    for (const st of SHOWCASE) {
      for (const o of st.options) {
        expect(svgFrame(o.svg)).toEqual({ lengthMm: st.lengthMm, widthMm: st.widthMm });
      }
    }
  });

  it("המידות בתחום הייצור של המוצר", () => {
    // לא ברירות המחדל — אלה עיצובים אמיתיים במידות שהוזמנו — אבל כן בתוך
    // הטווח שהמפעל מייצר.
    for (const st of SHOWCASE) {
      const [wMin, wMax] = FAB.products[st.product].widthRangeMm;
      expect(st.widthMm).toBeGreaterThanOrEqual(wMin);
      expect(st.widthMm).toBeLessThanOrEqual(wMax);
      expect(st.lengthMm).toBeGreaterThan(0);
      expect(st.gapMm).toBeGreaterThan(0);
    }
  });
});

describe("showcase — ייצור", () => {
  it("כל גרסה עוברת את הוולידציה של המנוע — גם אחרי הדילול לתצוגה", () => {
    // הדילול (ε=0.04 מ"מ) חייב להישאר מתחת לסף שמפיל בדיקת ייצוריות: אם
    // גשר נהיה צר מדי בגלל הדילול, הבדיקה הזו היא שתתפוס את זה.
    for (const st of SHOWCASE) {
      for (const o of st.options) {
        const { report } = validateDesign(o.svg, {
          productType: st.product,
          lengthMm: st.lengthMm,
          widthMm: st.widthMm,
          thicknessMm: FAB.defaultThicknessMm,
        });
        expect(report.status, `${st.id}/${o.note}: ${JSON.stringify(report.checks.filter((c) => c.status !== "pass"))}`)
          .not.toBe("fail");
      }
    }
  });
});

describe("showcaseMaterial", () => {
  it("גוף חומר מחושב מראש לכל גרסה, בשטח סביר", () => {
    // עיצוב אמיתי גוזר גם את קו המתאר, ולכן הגוף אינו בהכרח "מלבן + חורים" —
    // אבל הוא חייב להיות קיים (חישוב בזמן בילד), לא ריק, ובשטח שבין רבע
    // המלבן לכמעט כולו: אפס פירושו חיתוכים שבלעו את הפס, ומלא פירושו
    // שהחיתוכים לא נגזרו בכלל.
    for (const st of SHOWCASE) {
      st.options.forEach((o, i) => {
        expect(o.material, `${st.id}/${o.note}: חסר material מחושב`).toBeDefined();
        const material = showcaseMaterial(st, i);
        expect(material.length).toBeGreaterThanOrEqual(1);
        const full = st.lengthMm * st.widthMm;
        const area = multiPolygonArea(material);
        expect(area).toBeGreaterThan(full * 0.25);
        expect(area).toBeLessThan(full * 0.995);
      });
    }
  });

  it("אינדקס שאינו קיים מחזיר ריק ולא זורק", () => {
    expect(showcaseMaterial(SHOWCASE[0], 99)).toEqual([]);
  });
});
