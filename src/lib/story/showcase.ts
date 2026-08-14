// story mode — הוויטרינה של דף הבית: מה סופר, מה חזר, ומה זה נראה על היד.
//
// **למה זה חי כאן ולא ברכיב.** מה שהוויטרינה מציגה אינו איור אלא עיצוב: SVG
// קנוני עם viewBox במ"מ ושכבת `cutouts` — אותו מבנה בדיוק שגרסה שמורה נושאת
// (`designs.versions[].svg`). מכאן שהחלפת דוגמה בעיצוב אמיתי היא הדבקה של
// מחרוזת ב-`showcaseData.ts`, והרכיב לא יודע מה מהם.
//
// הנתונים עצמם נפלטים מ-`scripts/story-showcase.mjs`; הקובץ הזה הוא הטיפוסים
// והגזירה שהמסך צריך.
import { svgFrame } from "@/lib/geometry/frame";
import { samplePathToRings } from "@/lib/geometry/paths";
import type { MultiPolygon, Ring } from "@/lib/geometry/types";
import type { ProductType } from "@/lib/fabrication.config";
import { SHOWCASE_DATA } from "./showcaseData";

/** הצעה אחת מתוך השלוש שחזרו על אותו סיפור. */
export interface ShowcaseOption {
  /** שם הכיוון, לתווית נגישה ולתיאור — לא מוצג ככותרת. */
  note: string;
  /** ה-SVG הקנוני של ההצעה. */
  svg: string;
}

/** סיפור אחד, וההצעות שחזרו עליו. */
export interface ShowcaseStory {
  id: string;
  /** סוג הסיפור: זיכרון, חוויה, עיצוב, רגש. */
  kind: string;
  /** מה שנכתב בשדה הסיפור, כלשונו. */
  story: string;
  product: ProductType;
  lengthMm: number;
  widthMm: number;
  /** הפתח של הפריט המעורגל — קובע את הקשת בהדמיה. */
  gapMm: number;
  /** האינדקס של ההצעה שנבחרה. היא זו שנפתחת בהדמיה. */
  chosen: number;
  options: ShowcaseOption[];
}

export const SHOWCASE: readonly ShowcaseStory[] = SHOWCASE_DATA;

/** שכבת החיתוכים מתוך ה-SVG הקנוני — מה שנצבע בפריסה השטוחה. */
export function showcaseCutouts(svg: string): string {
  return /<g id="cutouts"[^>]*>([\s\S]*?)<\/g>/.exec(svg)?.[1] ?? "";
}

const D_ATTR = /\sd="([^"]*)"/g;

/**
 * הגאומטריה שההדמיה התלת-ממדית מקבלת: מלבן הרצועה, והחיתוכים כחורים בתוכו.
 *
 * **למה לא דרך `/api/validate`.** במסע היצירה הגאומטריה מגיעה מהשרת, כי שם
 * היא נגזרת מפלט של מודל — נתיבים שעלולים לחפוף, לחרוג מהגבול או להתקפל,
 * וההפרש הבוליאני חייב לרוץ עליהם. כאן העיצובים נכתבו על ידינו וידוע עליהם
 * שהם זרים זה לזה ויושבים בתוך המסגרת (`scripts/story-showcase.mjs` עוצר את
 * הפליטה אחרת), ולכן החורים הם בדיוק הטבעות — בלי בוליאניות, בלי
 * `polygon-clipping` בחבילה של דף הבית, ובלי בקשת רשת לקישוט.
 *
 * המשמעות המעשית: עיצוב אמיתי שיוחלף לכאן חייב להיות ה-`canonicalSvg` שהשרת
 * החזיר (שם החפיפות כבר אוחדו), ולא פלט גולמי.
 */
export function showcaseMaterial(story: ShowcaseStory, optionIndex: number): MultiPolygon {
  const option = story.options[optionIndex];
  if (!option) return [];
  const frame = svgFrame(option.svg) ?? { lengthMm: story.lengthMm, widthMm: story.widthMm };
  const outer: Ring = [
    [0, 0],
    [frame.lengthMm, 0],
    [frame.lengthMm, frame.widthMm],
    [0, frame.widthMm],
  ];
  const holes: Ring[] = [];
  for (const m of showcaseCutouts(option.svg).matchAll(D_ATTR)) {
    for (const sub of samplePathToRings(m[1])) {
      if (sub.ring.length >= 3) holes.push(sub.ring);
    }
  }
  return [[outer, ...holes]];
}
