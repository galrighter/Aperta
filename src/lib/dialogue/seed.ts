import { SPEC_FIELDS, coerceEditSpec, hasSpec, type EditSpec, type SpecSources } from "./spec";

// dialogue mode — הזרעת המפרט המצטבר מהיצירה (§9.2 ב-DIALOGUE_PLAN).
//
// **מה זה פותר.** המפרט המצטבר מתמלא מסבבי עריכה, ולכן הסבב **הראשון** על
// עיצוב חדש רואה `EDIT_SPEC_NONE` — מודל הטקסט לא יודע מה הפריט הוא, רק מה
// מבקשים לשנות בו. העלות אינה תיאורטית: סבב בלי הקשר הוא סבב פחות מדויק,
// כלומר לקוחה שצריכה עוד סבב — או לקוחה שלא עושה אותו.
//
// אבל המידע כבר קיים. `designStage` ייצר בדיוק את החמישייה הזו ביצירה, לכל
// אחד מ-3–6 הכיוונים, והיא שמורה ב-`RunInputs.designStage.spec`. מה שחסר היה
// **איזה מהם הלקוחה בחרה** — וזה מה ש-`VersionCandidate.designIndex` נושא
// מאז שהוא נצמד לפאנל בזמן היצירה.
//
// **הכול טהור כאן.** השליפה עצמה יושבת ב-`lib/db/runs.ts#editSpecFor`; מה
// שנשאר כאן הוא הפענוח והבחירה, שהם מה שיכול להיות שגוי בשקט ולכן מה שנבדק.

/**
 * החמישייה של כיוון עיצוב מסוים, מתוך ה-JSON ששלב הטקסט החזיר.
 *
 * `null` על כל דבר שאינו ודאי — JSON שאי אפשר לקרוא, אינדקס מחוץ לתחום,
 * כיוון בלי שום שדה. **חסר עדיף על ניחוש**: מפרט של הכיוון הלא נכון אינו
 * "פחות מדויק" אלא הצהרה בטוחה על פריט אחר, ומודל הטקסט יערוך אותה כאילו
 * היא נכונה — כלומר גרוע מלהתחיל ריק.
 *
 * ה-JSON נחתך ב-8,000 תווים כשהוא נשמר ליומן (`RunInputs.designStage.spec`),
 * וחיתוך באמצע הופך אותו לבלתי-קריא. זה נופל כאן כמו כל קלט פסול אחר, וזו
 * ההתנהגות הנכונה: מפרט חתוך אינו מפרט.
 *
 * **המקור של כל שדה מוזרע הוא `inferred`** (‏PROMPT_SPEC §1.3). לא `user` —
 * הלקוחה בחרה את הכיוון כמכלול, לא אישרה כל שדה בנפרד; ולא `chosen` —
 * "חופשי לבחירה מחדש" היה מתיר ל-respec לשכתב את הפריט שהיא בחרה. זה בדיוק
 * התקדים של §3.2: בחירה בגלריה מזרימה את תגי העיצוב שנבחר למפרט כ-`inferred`.
 *
 * **והיחס מוזרע גם הוא** (`length_to_width_ratio`): תמונת הייחוס נשאה אותו
 * במרומז, וב-respec אין ממי לרשת אותו — בלעדיו יצירה-מחדש מטילה קובייה על
 * הרוחב, הציר שנמדד מכולם (‏askedRatios מול drawnRatio).
 */
export function specFromDesignStage(
  specJson: string | null | undefined,
  designIndex: number | null | undefined,
): EditSpec | null {
  if (!specJson || typeof designIndex !== "number" || !Number.isInteger(designIndex) || designIndex < 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(specJson);
  } catch {
    return null;
  }
  const designs = (parsed as { designs?: unknown })?.designs;
  if (!Array.isArray(designs) || designIndex >= designs.length) return null;
  const chosen = designs[designIndex];
  if (!chosen || typeof chosen !== "object") return null;

  const box = chosen as Record<string, unknown>;
  const out: EditSpec = {};
  const sources: SpecSources = {};
  let fields = 0;
  for (const [key] of SPEC_FIELDS) {
    const value = box[key];
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim();
      sources[key] = "inferred";
      fields += 1;
    }
  }
  // יחס בלי אף שדה טקסט אינו מפרט — אי אפשר לצייר ממנו פריט, בדיוק כמו
  // ב-`hasSpec`. כיוון כזה נופל כמו כיוון ריק.
  if (!fields) return null;
  const ratio = Number(box.length_to_width_ratio);
  if (Number.isFinite(ratio) && ratio > 0) {
    out.length_to_width_ratio = ratio;
    sources.length_to_width_ratio = "inferred";
  }
  out.sources = sources;
  return out;
}

/**
 * הזרעה מ**ראיון** (שלב B) — הכיוון שנבחר, עם המקורות שלו.
 *
 * ההבדל מ-`specFromDesignStage`, והוא כל הסיבה לפונקציה נפרדת: כיווני הראיון
 * נושאים `sources` משלהם — מה שהלקוחה אמרה במפורש בראיון מתויג `user` —
 * והזרעה דרך המסלול של היצירה הייתה קוראת לכול `inferred` ומפשירה בדיוק את
 * מה שהיא קיבעה (‏PROMPT_SPEC §1.3: ראיון בלי מקורות נותן ל-respec רישיון
 * לשכתב את מה שנאמר). `coerceEditSpec` כבר יודע לקרוא את השדות המורחבים
 * ואת `sources` — כיוון ראיון הוא בדיוק הצורה שהוא מנקה.
 *
 * שדה שהכיוון נושא בלי תיוג ייקרא `inferred` בהמשך (`sourceOf`) — ההנחה
 * השמרנית, כמו תמיד.
 */
export function specFromInterview(
  directionsJson: string | null | undefined,
  designIndex: number | null | undefined,
): EditSpec | null {
  if (!directionsJson || typeof designIndex !== "number" || !Number.isInteger(designIndex) || designIndex < 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(directionsJson);
  } catch {
    return null;
  }
  const designs = (parsed as { designs?: unknown })?.designs;
  if (!Array.isArray(designs) || designIndex >= designs.length) return null;
  const spec = coerceEditSpec(designs[designIndex]);
  // יחס או מקורות בלי אף שדה טקסט אינם מפרט — כמו ב-`specFromDesignStage`.
  return spec && hasSpec(spec) ? spec : null;
}

/**
 * הכיוון שההצעה הנבחרת באה ממנו.
 *
 * `picked_index` הוא מקום במערך ההצעות; `designIndex` שעליו הוא הכיוון
 * במפרט. שתי רמות עקיפין, ושתיהן יכולות להיות ריקות בגרסה ישנה — ואז אין
 * הזרעה, וזה בדיוק המצב שהיה עד עכשיו בכל הרצה.
 *
 * ‏`picked_index` ריק נקרא כ-0: זו ההצעה שנשמרה כגרסה כשהלקוחה לא נגעה
 * בבחירה, וכך גם `chooseCandidate` והמסך משווים אותה.
 */
export function chosenDesignIndex(version: {
  picked_index?: number | null;
  candidates?: Array<{ designIndex?: number }> | null;
}): number | null {
  const picked = version.picked_index ?? 0;
  const chosen = version.candidates?.[picked];
  return typeof chosen?.designIndex === "number" ? chosen.designIndex : null;
}
