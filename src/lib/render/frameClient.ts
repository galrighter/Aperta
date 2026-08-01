import { getCloudflareContext } from "@opennextjs/cloudflare";
import { framePreview, type BridgePlan, type FramedPreview } from "@/lib/geometry/frameCutouts";
import type { DesignDims } from "@/lib/geometry/validate";

// מסגור מועמדים דרך ה-Worker הנפרד (binding בשם FRAME).
//
// למה: תקרת הזיכרון של Cloudflare היא 128MB **לכל isolate** — משותפת לכל
// הבקשות שרצות בו, לא ארוחה פרטית של בקשה אחת. מסגור הוא המקצה הגדול ביותר
// בבקשת יצירה, וכשהוא רץ כאן הוא מתחרה בכל השאר. script אחר = isolate אחר =
// תקרה משלו, ולכן המסגור עובר לשם. ההרצה שנהרגה ב-28.7 הייתה בקשה יחידה
// (reqs=1) — כלומר זו לא מקביליות אלא גובה המקצה עצמו.
//
// שלוש החלטות שקל לפספס:
//
// 1. **סדרתי, לא במקביל.** ארבע קריאות במקביל היו נוחתות באותו isolate של
//    forme-frame ומחזירות בדיוק את הבעיה שהעברנו. סדרתי = מועמד אחד חי בכל רגע.
// 2. **נפילה חזרה למקומי, לא כישלון.** binding חסר (dev, preview, פריסה לא
//    מסונכרנת) או שגיאה בשירות לא מפילים יצירה. זה מחזיר את הסיכון הישן, ולכן
//    זה נרשם ל-console — נפילה שקטה למסלול הישן תיראה בדיוק כמו תיקון שעובד.
// 3. **`normalized` לא חוצה את הגבול.** גרף הפוליגונים נשאר ומת ב-Worker
//    השני; חוזר רק מה שהמסך צריך. זה כל העניין.

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
): Promise<FramedPreview> {
  // ה-host לא נקרא: service binding מנתב לפי ה-binding, לא לפי ה-URL.
  const resp = await svc.fetch("https://frame.internal/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dims, cutoutsSvg, plan }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`frame worker ${resp.status}: ${detail.slice(0, 200)}`);
  }
  return (await resp.json()) as FramedPreview;
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
  const svc = frameService();
  const out: FramedPreview[] = [];
  for (const svg of svgs) {
    if (svc) {
      try {
        out.push(await frameOne(svc, dims, svg, plan));
        continue;
      } catch (e) {
        console.error("frame worker failed, framing locally:", (e as Error).message);
      }
    }
    out.push(framePreview(dims, svg, plan));
  }
  return out;
}
