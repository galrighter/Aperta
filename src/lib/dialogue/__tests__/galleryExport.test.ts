import { describe, expect, it } from "vitest";
import { curatedRecordOf, curatedRecordsOf, dimsOf, displaySvgOf } from "../galleryExport";

/**
 * dialogue mode — טרנספורמציות הייצוא של הגלריה (‏PROMPT_SPEC §3.2).
 *
 * מה שנבדק הוא מה שהסקריפט לא יתפוס בעצמו: קדימות `overrides` על `read`,
 * ‏`null` על מה שלא נמדד (לא אפס ולא ניחוש), רשומות שאינן ברות-גלריה,
 * והקוטביות של קובץ התצוגה — חומר מלא, לא נגטיב.
 */

const raw = (over: Record<string, unknown> = {}) => ({
  version_id: "v1",
  serial: 7,
  product_type: "bracelet",
  length_mm: 160,
  width_mm: 15,
  computed: { length_to_width_ratio: 10.64, openings_count: 29, metal_void_balance: 0.197 },
  read: {
    outer_silhouette: "מלבן מלא",
    character_tags: ["עדין", "נקי"],
    concept: "פיזור נקודות",
  },
  overrides: { gallery: true, ...over },
});

describe("curatedRecordOf", () => {
  it("רק רשומה מאוצרת נכנסת — הגלריה היא הרשימה המאוצרת בלבד", () => {
    expect(curatedRecordOf({ ...raw(), overrides: {} })).toBeNull();
    expect(curatedRecordOf(raw())).not.toBeNull();
  });

  it("רשומה שגרסתה נמחקה (`missing`) אינה נכנסת — אין ציור להציג", () => {
    expect(curatedRecordOf({ ...raw(), missing: true })).toBeNull();
  });

  it("‏overrides גוברים על read — התיקון של גל הוא ה-user של הגלריה", () => {
    const r = curatedRecordOf(raw({ character_tags: ["נועז"], concept: "אחר" }));
    expect(r?.tags).toEqual(["נועז"]);
    expect(r?.concept).toBe("אחר");
  });

  it("מספר שלא נמדד נכתב null — לא אפס ולא ניחוש", () => {
    const r = curatedRecordOf({ ...raw(), computed: { length_to_width_ratio: 10.64 } });
    expect(r?.computed.openings_count).toBeNull();
    expect(r?.computed.metal_void_balance).toBeNull();
    expect(r?.computed.length_to_width_ratio).toBe(10.64);
  });

  it("מזהה או מוצר חסרים פוסלים — רשומה בלי כתובת אינה ניתנת להצגה", () => {
    expect(curatedRecordOf({ ...raw(), version_id: undefined })).toBeNull();
    expect(curatedRecordOf({ ...raw(), product_type: "necklace" })).toBeNull();
  });
});

describe("curatedRecordsOf", () => {
  it("סדר קבוע (סידורי, ואז מזהה) — שתי ריצות ייצוא הן diff ריק", () => {
    const file = {
      designs: [
        { ...raw(), version_id: "b", serial: 2 },
        { ...raw(), version_id: "a", serial: 1 },
        { ...raw(), version_id: "z", serial: null },
      ],
    };
    expect(curatedRecordsOf(file).map((d) => d.version_id)).toEqual(["a", "b", "z"]);
  });

  it("קובץ בלי designs חוזר ריק, לא נופל — קובץ נערך ביד", () => {
    expect(curatedRecordsOf({})).toEqual([]);
    expect(curatedRecordsOf(null)).toEqual([]);
  });
});

describe("displaySvgOf", () => {
  const svg = (inner: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 10"><g id="cutouts">${inner}</g></svg>`;
  const DIMS = { lengthMm: 60, widthMm: 10 };

  it("קובץ עצמאי: חומר מלא (evenodd) בתוך viewBox — הקוטביות של FlatCanvas", () => {
    const out = displaySvgOf(svg(`<rect x="10" y="3" width="6" height="4"/>`), DIMS);
    expect(out).not.toBeNull();
    expect(out).toContain("<svg xmlns=");
    expect(out).toContain('viewBox="');
    expect(out).toContain('fill-rule="evenodd"');
    expect(out).toContain('fill="#202326"');
    // המסגרת החיצונית וטבעת החור — שני תת-מסלולים, כמו ב-previewOf.
    expect(out!.match(/M/g)).toHaveLength(2);
  });

  it("‏SVG ששובר את החוזה חוזר null — הייצוא מדווח, לא כותב קובץ ריק", () => {
    expect(displaySvgOf("not an svg", DIMS)).toBeNull();
  });

  it("dimsOf קורא את מידות הרשומה, ואפס על מה שאין", () => {
    expect(dimsOf({ length_mm: 160, width_mm: 15 })).toEqual({ lengthMm: 160, widthMm: 15 });
    expect(dimsOf({})).toEqual({ lengthMm: 0, widthMm: 0 });
  });
});
