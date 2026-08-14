import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseUsage } from "../service";

/**
 * מה שמודל התמונה חייב, בדרך מהקופסה ליומן.
 *
 * למה זה נבדק בכלל: זה תרגום שנכשל בשקט. `usage` נכתב בפייתון בשמות
 * snake_case ונקרא כאן, ואף אחד משני הצדדים לא נופל אם השמות לא נפגשים —
 * היומן פשוט מראה אפסים, וההרצה נקראת כהרצה שלא עלתה כלום. זו בדיוק המסקנה
 * ההפוכה מהאמת, ולכן ההבחנה בין "אין מדידה" ל-"אפס" היא עיקר הטסט.
 */

const BOX = {
  calls: 3,
  input_tokens: 1176,
  output_tokens: 1200,
  total_tokens: 2376,
  text_tokens: 853,
  image_tokens: 323,
};

describe("parseUsage", () => {
  it("מה שהקופסה שולחת נקרא כמו שהוא", () => {
    expect(parseUsage(BOX)).toEqual({
      calls: 3,
      inputTokens: 1176,
      outputTokens: 1200,
      totalTokens: 2376,
      textTokens: 853,
      imageTokens: 323,
    });
  });

  it("קופסה שקדמה לשדה — אין מדידה, ולא אפס", () => {
    // ההבחנה נושאת משקל: אפס ביומן הוא הרצה שלא עלתה כלום, וזה מה שלא קרה.
    expect(parseUsage(undefined)).toBeNull();
    expect(parseUsage(null)).toBeNull();
  });

  it("מבנה ריק — גם הוא אין מדידה", () => {
    // הקופסה מחזירה את המבנה גם כשאף תשובה לא דיווחה usage.
    expect(parseUsage({ calls: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0 })).toBeNull();
  });

  it("שדה חסר או שאינו מספר נספר כאפס, והשאר נשמר", () => {
    // תשובה חלקית עדיפה על אובדן המדידה כולה: הטוקנים שכן דווחו הם מה שנשלם.
    const out = parseUsage({ calls: 1, total_tokens: 410, output_tokens: "לא מספר" });
    expect(out).toEqual({
      calls: 1,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 410,
      textTokens: 0,
      imageTokens: 0,
    });
  });

  it("מה שאינו אובייקט אינו מדידה", () => {
    for (const bad of ["", "42", 7, [], true]) {
      expect(parseUsage(bad)).toBeNull();
    }
  });

  it("כל שם ששולח הצד השני באמת נקרא כאן", () => {
    // הטענה חוצה שפות בכוונה: `USAGE_KEYS` נכתב בפייתון ונקרא ב-TypeScript,
    // ושינוי שם שם אינו שגיאת קומפילציה כאן — הוא אפס שקט ביומן. הרשימה
    // נקראת מהקובץ עצמו ולא משוכפלת, כי עותק שני הוא מה שנסחף.
    const py = readFileSync(join(process.cwd(), "vectorizer/app/imagegen.py"), "utf8");
    const names = (tuple: string): string[] => {
      const block = new RegExp(`${tuple}\\s*=\\s*\\(([^)]*)\\)`).exec(py);
      if (!block) throw new Error(`${tuple} לא נמצא ב-vectorizer/app/imagegen.py`);
      return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    };
    const keys = [...names("USAGE_KEYS"), ...names("USAGE_DETAIL_KEYS")];
    expect(keys.length).toBe(5);
    // `calls` נוסף בצד הפייתון ב-`empty_usage` ולא ברשימות, ולכן הוא נבדק בנפרד.
    for (const key of [...keys, "calls"]) {
      expect(parseUsage({ calls: 1, [key]: 7 })).toMatchObject(
        key === "calls" ? { calls: 7 } : { [camel(key)]: 7 },
      );
    }
  });
});

/** `input_tokens` → `inputTokens`. */
const camel = (key: string) => key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
