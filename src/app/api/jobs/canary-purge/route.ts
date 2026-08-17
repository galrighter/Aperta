import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { requireBearerAdmin } from "@/lib/admin";
import { purgeHealthyCanaryRuns } from "@/lib/runs/canary";

// הדק הניקוי של הקנרית (`lib/runs/canary.ts`) — מוחק מיומן היצירות את ההרצות
// הסינתטיות שהסתיימו בטוב, ומשאיר את מה שנכשל.
//
// **למה מסלול נפרד מ-/api/jobs/sweep.** הסריקה שם רצה כל עשר דקות כי לקוחה
// ממתינה לה; זה ניקוי שרץ פעם ביום. חיבור השניים היה מריץ 144 סבבי ניקוי ביום
// בשביל שורה אחת, ובעיקר היה מערבב בתשובה אחת שני דברים שנקראים ביומן המתזמן
// בנפרד: "מי ממתין" מול "מה כבר לא צריך להיות כאן".
//
// השער הוא `Authorization: Bearer <ADMIN_TOKEN>` ולא עוגיית האדמין — הקורא הוא
// מתזמן (`worker-entry.js`) ולא דפדפן. בלי הסוד: מושבת, לא פתוח.

export async function POST(req: Request) {
  try {
    requireBearerAdmin(req);
    return NextResponse.json(await purgeHealthyCanaryRuns());
  } catch (err) {
    return handleRouteError(err);
  }
}
