import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase";
import { handleRouteError } from "@/lib/api";
import { requireDesignAccess } from "@/lib/designAccess";
import { previewOf, type DesignPreview } from "@/lib/designPreview";

type Params = { params: Promise<{ id: string }> };

/**
 * הציורים של עיצוב אחד, לכרטיס ב"העיצובים שלי".
 *
 * מסלול נפרד מ-`/api/designs/[id]` בכוונה: זה מחזיר כמה מאות בתים של path
 * לגרסה, וההוא מחזיר את **כל** הגרסאות עם ה-SVG וההצעות שלהן — מאות קילובתים
 * לעיצוב. רשימה של שבעה-עשר עיצובים דרך המסלול המלא הייתה מורידה מגה־בתים
 * לטלפון כדי לצייר שבעה-עשר ריבועים קטנים.
 *
 * **למה יותר מציור אחד.** שלוש יצירות על אותו עיצוב הן שלוש גרסאות שלו, וזה
 * המודל הנכון — פריט אחד, מספר סידורי אחד. אבל הכרטיס הראה רק את האחרונה,
 * ולכן מי שיצר שלוש פעמים ראה ברשימה עיצוב אחד ובלי שום שביל לשתי התוצאות
 * האחרות: הן היו בשרת, ואי אפשר היה להגיע אליהן. עכשיו הכרטיס מקבל את כולן.
 */
export const maxDuration = 30;

/**
 * כמה גרסאות מציירים. הגבול הוא של הכרטיס, לא של השרת: שורת ציורים ארוכה מזה
 * לא נכנסת אליו ממילא, וכל ציור נשמר גם ב-localStorage שיש לו מכסה.
 */
const MAX_RESULTS = 6;

/** ציור של גרסה אחת, עם המזהה שדרכו חוזרים אליה. */
export type VersionPreview = DesignPreview & { versionId: string; versionNo: number };

export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const design = await requireDesignAccess(req, id);
    // מה שהוזמן — נפילה לאחור בלבד. המסגרת שכל גרסה באמת יושבת בה נקראת
    // מה-viewBox שלה, בתוך `previewOf`, ושם גם ההסבר למה זה קריטי כאן.
    const dims = { lengthMm: Number(design.length_mm), widthMm: Number(design.width_mm) };

    // החדשה ראשונה — זה הסדר שבו הכרטיס מציג, וזה גם מה שנשמר כשיש יותר
    // מ-MAX_RESULTS: מה שנוצר לאחרונה הוא מה שמחפשים.
    const { data, error } = await supabaseAdmin()
      .from("design_versions")
      .select("id, svg, version_no")
      .eq("design_id", id)
      .order("version_no", { ascending: false })
      .limit(MAX_RESULTS);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ id: string; svg: string; version_no: number }>;

    const results = rows
      .map((r) => {
        const preview = previewOf(r.svg, dims);
        return preview ? { ...preview, versionId: r.id, versionNo: r.version_no } : null;
      })
      .filter((p): p is VersionPreview => p !== null);

    // הגרסה הנוכחית היא זו שהלקוחה בחרה, והיא לא בהכרח האחרונה שנוצרה. היא
    // מה שהכרטיס מצייר גדול, ולכן היא מוחזרת בנפרד — ובהיעדרה, האחרונה.
    const current = design.current_version_id
      ? (results.find((p) => p.versionId === design.current_version_id) ?? null)
      : null;

    return NextResponse.json({ preview: current ?? results[0] ?? null, results });
  } catch (err) {
    return handleRouteError(err);
  }
}
