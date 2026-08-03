import { describe, it, expect } from "vitest";
import { deriveAttemptId, deriveRenderJobId } from "../attemptId";

// מזהה הניסיון נגזר מ-`jobId` של הלקוחה במקום להיות מוגרל, וזו כל התשתית של
// C2 (docs/C2_RESILIENT_GENERATION.md): הקופסה מחזיקה את ההרצה תחתיו, ולכן
// בקשה חוזרת אוספת עבודה ששולמה כבר. מה שנשמר כאן הוא שלוש התכונות שהנתיב הזה
// עומד עליהן — יציבות, הפרדה בין ניסיונות, ותקינות הפורמט מול שתי המערכות
// שאוכלות אותו (עמודת uuid ב-Postgres, והבודק בצד הקופסה).

const JOB = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OTHER = "9c858901-8a57-4791-81fe-4c455b099bc9";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("מזהה הניסיון", () => {
  it("אותו job נותן תמיד אותו מזהה", async () => {
    // בלי זה בקשה חוזרת פותחת job חדש על הקופסה, כלומר קריאה נוספת למודל
    // התמונה על עבודה ששולמה — הכשל שכל השינוי קיים כדי למנוע.
    expect(await deriveAttemptId(JOB, 1)).toBe(await deriveAttemptId(JOB, 1));
  });

  it("ניסיון שני הוא מזהה אחר", async () => {
    // שתי ההרצות נשמרות ביומן ומעלות ארטיפקטים לנתיבים נפרדים; מזהה משותף
    // היה נותן לשנייה למחוק את הראיות של הראשונה.
    expect(await deriveAttemptId(JOB, 2)).not.toBe(await deriveAttemptId(JOB, 1));
  });

  it("שני jobs הם שני מזהים", async () => {
    expect(await deriveAttemptId(OTHER, 1)).not.toBe(await deriveAttemptId(JOB, 1));
  });

  it("הפורמט הוא UUID תקין", async () => {
    // הוא נכתב לעמודת uuid ב-generation_runs ונשלח לקופסה, ושתיהן דוחות כל
    // דבר אחר — הקופסה בכוונה, כי המזהה נעשה שם שם של תיקייה.
    const id = await deriveAttemptId(JOB, 1);
    expect(id).toMatch(UUID);
    expect(id[14]).toBe("8"); // גרסה
    expect("89ab").toContain(id[19]); // variant
  });
});

describe("מזהה ההרצה בקופסה", () => {
  const request = JSON.stringify({ prompt: "a bracelet", calls: 2 });

  it("אותה בקשה על אותו ניסיון — אותו job", async () => {
    expect(await deriveRenderJobId(JOB, request)).toBe(await deriveRenderJobId(JOB, request));
  });

  it("בקשה שהשתנתה היא job אחר", async () => {
    // הקופסה מחזירה תחת המזהה את מה שכבר רינדרה, בלי להסתכל בגוף. בלי
    // ההפרדה הזו, `jobId` שמוחזר בטעות עם פרומפט חדש היה מחזיר ללקוחה את
    // הציור הישן — תשובה למשהו שהיא לא ביקשה.
    const changed = JSON.stringify({ prompt: "a ring", calls: 2 });
    expect(await deriveRenderJobId(JOB, changed)).not.toBe(await deriveRenderJobId(JOB, request));
  });

  it("שני ניסיונות של אותה בקשה הם שני jobs", async () => {
    const first = await deriveAttemptId(JOB, 1);
    const second = await deriveAttemptId(JOB, 2);
    expect(await deriveRenderJobId(second, request)).not.toBe(await deriveRenderJobId(first, request));
  });

  it("הפורמט הוא UUID תקין", async () => {
    expect(await deriveRenderJobId(JOB, request)).toMatch(UUID);
  });
});
