import { he } from "@/i18n/he";
import type { EditRegion } from "./editStage";

// dialogue mode — קורפוס הבקשות של הרתמה (‏A0 ב-DIALOGUE_PLAN §7).
//
// **למה צריך לפרק את הפרומפט הישן.** ‏§7 דורש "‏10 בקשות שינוי אמיתיות מתוך
// `generation_runs`", ומה שנשמר שם בעמודת `prompt` הוא לא הבקשה אלא הפרומפט
// שנבנה ממנה בלקוחה: `"שינוי באזור ימין של הפריט: פחות בלאגן פה"`
// (`create/model.ts#buildEditPrompt`). שליחת המחרוזת הזו כמו שהיא לשלב הטקסט
// הייתה מוסרת את האזור פעמיים — פעם כטקסט בתוך הבקשה ופעם כפרמטר — ומודדת
// את המסלול החדש על קלט שהוא ממילא כבר עובד. ולכן: מפרקים.
//
// **הרצות חדשות אינן צריכות את זה.** מ-`RunInputs.editStage.request` הבקשה
// הגולמית נשמרת בנפרד. הפירוק כאן הוא בשביל ההיסטוריה — שהיא, נכון לעכשיו,
// כל הקורפוס שיש.

/** `"אזור ימין"` → `"right"`. נגזר מ-`he` ולא משוכפל: מי שישנה את הניסוח
 *  שם ישבור כאן פענוח שקט, ומיפוי הפוך נגזר הוא מה שמונע את זה. */
const REGION_BY_LABEL: ReadonlyMap<string, EditRegion> = new Map(
  (Object.entries(he.design.regions) as Array<[EditRegion, string]>)
    .map(([key, label]) => [label, key] as const),
);

export interface LegacyEditPrompt {
  region: EditRegion | null;
  request: string;
}

/**
 * הפרומפט הישן → אזור ובקשה.
 *
 * שתי הצורות ש-`buildEditPrompt` מייצר, וכל השאר:
 *
 *     "שינוי ב<אזור ימין> של הפריט: <בקשה>"  → region, request
 *     "שינוי בעיצוב כולו: <בקשה>"            → null,   request
 *     כל דבר אחר                              → null,   המחרוזת כמות שהיא
 *
 * **מה שאינו מזוהה מוחזר שלם ולא נזרק.** הקורפוס נבנה מהיסטוריה, ופרומפט
 * מנוסח אחרת (גרסה ישנה יותר של הקוד, הרצה מהבק־אופיס) הוא עדיין בקשה
 * אמיתית של אדם — וזה כל מה שהמדידה צריכה ממנו. מה שהיה נזרק כאן היה דווקא
 * המקרים הלא-שגרתיים, שהם המעניינים.
 */
export function parseLegacyEditPrompt(prompt: string): LegacyEditPrompt {
  const text = prompt.trim();
  const colon = text.indexOf(":");
  if (!text.startsWith("שינוי ב") || colon < 0) return { region: null, request: text };

  const head = text.slice("שינוי ב".length, colon).trim();
  const request = text.slice(colon + 1).trim();
  if (!request) return { region: null, request: text };

  // ‏"אזור ימין של הפריט" → "אזור ימין". ה-ה' הידיעה כבר בתוך התווית עצמה
  // (`he.design.regions`), ולכן החיתוך היחיד הוא הזנב.
  const label = head.replace(/\s+של הפריט$/, "").trim();
  return { region: REGION_BY_LABEL.get(label) ?? null, request };
}

/** האם השורה ביומן היא בקשת שינוי בכלל. `editedFromCurrent` הוא מה שנרשם
 *  כשהעיצוב הקיים נמסר למודל כתמונת בסיס — כלומר בדיוק "עריכה". */
export function isEditRun(inputs: { editedFromCurrent?: boolean } | null | undefined): boolean {
  return Boolean(inputs?.editedFromCurrent);
}
