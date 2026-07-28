import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { getRun } from "@/lib/db/runs";

// הפירוט המלא של הרצה אחת — ה-SVG הסופי וה-SVG של כל 13 המועמדים.
// נטען רק כשפותחים הרצה ביומן, כדי שהרשימה תישאר קלה.

export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = await getRun(id);
    // ליומן יש עכשיו גם שורות של ניסיון שנקטע — לאלה אין הרצה, ולכן אין פירוט.
    // ריק הוא התשובה הנכונה: הפתיחה תציג "אין נתונים" במקום "טעינת הפירוט נכשלה".
    if (!row) return NextResponse.json({ id, svg: null, debug: null });
    // הפירוט הוא המקום שבו ה-SVG של כל מועמד באמת נחוץ, ולכן הוא נקרא מ-
    // debug_full. שורות שנכתבו לפני הפיצול מוחזרות ל-debug (ההגירה מעבירה
    // אותן, אבל הנפילה לאחור עולה שורה אחת ומכסה גם שורה שנכתבה בחלון).
    return NextResponse.json({ id: row.id, svg: row.svg, debug: row.debug_full ?? row.debug });
  } catch (err) {
    return handleRouteError(err);
  }
}
