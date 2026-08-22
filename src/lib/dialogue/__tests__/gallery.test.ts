import { describe, expect, it } from "vitest";
import {
  GALLERY_COUNT, curatedById, curatedDesigns, describeGalleryChoice, gallerySvgPath,
  selectFrom, selectGalleryDesigns, vocabularyOf, type CuratedDesign,
} from "../gallery";

/**
 * dialogue mode — שכבת הגלריה בראיון (‏PROMPT_SPEC §3.2).
 *
 * מה שנבדק הוא מה שיכול להיות שגוי בשקט: בחירה שמחזירה שני אחים כמעט זהים
 * (המלכודת המפורשת של האוצרות — ה-50 נבחרו בפריסה סידורית, לא לפי דמיון),
 * שאילתה עם תגים לא מוכרים שמרוקנת את הגלריה, ואי-דטרמיניזם שהיה הופך כל
 * טסט להטלת קובייה. בסוף — חוזה הנתונים על הקובץ האמיתי: הבחירה טובה רק
 * כמו הרשימה שהיא רצה עליה.
 */

const design = (
  id: string,
  serial: number | null,
  tags: string[],
  product: "bracelet" | "ring" = "bracelet",
): CuratedDesign => ({
  version_id: id,
  serial,
  product_type: product,
  tags,
  concept: null,
  read: {},
  computed: {
    length_to_width_ratio: null,
    openings_count: null,
    metal_void_balance: null,
    mirror_symmetry: null,
  },
});

describe("selectFrom", () => {
  it("התאמה לשאילתה גוברת — מי שנושא את התגים המבוקשים נבחר קודם", () => {
    const pool = [
      design("a", 1, ["עדין", "אוורירי"]),
      design("b", 2, ["עמוס", "גיאומטרי"]),
      design("c", 3, ["עדין"]),
    ];
    const picked = selectFrom(pool, ["עדין", "אוורירי"], 2);
    expect(picked.map((d) => d.version_id)).toEqual(["a", "c"]);
  });

  it("בין התאמות שוות נבחר המגוון — לא שני אחים כמעט זהים", () => {
    // שלושתם עונים לשאילתה באותה מידה; אחרי שנבחר הראשון, האח הזהה לו
    // ("twin") חולק איתו שני תגים והשלישי רק אחד — השלישי נכנס.
    const pool = [
      design("first", 1, ["עדין", "נקי"]),
      design("twin", 2, ["עדין", "נקי"]),
      design("varied", 3, ["עדין", "אורגני"]),
    ];
    const picked = selectFrom(pool, ["עדין"], 2);
    expect(picked.map((d) => d.version_id)).toEqual(["first", "varied"]);
  });

  it("תגים לא מוכרים אינם מרוקנים את הגלריה — הבחירה ממשיכה על גיוון", () => {
    const pool = [design("a", 1, ["עדין"]), design("b", 2, ["עמוס"])];
    const picked = selectFrom(pool, ["תג-שלא-קיים"], 2);
    expect(picked).toHaveLength(2);
  });

  it("שאילתה ריקה היא גיוון טהור, בסדר דטרמיניסטי", () => {
    const pool = [
      design("b", 2, ["עמוס"]),
      design("a", 1, ["עדין"]),
      design("c", null, ["נקי"]),
    ];
    // סידורי עולה; חסר-סידורי אחרון.
    expect(selectFrom(pool, [], 3).map((d) => d.version_id)).toEqual(["a", "b", "c"]);
  });

  it("מאגר קטן מהמבוקש חוזר כולו — הגלריה לעולם אינה ממציאה", () => {
    const pool = [design("a", 1, ["עדין"])];
    expect(selectFrom(pool, ["עדין"], 6)).toHaveLength(1);
  });

  it("שתי קריאות זהות מחזירות אותה בחירה — אקראיות הייתה הופכת טסט לקובייה", () => {
    const pool = [
      design("a", 1, ["עדין", "נקי"]),
      design("b", 2, ["עדין"]),
      design("c", 3, ["אורגני"]),
      design("d", 4, ["נועז", "עדין"]),
    ];
    const first = selectFrom(pool, ["עדין"], 3).map((d) => d.version_id);
    expect(selectFrom(pool, ["עדין"], 3).map((d) => d.version_id)).toEqual(first);
  });
});

describe("vocabularyOf", () => {
  it("שכיחים תחילה — תג נפוץ הוא שאילתה שמחזירה מבחר", () => {
    const pool = [
      design("a", 1, ["עדין", "נקי"]),
      design("b", 2, ["עדין"]),
      design("c", 3, ["נועז"]),
    ];
    expect(vocabularyOf(pool)[0]).toBe("עדין");
    expect(vocabularyOf(pool)).toHaveLength(3);
  });
});

describe("describeGalleryChoice", () => {
  it("קורא את הרשומה בתוויות המפרט, ומשמיט מה שלא נמדד — לא ממציא", () => {
    const d: CuratedDesign = {
      ...design("a", 1, ["עדין", "אוורירי"]),
      concept: "קו נודד ששובר סימטריה",
      read: { outer_silhouette: "מלבן מלא", rhythm: "אחיד" },
      computed: {
        length_to_width_ratio: 10.64,
        openings_count: 29,
        metal_void_balance: 0.197,
        mirror_symmetry: null,
      },
    };
    const text = describeGalleryChoice(d);
    expect(text).toContain("Concept: קו נודד ששובר סימטריה");
    expect(text).toContain("Character: עדין · אוורירי");
    expect(text).toContain("Outer silhouette: מלבן מלא");
    expect(text).toContain("length-to-width 1:10.6");
    expect(text).toContain("openings 29");
    expect(text).toContain("open share 20%");
    expect(text).not.toContain("mirror symmetry");
  });

  it("רשומה כמעט ריקה עדיין נקראת — בלי שורות ריקות ובלי null-ים", () => {
    const text = describeGalleryChoice(design("a", 1, []));
    expect(text).not.toContain("null");
    expect(text).not.toContain("Measured");
  });
});

describe("חוזה הנתונים — הקובץ המאוצר האמיתי", () => {
  it("לשני המוצרים יש רשימה מאוצרת שמספיקה לגלריה מלאה", () => {
    expect(curatedDesigns("bracelet").length).toBeGreaterThanOrEqual(GALLERY_COUNT);
    expect(curatedDesigns("ring").length).toBeGreaterThanOrEqual(GALLERY_COUNT);
  });

  it("המזהים ייחודיים, ולכל רשומה יש תגים — שאילתה בלי תגים אינה מדידה", () => {
    const all = [...curatedDesigns("bracelet"), ...curatedDesigns("ring")];
    expect(new Set(all.map((d) => d.version_id)).size).toBe(all.length);
    for (const d of all) expect(d.tags.length).toBeGreaterThan(0);
  });

  it("בחירה אמיתית: שישה שונים, מהמוצר הנכון", () => {
    const picked = selectGalleryDesigns("bracelet", ["עדין"]);
    expect(picked).toHaveLength(GALLERY_COUNT);
    expect(new Set(picked.map((d) => d.version_id)).size).toBe(GALLERY_COUNT);
    for (const d of picked) expect(d.product_type).toBe("bracelet");
  });

  it("‏curatedById מוצא מאוצר ודוחה זר — הגלריה היא הרשימה המאוצרת בלבד", () => {
    const some = curatedDesigns("bracelet")[0];
    expect(curatedById(some.version_id)?.version_id).toBe(some.version_id);
    expect(curatedById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("gallerySvgPath", () => {
  it("נתיב סטטי לפי המזהה", () => {
    expect(gallerySvgPath("abc-123")).toBe("/gallery/abc-123.svg");
  });
});
