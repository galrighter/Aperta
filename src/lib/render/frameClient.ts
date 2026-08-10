import { getCloudflareContext } from "@opennextjs/cloudflare";
import { framePreview, type BridgePlan, type FramedPreview } from "@/lib/geometry/frameCutouts";
import { frameFullLocal, type FramedFull } from "@/lib/render/frameRequest";
import type { DesignDims } from "@/lib/geometry/validate";

// מסגור מועמדים — מחוץ ל-isolate של האתר.
//
// למה בכלל: תקרת הזיכרון של Cloudflare היא 128MB **לכל isolate**, משותפת לכל
// הבקשות שרצות בו. נמדד ב-28.7: forme-studio הגיע ל-P999 של 135.4MB — מעל
// התקרה — בעוד ששכן באותו חשבון יושב על 65MB. מסגור הוא המקצה הגדול ביותר
// בבקשת יצירה, ולכן הוא זה שיוצא.
//
// **סדר הניסיונות, והנימוק לכל שלב:**
//
// 1. **הקופסה** (`VECTORIZER_URL/api/frame`) — Node שמריץ את אותו
//    `src/lib/geometry/frameCutouts.ts`, ליד ה-vectorizer. שם יש זיכרון אמיתי
//    ואין תקרת 128MB בכלל. זה המסלול הנכון, וזה לא מוסיף תלות: הקופסה כבר
//    תלות קשיחה של יצירה — בלעדיה אין רנדר ואין ווקטור מלכתחילה.
// 2. **forme-frame** (binding בשם FRAME) — Worker נפרד. isolate אחר, אבל אותה
//    תקרת 128MB. פחות טוב מהקופסה, עדיין טוב מלרוץ כאן.
// 3. **מקומי** — dev, טסטים, ומקרה שבו שני הראשונים נפלו. זה בדיוק המצב שממנו
//    ברחנו, ולכן כל נפילה למטה נרשמת ל-console: מסלול ישן שקט נראה בדיוק כמו
//    תיקון שעובד.
//
// שתי החלטות שקל לפספס:
//
// - **סדרתי, לא במקביל.** ארבע קריאות במקביל על forme-frame היו נוחתות באותו
//   isolate ומשחזרות שם בדיוק את הבעיה. סדרתי = מועמד אחד חי בכל רגע.
// - **`normalized` לא חוצה את הגבול.** גרף הפוליגונים נשאר ומת בצד השני; חוזר
//   רק מה שהמסך צריך. זה כל העניין.

/** מסגור מועמד בודד הוא עשיריות שנייה (56–544ms נמדד). שלושים שניות הן תקרה
 *  שמבדילה בין "אטי" לבין "לא יענה", כדי שקופסה תקועה לא תתלה יצירה. */
const FRAME_TIMEOUT_MS = 30_000;

/** מה שצריך מ-service binding. הטיפוס המלא חי ב-@cloudflare/workers-types,
 *  שמביא איתו גלובלים שמתנגשים בטיפוסי ה-DOM של Next — זה מספיק ומדויק. */
interface FrameBinding {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

function frameService(): FrameBinding | null {
  try {
    return (getCloudflareContext().env as unknown as { FRAME?: FrameBinding }).FRAME ?? null;
  } catch {
    // אין הקשר Cloudflare — טסטים, `next dev`, בנייה.
    return null;
  }
}

async function frameOne(
  svc: FrameBinding,
  dims: DesignDims,
  cutoutsSvg: string,
  plan: BridgePlan,
  full = false,
): Promise<FramedPreview> {
  // ה-host לא נקרא: service binding מנתב לפי ה-binding, לא לפי ה-URL.
  const resp = await svc.fetch("https://frame.internal/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dims, cutoutsSvg, plan, ...(full ? { full } : {}) }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`frame worker ${resp.status}: ${detail.slice(0, 200)}`);
  }
  return (await resp.json()) as FramedPreview;
}

/** קריאה לשירות הגיאומטריה על הקופסה. אותו token כמו שאר הקופסה. */
async function frameOnBox(
  url: string,
  dims: DesignDims,
  cutoutsSvg: string,
  plan: BridgePlan,
  full = false,
): Promise<FramedPreview> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.VECTORIZER_TOKEN) headers.authorization = `Bearer ${process.env.VECTORIZER_TOKEN}`;
  const resp = await fetch(`${url}/api/frame`, {
    method: "POST",
    headers,
    body: JSON.stringify({ dims, cutoutsSvg, plan, ...(full ? { full } : {}) }),
    signal: AbortSignal.timeout(FRAME_TIMEOUT_MS),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`geometry service ${resp.status}: ${detail.slice(0, 200)}`);
  }
  return (await resp.json()) as FramedPreview;
}

/**
 * מסגור **מלא** של הזוכה — ולידציה, קנוניזציה ואיחוד חיתוכים — מחוץ ל-isolate.
 *
 * זה החצי השני של ההוצאה שהתחילה ב-28.7: המועמדים כבר מוסגרו בחוץ, אבל הזוכה
 * מוסגר שוב בפנים (`ingestCutouts`) עם הגרף המלא — וב-10.8 בדיוק השלב הזה הרג
 * isolate באמצע `saving`, בלי שנכתבה שגיאה. אותו סולם כמו התצוגה: קופסה →
 * Worker נפרד → מקומית, והמקומית היא בדיוק מה שרץ עד היום.
 */
export async function frameFull(
  dims: DesignDims,
  cutoutsSvg: string,
  plan: BridgePlan = {},
): Promise<FramedFull> {
  // שירות מגרסה שלפני `full` מתעלם מהדגל ומחזיר תצוגה בלי `normalized` —
  // ושמירה ממנה הייתה גרסה בלי SVG קנוני ובלי גאומטריה. חלון הפריסה בין
  // האתר לקופסה אמיתי, ולכן תשובה בלי השדה נחשבת כשל של המסלול, לא תשובה.
  const assertFull = (out: FramedFull): FramedFull => {
    if (!("normalized" in out)) throw new Error("service predates full framing");
    return out;
  };

  const box = process.env.VECTORIZER_URL || null;
  if (box) {
    try {
      const out = assertFull((await frameOnBox(box, dims, cutoutsSvg, plan, true)) as FramedFull);
      console.log("framed winner via box");
      return out;
    } catch (e) {
      console.error("geometry service failed (full), trying the frame worker:", (e as Error).message);
    }
  }
  const svc = frameService();
  if (svc) {
    try {
      const out = assertFull((await frameOne(svc, dims, cutoutsSvg, plan, true)) as FramedFull);
      console.log("framed winner via worker");
      return out;
    } catch (e) {
      console.error("frame worker failed (full), framing locally:", (e as Error).message);
    }
  }
  return frameFullLocal(dims, cutoutsSvg, plan);
}

/**
 * ממסגר את כל המועמדים. מחזיר בדיוק את מה שהמסגור המקומי היה מחזיר, פחות
 * `normalized` — הזוכה עובר בהמשך ב-ingestCutouts שגוזר את הגאומטריה ממילא.
 */
export async function frameCandidates(
  dims: DesignDims,
  svgs: string[],
  /** הגשרים שנחתכו בכיתוב. חייב להיות זהה למה ש-ingestCutouts יקבל: אחרת
   *  ההצעה שהלקוחה רואה מגושרת אחרת מהגרסה שנשמרת ממנה. */
  plan: BridgePlan = {},
): Promise<FramedPreview[]> {
  const box = process.env.VECTORIZER_URL || null;
  const svc = frameService();
  const out: FramedPreview[] = [];
  const via: string[] = [];
  /** הכשל הראשון של המסלול המקומי — נזרק רק אם אף מועמד לא שרד. */
  let firstErr: unknown = null;

  for (const svg of svgs) {
    if (box) {
      try {
        out.push(await frameOnBox(box, dims, svg, plan));
        via.push("box");
        continue;
      } catch (e) {
        console.error("geometry service failed, trying the frame worker:", (e as Error).message);
      }
    }
    if (svc) {
      try {
        out.push(await frameOne(svc, dims, svg, plan));
        via.push("worker");
        continue;
      } catch (e) {
        console.error("frame worker failed, framing locally:", (e as Error).message);
      }
    }
    // המסלול האחרון — ועד עכשיו היחיד שלא נתפס: מועמד אחד שהגאומטריה שלו
    // מפילה את המסגור הפיל את **כל** היצירה ב-internal, כולל שלושת המועמדים
    // שהיו נחתכים מצוין. מועמד כזה נזרק; היצירה נכשלת רק כשאיש לא שרד.
    try {
      out.push(framePreview(dims, svg, plan));
      via.push("local");
    } catch (e) {
      console.error("local framing failed, dropping candidate:", (e as Error).message);
      firstErr ??= e;
    }
  }

  if (!out.length && firstErr) throw firstErr;

  // שורה אחת ליצירה, לא למועמד. בלעדיה יש רק אזהרות בכישלון — ושתיקה נראית
  // בדיוק כמו "הכול רץ על הקופסה", גם כשהכול רץ מקומית. זו השאלה שרוצים לענות
  // עליה מהלוג בלי לנחש.
  if (via.length) console.log(`framed ${via.length} candidate(s) via ${[...new Set(via)].join("+")}`);
  return out;
}
