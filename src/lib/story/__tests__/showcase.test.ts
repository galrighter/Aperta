import { describe, it, expect } from "vitest";
import { FAB } from "@/lib/fabrication.config";
import { svgFrame } from "@/lib/geometry/frame";
import { multiPolygonArea } from "@/lib/geometry/poly";
import { validateDesign } from "@/lib/geometry/validate";
import { SHOWCASE, showcaseCutouts, showcaseMaterial } from "@/lib/story/showcase";

// הוויטרינה של דף הבית מציגה את העיצובים האלה כמוצר — "כל צורה כאן היא עיצוב
// שנחתך כמו שהוא". הבדיקה הזו היא מה שמחזיק את המשפט: כל אפשרות עוברת את
// אותה ולידציה בדיוק שגרסה אמיתית עוברת, ולא בדיקה מקבילה שנכתבה לצידה.

describe("showcase — הנתונים", () => {
  it("יש סיפורים, ולכל אחד כמה אפשרויות ואחת נבחרת", () => {
    expect(SHOWCASE.length).toBeGreaterThanOrEqual(3);
    for (const st of SHOWCASE) {
      expect(st.options.length).toBeGreaterThanOrEqual(2);
      expect(st.chosen).toBeGreaterThanOrEqual(0);
      expect(st.chosen).toBeLessThan(st.options.length);
      expect(st.story.length).toBeGreaterThan(10);
    }
  });

  it("מזהי הסיפורים ייחודיים", () => {
    expect(new Set(SHOWCASE.map((s) => s.id)).size).toBe(SHOWCASE.length);
  });

  it("ה-viewBox של כל אפשרות תואם למידות שהרשומה מצהירה עליהן", () => {
    // ההדמיה מקבלת את המידות מהרשומה ואת הצורה מה-SVG. פער ביניהם היה מותח
    // את הצורה על קשת בגודל אחר — בלי שדבר ייכשל.
    for (const st of SHOWCASE) {
      for (const o of st.options) {
        expect(svgFrame(o.svg)).toEqual({ lengthMm: st.lengthMm, widthMm: st.widthMm });
      }
    }
  });

  it("המידות הן ברירות המחדל של המוצר", () => {
    for (const st of SHOWCASE) {
      const p = FAB.products[st.product];
      expect(st.lengthMm).toBe(p.defaultLengthMm);
      expect(st.widthMm).toBe(p.defaultWidthMm);
      expect(st.gapMm).toBe(p.defaultGapMm);
    }
  });
});

describe("showcase — ייצור", () => {
  it("כל אפשרות עוברת את הוולידציה של המנוע", () => {
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
  it("מחזיר גוף אחד: מלבן הרצועה, והחיתוכים כחורים בתוכו", () => {
    for (const st of SHOWCASE) {
      st.options.forEach((o, i) => {
        const material = showcaseMaterial(st, i);
        expect(material).toHaveLength(1);
        const [outer, ...holes] = material[0];
        expect(outer).toHaveLength(4);
        // חור לכל תת-נתיב בשכבת החיתוכים
        const subpaths = (showcaseCutouts(o.svg).match(/[Mm]/g) ?? []).length;
        expect(holes.length).toBe(subpaths);
        // השטח שנשאר הוא בין רבע לכל המלבן: אפס פירושו חורים שבלעו את הפס,
        // ומלא פירושו שהחורים לא נגזרו בכלל.
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
