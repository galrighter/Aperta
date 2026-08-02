import { framePreview, type BridgePlan } from "@/lib/geometry/frameCutouts";
import type { DesignDims } from "@/lib/geometry/validate";

// המסגור כשירות — הבקשה, התשובה, וההחלטה מה עונים על מה.
//
// **למה זה קובץ אחד ולא אחד לכל קצה.** המסגור רץ בשלושה מקומות: על הקופסה
// (`geometry-service`), ב-Worker נפרד (`workers/frame`), ומקומית כשהשניים
// נופלים. כשהיו כאן שני עותקים, `plan` נוסף לחתימה, ה-Worker עודכן, הקופסה לא
// — והקופסה היא הראשונה בתור, כך שכל הגשרים של האותיות נזרקו בשקט בייצור.
// עותק שני של אותה החלטה הוא לא כפילות קוד, הוא הסכמה שפגה.
//
// מה שנשאר בכל קצה הוא רק התרגום לפרוטוקול שלו: node:http אצל אחד, Response
// אצל השני. ההחלטה עצמה כאן, והקורא (`frameClient`) בונה את הגוף מאותו טיפוס.

/** גוף הבקשה. אותו טיפוס שהקורא בונה ושכל קצה מפרק. */
export interface FrameRequest {
  dims: DesignDims;
  cutoutsSvg: string;
  /** הגשרים שנחתכו בכיתוב, כדי שאי שחזר מנותק ייגשר ולא יימחק. אופציונלי:
   *  הרצה בלי כיתוב לא שולחת אותו, וכל אי מטופל כאי בעיטור. */
  plan?: BridgePlan;
}

/** תשובה בלי תלות בפרוטוקול. כל קצה עוטף אותה במה שהוא יודע להחזיר. */
export interface FrameAnswer {
  status: number;
  body: unknown;
}

/** ממסגר מועמד אחד. לא זורק: כישלון חוזר כסטטוס, והקורא נופל למסלול הבא. */
export function handleFrame(body: FrameRequest | null | undefined): FrameAnswer {
  if (!body?.cutoutsSvg || typeof body.cutoutsSvg !== "string") {
    return { status: 400, body: { error: "cutoutsSvg is required" } };
  }
  if (!body?.dims || typeof body.dims.lengthMm !== "number") {
    return { status: 400, body: { error: "dims is required" } };
  }

  try {
    // גרף הפוליגונים נשאר בתהליך שממסגר ומת עם הבקשה. חוזר רק מה שהמסך צריך.
    return { status: 200, body: framePreview(body.dims, body.cutoutsSvg, body.plan ?? {}) };
  } catch (e) {
    // מסגור שנכשל הוא לא קריסה של השירות: הקורא נופל למסלול הבא.
    return { status: 500, body: { error: `frame failed: ${(e as Error).message}` } };
  }
}
