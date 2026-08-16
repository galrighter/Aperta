import { supabaseAdmin } from "./supabase";
import type { ProductType } from "@/lib/fabrication.config";
import type { LlmUsage } from "@/lib/llm/core";
import type { RunCursor } from "@/lib/runs/cursor";

// יומן הרצות הצינור (image→SVG). כל הרצה נשמרת — כולל דחיות ושגיאות — כדי
// שנוכל לאבחן תלונות ולכייל יחד. ראה migration 0003_generation_runs.sql.

export type RunSource = "studio" | "debug" | "upload";
export type RunStatus = "approved" | "rejected" | "error";

export interface RunStagePaths {
  /** תמונת הייחוס שנמסרה למודל בפועל — הכיתוב שנחתך מהפונט, או העיצוב שנערך.
   *  היא מרוסטרת בקופסה, ולכן זה המקום היחיד שבו הבייטים האלה קיימים. */
  reference?: string;
  conditioned?: string;
  overlay?: string;
  difference?: string;
  rendered?: string;
}

export interface RunMetrics {
  iou?: number;
  holes?: number;
  meanDeviationMm?: number;
  maxDeviationMm?: number;
}

/**
 * מה שמודל התמונה חייב על הרצה אחת, מסוכם על פני כל הקריאות שלה.
 *
 * **למה זה נשמר ולא מחושב.** המודל והמאמץ נבחרים לכל הרצה בנפרד
 * (`STORY_RENDER`, `LETTERING_MODEL`), והם הידית היקרה ביותר בצינור — פי
 * ארבעים בין הקצוות. עד עכשיו המחיר של הבחירה הזו היה מספר שנקרא ידנית מדף
 * התמחור, פעם אחת, ב-31/07: הקופסה מחקה את `usage` של תשובת מודל התמונה מיד
 * כשמשכה ממנה את הבייטים. כלומר כל שינוי במודל או במאמץ שינה את החשבון בלי
 * שאיש יכול היה לראות בכמה.
 *
 * המחיר עצמו **אינו** נשמר כאן, וזו החלטה: טבלת מחירים בקוד היא בדיוק מה
 * שמתיישן בשקט. הטוקנים הם מה שנמדד; ההכפלה נעשית מול דף התמחור של אותו יום.
 *
 * `calls` הוא מספר התשובות שדיווחו `usage` — לא מספר ההדמיות. תשובה בלי
 * `usage` שולמה גם היא, וממוצע שמחלק בקריאות-שנשלחו הוא מספר מומצא.
 *
 * חסר = הרצה שקדמה לשדה, או קופסה שקדמה לו.
 */
export interface RenderUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** הפיצול של הקלט. הוא כל ההבדל בין המודלים: gpt-image-2 מקודד את הרפרנס
   *  בפי 4.75 טוקנים מ-gpt-image-1-mini, וזה כל הפער במחיר ביניהם. */
  textTokens: number;
  imageTokens: number;
}

/**
 * המאפיינים שקבעו את ההרצה — מה שצריך כדי לשחזר אותה או להסביר את התוצאה.
 * נשמר כ-jsonb ולא כעמודות: זו תצוגה לבק־אופיס, לא מפתח לשאילתה, והשדות
 * משתנים עם הצינור.
 */
/** מועמד אחד אחרי המסגור: מה הוולידציה אמרה עליו, ומה הפיל אותו. */
export interface RunPanelVerdict {
  /** `pass` / `warn` / `fail` — הסטטוס של הדוח, לא של הקופסה. */
  status: string;
  /** קודי הבדיקות שנפלו (`V4`), ריק כשעבר. הקוד ולא ההודעה: הוא מה שמאפשר
   *  לספור על פני הרצות "כמה נפלו על צוואר" בלי לקרוא טקסט. */
  failed?: string[];
  /**
   * ומה הן אמרו — `details` של אותן בדיקות בדיוק, חתוך.
   *
   * הקוד לבדו סופר, והוא לא מסביר. ב-AP-0170 (14.8) המודל צייר שלושה עיצובים
   * תקינים למראה, הלקוחה ראתה שניים, והשורה אמרה `["V2"]` — כלומר "החומר
   * התפצל" בלי לומר היכן ולכמה. `details` של V2 נושא את מרכזי האיים ואת
   * מספרם, וזה בדיוק ההפרש בין תלונה שאפשר לאבחן לבין ניחוש.
   */
  failedDetails?: string[];
  /** פי כמה המסגור מתח אותו. במסלול Story הוא אמור להיות 1. */
  stretch?: number;
}

/** תמצית מדוח ולידציה לשורת היומן — הקודים שנפלו, ומה הם אמרו. */
export function verdictOf(
  report: { status: string; checks: Array<{ check: string; status: string; details?: string }> },
  stretch: number,
): RunPanelVerdict {
  const failed = report.checks.filter((c) => c.status === "fail");
  return {
    status: report.status,
    failed: failed.map((c) => c.check),
    // שורת יומן היא דיווח ולא עותק: `details` של V2 מונה מרכז לכל אי, ופס
    // שהתפורר לעשרים היה גורר פסקה. 400 תווים מספיקים לספר מה קרה ואיפה.
    ...(failed.length
      ? { failedDetails: failed.map((c) => (c.details ?? "").slice(0, 400)).filter(Boolean) }
      : {}),
    stretch: Math.round(stretch * 1000) / 1000,
  };
}

export interface RunInputs {
  productType?: ProductType;
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
  /** כמה פסים בהדמיה אחת, באיזו רשת, וכמה קריאות למודל — התכנון של planRender.
   *  מספר החלופות הוא rows × cols. `cols` חסר בהרצות שנשמרו לפני שהיו עמודות. */
  rows?: number;
  cols?: number;
  calls?: number;
  /** צורת הקנבס שנשלחה למודל, `"1536x1024"`. שתי הרצות של אותו פריט על קנבסים
   *  שונים זהות בכל שדה אחר, ובלי זה אי אפשר להעמיד אותן זו מול זו ביומן. */
  canvasSize?: string;
  /** המאמץ שנשלח למודל התמונה (`"low"` / `"high"`). חסר = ברירת המחדל של
   *  הקופסה, שהיא `"low"` — כלומר כל הרצה שקדמה לשדה הזה. */
  renderQuality?: string;
  /** מה שמודל התמונה חייב בהרצה הזו. ראה `RenderUsage`. */
  renderUsage?: RenderUsage;
  /**
   * story mode — שלב הטקסט שקדם למודל התמונה (lib/story/designStage.ts).
   *
   * `ok: false` = השלב רץ ונכשל, וההרצה נפלה חזרה לפרומפט של שלב אחד. חסר
   * לגמרי = לא היה שלב כזה בכלל (כל מסלול אחר, ועריכה במסלול Story). בלי
   * ההבחנה הזו שתי ההרצות נראות זהות ביומן, וזו בדיוק ההשוואה שהניסוי קיים
   * בשבילה.
   */
  designStage?: {
    ok: boolean;
    model?: string;
    effort?: string;
    ms?: number;
    /**
     * מה שנשלח למודל **הטקסט** — ההודעה המערכתית והפרומפט המלא, אחרי שהסיפור
     * והאורך נכנסו לתבנית.
     *
     * `render_prompt` הוא הפרומפט של מודל התמונה בלבד, ובהרצת Story דו-שלבית
     * הוא כבר תוצר של השלב הזה: הוא נושא את המפרט ולא את הסיפור. כלומר עד
     * כאן הקלט של החוליה הראשונה בשרשרת לא היה נראה בשום מקום — רק הפלט שלה
     * (`spec`) — ולא היה אפשר לומר על מפרט חלש אם הפרומפט ביקש את הדבר הלא
     * נכון או שהמודל ענה רע. חתוך, כמו `spec`: שורת יומן היא דיווח.
     */
    prompt?: string;
    system?: string;
    /** ה-JSON שנמסר למודל התמונה, חתוך. */
    spec?: string;
    /** כמה ניסיונות נדרשו (עד `DESIGN_ATTEMPTS`). 2 עם `ok: true` = הספק
     *  מגמגם וזה עדיין עבד — דפוס שנראה ביומן רק אם הוא נספר. */
    attempts?: number;
    /** נוסח הכשל האחרון, כש-`ok: false`. אותו טקסט שנשלח לתורן ולטלגרם. */
    failure?: string;
    /**
     * מה שלב הטקסט חייב. יחד עם `renderUsage` זה הופך את עלות הרצת Story
     * למספר שלם ולא לחיבור של מדידה והערכה.
     *
     * `reasoningTokens` הוא החלק שאי אפשר לראות: המודל חושב בטוקנים שמחויבים
     * כפלט ואינם מופיעים ב-JSON שחזר, ולכן אומדן שנגזר מאורך התשובה מפספס
     * דווקא את החלק היקר. חסר = הספק לא דיווח, או הרצה שקדמה לשדה.
     */
    usage?: LlmUsage;
  };
  /**
   * היחס: מה שהוזמן, מה שהתכנון הבטיח, מה שהמודל צייר, ופי כמה נמתח.
   *
   * מודל התמונה ממלא את התא שנותנים לו, והמסגור מותח את מה שחזר עד לאורך
   * שהוזמן — בשקט. ב-AP-0096 הוזמן 29:1, התא הבטיח 8.6:1, המודל צייר 6.95:1,
   * והמתיחה של ×4.2 מעכה קו א.ק.ג עד שנפסל. שום שדה לא אמר את זה.
   *
   * `plannedRatio` נשמר ולא נגזר בקריאה: הוא הבטחה של המתכנן ברגע התכנון,
   * ושינוי בקבועים שלו לא אמור לשכתב את מה שכבר רץ. ראה `render/ratioGap`.
   */
  orderedRatio?: number;
  plannedRatio?: number;
  drawnRatio?: number;
  stretch?: number;
  /**
   * story mode — היחסים שמודל הטקסט **ביקש**, לפי סדר העיצובים במפרט.
   *
   * הצד החסר של המדידה: `drawnRatio` נשמר מזמן, אבל עד שביקשנו יחס לא היה
   * מולו כלום. ההצמדה למה שיצא היא לפי **סדר גודל** ולא לפי שורה — המועמדים
   * עוברים `pickClosestRatio` ו-`orderByVariety`, ומיקום השורה אינו שורד
   * אותם. ריק = השלב נפל, או החזיר מפרט בלי יחסים.
   */
  askedRatios?: number[];
  /** story mode — מה שהתצורה שנבחרה מבטיחה לפי הכיול הדו-שלבי
   *  (`storyNaturalRatio`). הציפייה, מול `drawnRatio` שהוא התוצאה. */
  storyNaturalRatio?: number;
  /**
   * כמה חלופות התכנון ביקש (`rows × cols`), וכמה פסים הקופסה באמת החזירה.
   *
   * הם לא תמיד שווים, וזה לא היה נראה בשום מקום. `split_columns` חותך פס
   * לעמודות **רק** כשהוא מוצא בדיוק `cols` קבוצות; אם המודל צייר שתי שורות
   * במקום רשת 2×2, כל פס נשאר שלם ומחצית מהחלופות שהוזמנו — ושולם עליהן
   * באותה קריאה — פשוט לא נוצרות. נמדד ב-AP-0068: תוכנן 4, חזרו 2.
   */
  plannedCandidates?: number;
  deliveredPanels?: number;
  /**
   * מתוך הפסים שחזרו — כמה הקופסה אישרה.
   *
   * זה החוליה שהייתה חסרה בין "המודל צייר שלושה" לבין "הלקוחה ראתה אחד".
   * `deliveredPanels` סופר את מה שנחתך, אבל רק פס עם `status === "approved"`
   * מגיע למסגור, ורק מי שגם שרד את הוולידציה מוצע — כך שהצטמצמות מ-3 ל-1
   * יכולה לקרות בשני מקומות שונים לגמרי, ובלי המספר הזה אי אפשר לדעת באיזה.
   * נמדד על עיצוב 165 (14.8), ששם הייתה זו בדיוק השאלה.
   */
  approvedPanels?: number;
  /**
   * מה עלה בגורל כל מועמד **אחרי** המסגור: הוולידציה שלו, והבדיקות שהפילו
   * אותו. נכתב בעדכון שני (`noteRunVerdicts`), כי בזמן כתיבת השורה המסגור
   * עדיין לא רץ.
   *
   * זה מה שהופך "3 פסים, הרצה approved, הצעה אחת על המסך" מחידה לשורה
   * קריאה. ראה `noteRunVerdicts` ואת עיצוב 165.
   */
  panelVerdicts?: RunPanelVerdict[];
  /**
   * כמה מהפסים הוצעו ללקוחה. מ-11.8 הייצור נגזר מהיחס ומתקציב הפיקסלים
   * והתצוגה נחתכת ב-`MAX_CANDIDATES`, ולכן השניים כבר לא זהים: פס צר יכול
   * להיחתך לעשרים־וחמישה ולהציע שישה. בלי המספר הזה אי אפשר לראות ביומן כמה
   * מהעבודה שנעשתה בכלל הגיעה למסך.
   */
  offeredPanels?: number;
  /**
   * ההרצה הושלמה בלי הבקשה שפתחה אותה — נאספה מהקופסה מתוך ההקשר שנשמר בשורה
   * (`lib/runs/complete.ts`).
   *
   * ביומן שתי ההרצות נראות זהות בכל שדה אחר, וההבדל ביניהן הוא בדיוק מה
   * שרוצים למדוד: כמה יצירות ניצלו בזכות המנגנון הזה, במקום להיתקע.
   */
  completedDetached?: boolean;
  minHoleMm?: number;
  colorKey?: string;
  /** כמה קבצים המשתמש צירף (השראה/סימון). */
  imageCount?: number;
  /**
   * הקובץ צורף ולא נשלח למודל, וזו הסיבה: `lettering` = הכיתוב תפס את מקום
   * תמונת הייחוס, `edit` = העיצוב הקיים תפס אותו. בלי השדה הזה שורה עם
   * `imageCount: 1` ובלי תמונת קלט נראית כמו כשל בהעלאה.
   */
  imageDropped?: "lettering" | "edit";
  /** עריכה: העיצוב הקיים נמסר למודל התמונה כרפרנס, וההרצה לא יצאה מאפס. */
  editedFromCurrent?: boolean;
  /**
   * מספר הגרסה שנמסרה למודל כתמונת בסיס. `editedFromCurrent` לבדו אומר
   * "יצאה ממשהו קיים" ולא ממה — והלקוחה יכולה לחזור לגרסה ישנה ולערוך אותה,
   * כך שהבסיס אינו בהכרח הגרסה האחרונה. בלי המספר אי אפשר להעמיד ביומן את
   * הפרומפט מול מה שהוא ראה.
   */
  editedFromVersion?: number;
  /** מסלול הבק־אופיס: התמונה היא הקלט עצמו ולא הדמיה שנוצרה. */
  imageUpload?: boolean;
  /**
   * story mode — ההרצה הגיעה מהמסלול הפשוט (`/story`).
   *
   * זהו הניסוי, ותפקידו להימדד: בלי השדה הזה הרצת Story נראית ביומן זהה לכל
   * הרצה אחרת, ואי אפשר להעמיד את שני המסלולים זה מול זה — לא באחוז ההצלחה,
   * לא במתיחה ולא ברוחב שיצא. ריק = המסלול הרגיל, וזה מה שכתוב בכל שורה
   * שנרשמה עד היום.
   */
  mode?: "story";
  /** הפרומפט נכתב ידנית בבק־אופיס במקום להיבנות מהמידות. */
  promptOverride?: boolean;
  /**
   * הניסיון הכמה זה, מתוך אותה בקשה של הלקוחה. 1 = הראשון (וזו רוב מוחלטת של
   * השורות); 2 = הרנדר חזר ואף מועמד לא עבר, והצינור ניסה שוב מעצמו.
   *
   * בלי השדה הזה שני הניסיונות נראים ביומן כמו שתי יצירות נפרדות של אותה
   * לקוחה בהפרש דקה — וזו בדיוק השאלה שרוצים לענות עליה כשמסתכלים על העלות:
   * כמה מההרצות שילמו פעמיים. ראה `MAX_RENDER_ATTEMPTS` בנתיב היצירה.
   */
  attempt?: number;
  /**
   * הכיתוב שנחתך מהפונט ונמסר למודל כתמונת ייחוס, והטיפוגרפיה של כל שורה.
   * בלי זה אי אפשר להסביר ביומן למה חלופה אחת נראית אחרת מהשנייה — הפרומפט
   * זהה לכולן, וההבדל יושב בתמונה.
   */
  lettering?: {
    text?: string;
    rows: Array<{
      fontId: string;
      letterHeightMm: number;
      textWidthMm: number;
      /**
       * הגשרים שנחתכו בשורה הזו — **התכנון**, לא התיקון.
       *
       * `validation_report.bridges` של הגרסה מתעד רק את מה שנוסף *אחרי*
       * שהמודל צייר. הגשרים שנחתכו מהפונט לפני כן — אלה שהמודל מעתיק, ולכן
       * אלה שנראים ברוב העיצובים — לא נרשמו בשום מקום. תלונה על גשר שבולע
       * אות לא הייתה ניתנת לאבחון: לא היה מספר להעמיד מולה.
       */
      bridges?: Array<{
        /** האות שהחלל שייך לה. */
        char: string | null;
        /** רוחב הגשר שנחתך. */
        widthMm: number;
        /** המידה של החלל לאורך הציר שהגשר צר בו — היחס ביניהם הוא הפגיעה. */
        counterMm: number;
        /** אופקי (עברית) או אנכי (לטינית). */
        sideways: boolean;
      }>;
    }>;
  } | null;
}

/** הבעלים של ההרצה — נגזר מהעיצוב, לקיבוץ היומן לפי משתמש. */
export interface RunOwner {
  id: string;
  name: string;
  color: string;
  email: string | null;
}

export interface GenerationRunRow {
  id: string;
  created_at: string;
  source: RunSource;
  design_id: string | null;
  product_type: ProductType | null;
  prompt: string | null;
  color_key: string | null;
  status: RunStatus;
  error: string | null;
  duration_ms: number | null;
  render_model: string | null;
  render_path: string | null;
  stage_paths: RunStagePaths;
  svg: string | null;
  metrics: RunMetrics | null;
  /** קל: מה שהרשימה מציגה. ה-SVG של כל מועמד יושב ב-debug_full. */
  debug: unknown;
  /** ה-debug המלא כולל ה-SVG של כל מועמד — נקרא רק בפתיחת הרצה. */
  debug_full: unknown;
  /** הפרומפט המלא שנשלח למודל התמונה, כמו שהוא. נקרא רק בפתיחת הרצה. */
  render_prompt: string | null;
  inputs: RunInputs | null;
  /** קובץ ההשראה שהמשתמש צירף, ב-storage. */
  input_image_path: string | null;
}

export type NewRun = {
  id: string;
  source: RunSource;
  design_id?: string | null;
  product_type?: ProductType | null;
  prompt?: string | null;
  color_key?: string | null;
  status: RunStatus;
  error?: string | null;
  duration_ms?: number | null;
  render_model?: string | null;
  render_path?: string | null;
  stage_paths?: RunStagePaths;
  svg?: string | null;
  metrics?: RunMetrics | null;
  debug?: unknown;
  debug_full?: unknown;
  render_prompt?: string | null;
  inputs?: RunInputs | null;
  input_image_path?: string | null;
};

/** העמודות של 0009. מופרדות כדי שאפשר יהיה לכתוב שורה גם בלעדיהן. */
const INPUT_COLUMNS = ["render_prompt", "inputs", "input_image_path"] as const;

export async function insertRun(run: NewRun): Promise<void> {
  const sb = supabaseAdmin();
  const row = {
    id: run.id,
    source: run.source,
    design_id: run.design_id ?? null,
    product_type: run.product_type ?? null,
    prompt: run.prompt ?? null,
    color_key: run.color_key ?? null,
    status: run.status,
    error: run.error ?? null,
    duration_ms: run.duration_ms ?? null,
    render_model: run.render_model ?? null,
    render_path: run.render_path ?? null,
    stage_paths: run.stage_paths ?? {},
    svg: run.svg ?? null,
    metrics: run.metrics ?? null,
    debug: run.debug ?? null,
    debug_full: run.debug_full ?? null,
    render_prompt: run.render_prompt ?? null,
    inputs: run.inputs ?? null,
    input_image_path: run.input_image_path ?? null,
  };

  // upsert ולא insert: מזהה ההרצה נגזר מ-`jobId` של הלקוחה (render/attemptId.ts),
  // כדי שבקשה שמתחדשת אחרי ניתוק תחזור לאותה הרצה. לכן היא גם כותבת לאותה שורה
  // — insert היה נכשל שם על מפתח כפול ומשאיר את הניסיון המוצלח בלי יומן.
  const { error } = await sb.from("generation_runs").upsert(row);
  if (!error) return;

  // אותו חלון שבין migrate.yml ל-deploy.yml שהפיל את קריאת היומן יכול להפיל
  // כאן *כתיבה* — וזה גרוע יותר: הרצה שקרתה לא תיראה ביומן לעולם. עמודות 0009
  // הן תוספת אבחון; אם הן עוד לא קיימות, עדיף שורה בלעדיהן מאשר בלי שורה.
  if (!INPUT_COLUMNS.some((c) => error.message.includes(c))) {
    throw new Error(`insert run failed: ${error.message}`);
  }
  for (const c of INPUT_COLUMNS) delete (row as Record<string, unknown>)[c];
  const retry = await sb.from("generation_runs").upsert(row);
  if (retry.error) throw new Error(`insert run failed: ${retry.error.message}`);
}

/**
 * מסמן על שורת הרצה כשל שקרה **אחרי** שהיא נרשמה.
 *
 * השורה נכתבת באמצע הצינור, עם הסטטוס של הווקטורייזר — ומה שנכשל אחריה
 * (מסגור, ולידציה, שמירת הגרסה) לא עדכן אותה מעולם: היומן הציג הרצה שנראית
 * תקינה בזמן שהמשתמש קיבל 500. הכשל האמיתי נשמר רק על שורת ה-job, שאינה
 * מוצגת כשיש הרצה — כלומר בדיוק המקרה הזה היה בלתי נראה (אוגוסט 2026: לקוח
 * עם `internal · 500` פעמיים ברצף, והיומן ענה "אין שגיאה").
 *
 * `error` נכתב רק על שורה שאין לה אחד — סיפור קיים לא נדרס. best-effort,
 * כמו כל כתיבת יומן: הכשל המקורי הוא מה שחשוב להחזיר, לא כתיבת הדיווח עליו.
 *
 * **הסטטוס בכתיבה נפרדת, ורק מ-`approved`.** שתי העדכונים אינם אותו תנאי:
 * ההודעה נכתבת רק על שורה שקטה, אבל `approved` שנגמר בכשל אינו approved גם אם
 * כבר יש לו הודעה — וזו בדיוק השורה שהטעתה ביומן ובספירות. `rejected` נשאר
 * `rejected`: שם הדחייה היא הסיפור, והחלפתה ב"שגיאה" מוחקת אותו.
 */
/**
 * כשל כפי שהוא נכתב לשורת ההרצה: `code · message` כשיש קוד, ואחרת ההודעה.
 *
 * אותה צורה בדיוק שבה הכשל נרשם על שורת ה-job, כדי ששני המקורות שהיומן מציג
 * זה לצד זה יהיו ברי-השוואה — ושהקוד (`internal`, `vectorize_failed`) לא
 * יאבד בדרך: הוא מה שמבדיל בין תקלה אצלנו לדחייה של הצינור.
 *
 * הקוד נקרא כתכונה ולא דרך `instanceof ApiError`: זה שומר את שכבת המסד בלי
 * תלות בשכבת ה-API, וממילא כל כשל שנושא `code` מתאר את עצמו כך.
 */
export function describeFailure(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && code ? `${code} · ${err.message}` : err.message;
}

/**
 * מוסיף לשורת ההרצה מה שידוע רק **אחרי** שהיא נכתבה: מה עלה בגורל כל מועמד
 * במסגור ובוולידציה.
 *
 * **למה זה נדרש, ולמה זו הייתה נקודה עיוורת.** השורה נכתבת מיד כשהקופסה עונה,
 * לפני המסגור — במכוון, כדי שקריסה במסגור עדיין תשאיר יומן. אבל הוולידציה
 * רצה אחריה, ומה שהיא פוסלת **נעלם**: `offeredRows` שנשמר על הגרסה מכיל רק
 * מועמדים שעברו, ומועמד שנפל אינו נשמר בשום מקום.
 *
 * נמדד על עיצוב 165 (14.8): הקופסה חתכה שלושה פסים ואישרה, כל שלושת המועמדים
 * נפלו ב-V4 (צוואר מתחת ל-0.75 מ"מ), הרשימה התרוקנה, והמסך הציג את הגרסה
 * השמורה לבדה. ביומן זה נראה כמו הרצה `approved` עם שלושה פסים — ולא היה שום
 * שדה שאומר שאף אחד מהם לא הוצע, ובוודאי לא **למה**.
 *
 * קריאה-ואז-כתיבה של `inputs` בלבד, ולא `persistRun` שני: הקריאה השנייה הייתה
 * כותבת מחדש את `debug_full` על כל ה-SVG שבתוכו. best-effort, כמו כל כתיבת
 * יומן — הרצה שהצליחה לא נופלת על רישום.
 */
export async function noteRunVerdicts(id: string, verdicts: RunPanelVerdict[]): Promise<void> {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("generation_runs").select("inputs").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    const inputs = ((data?.inputs ?? {}) as RunInputs) ?? {};
    const patched = await sb
      .from("generation_runs")
      .update({ inputs: { ...inputs, panelVerdicts: verdicts } })
      .eq("id", id);
    if (patched.error) throw new Error(patched.error.message);
  } catch (e) {
    console.error(`note run ${id} verdicts failed:`, (e as Error).message);
  }
}

export async function markRunError(id: string, message: string): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("generation_runs")
    .update({ error: message })
    .eq("id", id)
    .is("error", null);
  if (error) console.error(`mark run ${id} error failed:`, error.message);

  const status = await sb
    .from("generation_runs")
    .update({ status: "error" })
    .eq("id", id)
    .eq("status", "approved");
  if (status.error) console.error(`mark run ${id} status failed:`, status.error.message);
}

/** שורה ברשימת היומן: הכול חוץ מה-SVG, שנטען רק בפתיחת הרצה. */
export type RunListRow = Omit<GenerationRunRow, "svg" | "debug_full"> & { has_svg: boolean };

/** העמודות שהרשימה באמת מציגה. `svg` בכוונה בחוץ — הוא נשאל דרך has_svg
 *  (עמודה מחושבת, migration 0004): 80 שורות עם ה-SVG המלא היו 451KB ו-13.7
 *  שניות כדי לרנדר סימן וי. `select("*")` היה מחזיר אותו בכל פעם. */
const BASE_COLUMNS =
  "id, created_at, source, design_id, product_type, prompt, color_key, status, error, " +
  "duration_ms, render_model, render_path, stage_paths, metrics, debug";

/** `render_prompt` בכוונה בחוץ: הוא ארוך (כ-3KB להרצה) ואיש לא קורא אותו
 *  ברשימה. הוא נטען עם הפירוט, בפתיחת חלון הפרומפט. */
const LIST_COLUMNS = `${BASE_COLUMNS}, inputs, input_image_path, has_svg`;

/**
 * מאילו מהמזהים האלה קיימת שורת הרצה.
 *
 * צריך להישאל מול הטבלה ולא מול העמוד שנטען: תחת סינון ("נכשלו") העמוד מכיל
 * רק חלק מההרצות, וכל השאר נראות משם כאילו אינן קיימות. זה מה שגרם ליומן
 * להציג "כתיבת ההרצה נכשלה" על יצירות שהצליחו ונרשמו כשורה — ראה runs/orphans.
 */
export async function existingRunIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("generation_runs").select("id").in("id", unique);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
}

/** "נכשלו" ביומן = כל מה שאינו `approved`: גם דחייה של הצינור וגם שגיאה. */
export type RunStatusFilter = "approved" | "problem";

export interface ListRunsOptions {
  limit?: number;
  /**
   * העמוד הבא: רק הרצות שקודמות לסמן. סמן ולא `offset` — היומן מקבל שורות
   * חדשות בראשו כל הזמן, ו-offset היה מדלג על שורה או מכפיל אותה בכל פעם
   * שהרצה נוספת נכתבה בין עמוד לעמוד.
   *
   * הסמן הוא `(created_at, id)` ולא חותמת לבדה: ראה `runs/cursor`.
   */
  cursor?: RunCursor | null;
  /** סינון בשרת, כדי ש"נכשלו" יסרוק את כל ההיסטוריה ולא רק את העמוד הראשון. */
  status?: RunStatusFilter | null;
}

export async function listRuns(opts: ListRunsOptions = {}): Promise<RunListRow[]> {
  const { limit = 20, cursor = null, status = null } = opts;
  const sb = supabaseAdmin();

  /**
   * חלון העמוד. `tie` הוא הזנב של גוש החותמת שהסמן יושב בתוכו — אותה חותמת
   * בדיוק, מזהה קטן יותר. בלעדיו `lt` על החותמת מדלג על כל הגוש, וכל הרצה בו
   * שלא נכנסה לעמוד הקודם נעלמת מהיומן; כשהגוש יושב על גבול העמוד זה מה שהופך
   * לחיצה על "עוד" לעמוד ריק. שאילתה ולא שליפה רחבה עם קילוף בזיכרון: כל שורה
   * כאן נושאת את ה-debug שלה, וזו בדיוק העלות שהעימוד בא להוריד.
   */
  const query = (columns: string, tie: boolean) => {
    let q = sb.from("generation_runs").select(columns);
    if (tie) q = q.eq("created_at", cursor!.createdAt).lt("id", cursor!.id!);
    else if (cursor) q = q.lt("created_at", cursor.createdAt);
    if (status === "approved") q = q.eq("status", "approved");
    if (status === "problem") q = q.neq("status", "approved");
    // `id` כשובר שוויון, כדי שהסדר יהיה אותו סדר שהסמן מדבר בו.
    return q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  };

  /** זנב הגוש קודם — הוא שווה בחותמת ולכן קודם לכל מה שישן ממנה. */
  const page = async (columns: string) => {
    const parts = await Promise.all(
      cursor?.id ? [query(columns, true), query(columns, false)] : [query(columns, false)],
    );
    const failed = parts.find((p) => p.error);
    if (failed?.error) return { error: failed.error, rows: [] };
    return { error: null, rows: parts.flatMap((p) => (p.data ?? []) as unknown[]).slice(0, limit) };
  };

  const { rows, error } = await page(LIST_COLUMNS);
  if (!error) return rows as RunListRow[];

  // migrate.yml ו-deploy.yml נדלקים מאותו push ורצים במקביל, כך שיש חלון שבו
  // ה-Worker כבר מבקש עמודה וה-DB עוד לא מכיר אותה. במקום להפיל את היומן על
  // תלות בסדר, נופלים חזרה למסלול הישן — איטי, אבל עובד — עד שההגירה נוחתת.
  if (!/has_svg|inputs|input_image_path/.test(error.message)) throw new Error(error.message);
  const legacy = await page(`${BASE_COLUMNS}, svg`);
  if (legacy.error) throw new Error(legacy.error.message);
  return (legacy.rows as Array<
    Omit<RunListRow, "has_svg" | "inputs" | "input_image_path"> & { svg: string | null }
  >).map(({ svg, ...rest }) => ({
    ...rest,
    has_svg: svg !== null,
    inputs: null,
    input_image_path: null,
  }));
}

/**
 * ספירה בלבד — `head: true` מחזיר את המספר בלי אף שורה.
 *
 * זה מה שמאפשר להציג "כמה נכשלו" גם כשהרשימה עצמה מעומדת: לספור דרך הרשימה
 * היה אומר לשלוף את כל ההרצות עם הפרומפטים והמדדים שלהן רק כדי למנות כמה מהן
 * אדומות — בדיוק הקריאה שהעימוד בא להפסיק.
 */
export async function countRuns(): Promise<{ total: number; failed: number }> {
  const sb = supabaseAdmin();
  const head = () => sb.from("generation_runs").select("id", { count: "exact", head: true });
  const [total, failed] = await Promise.all([head(), head().neq("status", "approved")]);
  if (total.error) throw new Error(total.error.message);
  if (failed.error) throw new Error(failed.error.message);
  return { total: total.count ?? 0, failed: failed.count ?? 0 };
}

/**
 * כמה הרצות נכשלו על תקציב שנגמר בטווח זמן נתון.
 *
 * זה מה שמונע הצפת מיילים: התקציב לא מתמלא מעצמו, ולכן כל לקוחה שמנסה ליצור
 * בינתיים תייצר כשל זהה. אם כבר יש כשל כזה בשעה שקדמה להרצה הנוכחית — ההתראה
 * כבר נשלחה, ואין מה לחזור עליה.
 *
 * החיפוש הוא על טקסט השגיאה כמו שנשמר ביומן: הוא נושא את גוף ה-429 של OpenAI
 * (`insufficient_quota` / `billing_hard_limit_reached`). עמודת קוד ייעודית
 * הייתה נקייה יותר, אבל היא מיגרציה שלמה בשביל שאילתה אחת שרצה רק בכשל.
 */
export async function countQuotaFailuresSince(sinceIso: string, beforeIso: string): Promise<number> {
  const sb = supabaseAdmin();
  const { count, error } = await sb
    .from("generation_runs")
    .select("id", { count: "exact", head: true })
    .eq("status", "error")
    .gte("created_at", sinceIso)
    .lt("created_at", beforeIso)
    .or("error.ilike.%quota%,error.ilike.%billing_hard_limit%");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * כמה הרצות נגמרו בשגיאה מאז נקודת זמן — הדופק שהתראת הכשלים נשענת עליו.
 *
 * `status = 'error'` בלבד: דחייה (`rejected`) היא תוצאה לגיטימית של הצינור,
 * וספירה שלה הייתה מזעיקה על ערבים שבהם המודל פשוט מצייר פחות טוב.
 */
export async function countErrorRunsSince(sinceIso: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("generation_runs")
    .select("id", { count: "exact", head: true })
    .eq("status", "error")
    .gte("created_at", sinceIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** הגרסה שהרצה שמרה, כפי שהיומן צריך אותה כדי למשוך ממנה קובץ ייצור. */
export interface RunVersion {
  id: string;
  versionNo: number | null;
  validationStatus: string | null;
}

/**
 * הגרסה שכל הרצה בעמוד שמרה, בשאילתה אחת.
 *
 * זה מה שמאפשר לכפתור ה-SVG שבשורה למשוך את **קובץ הייצור** בלי לפתוח קודם את
 * הפירוט: בלי זה מזהה הגרסה מגיע רק מ-/api/debug/log/<id>, כלומר הקובץ שמעניין
 * בפועל היה חבוי מאחורי פתיחת שורה.
 *
 * הגרסה **הראשונה** של כל הרצה, כמו ב-`bridgesForRun`: זו שההרצה עצמה שמרה,
 * להבדיל מעריכות שבאו אחריה. שאילתה נפרדת ולא embed, ו-best-effort — כשל כאן
 * משאיר יומן בלי כפתור הורדה, ולא יומן בלי שורות.
 *
 * הרצות מלפני מיגרציה 0012 לא נושאות `generation_id` ולכן אין להן התאמה כאן.
 */
export async function versionsForRuns(runIds: string[]): Promise<Map<string, RunVersion>> {
  const ids = [...new Set(runIds)];
  const out = new Map<string, RunVersion>();
  if (ids.length === 0) return out;
  try {
    const { data, error } = await supabaseAdmin()
      .from("design_versions")
      .select("id, generation_id, version_no, validation_status")
      .in("generation_id", ids)
      .order("version_no", { ascending: true });
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{
      id: string;
      generation_id: string | null;
      version_no: number | null;
      validation_status: string | null;
    }>) {
      // הראשונה זוכה: המיון עולה, ולכן שורה מאוחרת יותר של אותה הרצה היא
      // גרסה מאוחרת יותר ולא זו שההרצה שמרה.
      if (!row.generation_id || out.has(row.generation_id)) continue;
      out.set(row.generation_id, {
        id: row.id,
        versionNo: row.version_no,
        validationStatus: row.validation_status,
      });
    }
  } catch (e) {
    console.error("run version lookup failed:", (e as Error).message);
  }
  return out;
}

/**
 * הבעלים **והמספר הסידורי** של כל עיצוב שביומן, בשאילתה אחת. הבעלים הוא מה
 * שמאפשר לקבץ את היומן לפי משתמש במקום לפי זמן.
 *
 * שאילתה נפרדת ולא embed: היומן חייב להיטען גם כשהעיצוב נמחק, גם כשמיגרציה
 * 0008 עוד לא רצה, וגם כשהעיצוב שייך לבודק בלי חשבון.
 *
 * ה-serial הוא הרפרנס האנושי (`AP-0047`) — אותו מספר שמופיע בלשונית העיצובים,
 * בהזמנה ובמייל ללקוחה. ביומן הוא נדרש בדיוק מאותה סיבה: תלונה מגיעה עם מספר,
 * ובלעדיו הדרך היחידה לקשור אותה להרצה היא uuid שאיש לא מקריא בטלפון.
 * best-effort — כשל כאן מחזיר מפות ריקות ומשאיר יומן בלי שיוך.
 */
export async function designsForRuns(
  designIds: string[],
): Promise<{ owners: Map<string, RunOwner>; serials: Map<string, number> }> {
  const ids = [...new Set(designIds)];
  const owners = new Map<string, RunOwner>();
  const serials = new Map<string, number>();
  if (ids.length === 0) return { owners, serials };
  try {
    const { data, error } = await supabaseAdmin()
      .from("designs")
      .select("id, serial, profiles(id, name, color, email)")
      .in("id", ids);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as Array<{
      id: string;
      serial: number | null;
      profiles: RunOwner | null;
    }>) {
      if (row.profiles) owners.set(row.id, row.profiles);
      if (typeof row.serial === "number") serials.set(row.id, row.serial);
    }
  } catch (e) {
    console.error("run design lookup failed:", (e as Error).message);
  }
  return { owners, serials };
}

/** שורה בודדת מהיומן — לפירוט מלא (כולל ה-SVG של כל מועמד). */
export async function getRun(id: string): Promise<GenerationRunRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("generation_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GenerationRunRow | null) ?? null;
}
