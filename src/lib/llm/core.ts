// טיפוסים ושגיאות משותפים לכל ספקי ה-LLM (Anthropic / OpenAI).

export interface LlmImage {
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
}

export interface LlmRequest {
  system: string;
  userText: string;
  images?: LlmImage[];
  maxTokens?: number;
  /** מודל מסוים לקריאה הזו, במקום ברירת המחדל של הספק. הקורא בוחר אותו
   *  כשהסיבה חיה אצלו — ראה `STORY_DESIGN` ב-lib/story/designStage.ts. */
  model?: string;
  /** עומק החשיבה, למודלי reasoning. ריק = ברירת המחדל של הספק. */
  reasoningEffort?: "low" | "medium" | "high";
  /** תקרת המתנה משלה לקריאה הזו. ריק = `LLM_TIMEOUT_MS`. קיים בשביל קורא
   *  שיושב **בתוך** בקשה ארוכה יותר ואינו יכול לבלוע את כל התקציב שלה. */
  timeoutMs?: number;
}

export const LLM_TIMEOUT_MS = 120_000;

/**
 * מה שקריאת ה-LLM חייבה.
 *
 * **`reasoningTokens` הוא הסיבה שזה קיים.** מודל reasoning חושב בטוקנים
 * שמחויבים כפלט ואינם מופיעים בטקסט שחוזר, ולכן קריאה שהחזירה JSON קצר יכולה
 * לעלות פי כמה ממה שנראה. אי אפשר לגזור את זה מהתשובה — רק לקרוא את זה מהדיווח.
 *
 * מודל שאינו מדווח פירוט משאיר אותו `undefined`; הסכומים עצמם קיימים תמיד.
 */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** מתוך הפלט. חלק מהמודלים אינם מפרטים אותו. */
  reasoningTokens?: number;
  /** מתוך הקלט: מה שנענה מהמטמון וזול יותר. */
  cachedInputTokens?: number;
}

/** תשובה שנושאת גם את מה שהיא עלתה. `usage` ריק = הספק לא דיווח. */
export interface LlmAnswer {
  text: string;
  usage: LlmUsage | null;
}

/**
 * שתי מדידות לאחת — לקורא שמנסה שוב.
 *
 * ניסיון שנפל שולם עליו במלואו: מודל שחשב שתי דקות ואז פג לו הזמן, או כזה
 * שהחזיר JSON פסול, מחויב על כל מה שהספיק. חיבור המדידות הוא מה שמונע
 * מהניסיונות האלה להיעלם מהחשבון, וזה בדיוק המקרה שבו החשבון הכי גבוה.
 *
 * `null` + `null` נשאר `null`: אין מדידה אינו אפס.
 */
export function addLlmUsage(a: LlmUsage | null, b: LlmUsage | null): LlmUsage | null {
  if (!a) return b;
  if (!b) return a;
  const sum: LlmUsage = {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
  // הפירוט נשמר רק אם לפחות אחד הצדדים דיווח אותו, כדי שמודל שאינו מדווח
  // לא יקבל אפס שנראה כמו מדידה.
  if (a.reasoningTokens != null || b.reasoningTokens != null) {
    sum.reasoningTokens = (a.reasoningTokens ?? 0) + (b.reasoningTokens ?? 0);
  }
  if (a.cachedInputTokens != null || b.cachedInputTokens != null) {
    sum.cachedInputTokens = (a.cachedInputTokens ?? 0) + (b.cachedInputTokens ?? 0);
  }
  return sum;
}

/** מי ענה בפועל — לשקיפות מול הלקוח ולאבחון נסיגה בין ספקים. */
export interface LlmReply {
  text: string;
  provider: "openai" | "anthropic";
  model: string;
  fallbackReason?: string;   // קיים רק כשהספק המועדף נכשל ועברנו לגיבוי
}

export class LlmError extends Error {
  constructor(message: string, public retriable: boolean) {
    super(message);
  }
}
