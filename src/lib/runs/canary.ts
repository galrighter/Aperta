import { deleteJobsForRuns } from "@/lib/db/jobs";
import { deleteRuns, listPurgeableCanaryRuns, type PurgeableRun } from "@/lib/db/runs";
import { removeFiles } from "@/lib/db/storage";

// הקנרית מנקה אחריה.
//
// **מה הבעיה שזה פותר.** `canary.yml` מריץ יצירה סינתטית מלאה כל שעתיים, וכל
// אחת מהן נכתבת ליומן היצירות כמו כל הרצה אחרת. בשבוע שקדם ל-17.8 זה היה 79
// מתוך 166 השורות — כמעט חצי מהיומן, כולן על אותו תיאור, כולן בלי בעלים (כי
// העיצוב נמחק מיד אחריהן). מי שנכנס ליומן בעקבות תלונה של לקוחה סרק אותן
// בעיניים בדרך לשורה שהוא חיפש, וזה בדיוק סוג הרעש שמאמן לדלג על שורות.
//
// **ומה שלא נמחק, בכוונה: כישלון.** הרצה קנרית שנדחתה או שגתה היא הדבר היחיד
// שהקנרית קיימת בשבילו, והיא נשארת ביומן עד שמישהו מטפל בה. מה שנמחק הוא
// `approved` בלבד — ההוכחה השגרתית שהאתר עבד בשעה שעברה, שכבר סופרה ונשכחה
// (ההוכחה עצמה נשמרת ממילא ביומן ההרצות של Actions, שהוא התיעוד שהבדיקה רצה).
//
// **וגם היא נמחקת פעם ביום ולא מיד.** הקצב הוא החלטה ולא אילוץ: יומן שבו
// הקנרית כמעט אף פעם לא נראית מוחק גם את הידיעה שהיא רצה ועברה, וזו ידיעה
// ששווה משהו למי שפותח את היומן. הגבול העליון הוא 12 שורות — יום שלם של
// בדיקות — במקום 79 בשבוע כשלא היה ניקוי בכלל.
//
// **שלושה דברים ולא אחד.** לשורת יומן יש תמונות ב-storage ולעתים שורת job
// לצדה. שורה שנמחקת לבדה משאירה בייטים שאין להם יותר דרך גישה — וגרוע מזה,
// שורת job בלי הרצה חוזרת ליומן מיד בתור "ניסיון שלא הגיע לשורת הרצה"
// (`runs/orphans.ts`): אותו רעש בדיוק, במסווה של כישלון שלא קרה.

/**
 * תקרה לסבב.
 *
 * הקנרית מייצרת 12 שורות ביום והסבב רץ פעם ביום, כלומר בשגרה זה מה שיש כאן.
 * התקרה קיימת בשביל הסבב **הראשון**, שפוגש היסטוריה שלמה, ובשביל המקרה שבו
 * המתזמן שתק שבוע: 200 שורות הן ~1,000 קבצים למחיקה, מה שעדיין נכנס בנוחות
 * בבקשה אחת, ומה שמעבר לזה ייאסף בסבב הבא.
 */
export const CANARY_PURGE_LIMIT = 200;

export interface CanaryPurgeReport {
  /** כמה שורות יומן נמחקו. */
  runs: number;
  /** כמה בקשות יצירה נמחקו איתן (בדרך כלל 0 — ראה `deleteJobsForRuns`). */
  jobs: number;
  /** כמה קבצים ב-storage נמחקו. */
  files: number;
}

/** כל מה ששורה אחת מחזיקה ב-storage: ההדמיה, שלבי הביניים, וקובץ ההשראה. */
export function filesOf(run: PurgeableRun): string[] {
  const stages = Object.values(run.stage_paths ?? {}).filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  return [run.render_path, ...stages, run.input_image_path].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
}

/**
 * סבב ניקוי אחד.
 *
 * **הסדר הוא הנקודה.** קבצים, אחר כך בקשות, ורק בסוף שורות היומן — כך שכל
 * נפילה באמצע משאירה מצב שהסבב הבא מתקן בעצמו: השורה עדיין כאן, היא עדיין
 * עונה לשאילתה, והמחיקות שכבר בוצעו הן no-op בפעם השנייה. הסדר ההפוך היה
 * מאבד את הנתיבים ברגע שהשורה נמחקה — כלומר בייטים שאיש כבר לא יודע עליהם.
 *
 * `removeFiles` לא זורק אלא מזהיר, ולכן קובץ עקשן אינו עוצר את הסבב: שורה
 * שנשארת ביומן בגלל תמונה אחת היא בדיוק הכישלון שהניקוי בא למנוע.
 */
export async function purgeHealthyCanaryRuns(
  limit = CANARY_PURGE_LIMIT,
): Promise<CanaryPurgeReport> {
  const runs = await listPurgeableCanaryRuns(limit);
  if (!runs.length) return { runs: 0, jobs: 0, files: 0 };

  const paths = runs.flatMap(filesOf);
  await removeFiles(paths);

  const ids = runs.map((r) => r.id);
  const jobs = await deleteJobsForRuns(ids);
  const deleted = await deleteRuns(ids);
  return { runs: deleted, jobs, files: paths.length };
}
