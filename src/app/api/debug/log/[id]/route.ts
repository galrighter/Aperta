import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { getRun } from "@/lib/db/runs";
import { bridgesForRun } from "@/lib/db/designs";

// הפירוט המלא של הרצה אחת — ה-SVG הסופי וה-SVG של כל 13 המועמדים.
// נטען רק כשפותחים הרצה ביומן, כדי שהרשימה תישאר קלה.

export const maxDuration = 60;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(req);
    const { id } = await ctx.params;
    const row = await getRun(id);
    // ליומן יש עכשיו גם שורות של ניסיון שנקטע — לאלה אין הרצה, ולכן אין פירוט.
    // ריק הוא התשובה הנכונה: הפתיחה תציג "אין נתונים" במקום "טעינת הפירוט נכשלה".
    if (!row) {
      return NextResponse.json({ id, svg: null, debug: null, renderPrompt: null, inputs: null, bridges: null });
    }
    // הפירוט הוא המקום שבו ה-SVG של כל מועמד באמת נחוץ, ולכן הוא נקרא מ-
    // debug_full. שורות שנכתבו לפני הפיצול מוחזרות ל-debug (ההגירה מעבירה
    // אותן, אבל הנפילה לאחור עולה שורה אחת ומכסה גם שורה שנכתבה בחלון).
    return NextResponse.json({
      id: row.id,
      svg: row.svg,
      debug: row.debug_full ?? row.debug,
      // הפרומפט המלא נשלח רק כאן: ברשימה הוא 3KB לשורה שאף אחד לא קורא, וכאן
      // הוא בדיוק מה שביקשו לראות.
      renderPrompt: row.render_prompt ?? null,
      prompt: row.prompt ?? null,
      inputs: row.inputs ?? null,
      // הגשרים שנוספו אחרי המעקב — מהגרסה שההרצה שמרה. שאילתה נפרדת וקטנה,
      // ורק בפתיחת הרצה.
      bridges: await bridgesForRun(row.id),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
