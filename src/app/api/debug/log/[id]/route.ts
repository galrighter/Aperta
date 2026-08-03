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
      return NextResponse.json({
        id, svg: null, rawSvg: null, versionNo: null, versionId: null,
        debug: null, renderPrompt: null, inputs: null, bridges: null, offered: null,
      });
    }
    // הפירוט הוא המקום שבו ה-SVG של כל מועמד באמת נחוץ, ולכן הוא נקרא מ-
    // debug_full. שורות שנכתבו לפני הפיצול מוחזרות ל-debug (ההגירה מעבירה
    // אותן, אבל הנפילה לאחור עולה שורה אחת ומכסה גם שורה שנכתבה בחלון).
    // הגאומטריה שנשמרה לגרסה — זו שהלקוחה מקבלת. ראה `bridgesForRun`.
    const version = await bridgesForRun(row.id);

    return NextResponse.json({
      id: row.id,
      // מה שנשמר, ובהיעדרו (הרצה שלא הגיעה לגרסה) מה שהווקטורייזר החזיר.
      svg: version.svg ?? row.svg,
      versionNo: version.versionNo,
      // הגרסה שההרצה שמרה — המפתח לקבצי הייצור שלה מתוך היומן. `null` בהרצה
      // שלא הגיעה לגרסה: שם אין מה לחתוך, ולכן גם אין מה להוריד.
      versionId: version.versionId,
      /** הפלט הגולמי — לפני מתיחה, גישור ועיבוי. ההפרש בינו לבין `svg` הוא
       *  בדיוק מה שהצינור עשה אחרי שהמודל צייר. */
      rawSvg: version.svg ? row.svg : null,
      debug: row.debug_full ?? row.debug,
      // הפרומפט המלא נשלח רק כאן: ברשימה הוא 3KB לשורה שאף אחד לא קורא, וכאן
      // הוא בדיוק מה שביקשו לראות.
      renderPrompt: row.render_prompt ?? null,
      prompt: row.prompt ?? null,
      inputs: row.inputs ?? null,
      // הגשרים שנוספו אחרי המעקב — של הגרסה שההרצה שמרה, ושל כל הצעה לצידה.
      bridges: version.bridges,
      offered: version.candidates,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
