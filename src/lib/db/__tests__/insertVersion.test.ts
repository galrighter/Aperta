import { beforeEach, describe, expect, it, vi } from "vitest";

// "הרצה אחת = שורת גרסה אחת" נאכף במסד (מיגרציה 0021), ומה שנבדק כאן הוא הצד
// השני של האכיפה: מה `insertVersion` עושה כשהיא נתקלת בה. התשובה חייבת להיות
// "מחזירה את השורה הקיימת" ולא "זורקת" — אחרת האינדקס הופך כפילות שקטה
// ל"היצירה נכשלה" על עיצוב ששמור אצלנו, שהוא בדיוק הכשל ש-C2 נבנה למנוע.

const db = vi.hoisted(() => ({
  /** מה ה-insert מחזיר. `error` = ההתנגשות שאנחנו בודקים. */
  insert: { data: null as unknown, error: null as { message: string } | null },
  /** מה שנמצא כשמחפשים לפי `generation_id`. */
  existing: null as unknown,
  inserts: 0,
  designUpdates: 0,
}));

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "designs") {
        return {
          update: () => ({
            eq: () => {
              db.designUpdates += 1;
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      return {
        // `version_no` המקסימלי הקיים, ואיתור לפי `generation_id` — שתיהן
        // מתחילות ב-select ונבדלות בשרשור שאחריו.
        select: () => ({
          eq: (col: string) => {
            const maxNo = {
              order: () => ({
                limit: () => ({ maybeSingle: () => Promise.resolve({ data: { version_no: 4 }, error: null }) }),
              }),
            };
            const byGeneration = {
              order: () => ({
                limit: () => ({ maybeSingle: () => Promise.resolve({ data: db.existing, error: null }) }),
              }),
            };
            return col === "generation_id" ? byGeneration : maxNo;
          },
        }),
        insert: () => ({
          select: () => ({
            single: () => {
              db.inserts += 1;
              return Promise.resolve(db.insert);
            },
          }),
        }),
      };
    },
  }),
}));

const { insertVersion } = await import("../designs");

const GEN = "6fbd158b-59c6-8f7c-9910-9f60f83efa3a";

const input = {
  design_id: "e818b255-731c-4f47-a0e0-9bf11f302680",
  svg: "<svg/>",
  source: "generate" as const,
  user_prompt: "צמיד",
  annotation_png_path: null,
  validation_report: null,
  validation_status: "pass" as const,
  candidates: [{ svg: "<svg/>" }] as never,
  generation_id: GEN,
  picked_index: 0,
};

/** הנוסח ש-Postgres מחזיר על הפרת האינדקס של 0021. */
const COLLISION = {
  message:
    'duplicate key value violates unique constraint "design_versions_one_run_per_generation"',
};

beforeEach(() => {
  vi.clearAllMocks();
  db.insert = { data: { id: "v-new", version_no: 5 }, error: null };
  db.existing = null;
  db.inserts = 0;
  db.designUpdates = 0;
});

describe("insertVersion מול האינדקס של 0021", () => {
  it("שומרת כרגיל כשאין התנגשות", async () => {
    const row = await insertVersion(input);
    expect(row).toMatchObject({ id: "v-new", version_no: 5 });
    // `version_no` רץ מהמקסימום הקיים, לא מאחד.
    expect(db.inserts).toBe(1);
    expect(db.designUpdates).toBe(1);
  });

  it("מחזירה את השורה הקיימת כשקורא אחר הקדים אותה", async () => {
    db.insert = { data: null, error: COLLISION };
    db.existing = { id: "v-first", version_no: 1, design_id: input.design_id };
    const row = await insertVersion(input);
    expect(row).toMatchObject({ id: "v-first" });
    // ולא מצביעה מחדש: מי שכתב ראשון כבר עדכן את `current_version_id`.
    expect(db.designUpdates).toBe(0);
  });

  it("אינה בולעת את ההתנגשות כשאין שורה להחזיר", async () => {
    // התנגשות בלי שורה מאחוריה אינה מצב מוכר, ושתיקה עליה הייתה מחזירה
    // ללקוחה "נשמר" על משהו שלא נשמר. עדיף להיכשל בקול.
    db.insert = { data: null, error: COLLISION };
    db.existing = null;
    await expect(insertVersion(input)).rejects.toThrow();
    expect(db.designUpdates).toBe(0);
  });

  it("התנגשות על version_no עדיין מנסה שוב, ואינה מתבלבלת עם 0021", async () => {
    // שתי ההתנגשויות הן "duplicate key", והתגובה להן הפוכה: אחת מקצה מספר
    // גרסה חדש, השנייה מוותרת על השורה לטובת הקיימת.
    db.insert = { data: null, error: { message: 'duplicate key value violates unique constraint "design_versions_design_id_version_no_key"' } };
    await expect(insertVersion(input)).rejects.toThrow("Failed to allocate version number");
    expect(db.inserts).toBe(3);
  });
});
