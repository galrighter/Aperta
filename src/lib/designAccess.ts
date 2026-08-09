import { ApiError } from "./api";
import { requireAccountId } from "./account";
import { requireAdmin } from "./admin";
import { getAccount } from "./db/accounts";
import { getDesign, type DesignRow } from "./db/designs";

/**
 * מי רשאי לגעת בעיצוב קיים.
 *
 * `/api/designs` כבר מכריע בעלות ביצירה ובקריאת הרשימה, אבל המסלולים שמקבלים
 * מזהה עיצוב לא בדקו כלום: מי שהחזיק uuid יכול היה לקרוא עיצוב של חבר, לשנות
 * אותו, למחוק אותו, ולהריץ עליו יצירה — כלומר לשרוף מכסה וכסף על חשבון בעליו.
 *
 * ההכרעה כאן היא מראה של זו שביצירה, אבל מהכיוון ההפוך: שם הבעלים נקבע מהבקשה,
 * וכאן הוא כבר כתוב בשורה. לכן אין צורך שהלקוח ישלח `profileId` — ובעצם עדיף
 * שלא, כי כל פרמטר שהדפדפן שולח הוא פרמטר שאפשר לזייף.
 *
 * שני מסלולים לגיטימיים:
 * 1. **הסטודיו הפנימי** — עיצוב ששייך לפרופיל בודק. לסטודיו אין חשבון-לקוח, ולכן
 *    הוא מזדהה דרך עוגיית האדמין (aperta_admin): הסטודיו יושב מאחורי AdminGate,
 *    וקריאות ה-fetch שלו נושאות את העוגייה. בלי השער הזה כל אנונימי שהחזיק מזהה
 *    בודק יכול היה לקרוא/לשנות/למחוק/לייצר על עיצובי בודק — לשרוף כסף ולמחוק
 *    היסטוריה.
 * 2. **האתר** — העוגייה החתומה חייבת להצביע על אותו פרופיל בדיוק.
 *
 * הערה על 46 העיצובים הישנים: כולם רשומים על "בודק 1", כי המשפך ייחס כל עיצוב
 * לפרופיל הראשון לפני שהיה רישום. הם נשארים נגישים דרך מסלול (1) — עכשיו מאחורי
 * שער האדמין — זו היסטוריה של גל עצמו, לא של לקוחות.
 */
/**
 * `known` — הזהות, כשהמסלול כבר פתר אותה.
 *
 * לא אופטימיזציה. `readAccountId` מאמת את האסימון מול שרת האימות, ואימות של
 * אסימון שפג **מסובב את ה-refresh token**: השני שירוץ באותה בקשה ייקח את
 * העוגייה כפי שהגיעה, כלומר את הטוקן שכבר נשרף, וייכשל. מסלול שצריך גם את
 * מזהה החשבון לעצמו וגם בדיקת בעלות חייב אפוא לפתור פעם אחת ולמסור לכאן.
 *
 * `undefined` = "לא נפתר, תפתור בעצמך". `null` = "נפתר, ואין אף אחד".
 */
type KnownAccount = { known?: string | null };

export async function assertDesignAccess(
  req: Request,
  ownerId: string | null,
  opts: KnownAccount = {},
): Promise<void> {
  if (ownerId) {
    const owner = await getAccount(ownerId);
    if (owner?.kind === "tester") {
      requireAdmin(req);
      return;
    }
  }
  const accountId =
    opts.known === undefined
      ? await requireAccountId(req)
      : (opts.known ?? throwAccountRequired());
  if (accountId !== ownerId) {
    throw new ApiError("forbidden", "This design belongs to another account", 403);
  }
}

function throwAccountRequired(): never {
  throw new ApiError("account_required", "Sign in before designing", 401);
}

/** טוען עיצוב ומחזיר אותו רק אם הפונה רשאי לגעת בו. */
export async function requireDesignAccess(
  req: Request,
  designId: string,
  opts: KnownAccount = {},
): Promise<DesignRow> {
  const design = await getDesign(designId);
  await assertDesignAccess(req, design.profile_id, opts);
  return design;
}
