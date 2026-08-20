import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/db/supabase";
import { FAB, resolveFab } from "@/lib/fabrication.config";
import { buildRenderPrompt } from "@/lib/llm/imagegen";
import { planRender, maxRows } from "@/lib/render/panels";
import { canvasFor, canvasOf, sizeParam, type Canvas } from "@/lib/render/canvas";
// dialogue mode — רתמת המדידה של שלב A (‏A0 ב-docs/DIALOGUE_PLAN.md §7).
import { supabaseAdmin as sbAdmin } from "@/lib/db/supabase";
import { DIALOGUE_EDIT } from "@/lib/dialogue/mode";
import {
  buildRespecRenderPrompt, coerceEditSpec, runEditStage, runsRespec, stagedEditPrompt,
  type EditRegion,
} from "@/lib/dialogue/editStage";
import { closureCoverage, gradeInstruction } from "@/lib/dialogue/lab";
import { isEditRun, parseLegacyEditPrompt } from "@/lib/dialogue/corpus";
import type { RunInputs } from "@/lib/db/runs";
import { editPromptFor } from "@/components/create/model";

// מסך כיול הפרומפט — מה שהוא צריך *לפני* שהוא מריץ.
//
// ההרצה עצמה היא `/api/generate` הרגיל, עם `promptOverride`/`rowsOverride`.
// זו כל הנקודה: אין צינור שני שצריך להישאר תואם, יש הבדל אחד מכוון. מה שנשאר
// כאן הוא ההכנה בלבד — לבנות את פרומפט ברירת המחדל לאותן מידות, ולהחזיר את
// הפרופיל שעיצובי הכיול נשמרים תחתיו.

// dialogue mode — שלב הטקסט יושב כאן בתוך הבקשה (עד 100 שנ׳ על שני
// ניסיונות), ו-30 שנ׳ היו הורגות אותה באמצע. הבקשה הזו אינה בונה תמונה
// ואינה עולה כסף מעבר לשלב הטקסט עצמו.
export const maxDuration = 180;

/** הפרופיל שכל עיצובי הכיול נרשמים עליו. `tester` — ולכן `assertDesignAccess`
 *  מתיר אותו מאחורי שער האדמין (מסך הכיול ממילא admin-only), והמכסה היומית
 *  שלו נפרדת משל לקוחות. */
const LAB_PROFILE_NAME = "prompt-debug";
const LAB_PROFILE_COLOR = "#8a5de0";

async function labProfileId(): Promise<string> {
  const sb = supabaseAdmin();
  const found = await sb.from("profiles").select("id").eq("name", LAB_PROFILE_NAME).maybeSingle();
  if (found.error) throw new Error(found.error.message);
  if (found.data) return (found.data as { id: string }).id;

  const created = await sb
    .from("profiles")
    .insert({ name: LAB_PROFILE_NAME, color: LAB_PROFILE_COLOR, kind: "tester" })
    .select("id")
    .single();
  if (created.error) throw new Error(created.error.message);
  return (created.data as { id: string }).id;
}

/**
 * dialogue mode — הקורפוס: בקשות שינוי אמיתיות מהיומן.
 *
 * ‏§7 דורש "‏10 בקשות שינוי אמיתיות מתוך `generation_runs`", והן לא יושבות
 * שם כבקשות: עמודת `prompt` מחזיקה את מה ש-`buildEditPrompt` בנה בלקוחה.
 * ראה `lib/dialogue/corpus.ts` — שם הפירוק, וגם הנימוק למה הוא נחוץ.
 *
 * החלון (`scan`) רחב מהמכסה (`limit`) בכוונה: עריכות הן מיעוט מההרצות,
 * וסריקה של המכסה בלבד הייתה מחזירה שתיים מתוך עשר בקשות. הקריאה מוגבלת
 * לעמודות שהיא באמת קוראת — ‏`render_prompt` וה-SVG-ים אינם בה.
 */
export async function GET(req: Request) {
  try {
    requireAdmin(req);
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 10, 1), 40);
    const scan = Math.min(Math.max(Number(url.searchParams.get("scan")) || 400, limit), 1000);

    const { data, error } = await sbAdmin()
      .from("generation_runs")
      .select("id, created_at, design_id, product_type, prompt, status, inputs")
      .order("created_at", { ascending: false })
      .limit(scan);
    if (error) throw new Error(error.message);

    type Row = {
      id: string; created_at: string; design_id: string | null;
      product_type: "bracelet" | "ring" | null; prompt: string | null;
      status: string; inputs: RunInputs | null;
    };
    const seen = new Set<string>();
    const requests = [];
    for (const row of (data ?? []) as Row[]) {
      if (!isEditRun(row.inputs) || !row.prompt?.trim()) continue;
      // dialogue mode — `RunInputs.editStage.request` הוא הבקשה הגולמית,
      // והיא עדיפה על פירוק: היא נשמרה כמו שהיא. היא קיימת רק בהרצות של
      // המסלול החדש, ולכן הפירוק הוא מה שנשאר לכל ההיסטוריה.
      const saved = row.inputs?.editStage?.request?.trim();
      const parsed = parseLegacyEditPrompt(row.prompt);
      const request = saved || parsed.request;
      // דדופ לפי הבקשה עצמה: "לדלל קצת" שנשלחה בחמישה עיצובים היא מדידה
      // אחת, לא חמש, והיא הייתה בולעת את הקורפוס.
      const key = request.replace(/\s+/g, " ").toLowerCase();
      if (!request || seen.has(key)) continue;
      seen.add(key);
      requests.push({
        runId: row.id,
        createdAt: row.created_at,
        designId: row.design_id,
        productType: row.product_type ?? "bracelet",
        request,
        region: (row.inputs?.editStage?.region as string | undefined) ?? parsed.region,
        lengthMm: row.inputs?.lengthMm,
        status: row.status,
        /** הפרומפט המלא כמו שנשמר — כדי שיהיה אפשר לראות ממה הבקשה חולצה. */
        legacyPrompt: row.prompt,
      });
      if (requests.length >= limit) break;
    }

    return NextResponse.json({ requests, scanned: (data ?? []).length });
  } catch (err) {
    return handleRouteError(err);
  }
}

const schema = z.object({
  productType: z.enum(["bracelet", "ring"]).default("bracelet"),
  lengthMm: z.number().positive().max(400).optional(),
  widthMm: z.number().positive().max(100).optional(),
  thicknessMm: z.number().positive().max(5).optional(),
  /** הבריף של הלקוחה — הוא מוטמע בתוך הפרומפט, ולכן הוא חלק ממה שמכיילים. */
  userPrompt: z.string().max(4000).default(""),
  /** עריכה: הפרומפט מדבר על תמונה מצורפת במקום לתאר פריט חדש. */
  editing: z.boolean().default(false),
  /** שורות מפורשות. בלעדיהן — מה ש-planRender גוזר מהיחס. */
  rows: z.number().int().min(1).max(40).optional(),
  /** צורת הקנבס, במקום זו ש-`canvasFor` גוזר מהאורך. אותה עקיפה כמו
   *  ב-`/api/generate`, כדי שהפרומפט שנבנה כאן יהיה זה שיישלח שם. */
  canvas: z.enum(["1536x1024", "1024x1536"]).optional(),

  /**
   * dialogue mode — להריץ את שלב הטקסט ולהחזיר את **שני** המסלולים זה לצד זה.
   *
   * ריק = ההתנהגות הקיימת של המעבדה, מילה במילה: פרומפט אחד, בלי קריאה לשום
   * מודל. השדות שמתחת נקראים רק כשהוא דלוק.
   */
  compare: z.boolean().default(false),
  /** הבקשה בעברית, גולמית. זה מה ששני המסלולים מקבלים — האחד מתרגם אותה,
   *  השני שולח אותה כמו שהיא. */
  editRequest: z.string().max(4000).default(""),
  region: z.enum(["right", "center", "left", "all"]).optional(),
  /** המפרט המצטבר מהסבב הקודם, כדי שסבב 5 יידע מה נקבע בסבב 2 (§2.2).
   *  ‏`unknown` ולא `string` — מאז ההרחבה המפרט נושא גם יחס (מספר) ומפת
   *  `sources`; הניקוי האמיתי יושב ב-`coerceEditSpec`, לא בסכמה. */
  spec: z.record(z.string(), z.unknown()).optional(),
  /** מודל טקסט אחר, למכרז של §5.4. ריק = המכהן. */
  textModel: z.string().max(120).optional(),
  textEffort: z.enum(["low", "medium", "high"]).optional(),
});

export async function POST(req: Request) {
  try {
    requireAdmin(req);
    const body = await parseBody(req, schema);

    const product = FAB.products[body.productType];
    const dims = {
      lengthMm: body.lengthMm ?? product.defaultLengthMm,
      widthMm: body.widthMm ?? product.defaultWidthMm,
      thicknessMm: body.thicknessMm ?? FAB.defaultThicknessMm,
    };

    const minHoleMm = resolveFab(dims.thicknessMm, body.productType).minHole;
    // הקנבס נמסר במפורש כשהמעבדה מבקשת אותו: הוא קובע גם את התקרה (הפתח
    // המינימלי נפרס על גובה השורה) וגם את היחס שהמודל יימשך אליו.
    const canvas = body.canvas ? canvasOf(body.canvas) : canvasFor(dims.lengthMm);
    const plan = planRender({
      ratio: dims.lengthMm / dims.widthMm,
      widthMm: dims.widthMm,
      minHoleMm,
      canvas,
    });
    // שורות מפורשות גוברות על התכנון, **והתקרה מדווחת ולא נאכפת כאן**.
    //
    // עד 17.8 היא נאכפה, ואז הפרומפט שנבנה כאן לא היה זה שנשלח: `/api/generate`
    // מקבל `rowsOverride` כמו שהוא (ראה את ההערה שם), כלומר בקשה ל-2 שורות
    // בפריט רחב הפיקה כאן פרומפט של פריט יחיד וחתכה שם שני פסים. מסך הכיול
    // ממילא מגביל את התיבה ב-`maxRows`, כך שההגנה על הקלדה בשוגג נשארת — ומי
    // ששולח מספר גדול יותר במפורש מקבל בדיוק את מה שההרצה תעשה.
    const cap = maxRows(dims.widthMm, minHoleMm, canvas);
    const rows = body.rows ?? plan.rows;

    return NextResponse.json({
      profileId: await labProfileId(),
      profileName: LAB_PROFILE_NAME,
      dims,
      minHoleMm,
      /** מה שהתכנון היה בוחר לבדו — כדי שהמסך יראה ממה סטית. */
      plannedRows: plan.rows,
      maxRows: cap,
      rows,
      canvas: sizeParam(canvas),
      prompt: buildRenderPrompt(body.userPrompt, body.productType, dims, rows, body.editing),
      // dialogue mode — שתי הזרועות. ריק כשלא ביקשו השוואה. הקנבס נמסר כי
      // פרומפט ה-respec נוקב בצורתו, ושני מקומות לאותה החלטה נפרדים בשקט.
      compare: body.compare
        ? await compareArms(body, dims, rows, canvas)
        : undefined,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * dialogue mode — סבב אחד, בשני המסלולים.
 *
 * **שתיהן נבנות מאותה בקשה גולמית ובאותן מידות**, וזה כל מה שהופך את
 * ההשוואה למשמעותית: מה שנבדל ביניהן הוא הטיפול בבקשה, ולא הפריט, לא הקנבס
 * ולא מספר השורות.
 *
 * הזרוע הקיימת אינה משוחזרת כאן אלא נבנית מ-`editPromptFor` — אותה פונקציה
 * שהמסע קורא לה, אחרי חילוץ. עותק היה נפרד ממנה בשקט, וזו בדיוק הטעות
 * שהופכת דוח השוואה למטעה.
 *
 * **מה שלא רץ כאן: מודל התמונה.** הבקשה הזו מחזירה שני פרומפטים ואת מה ששלב
 * הטקסט אמר; מי שקונה רנדר הוא `/api/generate` הרגיל, עם `promptOverride`.
 * זו אותה הפרדה שהמעבדה בנויה עליה מלכתחילה — הכנה כאן, הרצה שם, בלי צינור
 * שני שצריך להישאר תואם.
 */
async function compareArms(
  body: { editRequest: string; region?: EditRegion; spec?: Record<string, unknown>;
    productType: "bracelet" | "ring"; editing: boolean;
    textModel?: string; textEffort?: "low" | "medium" | "high" },
  dims: { lengthMm: number; widthMm: number; thicknessMm: number },
  rows: number,
  canvas: Canvas,
) {
  const request = body.editRequest.trim();
  const region = body.region ?? null;
  const model = body.textModel || DIALOGUE_EDIT.model;
  // המפרט שהגיע מהלקוח של הרתמה, מנוקה: קלט חיצוני אינו הצהרה.
  const priorSpec = coerceEditSpec(body.spec);

  // הזרוע הקיימת: הבקשה נכנסת לפרומפט של המסע ומשם כמות שהיא למודל התמונה.
  const legacy = editPromptFor(region, request);
  const baseline = buildRenderPrompt(legacy, body.productType, dims, rows, true);

  const stage = request
    ? await runEditStage({
        productType: body.productType,
        request,
        region,
        spec: priorSpec,
        lengthMm: dims.lengthMm,
        model,
        effort: body.textEffort,
      })
    : null;

  /** ‏PROMPT_SPEC §6 — אותה הכרעה בדיוק כמו בנתיב היצירה: ‏respec כשיש מפרט
   *  והמודל לא ביקש ייחוס; אחרת עריכת הייחוס. סבב ראשון ברתמה מתחיל תמיד
   *  בלי מפרט ולכן בייחוס — וזה נכון: ‏respec על מפרט ריק אינו נמדד, הוא
   *  היה מצייר פריט חדש (וזו גם מלכודת עיצובי טרום-ההזרעה). */
  const respec = stage?.ok
    ? runsRespec({ decision: stage.decision, priorSpec, lettering: false })
    : false;
  const changeRequest = stage?.ok
    ? (respec ? stage.decision.image_instruction ?? "" : stagedEditPrompt(stage.decision))
    : legacy;
  return {
    textModel: model,
    effort: body.textEffort ?? DIALOGUE_EDIT.effort,
    baseline: { changeRequest: legacy, prompt: baseline },
    dialogue: {
      ok: Boolean(stage?.ok),
      /** השלב נפל — הזרוע הזו רצה בפרומפט של היום. **זו ההתנהגות המתוכננת**
       *  (§2.5), והדוח חייב לספור אותה ככזו ולא כשגיאה. */
      stageDown: Boolean(stage && !stage.ok),
      reason: stage && !stage.ok ? stage.reason : undefined,
      attempts: stage?.attempts,
      ms: stage?.ms,
      usage: stage?.usage ?? undefined,
      decision: stage?.ok ? stage.decision : undefined,
      spec: stage?.ok ? stage.spec : undefined,
      /** מה הסבב הזה היה עושה בצינור האמיתי — צויר מחדש מהמפרט או ייחוס. */
      respec,
      /** כיסוי הסגירה (‏PROMPT_SPEC §7): כמה דרגות חופש המפרט הכריע, ולפי
       *  איזה מקור. אוטומטי מה-JSON, כמו שהטבלה שם דורשת. */
      coverage: stage?.ok ? closureCoverage(stage.spec) : undefined,
      /** הציון האוטומטי של ציר התיאור הגרפי (§5.3, §7.1). */
      grade: stage?.ok ? gradeInstruction(stage.decision.image_instruction) : undefined,
      changeRequest,
      prompt: respec && stage?.ok
        ? buildRespecRenderPrompt({
            spec: stage.spec,
            decision: stage.decision,
            canvas,
            rows,
            thicknessMm: dims.thicknessMm,
            fallbackRatio: dims.widthMm > 0 ? dims.lengthMm / dims.widthMm : null,
          })
        : buildRenderPrompt(changeRequest, body.productType, dims, rows, true),
    },
  };
}
