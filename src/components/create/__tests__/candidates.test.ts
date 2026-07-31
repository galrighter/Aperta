import { describe, it, expect } from "vitest";
import { candidatesByGeneration, candidatesOf } from "../model";

// ההצעות חיו רק בזיכרון הדפדפן: /api/generate החזיר אותן בגוף התשובה ולא שמר
// אותן, ו-resume בנה את הגרסאות מה-DB בלי `candidates`. כל רענון מחק את רצועת
// החלופות. מיגרציה 0012 שומרת אותן — פעם אחת לכל הרצה, לא לכל בחירה.

type V = { generation_id?: string | null; candidates?: string[] | null };

const RUN = "11111111-1111-1111-1111-111111111111";
const RUN2 = "22222222-2222-2222-2222-222222222222";

describe("איתור ההצעות של גרסה", () => {
  it("הגרסה שההרצה יצרה נושאת את ההצעות", () => {
    const versions: V[] = [{ generation_id: RUN, candidates: ["a", "b", "c"] }];
    const byRun = candidatesByGeneration(versions);
    expect(candidatesOf(versions[0], byRun)).toEqual(["a", "b", "c"]);
  });

  it("גרסה שנוצרה מבחירה מאתרת אותן דרך מזהה ההרצה", () => {
    const versions: V[] = [
      { generation_id: RUN, candidates: ["a", "b", "c"] },
      { generation_id: RUN, candidates: null }, // בחירת הצעה — לא משכפלת
    ];
    const byRun = candidatesByGeneration(versions);
    expect(candidatesOf(versions[1], byRun)).toEqual(["a", "b", "c"]);
  });

  it("כל הרצה שומרת על ההצעות שלה", () => {
    const versions: V[] = [
      { generation_id: RUN, candidates: ["a", "b"] },
      { generation_id: RUN, candidates: null },
      { generation_id: RUN2, candidates: ["x", "y", "z"] },
      { generation_id: RUN2, candidates: null },
    ];
    const byRun = candidatesByGeneration(versions);
    expect(candidatesOf(versions[1], byRun)).toEqual(["a", "b"]);
    expect(candidatesOf(versions[3], byRun)).toEqual(["x", "y", "z"]);
  });

  it("ההצעות נשמרות פעם אחת בלבד לכל הרצה", () => {
    const versions: V[] = [
      { generation_id: RUN, candidates: ["a", "b"] },
      { generation_id: RUN, candidates: null },
      { generation_id: RUN, candidates: null },
    ];
    const stored = versions.filter((v) => v.candidates?.length).length;
    expect(stored).toBe(1);
    // ובכל זאת שלוש הגרסאות מציגות את אותן הצעות
    const byRun = candidatesByGeneration(versions);
    for (const v of versions) expect(candidatesOf(v, byRun)).toEqual(["a", "b"]);
  });

  it("עיצוב מלפני המיגרציה לא נשבר — פשוט אין הצעות", () => {
    const versions: V[] = [{}, { generation_id: null, candidates: null }];
    const byRun = candidatesByGeneration(versions);
    expect(byRun.size).toBe(0);
    for (const v of versions) expect(candidatesOf(v, byRun)).toBeUndefined();
  });

  it("הרצה בלי הצעות שעברו ולידציה אינה נכנסת למפה", () => {
    const versions: V[] = [{ generation_id: RUN, candidates: [] }];
    expect(candidatesByGeneration(versions).size).toBe(0);
  });
});
