import { framePreview, type BridgePlan } from "@/lib/geometry/frameCutouts";
import type { DesignDims } from "@/lib/geometry/validate";

// הלוגיקה של /api/frame, בלי HTTP סביבה.
//
// למה זה קובץ נפרד מ-server.ts: server.ts פותח פורט ברגע שמייבאים אותו, ולכן
// טסט לא יכול לגעת בו. בלי זה השירות היחיד שרץ בייצור הוא היחיד שאף אחד לא
// בודק — וזה בדיוק מה שקרה: `plan` נוסף לחתימה, ה-Worker עודכן, השירות כאן
// לא, וחודשיים של גשרי אותיות היו נעלמים בשקט בכל מסגור שרץ על הקופסה.
//
// המקבילה ל-`workers/frame/index.ts`. שני הקצוות האלה חייבים להישאר זהים
// בהתנהגות; מה שמבדיל ביניהם הוא רק איפה הם רצים.

export interface FrameRequest {
  dims: DesignDims;
  cutoutsSvg: string;
  /** הגשרים שנחתכו בכיתוב, כדי שאי שחזר מנותק ייגשר ולא יימחק. אופציונלי:
   *  הרצה בלי כיתוב לא שולחת אותו, וכל אי מטופל כאי בעיטור. */
  plan?: BridgePlan;
}

export interface FrameResponse {
  status: number;
  body: unknown;
}

/** ממסגר מועמד אחד. לא זורק: כישלון חוזר כסטטוס, והקורא נופל למסלול הבא. */
export function handleFrame(body: FrameRequest | null | undefined): FrameResponse {
  if (!body?.cutoutsSvg || typeof body.cutoutsSvg !== "string") {
    return { status: 400, body: { error: "cutoutsSvg is required" } };
  }
  if (!body?.dims || typeof body.dims.lengthMm !== "number") {
    return { status: 400, body: { error: "dims is required" } };
  }

  try {
    // גרף הפוליגונים נשאר בתהליך הזה ומת עם הבקשה. חוזר רק מה שהמסך צריך.
    return { status: 200, body: framePreview(body.dims, body.cutoutsSvg, body.plan ?? {}) };
  } catch (e) {
    // מסגור שנכשל הוא לא קריסה של השירות: הקורא נופל למסלול הבא.
    return { status: 500, body: { error: `frame failed: ${(e as Error).message}` } };
  }
}
