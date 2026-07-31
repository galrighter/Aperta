import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody } from "@/lib/api";
import { requireDesignAccess } from "@/lib/designAccess";
import { getVersion } from "@/lib/db/designs";
import { ingestCutouts } from "@/lib/vectorizer";

// בחירת מועמד. /api/generate מחזיר כמה הצעות ושומר את הטובה ביותר כגרסה;
// כשהלקוחה בוחרת אחרת, זו נשמרת כגרסה חדשה — כך הבחירה נכנסת להיסטוריה של
// העיצוב כמו כל שינוי אחר, ואפשר לחזור ממנה.
//
// ה-SVG חוזר מהדפדפן ולכן אינו אמין: הוא עובר את אותו צינור מסגור וולידציה
// כמו כל cutouts אחר, ונדחה בדיוק באותם תנאים.

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  svg: z.string().min(1).max(500_000),
  /** איזו הצעה נבחרה. אופציונלי כדי שלקוח ישן לא יישבר על שדה חדש. */
  index: z.number().int().min(0).max(50).optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const design = await requireDesignAccess(req, id);
    const body = await parseBody(req, schema);

    // הבחירה היא אירוע *בתוך* ההרצה הקיימת ולא הרצה חדשה, ולכן היא יורשת את
    // `generation_id` מהגרסה המוצגת. את ההצעות עצמן היא **לא** משכפלת: הן
    // כבר שמורות על הגרסה שההרצה יצרה, והקורא מאתר אותן לפי אותו מזהה. בלי
    // זה עיצוב עם חמש בחירות היה נושא את אותן ארבע הצעות חמש פעמים.
    const current = design.current_version_id
      ? await getVersion(design.current_version_id).catch(() => null)
      : null;

    const { version, report, geometry, lengthMm, widthMm } = await ingestCutouts({
      design,
      cutoutsSvg: body.svg,
      userPrompt: null,
      renderPngPath: null,
      generationId: current?.generation_id ?? null,
      pickedIndex: body.index ?? null,
    });
    return NextResponse.json({ version, report, geometry, lengthMm, widthMm });
  } catch (err) {
    return handleRouteError(err);
  }
}
