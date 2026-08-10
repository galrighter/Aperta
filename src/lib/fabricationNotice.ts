// מה מדוח הוולידציה מגיע ללקוחה, ומה נשאר אצלנו.
//
// הדוח נכתב לסדנה. "גשר חומר צר מדי — צוואר שיישבר בחיתוך · 4 מקומות" הוא
// בדיוק מה שאנחנו צריכים כדי לדעת מה לתקן במנוע, ובדיוק מה שאין ללקוחה מה
// לעשות איתו. מה שהיא ראתה בפועל (צילום מסך, 10.8) היה ארבע שורות אדומות
// במילים מרצפת בית מלאכה — "אי של חומר", "צוואר שיישבר", "52% מהחלל" —
// ומתחתן הזמנה "לבחור חלופה אחרת", כשאין ולו חלופה אחת על המסך: כשהגרסה
// השמורה נכשלה, `offered` ב-/api/generate ריק בהגדרה, ורצועת ההצעות לא
// מוצגת. כלומר גם המידע וגם הפעולה שהוצעו היו שלנו ולא שלה.
//
// החלוקה כאן היא לפי מה שאפשר לעשות עם המידע:
//
//  · **חסום** — היא לא יכולה להזמין, ומגיע לה לדעת למה. משפט אחד בשפה שלה על
//    הסיבה הדומיננטית, ואחריו הפעולה שבאמת פתוחה. לא רשימת ממצאים: הפעולה
//    זהה לכל הממצאים, ולכן המניין השני והשלישי מוסיפים חרדה ולא החלטה.
//
//  · **מראה** — הכיתוב. אנחנו לא יודעים אם הוא "נראה תקין"; רק היא יודעת.
//    זו בקשה להסתכל, לא ממצא — ולכן נכתבת בשחור ולא באדום.
//
//  · **שקט** — כל השאר. אזהרה שאינה חוסמת היא הערה לסדנה: "לא ניתן היה לבדוק
//    את רוחב הגשרים", "שטח פתוח גבוה — עלול להקשות על ערגול". הפריט ניתן
//    להזמנה, כפתור ההזמנה פתוח, ואין לה מה להחליט. הצגה שלה = חרדה בלי פעולה,
//    על פריט תקין.
//
// מה שלא הולך לאיבוד: `fabricationRef` מדפיס שורה קומפקטית אחת עם הסטטוס
// והקודים, ולכן צילום מסך אחד מהלקוחה עדיין אומר לנו בדיוק מה נפל ובכמה
// מקומות. אותו עיקרון שבגללו `errSchemaOutdated` משאיר את הקוד הטכני מתחת
// לנוסח האנושי.
import type { CheckResult, ValidationReport } from "@/lib/geometry/types";

/** משפחת הסיבה — לא הבדיקה. שלוש בדיקות שונות שאומרות "העיצוב דק מדי" הן
 *  משפט אחד ללקוחה, כי הבקשה שתפתור אותן היא אותה בקשה. */
export type BlockCause = "detached" | "thin" | "small" | "margin" | "open" | "other";

/**
 * בדיקה → משפחה. כולל בדיקות שאינן פעילות היום (V6–V10 יושבות ב-`he.checks`
 * ואינן נדחפות מ-`validate.ts`) — מיפוי חסר נופל ל-"other", והמשמעות היא
 * משפט גנרי במקום משפט מדויק. עדיף שיהיה כאן מראש.
 */
const CAUSE_OF: Record<string, BlockCause> = {
  V1: "other",     // מבנה SVG לא תקין
  V2: "detached",  // החומר אינו רציף
  V3: "detached",  // אי חומר בתוך פתח
  V4: "thin",      // גשר צר מדי
  V5: "small",     // פתח קטן מדי לחיתוך
  V6: "small",     // חריץ צר מדי
  V7: "margin",    // חירור בשוליים
  V8: "open",      // שטח פתוח גבוה מדי
  V9: "other",     // פינה פנימית חדה
  V10: "thin",     // פרט חומר עדין מדי
};

/** שובר שוויון בין שתי משפחות באותו משקל. הסדר הוא לפי כמה הבקשה שנגזרת
 *  מהמשפחה סבירה להזיז את התוצאה — "חלקים מנותקים" לפני "עיצוב פשוט יותר". */
const TIE_BREAK: BlockCause[] = ["detached", "thin", "small", "margin", "open", "other"];

/**
 * בדיקות שהממצא שלהן הוא החלטה של הלקוחה ולא שלנו. הפריט ניתן לייצור; מה
 * שנשאר פתוח הוא אם הוא נראה כמו שהיא רצתה, וזו שאלה שרק היא יכולה לענות
 * עליה — בעין, על הפריסה.
 */
const LOOK_CHECKS = new Set(["LETTERING_BRIDGE"]);

/** יש בכלל ממצא שאינו "עבר"? (רק בשביל השורה הטכנית.) */
export function hasFindings(report: ValidationReport | null | undefined): boolean {
  return (report?.checks ?? []).some((c) => c.status !== "pass");
}

/**
 * הסיבה שבגללה אי אפשר לייצר, כמשפחה אחת — הדומיננטית לפי מספר המקומות.
 * `null` כשאין כשל.
 *
 * למה הדומיננטית ולא כולן: בצילום מהשדה ישבו V2 (מקום אחד), V3 (מקום אחד)
 * ו-V4 (ארבעה). שלושתן תיאור אחד של אותו עיצוב שיצא דק מדי, והבקשה שתפתור
 * אותן זהה. שלוש שורות במקום אחת אינן שלוש החלטות.
 */
export function blockCause(checks: CheckResult[] | null | undefined): BlockCause | null {
  const fails = (checks ?? []).filter((c) => c.status === "fail");
  if (fails.length === 0) return null;

  const weight = new Map<BlockCause, number>();
  for (const c of fails) {
    const cause = CAUSE_OF[c.check] ?? "other";
    // כשל בלי מיקומים (V1 למשל) שוקל אחד ולא אפס — אחרת הוא נבלע גם כשהוא
    // הכשל היחיד, ו-`blockCause` מחזיר משפחה שרירותית.
    weight.set(cause, (weight.get(cause) ?? 0) + Math.max(1, c.locations?.length ?? 0));
  }

  return [...weight.entries()].sort(
    (a, b) => b[1] - a[1] || TIE_BREAK.indexOf(a[0]) - TIE_BREAK.indexOf(b[0]),
  )[0][0];
}

/** האם צריך לבקש ממנה להסתכל על הכיתוב. */
export function needsLook(checks: CheckResult[] | null | undefined): boolean {
  return (checks ?? []).some((c) => c.status !== "pass" && LOOK_CHECKS.has(c.check));
}

/**
 * הבדיקות שמותר לצייר את המיקומים שלהן על הפריסה.
 *
 * הכלל: מסמנים רק את מה שסיפרנו עליו. עיגול מקווקו על פריט שאפשר להזמין הוא
 * הצבעה על פגם שלא אמרנו עליו דבר — הלקוחה רואה שמשהו לא בסדר, אין לה שם
 * לתת לו, וכפתור ההזמנה בכל זאת פתוח. לכן: כשחסום — הכשלים; אחרת — כלום.
 */
export function markedChecks(checks: CheckResult[] | null | undefined): CheckResult[] {
  return (checks ?? []).filter((c) => c.status === "fail");
}

/**
 * השורה הטכנית — הסטטוס והקודים, קומפקטית, ב-LTR.
 *
 * זה מה שמחליף את רשימת הממצאים בתור אמצעי האבחון שלנו: היא חסרת משמעות
 * ללקוחה ולכן אינה מפחידה, וצילום מסך אחד ממנה מספיק כדי לדעת מה בדיוק נפל.
 * דוגמה: `fail V2 V3 V4×4 · warn LETTERING_BRIDGE`.
 */
export function fabricationRef(report: ValidationReport | null | undefined): string {
  const checks = (report?.checks ?? []).filter((c) => c.status !== "pass");
  if (checks.length === 0) return "";

  const label = (c: CheckResult) => {
    const n = c.locations?.length ?? 0;
    return n > 1 ? `${c.check}×${n}` : c.check;
  };
  const group = (status: "fail" | "warn") => {
    const ids = checks.filter((c) => c.status === status).map(label);
    return ids.length ? `${status} ${ids.join(" ")}` : "";
  };

  return [group("fail"), group("warn")].filter(Boolean).join(" · ");
}
