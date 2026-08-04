import opentype from "opentype.js";
import { base64ToBytes } from "@/lib/base64";

// מאגר הפונטים של הכיתוב על התכשיט.
//
// למה יותר מאחד: הכיתוב מגיע ללקוחה כתמונת ייחוס שהמודל מעצב סביבה
// (docs/research/HEBREW_TEXT_HANDOFF.md), כלומר הטיפוגרפיה היא שלנו ולא של
// המודל — ולכן כל מגוון טיפוגרפי חייב להגיע מכאן. שמונה פנים נותנות טווח
// אמיתי (סריף קלאסי, סנס נקי, גיאומטרי, תצוגה כבדה, מעובה־צר, כתב יד, קליל)
// בלי מודל נוסף ובלי ניחוש.
//
// כל הפנים הן OFL 1.1 והמוטמע הוא **תת-קבוצה**: עברית כולל סופיות, לטינית,
// ספרות ופיסוק. זה מוריד קובץ טיפוסי מ-60–175KB ל-8–20KB, וזו הסיבה שאפשר
// להחזיק שמונה מהם בתוך ה-Worker בלי לשלם עליהם ברוחב פס בכל בקשה. הרישיונות
// וזכויות היוצרים: fonts/OFL.md. Secular One הוא היחיד שאינו מסובסט — הוא היה
// כאן קודם (fontData.ts) ולא נגענו בו.

export const FONT_IDS = [
  "secular", "serif", "sans", "round", "display", "condensed", "script", "delicate",
] as const;

export type FontId = (typeof FONT_IDS)[number];

export interface Face {
  id: FontId;
  /** שם הפונט המקורי — לייחוס ולרישיון. */
  family: string;
  /** איך הפנים נקראות ללקוחה ובבק־אופיס. */
  label: string;
  /**
   * רוחב הטקסט לגובה אות, בקירוב (נמדד על "שני מגידס"). לא לפריסה — הפריסה
   * נמדדת מהפונט עצמו — אלא לבחירה: כשהכיתוב ארוך מדי לפס, פנים צרות יותר
   * נותנות אות גדולה יותר על אותו אורך.
   */
  widthPerHeight: number;
}

// הרוחבים נמדדו על "ענבל רייטר". Amatic SC נבחן ונפסל: הוא יפה, והוא הכי
// "עדין" מכל מה שנבדק — אבל בגובה אות של 8 מ"מ **כל** המשיכות שלו צרות
// מהפתח המינימלי, כלומר הכיתוב כולו נמחק בחיתוך. Bellefair נותן את אותו אופי
// קליל ושורד. אין טעם בפנים שהטבלה מבטיחה ושתמיד נופלות חזרה לאחרות.
export const FACES: Record<FontId, Face> = {
  secular:   { id: "secular",   family: "Secular One",      label: "עגול ומלא",   widthPerHeight: 5.9 },
  serif:     { id: "serif",     family: "Frank Ruhl Libre", label: "סריף קלאסי",  widthPerHeight: 6.0 },
  sans:      { id: "sans",      family: "Heebo",            label: "נקי ומודרני", widthPerHeight: 7.1 },
  round:     { id: "round",     family: "Rubik",            label: "גיאומטרי רך", widthPerHeight: 7.0 },
  display:   { id: "display",   family: "Suez One",         label: "כבד ובולט",   widthPerHeight: 6.5 },
  condensed: { id: "condensed", family: "Karantina",        label: "צר ומעובה",   widthPerHeight: 3.9 },
  script:    { id: "script",    family: "Gveret Levin",     label: "כתב יד",      widthPerHeight: 3.8 },
  delicate:  { id: "delicate",  family: "Bellefair",        label: "עדין וקליל",  widthPerHeight: 6.8 },
};

/** ברירת המחדל — הפונט שאיתו רצו כל הניסויים. */
export const DEFAULT_FONT: FontId = "secular";

export const isFontId = (v: unknown): v is FontId =>
  typeof v === "string" && (FONT_IDS as readonly string[]).includes(v);

// ייבוא דינמי לכל פנים: הכיתוב הוא שדה אופציונלי, וברוב ההרצות אף פונט לא
// נדרש. סטטי היה גורר את כל השמונה לכל בקשה.
const LOADERS: Record<FontId, () => Promise<{ DATA: string }>> = {
  secular:   () => import("./secular"),
  serif:     () => import("./serif"),
  sans:      () => import("./sans"),
  round:     () => import("./round"),
  display:   () => import("./display"),
  condensed: () => import("./condensed"),
  script:    () => import("./script"),
  delicate:  () => import("./delicate"),
};

const cache = new Map<FontId, opentype.Font>();

/** הפנים המפוענחות. הפענוח קורה פעם אחת לכל isolate. */
export async function loadFace(id: FontId): Promise<opentype.Font> {
  const hit = cache.get(id);
  if (hit) return hit;
  const { DATA } = await LOADERS[id]();
  const font = opentype.parse(base64ToBytes(DATA).buffer);
  cache.set(id, font);
  return font;
}
