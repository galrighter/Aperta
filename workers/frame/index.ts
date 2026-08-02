import { framePreview, type BridgePlan } from "@/lib/geometry/frameCutouts";
import type { DesignDims } from "@/lib/geometry/validate";

// Worker נפרד שכל תפקידו למסגר מועמד אחד.
//
// למה בכלל Worker שני: תקרת הזיכרון של Cloudflare היא 128MB **לכל isolate, לא
// לכל בקשה** — ו-isolate אחד משרת הרבה בקשות במקביל. כלומר המסגור של ארבעה
// מועמדים לא מתחרה רק בעצמו, אלא גם בכל בקשה אחרת שרצה באותו רגע באותו
// isolate. זה מה שהרג הרצה יחידה (28.7, reqs=1) ב-exceededResources.
//
// למה לא subrequest ל-Worker של האתר עצמו: אותו script = אותו isolate. זה היה
// מוסיף round-trip ולא מוסיף ולו בייט אחד של תקציב. script אחר הוא isolate אחר,
// ולכן תקרה משלו — זו כל הסיבה שהקובץ הזה קיים.
//
// מה שהוא לא: הוא לא מחזיק סודות, לא ניגש ל-DB, ולא חשוף לאינטרנט
// (workers_dev=false, בלי routes) — הדרך היחידה להגיע אליו היא ה-service binding.
//
// והכי חשוב: הוא מייבא את מנוע הגיאומטריה, לא משכפל אותו. חוקי הייצור נשארים
// בקובץ אחד; מה שמשתנה כאן הוא איפה הם רצים, לא מה הם אומרים.

interface FrameRequest {
  dims: DesignDims;
  cutoutsSvg: string;
  /** הגשרים שנחתכו בכיתוב, כדי שאי שחזר מנותק ייגשר ולא יימחק. אופציונלי:
   *  הרצה בלי כיתוב לא שולחת אותו, וכל אי מטופל כאי בעיטור. */
  plan?: BridgePlan;
}

function bad(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== "POST") return bad("POST only", 405);

    let body: FrameRequest;
    try {
      body = (await req.json()) as FrameRequest;
    } catch (e) {
      return bad(`bad JSON: ${(e as Error).message}`);
    }
    if (!body?.cutoutsSvg || typeof body.cutoutsSvg !== "string") return bad("cutoutsSvg is required");
    if (!body?.dims || typeof body.dims.lengthMm !== "number") return bad("dims is required");

    try {
      // גרף הפוליגונים נשאר כאן ומת עם הבקשה. מה שחוזר הוא רק מה שהמסך צריך.
      return Response.json(framePreview(body.dims, body.cutoutsSvg, body.plan ?? {}));
    } catch (e) {
      // מסגור שנכשל הוא לא קריסה של השירות: הקורא נופל חזרה למסגור מקומי.
      return bad(`frame failed: ${(e as Error).message}`, 500);
    }
  },
};
