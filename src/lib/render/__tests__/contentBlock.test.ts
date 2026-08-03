import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isContentBlock } from "../service";
import { he } from "@/i18n/he";

// RM-0077 (3.8.26): ארבע הרצות של "עיטורי מיקי מאוס" חזרו מ-OpenAI כ-400
// `rejected by the safety system`, והלקוח קיבל בכל אחת מהן "ה-AI החזיר פלט
// שאינו עיצוב תקין. נסו שוב" — הזמנה לחזור על דחייה דטרמיניסטית. ההודעה גם לא
// תיארה את מה שקרה: המודל לא החזיר פלט פגום, הוא סירב.

/** הגוף שהקופסה מעבירה כמות שהוא, מקוצר — כפי שנרשם ב-generation_runs. */
const REAL_MESSAGE =
  'Image generation failed. gpt-image-2: 400 {\n  "error": {\n    "message": "Your request was ' +
  'rejected by the safety system. If you believe this is an error, contact us at help.openai.com';

describe("isContentBlock", () => {
  it("מזהה את הדחייה של RM-0077", () => {
    expect(isContentBlock(REAL_MESSAGE)).toBe(true);
  });

  it("מזהה את שאר הניסוחים של אותה משפחה", () => {
    expect(isContentBlock("moderation_blocked")).toBe(true);
    expect(isContentBlock("This request violates our content policy.")).toBe(true);
    expect(isContentBlock("blocked by the content filter")).toBe(true);
  });

  it("אינו בולע כשל רגיל של מודל התמונה", () => {
    // אלה כשלים מקריים, ושם ניסיון חוזר הוא הפעולה הנכונה — סיווג שגוי כאן
    // היה שולל מהלקוחה את הכפתור היחיד שהיה עוזר לה.
    expect(isContentBlock("Image generation failed. gpt-image-2: 500 upstream error")).toBe(false);
    expect(isContentBlock("timed out after 240s")).toBe(false);
    expect(isContentBlock("")).toBe(false);
  });
});

describe("הקוד מגיע עד ללקוחה", () => {
  const SRC = join(process.cwd(), "src");

  it("שירות הרנדר מפריד את הדחייה מ-llm_error", () => {
    const service = readFileSync(join(SRC, "lib/render/service.ts"), "utf8");
    expect(service).toContain('isContentBlock(message) ? "content_blocked" : "llm_error"');
  });

  it("ללקוחה יש נוסח משלו לקוד הזה", () => {
    const api = readFileSync(join(SRC, "lib/client/api.ts"), "utf8");
    expect(api).toContain('if (code === "content_blocked") return he.errContentBlocked;');
  });

  it("הנוסח אינו מזמין לנסות שוב את אותו תיאור", () => {
    // זו כל הנקודה: ההודעה הקודמת הסתיימה ב"נסו שוב", וזה מה שהלקוח עשה
    // שלוש פעמים. הנוסח החדש מבקש לנסח מחדש.
    expect(he.errContentBlocked).toContain("נסחו");
  });

  it("מסך העיבוד לא מציע ניסיון חוזר על דחייה דטרמיניסטית", () => {
    const screen = readFileSync(join(SRC, "components/create/ProcessingScreen.tsx"), "utf8");
    expect(screen).toContain('"content_blocked"');
    expect(screen).toContain("RETRY_POINTLESS.has(code ?? \"\")");
  });
});
