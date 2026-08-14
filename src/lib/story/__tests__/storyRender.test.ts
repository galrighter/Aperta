import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STORY_RENDER } from "../mode";

/**
 * story mode — המודל והמאמץ שהמסלול רץ בהם.
 *
 * הטסט היחיד שיש מה לבדוק בו כאן הוא **החוזה מול הקופסה**, והוא חוצה שפות:
 * `STORY_RENDER` נכתב ב-TypeScript ונשלח כמחרוזת אל `vectorizer/app/imagegen.py`,
 * שמאמת אותו מול רשימה מותרת ומחזיר 400 על ערך שאינו בה. שם שגוי כאן אינו
 * שגיאת קומפילציה ואינו כשל בטסט אחר — הוא הרצה שנופלת בפרודקשן, אחרי
 * שהלקוחה כבר המתינה.
 *
 * לכן הרשימות נקראות מהקובץ עצמו ולא משוכפלות לכאן: עותק שני של רשימה מותרת
 * הוא בדיוק מה שנסחף.
 */

const imagegenPy = readFileSync(
  join(process.cwd(), "vectorizer/app/imagegen.py"),
  "utf8",
);

/** `ALLOWED_X = frozenset({"a", "b"})` → הערכים עצמם. */
function allowlist(name: string): string[] {
  const block = new RegExp(`${name}\\s*=\\s*frozenset\\(\\{([^}]*)\\}\\)`).exec(imagegenPy);
  if (!block) throw new Error(`${name} לא נמצא ב-vectorizer/app/imagegen.py`);
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("STORY_RENDER", () => {
  it("המודל נמצא ברשימה שהקופסה מתירה", () => {
    expect(allowlist("ALLOWED_MODELS")).toContain(STORY_RENDER.model);
  });

  it("והמאמץ גם", () => {
    expect(allowlist("ALLOWED_QUALITIES")).toContain(STORY_RENDER.quality);
  });

  it("שתי הרשימות באמת נקראו — לא ריקות, ולא ביטוי שהתאים לכלום", () => {
    expect(allowlist("ALLOWED_MODELS").length).toBeGreaterThan(1);
    expect(allowlist("ALLOWED_QUALITIES").length).toBeGreaterThan(1);
  });

  it("ברירת המחדל של הקופסה נשארה הזולה — המסלול הזה חורג ממנה, לא מחליף אותה", () => {
    expect(/^MODEL = "gpt-image-1-mini"$/m.test(imagegenPy)).toBe(true);
    expect(/^QUALITY = "low"$/m.test(imagegenPy)).toBe(true);
  });
});
