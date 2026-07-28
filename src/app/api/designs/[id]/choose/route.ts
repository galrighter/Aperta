import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody } from "@/lib/api";
import { requireDesignAccess } from "@/lib/designAccess";
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
});

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const design = await requireDesignAccess(req, id);
    const body = await parseBody(req, schema);

    const { version, report, geometry, lengthMm, widthMm } = await ingestCutouts({
      design,
      cutoutsSvg: body.svg,
      userPrompt: null,
      renderPngPath: null,
    });
    return NextResponse.json({ version, report, geometry, lengthMm, widthMm });
  } catch (err) {
    return handleRouteError(err);
  }
}
