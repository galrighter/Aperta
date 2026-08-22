import type { ProductType } from "@/lib/fabrication.config";
import { ratioBandFor } from "@/lib/story/ratio";
import type { EditSpec, SpecSources } from "./spec";

// dialogue mode — מצב-מדויק בתוך השיחה: תור `edit` בחוזה הראיון.
//
// **מה זה** (החלטת גל, 21.8 — "השיחה היא המשטח היחיד"): המעבר בין מצב-שיחה
// למצב-מדויק קורה **בתוך** השיחה, לא בקישור יציאה לעורך. המודל מחזיר תור
// `edit` — הזמנה + אילו פקדים להציג — והמסך מציג פקדים מדויקים: מחוון רוחב
// (היחס אורך-רוחב) וצ'יפים לסימטריה ולצפיפות. מה שנקבע בהם חוזר כתשובה
// בתמליל + מטען מובנה, והשרת הוא שמתרגם אותו למפרט — בדיוק בתבנית הגלריה
// (`chosenVersionId` → `curatedById`): גוף בקשה מקבל רק ערכים מתוך טווח/רשימה.
//
// **למה הקובץ טהור ונפרד.** שלושה צרכנים: פרומפט הראיון (החוזה והבלוק אחרי
// קביעה), מסך השיחה (הפקדים עצמם), ונתיב ה-API (ניקוי, תיאור, וההצבה במפרט).
// כמו `gallery.ts` — אפס רשת, אפס LLM, וכולם קוראים מכאן.
//
// **שלושה פקדים, לא ארבעה — והיעדר `feel` הוא החלטה.** מאפייני העורך הקיים הם
// סימטריה·צפיפות·תחושה, אבל "תחושה" (עדין/מאסיבי) מתפרקת בדיוק לשני הפקדים
// האחרים: ‏PROMPT_SPEC §4 — "עדין → יחס ↑, קו ↓, מאזן פתוח"; "בולט → יחס ↓,
// מאזן מלא". פקד שלישי חופף היה מזמין סתירה (תחושה=מאסיבי + רוחב=צר) — בדיוק
// הסתירה ש-`attrsAuto` בעורך קיים כדי למנוע — ומילות איכות הן ממילא מה
// שהשיחה עצמה מתרגמת הכי טוב. מצב-מדויק קיים למה שמילים עושות הכי רע:
// מספרים ובחירות בינאריות.
//
// **התרגום למפרט דטרמיניסטי — קוד תבנית, לא קריאת מודל** (‏§1.2: "אין מודל
// שלישי"). קביעה בפקד היא הצהרה מפורשת של הלקוחה, ולכן `user` וקפוא (§1.3);
// מודל שמנסח אותה מחדש היה יכול לסחוף את הערך המדויק — וסחף על שדה קפוא הוא
// בדיוק הכשל שהמקורות קיימים למנוע. לכן `applyEditChoice` רץ בשרת **אחרי**
// סבב המודל ודורס: הערך שנקבע הוא הערך שנשמר, מילה במילה, והמודל בסבב הזה
// אחראי רק על ההמשך השיחתי (מה לשאול עכשיו, או לסכם).

/** הפקדים שהמסך יודע להציג. `width` הוא **היחס** (§2.1 — "רוחב לעולם אינו
 *  נאמר לבד"): האורך קבוע מהגוף, והמידה נשאלת רק אחרי התוצאה. */
export const EDIT_CONTROL_KEYS = ["width", "symmetry", "density"] as const;

export type EditControlKey = (typeof EDIT_CONTROL_KEYS)[number];

/** מה שהמודל מחזיר כשהוא בוחר להציע מצב-מדויק — הזמנה בעברית ואילו פקדים.
 *  חי כאן ולא ב-`interview.ts` מאותו נימוק כמו `GalleryAsk`: גם המסך צריך
 *  אותו, בלי לגרור את לקוח ה-LLM. */
export interface EditControlsAsk {
  /** ההזמנה, בעברית — "רוצה לקבוע את זה בדיוק?" */
  lead: string;
  /** אילו פקדים להציג. הפענוח מבטיח שאינה ריקה — רשימה ריקה מהמודל
   *  נקראת "הצג הכול". */
  controls: EditControlKey[];
}

export type SymmetryChoice = "symmetric" | "asymmetric";
export type DensityChoice = "low" | "medium" | "high";

/** מה שהלקוחה קבעה בפקדים. הכול רשות — היא מקבעת רק מה שחשוב לה, והיתר
 *  נשאר כפי שהשיחה השאירה אותו. */
export interface EditChoice {
  /** היחס אורך-רוחב, בתוך `ratioBandFor` של המוצר. */
  ratio?: number;
  symmetry?: SymmetryChoice;
  density?: DensityChoice;
}

/**
 * הטקסט הקנוני שקביעת צ'יפ כותבת למפרט — סגור, באנגלית, בנוסח שהפרומפטים
 * כבר מבקשים (הכרעה אחת, "או ללא"). קבוע כדי ששתי קביעות זהות יכתבו את אותו
 * מפרט מילה-במילה — "identical words redraw the same piece".
 */
export const SYMMETRY_SPEC_TEXT: Record<SymmetryChoice, string> = {
  symmetric: "Mirror-symmetric along its length.",
  asymmetric: "Deliberately asymmetric — no mirror axis.",
};

/** צפיפות החיתוכים → `metal_void_balance`: התרגום הכמותי של §2.1
 *  ("כשליש מהשטח פתוח"), לא ספירת חיתוכים — מניין מדויק הוא של `elements`
 *  והשיחה מכריעה אותו, לא צ'יפ. */
export const DENSITY_SPEC_TEXT: Record<DensityChoice, string> = {
  low: "Mostly solid metal — few cuts, only a small share of the area is open.",
  medium: "Balanced between metal and openings — roughly a third of the area is open.",
  high: "Airy and open — many fine cuts, around half of the area is open.",
};

/**
 * קביעה שהגיעה מבחוץ, מנוקה לצורה שמותר להמשיך איתה. `null` כשאין בה כלום.
 *
 * היחס **נצבט** לטווח המוצר ולא נפסל: המחוון במסך ממילא תחום, וערך מחוץ
 * לטווח הוא לקוח ישן או עוין — הצביטה שקולה למה שהמסך היה מרשה. זה שונה
 * במפורש ממידת גוף (AP-0065: מדידה לא מתקנים בשקט) — יחס אינו מדידה של
 * הלקוחה אלא בחירה עיצובית על סקלה שאנחנו הגדרנו.
 */
export function coerceEditChoice(raw: unknown, productType: ProductType): EditChoice | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const box = raw as Record<string, unknown>;
  const out: EditChoice = {};
  const ratio = Number(box.ratio);
  if (Number.isFinite(ratio) && ratio > 0) {
    const [wide, thin] = ratioBandFor(productType);
    out.ratio = Math.round(Math.min(thin, Math.max(wide, ratio)) * 10) / 10;
  }
  if (box.symmetry === "symmetric" || box.symmetry === "asymmetric") out.symmetry = box.symmetry;
  if (box.density === "low" || box.density === "medium" || box.density === "high") {
    out.density = box.density;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * הקביעה, כפי שפרומפט הסבב הבא קורא אותה — באנגלית, עם הטקסטים הקנוניים
 * עצמם, כדי שמה שהמודל רואה ומה ש-`applyEditChoice` כותב הם אותו דבר אחד.
 */
export function describeEditChoice(choice: EditChoice): string {
  const lines: string[] = [];
  if (choice.ratio !== undefined) {
    lines.push(`Length-to-width ratio: 1:${choice.ratio} — set exactly, on a slider.`);
  }
  if (choice.symmetry) lines.push(`Symmetry: ${SYMMETRY_SPEC_TEXT[choice.symmetry]}`);
  if (choice.density) lines.push(`Metal-void balance: ${DENSITY_SPEC_TEXT[choice.density]}`);
  return lines.join("\n");
}

/**
 * ההצבה במפרט — דטרמיניסטית, אחרי סבב המודל, ודורסת.
 *
 * המקור הוא `user` על כל שדה שנקבע: הפקד הוא אמירה מפורשת (§1.3), וגם שדה
 * שכבר היה `user` מדבריה נדרס — קביעה בפקד היא בדיוק "בקשת שינוי שנוגעת בו
 * במפורש", המקרה היחיד שבו `user` משתנה.
 */
export function applyEditChoice(spec: EditSpec | null | undefined, choice: EditChoice): EditSpec {
  const out: EditSpec = { ...(spec ?? {}) };
  const sources: SpecSources = { ...(spec?.sources ?? {}) };
  if (choice.ratio !== undefined) {
    out.length_to_width_ratio = choice.ratio;
    sources.length_to_width_ratio = "user";
  }
  if (choice.symmetry) {
    out.symmetry = SYMMETRY_SPEC_TEXT[choice.symmetry];
    sources.symmetry = "user";
  }
  if (choice.density) {
    out.metal_void_balance = DENSITY_SPEC_TEXT[choice.density];
    sources.metal_void_balance = "user";
  }
  out.sources = sources;
  return out;
}

/**
 * איפה היחס יושב על הטווח, בשלישים — לשפת הבועה בלבד ("רוחב צר"), לא למפרט.
 * סקלה לוגריתמית: הטווח (2.4–47.5 בצמיד) הוא יחסי, ושליש ליניארי היה קורא
 * לרוב הטווח "צר".
 */
export function widthThirdOf(ratio: number, band: [number, number]): "wide" | "medium" | "narrow" {
  const [wide, thin] = band;
  const clamped = Math.min(thin, Math.max(wide, ratio));
  const t = (Math.log(clamped) - Math.log(wide)) / (Math.log(thin) - Math.log(wide));
  return t < 1 / 3 ? "wide" : t < 2 / 3 ? "medium" : "narrow";
}

/** נקודת הפתיחה של המחוון כשהשיחה עוד לא הכריעה יחס — אמצע לוגריתמי של
 *  הטווח, מאותו נימוק כמו `widthThirdOf`. */
export function defaultRatioFor(productType: ProductType): number {
  const [wide, thin] = ratioBandFor(productType);
  return Math.round(Math.sqrt(wide * thin) * 10) / 10;
}
