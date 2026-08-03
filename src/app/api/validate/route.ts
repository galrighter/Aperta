import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { validateDesign } from "@/lib/geometry/validate";
import { tooManyAttempts } from "@/lib/db/rateLimit";
import { clientIp } from "@/lib/ip";

// ולידציה בלבד ל-SVG נתון — שימוש פנימי/דיבוג, וגם לקליינט לחישוב גיאומטריה
// (material/cutUnion) של גרסה קיימת עבור התלת-ממד וההדגשות.

const schema = z.object({
  // תקרה כמו ב-currentSvg של היצירה: SVG קנוני של עיצוב קטן בהרבה, והמסלול
  // לא-מאומת ומריץ boolean ops כבדים — קלט בלתי מוגבל הוא וקטור DoS על ה-CPU.
  svg: z.string().min(1).max(500_000),
  productType: z.enum(["bracelet", "ring"]),
  lengthMm: z.number().positive(),
  widthMm: z.number().positive(),
  thicknessMm: z.number().positive().default(1.5),
});

export async function POST(req: Request) {
  try {
    // המסלול לא-מאומת ומריץ boolean ops כבדים. תקרת הקלט מגבילה עלות לבקשה;
    // ההגבלה לפי IP (60 לדקה) מגבילה הצפה של בקשות.
    if (await tooManyAttempts(`validate:${clientIp(req)}`, 60_000, 60)) {
      throw new ApiError("rate_limited", "Too many requests, try again later", 429);
    }
    const body = await parseBody(req, schema);
    const { report, normalized } = validateDesign(body.svg, {
      productType: body.productType,
      lengthMm: body.lengthMm,
      widthMm: body.widthMm,
      thicknessMm: body.thicknessMm,
    });
    return NextResponse.json({
      report,
      canonicalSvg: normalized?.canonicalSvg ?? null,
      geometry: normalized
        ? { material: materialOf(normalized, body), cutUnion: normalized.cutUnion }
        : null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

import { difference, rectPolygon } from "@/lib/geometry/poly";
import type { NormalizedDesign } from "@/lib/geometry/normalize";

function materialOf(n: NormalizedDesign, dims: { lengthMm: number; widthMm: number }) {
  return difference([rectPolygon(0, 0, dims.lengthMm, dims.widthMm)], n.cutUnion);
}
