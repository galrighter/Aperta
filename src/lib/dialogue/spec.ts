// dialogue mode — המפרט המצטבר, וההחלטה שמעדכנת אותו (§2.2 ב-DIALOGUE_PLAN).
//
// **למה זה קובץ נפרד מ-`editStage.ts`.** שני קוראים שונים לגמרי צריכים את
// הטיפוסים האלה: שלב הטקסט, שמדבר עם ספק LLM, ושכבת ה-DB, ששומרת אותם
// ב-`RunInputs` (jsonb). קובץ אחד היה גורר את לקוח ה-LLM לתוך `lib/db/runs.ts`
// בשביל חמישה שדות מחרוזת. כאן אין שום תלות ריצה — טיפוסים ופונקציות טהורות.
//
// **"עריכה של תמונה הופכת לעריכת פרומפט".** התרגום המעשי: לכל עיצוב נשמר
// מפרט מצטבר, ובכל סבב מודל הטקסט **עורך אותו** ולא מחבר הוראה מאפס. זה מה
// שפותר את הכשל האמיתי של עריכה מצטברת — היום סבב 5 אינו יודע מה נקבע בסבב 2,
// כי כל סבב רואה רק את התמונה ואת המשפט האחרון, ולכן "תחזירי את הקצב שהיה
// בהתחלה" הוא בקשה שאין לה למה להתייחס.

/**
 * המפרט המצטבר של עיצוב — **אותם שדות בדיוק** שיוצאים מ-`designStage`
 * (`DesignDirection` ב-lib/story/designStage.ts).
 *
 * זהות השדות אינה נוחות: היא מה שמאפשר למפרט שנוצר ביצירה להיכנס לסבב
 * העריכה הראשון בלי תרגום, ולמפרט שיצא מסבב עריכה להיכנס לסבב הבא. שדה
 * שהיה נוסף כאן ולא שם היה שובר את השרשרת בחוליה הראשונה.
 *
 * הכול אופציונלי: עיצוב שנוצר במסלול הרגיל אינו נושא מפרט בכלל, וזה מצב
 * תקין — ראה `EDIT_SPEC_NONE`.
 */
export interface EditSpec {
  outer_silhouette?: string;
  metal_structure?: string;
  negative_space?: string;
  rhythm_balance?: string;
  manufacturability?: string;
}

/** מה שמודל הטקסט מחזיר לכל בקשת שינוי. */
export interface EditDecision {
  /**
   * ההיקף שהמודל הכריע עליו, במילותיו. תיאורי — הוא נכנס לפרומפט של מודל
   * התמונה, והוא גם מה שנקרא ביומן כשמסתכלים למה שינוי "מקומי" שינה הכול.
   */
  scope?: string;
  /**
   * הוראת הציור. **זה השדה שקובע**, וזה גם השדה היחיד שהקבילות נבדקת עליו:
   * בלעדיו אין מה למסור למודל התמונה, ומפרט חלקי גרוע ממפרט שאין.
   */
  image_instruction?: string;
  /** מה שהבקשה לא נגעה בו ולכן נשאר. ריק = הבקשה נוגעת בפריט כולו. */
  preserve?: string[];
  /**
   * המודל לא הבין את הבקשה מספיק כדי לתרגם אותה.
   *
   * **בשלב A זה נרשם ואינו נאכף** (החלטת גל): המסלול עדיין אינו יכול לשאול —
   * מסך השיחה הוא שלב B. השדה קיים מעכשיו כי הוא מה שימדוד את *כמות*
   * המקרים שבהם שאלה הייתה חוסכת סבב, וזו בדיוק ההצדקה שתידרש לשלב B.
   * הרצה עם `needs_clarification` ממשיכה רגיל, והשאלה נרשמת ביומן.
   */
  needs_clarification?: string;
  /** המפרט אחרי השינוי. חסר = המודל לא עדכן, והקודם נשמר. ראה `nextEditSpec`. */
  updated_spec?: EditSpec;
}

/** סדר השדות בפרומפט — קבוע, כדי ששתי הרצות של אותו מפרט יהיו אותו טקסט. */
export const SPEC_FIELDS: ReadonlyArray<readonly [keyof EditSpec, string]> = [
  ["outer_silhouette", "Outer silhouette"],
  ["metal_structure", "Metal structure"],
  ["negative_space", "Negative space"],
  ["rhythm_balance", "Rhythm and balance"],
  ["manufacturability", "Manufacturability"],
];

/**
 * מה שנכתב במקום המפרט כשאין מפרט — הסבב הראשון על עיצוב שנוצר במסלול הרגיל.
 *
 * משפט ולא מחרוזת ריקה: כותרת עם כלום מתחתיה נקראת כמפרט ריק, כלומר כפריט
 * בלי צללית ובלי מבנה, וזו הצהרה שגויה על פריט שקיים ומצויר בתמונה המצורפת.
 *
 * ⚠ **וזה המצב בסבב הראשון של כל עיצוב, גם במסלול הזה.** המפרט מתחיל
 * להצטבר מהסבב הראשון ואילך; הזרעה שלו ממה שיצא מ-`designStage` ביצירה
 * דורשת לדעת **איזה** מבין שלושת עד ששת הכיוונים הלקוחה בחרה, וזה לא נשמר
 * ב-`RunInputs` היום. זו הרחבה נפרדת ולא הנחה שאפשר לנחש: מפרט של הכיוון
 * הלא נכון גרוע ממפרט שאין, כי הוא מצהיר בביטחון על פריט אחר.
 */
export const EDIT_SPEC_NONE =
  "Not recorded. This piece was designed before the specification was kept, so describe what the change implies about it rather than assuming what it already is.";

/** המפרט המצטבר, כפי שהוא נכתב בפרומפט. `null` וכן מפרט שכל שדותיו ריקים —
 *  שניהם `EDIT_SPEC_NONE`: מפרט שיש בו רק כותרות הוא הצהרה על פריט ריק. */
export function describeSpec(spec: EditSpec | null | undefined): string {
  const lines = SPEC_FIELDS
    .map(([key, label]) => [label, spec?.[key]?.trim()] as const)
    .filter((pair): pair is readonly [string, string] => Boolean(pair[1]))
    .map(([label, value]) => `${label}: ${value}`);
  return lines.length ? lines.join("\n") : EDIT_SPEC_NONE;
}

/**
 * המפרט לסבב הבא.
 *
 * **מיזוג שדה־שדה ולא החלפה.** מודל שהחזיר `updated_spec` חלקי — שלושה שדות
 * מתוך חמישה — לא הצהיר שהשניים האחרים נעלמו; הוא פשוט לא כתב אותם. החלפה
 * הייתה מוחקת בסבב אחד מה שנקבע בחמישה, וזה בדיוק הכשל שהמפרט המצטבר קיים
 * כדי למנוע. שדה ריק או רווחים בלבד נחשב "לא נכתב".
 */
export function nextEditSpec(prev: EditSpec | null | undefined, decision: EditDecision): EditSpec {
  const out: EditSpec = { ...(prev ?? {}) };
  const update = decision.updated_spec;
  if (update && typeof update === "object") {
    for (const [key] of SPEC_FIELDS) {
      const value = update[key];
      if (typeof value === "string" && value.trim()) out[key] = value.trim();
    }
  }
  return out;
}

/** האם יש כאן מפרט בכלל — לפחות שדה אחד שנכתב. */
export function hasSpec(spec: EditSpec | null | undefined): boolean {
  return SPEC_FIELDS.some(([key]) => Boolean(spec?.[key]?.trim()));
}
