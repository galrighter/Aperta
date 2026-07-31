import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody } from "@/lib/api";
import { textToPolygons } from "@/lib/text/stencil";
import { FONT_IDS, DEFAULT_FONT } from "@/lib/text/fonts";
import { ringToPathD } from "@/lib/geometry/paths";
import { resolveFab } from "@/lib/fabrication.config";

// המרת טקסט לנתיבי אותיות מגושרים — סעיף 6.4. משמש לדיבוג; בצינור היצירה
// ההמרה קורית אוטומטית בשלב הנרמול (convertTextRequests).

const schema = z.object({
  content: z.string().min(1).max(60),
  x: z.number(),
  y: z.number(),
  height: z.number().positive(),
  align: z.enum(["start", "middle", "end"]).default("middle"),
  productType: z.enum(["bracelet", "ring"]).default("bracelet"),
  thicknessMm: z.number().positive().default(1.5),
  font: z.enum(FONT_IDS).default(DEFAULT_FONT),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema);
    const fab = resolveFab(body.thicknessMm, body.productType);
    const polygons = await textToPolygons(
      body.content, body.x, body.y, body.height, body.align, fab.minBridgeCut,
      { fontId: body.font },
    );
    const paths = polygons.map((poly) => poly.map((r) => ringToPathD(r)).join(""));
    return NextResponse.json({ paths, polygons });
  } catch (err) {
    return handleRouteError(err);
  }
}
