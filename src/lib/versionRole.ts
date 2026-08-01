/**
 * מה תפקידה של שורת גרסה — ובעיקר: האם מותר לדרוס אותה.
 *
 * שלוש דרכים יוצרות גרסה, ורק שתיים מהן הן "שינוי" אמיתי:
 *
 * | תפקיד      | נוצר על ידי           | candidates | picked_index |
 * |------------|-----------------------|------------|--------------|
 * | `run`      | יצירה או בקשת שינוי   | יש         | יש           |
 * | `pick`     | בחירת הצעה אחרת       | אין        | יש           |
 * | `plain`    | כל השאר (וקטוריזציה,  | אין        | אין          |
 * |            | תיקון אוטומטי, ישן)   |            |              |
 *
 * `run` נושאת את ההצעות של ההרצה — היא **התוצר** של קריאה למנוע, ואסור לגעת
 * בה. `pick` היא רק סימן לאיזו הצעה מוצגת, ולכן בחירה נוספת **באותה הרצה**
 * מעדכנת אותה במקום להוסיף שורה. בלי ההבחנה הזו השוואה בין שלוש הצעות הפיקה
 * שלוש שורות ביומן, וחזרה להצעה קודמת יצרה שורה רביעית זהה לראשונה.
 *
 * ההבחנה היא לפי `candidates` ולא לפי `user_prompt`: `user_prompt` של בחירה
 * הוא null בדיוק כמו של גרסה ישנה, בעוד שרשימת ההצעות נשמרת אך ורק על השורה
 * שההרצה יצרה — היא מה שגורם לרצועת ההצעות להופיע בכלל.
 */
export type VersionRole = "run" | "pick" | "plain";

/** רק מה שדרוש להכרעה, כדי שהפונקציה תהיה ניתנת לבדיקה בלי שורת מסד שלמה. */
export interface VersionRoleInput {
  candidates?: unknown[] | null;
  generation_id?: string | null;
  picked_index?: number | null;
}

export function versionRole(v: VersionRoleInput): VersionRole {
  if (v.candidates?.length) return "run";
  return v.picked_index != null && v.generation_id ? "pick" : "plain";
}

/**
 * האם בחירה חדשה תדרוס את `v` במקום להוסיף שורה.
 *
 * שני תנאים: `v` היא שורת בחירה, **והיא של אותה הרצה**. הרצה חדשה (בקשת
 * שינוי) פותחת שרשרת משלה, ובחירה בתוכה לא תדרוס את הבחירה של ההרצה הקודמת.
 */
export function isReplaceablePick(v: VersionRoleInput, generationId: string | null): boolean {
  return !!generationId && versionRole(v) === "pick" && v.generation_id === generationId;
}
