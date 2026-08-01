import { describe, it, expect } from "vitest";
import { entryFromGeneration } from "../model";
import type { ValidationReport } from "@/lib/geometry/types";

// הרגרסיה שנסגרה כאן: בקשת שינוי בנתה את רשומת הגרסה בעצמה, בלי להעתיק את
// `candidates`. המנוע מריץ *אותו* צינור לעריכה וליצירה, מחזיר את אותן שלוש-
// ארבע הצעות, ואף שומר אותן על הגרסה — אבל המסך הציג אחרי כל שינוי הצעה אחת,
// והשאר הופיעו רק ברענון שטוען את הגרסה מהשרת. שני המסלולים בונים עכשיו את
// הרשומה מאותה פונקציה, כך שאין מאיפה לשמוט שדה בצד אחד בלבד.

const report = { status: "pass" } as unknown as ValidationReport;

const res = (patch: Record<string, unknown> = {}) => ({
  version: { id: "v2", version_no: 2, svg: "<svg/>" },
  lengthMm: 160,
  report,
  geometry: null,
  ...patch,
});

describe("entryFromGeneration", () => {
  it("שינוי נושא את ההצעות שחזרו, בדיוק כמו יצירה", () => {
    const candidates = [
      { svg: "<a/>", report },
      { svg: "<b/>", report },
      { svg: "<c/>", report },
    ];
    const edit = entryFromGeneration(res({ candidates }), {
      region: "right",
      text: "לדלל את החיתוכים בקצה",
    });
    expect(edit.candidates).toHaveLength(3);

    const first = entryFromGeneration(res({ candidates }), { region: null, text: "" });
    expect(first.candidates).toEqual(edit.candidates);
  });

  it("הבקשה והאזור נשמרים על הגרסה — זה מה שהיומן מציג", () => {
    const e = entryFromGeneration(res(), { region: "left", text: "יותר מתכת במרכז" });
    expect(e).toMatchObject({
      versionId: "v2",
      versionNo: 2,
      lengthMm: 160,
      region: "left",
      text: "יותר מתכת במרכז",
      svg: "<svg/>",
    });
  });

  it("מסלול הווקטוריזציה לא מחזיר הצעות — והגרסה תקינה בלעדיהן", () => {
    const e = entryFromGeneration(res(), { region: null, text: "" });
    expect(e.candidates).toBeUndefined();
    // ובלי אורך שחזר מהשרת, השדה הוא null ולא undefined — כך הוא נשמר.
    expect(entryFromGeneration(res({ lengthMm: undefined }), { region: null, text: "" }).lengthMm)
      .toBeNull();
  });
});
