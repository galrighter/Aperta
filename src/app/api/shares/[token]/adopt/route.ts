import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody, ApiError } from "@/lib/api";
import { requireAccountId } from "@/lib/account";
import { isShareToken } from "@/lib/shareToken";
import { getShareByToken, type ShareRow } from "@/lib/db/shares";
import { supabaseAdmin } from "@/lib/db/supabase";
import { ingestCutouts } from "@/lib/vectorizer";
import { svgFrame } from "@/lib/geometry/frame";
import { scaleLetterBridges } from "@/lib/geometry/restoreBridges";
import type { BridgePlan } from "@/lib/geometry/frameCutouts";
import { he } from "@/i18n/he";

/**
 * "להזמין כזה" — עותק של עיצוב ששותף, במידה של מי שמזמין.
 *
 * **למה זה לא `duplicate`.** שכפול מעתיק את המידות של המקור, וזה בדיוק מה
 * שאסור כאן: תכשיט נחתך לפי פרק היד של מי שעונד אותו, והלינק מסתובב בין
 * אנשים. מה שמועתק הוא **הדוגמה**; המסגרת היא של המזמין.
 *
 * **והמתיחה עוברת ב-`ingestCutouts`, לא בקוד משלה.** הפיתוי היה לקרוא ל-
 * `rescaleCutoutsSvg` ישירות — זה שלוש שורות ונראה כמו בדיוק מה שצריך. הוא
 * מדלג על כל מה ש-`frameCutoutsDims` עושה סביב אותה מתיחה: החלוקה של הפער
 * בין שני הצירים (עד 5% נבלעים ברוחב כהגדלה אחידה, כדי שהדוגמה לא תעוות),
 * `dropThinCutouts` ו-`dropDetachedMaterial`. השניים האחרונים אינם קישוט:
 * מתיחה משנה רוחבי גשרים וגדלי פתחים, כלומר היא מייצרת בדיוק את הממצאים
 * שהם מנקים. בלעדיהם חלק גדול מההזמנות היה נוחת על "לא ניתן לייצור" שהצינור
 * הרגיל יודע לתקן בשקט.
 *
 * זהו גם הכלל שנכתב במפורש ב-`frameCutouts.ts`: חוקי הייצור יושבים במקום
 * אחד. מסלול שני שמותח גאומטריה בדרכו שלו הוא היום שבו השניים מתפצלים.
 *
 * **ומה שהיה חסר כאן: תוכנית הגשרים.** המסלול קרא ל-`ingestCutouts` בלי
 * `bridgePlan`, ולכן כל חלל של אות שחזר מנותק טופל כאי בעיטור — גשר לפי
 * הקישור הקצר ביותר במקום הגשר שאנחנו חתכנו, בכיוון שנגזר מגאומטריה עיוורת.
 * בעברית הגשר נחתך מהצד, ועל `ם` גשר מלמעלה הוא אות אחרת. השיתוף נושא מאז את
 * התוכנית (0021), ו-`adoptedPlan` מעביר אותה למסגרת של המזמין.
 *
 * הוולידציה רצה על המסגרת הסופית ותוצאתה נמסרת כמו שהיא: מסך התוצאה כבר יודע
 * להציג מצב ייצור כולל כישלון, ומשם אפשר לבקש שינוי — תשובה טובה יותר מ-500.
 *
 * הבעלות נקבעת מהחשבון המחובר. השיתוף אינו נותן גישה לעיצוב המקורי — הוא נותן
 * את הדוגמה, ומה שנוצר כאן הוא עיצוב חדש של המזמין.
 */

export const maxDuration = 60;

const schema = z.object({
  lengthMm: z.number().positive().max(2000),
  widthMm: z.number().positive().max(200),
  gapMm: z.number().positive().max(200).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!isShareToken(token)) throw new ApiError("not_found", "No such share", 404);

    const body = await parseBody(req, schema);
    // כאן נוצרת רשומה שצריכה בעלים — ולכן זה הרגע שדורש זיהוי, בדיוק כמו
    // ביצירה רגילה.
    const profileId = await requireAccountId(req);

    const share = await getShareByToken(token);
    if (!share) throw new ApiError("not_found", "No such share", 404);

    const lengthMm = round1(body.lengthMm);
    const widthMm = round1(body.widthMm);
    const gapMm = body.gapMm ?? Number(share.gap_mm);

    // העיצוב נוצר קודם, כי `ingestCutouts` מותח אל המידות שכתובות בשורה שלו.
    const { data: created, error } = await supabaseAdmin()
      .from("designs")
      .insert({
        profile_id: profileId,
        name: `${share.product_type === "ring" ? he.ring : he.bracelet} · ${Math.round(lengthMm + gapMm)}${he.design.mm}`,
        product_type: share.product_type,
        length_mm: lengthMm,
        width_mm: widthMm,
        gap_mm: gapMm,
        thickness_mm: Number(share.thickness_mm),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { version, report, geometry, widthMm: framedWidth } = await ingestCutouts({
      design: created,
      cutoutsSvg: share.svg,
      userPrompt: null,
      renderPngPath: null,
      bridgePlan: adoptedPlan(share, lengthMm, widthMm),
    });

    // מאיזה שיתוף זה בא. נשמר בדוח (jsonb) ולא בעמודה, מאותה סיבה שנתיב
    // ההדמיה נשמר שם: זה מטא-דאטה של מקור, והוא מה שיאפשר לענות בבק־אופיס על
    // "מאיפה הגיעה ההזמנה הזו". נכתב אחרי `ingestCutouts` כדי לא לשכפל את
    // בניית הדוח שלו — הוא מקור האמת למה שנכנס לשדה.
    await supabaseAdmin()
      .from("design_versions")
      .update({
        validation_report: {
          ...(version.validation_report as Record<string, unknown>),
          fromShareToken: share.token,
        },
      })
      .eq("id", version.id);

    // שורת העיצוב נשארת כפי שנכתבה: `ingestCutouts` אינו נוגע ב-`designs`,
    // והרוחב שהוא עשוי לתקן בתוך הסובלנות חי ב-viewBox של הגרסה — שם המסך
    // קורא אותו ממילא (`frameWidthMm`). לכן אין כאן קריאה חוזרת למסד.
    return NextResponse.json(
      { design: { ...created, current_version_id: version.id }, version, report, geometry, lengthMm, widthMm: framedWidth },
      { status: 201 },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * תוכנית גשרי הכיתוב של השיתוף, במסגרת של המזמין.
 *
 * השיתוף שמר אותה בקואורדינטות ה-SVG שלו (0021), והמזמין מקבל מסגרת אחרת —
 * האורך תמיד שלו, והרוחב לרוב. `ingestCutouts` מצפה לתוכנית **בקואורדינטות
 * שהוזמנו** (`frameCutouts` משלים משם את ההפרש שהסובלנות בולעת), ולכן ההעברה
 * כאן היא בדיוק בין שתי המסגרות האלה.
 *
 * `scaleLetterBridges` ולא הכפלה מקומית: הכלל שעובי הגשר אינו נמתח הוא חוק
 * ייצור, ואת הדילול השקט שהוא מונע ראינו כבר על עיצוב שאומץ באורך קצר יותר.
 *
 * בלי תוכנית — שיתוף מלפני 0021, או עיצוב בלי כיתוב — מוחזרת תוכנית ריקה, וזו
 * בדיוק ההתנהגות שהייתה כאן עד כה.
 */
function adoptedPlan(share: ShareRow, lengthMm: number, widthMm: number): BridgePlan {
  const planned = share.letter_bridges;
  if (!planned?.length) return {};
  // המסגרת ששותפה נקראת מה-SVG עצמו ולא מעמודות השורה, מאותה סיבה שכל השאר
  // קורא אותה משם: ה-viewBox הוא המסגרת שהגאומטריה באמת יושבת בה.
  const from = svgFrame(share.svg);
  if (!from) return {};
  return {
    letterBridges: scaleLetterBridges(planned, lengthMm / from.lengthMm, widthMm / from.widthMm),
  };
}
