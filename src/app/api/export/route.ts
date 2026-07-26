import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { supabaseAdmin, STORAGE_BUCKET } from "@/lib/db/supabase";
import { getDesign, getVersion } from "@/lib/db/designs";
import { uploadFile } from "@/lib/db/storage";
import { normalizeSvg } from "@/lib/geometry/normalize";
import { difference, rectPolygon } from "@/lib/geometry/poly";
import { svgFrame } from "@/lib/geometry/frame";
import { buildDxf, buildExportSvg } from "@/lib/dxf/dxf";

// ייצוא ייצור — סעיף 10. זמין בסטטוס pass; ב-warn רק עם forced=true; fail חסום.

const schema = z.object({
  versionId: z.string().uuid(),
  forced: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema);
    const version = await getVersion(body.versionId);
    const design = await getDesign(version.design_id);

    if (version.validation_status === "fail") {
      throw new ApiError("export_blocked", "Cannot export a design with validation failures", 409);
    }
    if (version.validation_status === "warn" && !body.forced) {
      throw new ApiError("export_needs_confirmation", "Design has warnings — confirm forced export", 409);
    }

    // המסגרת של הגרסה עצמה קובעת מה נחתך. האורך שווה תמיד למה שהוזמן;
    // הרוחב עשוי להיבדל ממנו עד כדי הסטייה המותרת שנבלעה במתיחה.
    const frame = svgFrame(version.svg);
    const L = frame?.lengthMm ?? Number(design.length_mm);
    const W = frame?.widthMm ?? Number(design.width_mm);
    const normalized = normalizeSvg(version.svg, L, W);

    // גבול המתכת האמיתי (כולל קצה גלי אם חיתוך מגיע לקצה)
    const material = difference([rectPolygon(0, 0, L, W)], normalized.cutUnion);
    const dxfInput = { lengthMm: L, widthMm: W, material };
    const dxf = buildDxf(dxfInput);
    const exportSvg = buildExportSvg(dxfInput);

    const safeName = design.name.replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "") || "design";
    const asciiName = /^[\w-]+$/.test(safeName) ? safeName : "design";
    const fileBase = `${asciiName}_${design.product_type}_v${version.version_no}`;
    const dxfPath = `exports/${design.id}/${fileBase}.dxf`;
    const svgPath = `exports/${design.id}/${fileBase}.svg`;

    await uploadFile(dxfPath, dxf, "application/dxf");
    await uploadFile(svgPath, exportSvg, "image/svg+xml");

    const { error } = await supabaseAdmin().from("exports").insert({
      design_id: design.id,
      version_id: version.id,
      dxf_path: dxfPath,
      svg_path: svgPath,
      forced: body.forced,
    });
    if (error) throw new Error(error.message);

    // שם ההורדה המלא (כולל עברית) עובר בפרמטר download של ה-URL החתום
    const prettyBase = `${design.name}_${design.product_type}_v${version.version_no}`;
    const dxfUrl = await signedUrlWithName(dxfPath, `${prettyBase}.dxf`);
    const svgUrl = await signedUrlWithName(svgPath, `${prettyBase}.svg`);

    return NextResponse.json({ dxfUrl, svgUrl, dxfPath, svgPath });
  } catch (err) {
    return handleRouteError(err);
  }
}

async function signedUrlWithName(path: string, downloadName: string): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .storage.from(STORAGE_BUCKET)
    .createSignedUrl(path, 3600, { download: downloadName });
  if (error || !data) throw new Error(`Failed to sign URL: ${error?.message}`);
  return data.signedUrl;
}
