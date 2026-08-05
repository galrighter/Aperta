import { getAccount } from "@/lib/db/accounts";
import { designCode } from "@/lib/designCode";
import { sendMail, mailConfigured } from "@/lib/mail";
import { designReadyMail } from "@/lib/mailTemplates";
import { SITE } from "@/lib/site.config";
import type { DesignRow } from "@/lib/db/designs";

/**
 * מייל "העיצוב שלך מוכן" — על הגרסה הראשונה של עיצוב בלבד.
 *
 * שלושה תנאים, וכולם אותו כלל: להתריע רק כשיש למי ועל מה. עיצוב שכבר הייתה
 * לו גרסה הוא עריכה; פרופיל בודק הוא הסטודיו הפנימי; ובלי מייל אין נמען.
 *
 * **למה `isFirstVersion` הוא פרמטר ולא `design.current_version_id`:** לשני
 * הקוראים יש עדות שונה לאותה שאלה, ורק אחת מהן נכונה אצל כל אחד. ב-POST
 * `design` נקרא *לפני* ההרצה, ולכן `current_version_id` שלו הוא המצב שקדם לה.
 * במסלול ההתאוששות הגרסה **כבר** נשמרה — קריאת השדה שם תמיד תחזיר גרסה
 * ותשתיק את המייל תמיד. שם העדות היא `version_no === 1`. הפרמטר מכריח כל קורא
 * להביא את העדות שתקפה אצלו במקום לרשת בדיקה שנכונה רק בצד אחד.
 *
 * **לעולם לא מפיל את הבקשה.** היצירה הצליחה ונשמרה; מה שיכול להיכשל כאן הוא
 * ההתראה בלבד, והכיוון ההפוך היה מציג "היצירה נכשלה" על עיצוב שקיים.
 */
export async function notifyDesignReady(design: DesignRow, isFirstVersion: boolean): Promise<void> {
  try {
    if (!isFirstVersion) return;
    if (!mailConfigured()) return;
    const owner = await getAccount(design.profile_id);
    if (!owner?.email || owner.kind === "tester") return;
    const mail = designReadyMail({
      name: owner.name,
      code: designCode(design.serial),
      url: `${SITE.url}/design?resume=${design.id}`,
    });
    const res = await sendMail({ to: owner.email, subject: mail.subject, text: mail.text });
    if (!res.ok) console.error("design-ready mail failed:", res.error);
  } catch (e) {
    console.error("design-ready mail failed:", (e as Error).message);
  }
}
