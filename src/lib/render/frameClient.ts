import { getCloudflareContext } from "@opennextjs/cloudflare";
import { framePreview, type FramedPreview } from "@/lib/geometry/frameCutouts";
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

async function frameOne(svc: FrameBinding, dims: DesignDims, cutoutsSvg: string): Promise<FramedPreview> {
  // ה-host לא נקרא: service binding מנתב לפי ה-binding, לא לפי ה-URL.
  const resp = await svc.fetch("https://frame.internal/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dims, cutoutsSvg }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`frame worker ${resp.status}: ${detail.slice(0, 200)}`);
  }
  return (await resp.json()) as FramedPreview;
}

/** קריאה לשירות הגיאומטריה על הקופסה. אותו token כמו שאר הקופסה. */
async function frameOnBox(url: string, dims: DesignDims, cutoutsSvg: string): Promise<FramedPreview> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.VECTORIZER_TOKEN) headers.authorization = `Bearer ${process.env.VECTORIZER_TOKEN}`;
  const resp = await fetch(`${url}/api/frame`, {
    method: "POST",
    headers,
    body: JSON.stringify({ dims, cutoutsSvg }),
    signal: AbortSignal.timeout(FRAME_TIMEOUT_MS),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`geometry service ${resp.status}: ${detail.slice(0, 200)}`);
  }
  return (await resp.json()) as FramedPreview;
}

/**
 * ממסגר את כל המועמדים. מחזיר בדיוק את מה שהמסגור המקומי היה מחזיר, פחות
 * `normalized` — הזוכה עובר בהמשך ב-ingestCutouts שגוזר את הגאומטריה ממילא.
 */
export async function frameCandidates(dims: DesignDims, svgs: string[]): Promise<FramedPreview[]> {
  const box = process.env.VECTORIZER_URL || null;
  const svc = frameService();
  const out: FramedPreview[] = [];
  const via: string[] = [];

  for (const svg of svgs) {
    if (box) {
      try {
        out.push(await frameOnBox(box, dims, svg));
        via.push("box");
        continue;
      } catch (e) {
        console.error("geometry service failed, trying the frame worker:", (e as Error).message);
      }
    }
    if (svc) {
      try {
        out.push(await frameOne(svc, dims, svg));
        via.push("worker");
        continue;
      } catch (e) {
        console.error("frame worker failed, framing locally:", (e as Error).message);
      }
    }
    out.push(framePreview(dims, svg));
    via.push("local");
  }

  // שורה אחת ליצירה, לא למועמד. בלעדיה יש רק אזהרות בכישלון — ושתיקה נראית
  // בדיוק כמו "הכול רץ על הקופסה", גם כשהכול רץ מקומית. זו השאלה שרוצים לענות
  // עליה מהלוג בלי לנחש.
  if (via.length) console.log(`framed ${via.length} candidate(s) via ${[...new Set(via)].join("+")}`);
  return out;
}
