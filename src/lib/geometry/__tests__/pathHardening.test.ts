import { describe, expect, it } from "vitest";
import { tokenizePath, samplePathToRings } from "../paths";
import { ringArea } from "../poly";

// שני קלטי SVG חוקיים שהצינור החי אינו מייצר — הווקטורייזר עושה `orient` מפורש
// ופולט M/L/Z בלבד — ולכן שניהם הקשחה של מסלול הייבוא (share-adopt, קובץ שעבר
// אופטימיזציה), לא באג שנצפה בייצור. O5 בדוח הביקורת.

describe("tokenizePath — דגלי קשת דחוסים", () => {
  /**
   * `flag` בדקדוק של SVG הוא תו אחד, ולכן `0 1 1` מותר להיכתב `011`. הסורק קרא
   * מספרים בחמדנות ובלע את זה כ-11, ואז ספירת הארגומנטים יצאה 6 במקום 7.
   */
  it("קורא `011` כשני דגלים וקואורדינטה, ולא כמספר אחד", () => {
    const cmds = tokenizePath("M0 0 A1 1 0 011 0Z");
    const arc = cmds.find((c) => c.op === "A");
    expect(arc).toBeDefined();
    expect(arc!.args).toEqual([1, 1, 0, 0, 1, 1, 0]);
  });

  it("קורא את אותה קשת גם כשהדגלים מופרדים כרגיל", () => {
    const spaced = tokenizePath("M0 0 A1 1 0 0 1 1 0Z").find((c) => c.op === "A");
    const packed = tokenizePath("M0 0 A1 1 0 011 0Z").find((c) => c.op === "A");
    expect(packed!.args).toEqual(spaced!.args);
  });

  it("מטפל בשני הדגלים דחוסים יחד עם הקואורדינטה", () => {
    // large-arc=1, sweep=1, ואז x=2 — הכל בלי מפריד.
    const arc = tokenizePath("M0 0 a5 5 0 112 3Z").find((c) => c.op === "a");
    expect(arc!.args).toEqual([5, 5, 0, 1, 1, 2, 3]);
  });

  it("דוחה דגל שאינו 0 או 1 במקום לבלוע אותו בשקט", () => {
    expect(() => tokenizePath("M0 0 A1 1 0 5 1 1 0Z")).toThrow(/Arc flag/);
  });

  it("קשת דחוסה נדגמת לטבעת סגורה עם שטח", () => {
    // המבחן האמיתי: לא רק שהאסימונים נכונים, אלא שהנתיב עובר את כל הדגימה.
    const subs = samplePathToRings("M0 0 A5 5 0 011 0 A5 5 0 01-1 0Z");
    expect(subs).toHaveLength(1);
    expect(subs[0].closed).toBe(true);
    expect(subs[0].ring.length).toBeGreaterThan(3);
  });

  it("לא נוגע בפקודות אחרות שמספריהן צמודים", () => {
    // רגרסיה: הטיפול בדגלים חייב לחול על A/a בלבד.
    const cmds = tokenizePath("M0 0L1.5.5L2-3Z");
    expect(cmds.map((c) => c.op)).toEqual(["M", "L", "L", "Z"]);
    expect(cmds[1].args).toEqual([1.5, 0.5]);
    expect(cmds[2].args).toEqual([2, -3]);
  });
});

describe("ringArea — הכיוון שעליו נשענת ההכרעה", () => {
  it("מחזיר סימנים מנוגדים לשתי טבעות מנוגדות כיוון", () => {
    const cw: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const ccw = [...cw].reverse();
    expect(Math.sign(ringArea(cw))).toBe(-Math.sign(ringArea(ccw)));
  });
});
