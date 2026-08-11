import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, handleRouteError } from "@/lib/api";
import { requireBearerAdmin } from "@/lib/admin";
import { runComeback } from "@/lib/comeback";

// ההדק של מייל "חזרנו לאוויר" (`lib/comeback.ts`). נקרא על ידי מכונה —
// ה-workflow "Comeback mail" — אחרי שגל החליט שהתקלה תוקנה. ברירת המחדל היא
// תצוגה מקדימה: מי היה מקבל, בלי לשלוח כלום. השליחה עצמה דורשת `send: true`
// מפורש — מייל שיוצא ללקוחות אינו תופעת לוואי של בדיקה.

export const maxDuration = 300;

const schema = z.object({
  send: z.boolean().default(false),
  /** כמה אחורה לחפש תקועים. ברירת מחדל יומיים — חלון תקלה טיפוסי; עד שבועיים,
   *  כי מייל "חזרנו" על תקיעה בת חודש הוא ספאם, לא שירות. */
  sinceHours: z.number().int().min(1).max(336).default(48),
});

export async function POST(req: Request) {
  try {
    requireBearerAdmin(req);
    const body = await parseBody(req, schema);
    const sinceIso = new Date(Date.now() - body.sinceHours * 60 * 60_000).toISOString();
    const report = await runComeback({ sinceIso, send: body.send });
    return NextResponse.json(report);
  } catch (err) {
    return handleRouteError(err);
  }
}
