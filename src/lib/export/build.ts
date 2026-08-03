import { supabaseAdmin, STORAGE_BUCKET } from "@/lib/db/supabase";
import type { DesignRow, VersionRow } from "@/lib/db/designs";
import { uploadFile } from "@/lib/db/storage";
import { normalizeSvg } from "@/lib/geometry/normalize";
import { difference, rectPolygon } from "@/lib/geometry/poly";
import { svgFrame } from "@/lib/geometry/frame";
import { buildDxf, buildExportSvg } from "@/lib/dxf/dxf";
import { exportFileBase } from "./fileName";

// בניית קבצי הייצור של גרסה — סעיף 10.
//
// זה **לא** ה-SVG שמוצג במסך ולא זה שביומן: אלה קבצי החיתוך שהמתכת מפני חותכת
// לפיהם — המתאר של המתכת שנשארת, במילימטרים, אחרי שהחיתוכים הוחסרו ממנה.
// ה-SVG שנשמר בגרסה מתאר את *מה שנחתך* בקנה מידה של התצוגה. לכן הפונקציה הזאת
// היא המקום היחיד שמייצר קובץ להורדה, והיא משותפת למסלול הסטודיו (/api/export)
// ולמסלול הבק־אופיס (/api/admin/designs/<id>/export): שני מסכים, קובץ אחד.

export interface ExportFiles {
  dxfUrl: string;
  svgUrl: string;
  dxfPath: string;
  svgPath: string;
}

/** מייצר את קבצי הייצור, מעלה אותם, רושם את הייצוא ומחזיר קישורי הורדה חתומים. */
export async function buildVersionExport(
  design: DesignRow,
  version: VersionRow,
  forced: boolean,
): Promise<ExportFiles> {
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

  // `0075-120-12` — הסידורי והמידות שהוזמנו, ולא המידות שנמדדו מהמסגרת: הרוחב
  // עשוי להיבדל מהן בשבריר שנבלע במתיחה, ושם קובץ שאומר 11.7 במקום 12 מתאר
  // פריט שאיש לא הזמין.
  const fileBase = exportFileBase(design.serial, Number(design.length_mm), Number(design.width_mm));
  // הגרסה נשארת בנתיב האחסון (ולא בשם ההורדה): שני ייצואים של אותו עיצוב הם
  // שני אובייקטים, ורשומות `exports` מצביעות על שניהם.
  const storedBase = `${fileBase}_v${version.version_no}`;
  const dxfPath = `exports/${design.id}/${storedBase}.dxf`;
  const svgPath = `exports/${design.id}/${storedBase}.svg`;

  await uploadFile(dxfPath, dxf, "application/dxf");
  await uploadFile(svgPath, exportSvg, "image/svg+xml");

  const { error } = await supabaseAdmin().from("exports").insert({
    design_id: design.id,
    version_id: version.id,
    dxf_path: dxfPath,
    svg_path: svgPath,
    forced,
  });
  if (error) throw new Error(error.message);

  // שם ההורדה עובר בפרמטר download של ה-URL החתום
  const dxfUrl = await signedUrlWithName(dxfPath, `${fileBase}.dxf`);
  const svgUrl = await signedUrlWithName(svgPath, `${fileBase}.svg`);

  return { dxfUrl, svgUrl, dxfPath, svgPath };
}

async function signedUrlWithName(path: string, downloadName: string): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .storage.from(STORAGE_BUCKET)
    .createSignedUrl(path, 3600, { download: downloadName });
  if (error || !data) throw new Error(`Failed to sign URL: ${error?.message}`);
  return data.signedUrl;
}
