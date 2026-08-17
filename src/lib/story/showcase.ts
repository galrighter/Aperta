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

/** גרסה אחת של העיצוב, כפי שהיא מוצגת בוויטרינה. */
export interface ShowcaseOption {
  /** שם הכיוון, לתווית נגישה ולתיאור — לא מוצג ככותרת. */
  note: string;
  /** ה-SVG הקנוני של ההצעה (מדולל לתצוגה — ראו את כותרת המחולל). */
  svg: string;
  /**
   * גוף החומר, מחושב מראש במחולל (מלבן⊖חיתוכים, polygon-clipping).
   *
   * קיים כי עיצוב אמיתי גוזר גם את קו המתאר — חיתוכי קצה שמתחילים ב-M0 0 —
   * וחור שנוגע בשפה מפיל את הטריאנגולציה של ההדמיה. החישוב בזמן בילד משאיר
   * את polygon-clipping מחוץ לחבילה של דף הבית.
   */
  material?: MultiPolygon;
}

/** עיצוב אחד בוויטרינה: מה שנכתב, ומה שנשמר בסטודיו. */
export interface ShowcaseStory {
  id: string;
  /** המספר הסידורי של העיצוב בסטודיו — designCode() הופך אותו ל-"AP-0249". */
  serial: number;
  /** סוג הטקסט: רגש, סגנון, חוויה… — לתיאור הנגיש. */
  kind: string;
  /** התווית שמעל הציטוט — "סיפור · רגש" / "תיאור · מדויק". נוקבת בשער שדרכו
   *  העיצוב נוצר, ולכן שני שערי דף הבית מיוצגים בוויטרינה. */
  tag: string;
  /** מה שנכתב בשדה הסיפור/התיאור, כלשונו. */
  story: string;
  product: ProductType;
  lengthMm: number;
  widthMm: number;
  /** הפתח של הפריט המעורגל — קובע את הקשת בהדמיה. */
  gapMm: number;
  /** האינדקס של הגרסה הנוכחית. היא זו שנפתחת בהדמיה. */
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
 * הגאומטריה שההדמיה התלת-ממדית מקבלת.
 *
 * המסלול הראשי הוא ה-`material` שחושב מראש במחולל — חיסור בוליאני מלא, כמו
 * בצינור הייצור, שרץ בזמן בילד ולא בדפדפן. הנפילה-לאחור (מלבן + החיתוכים
 * כחורים) נשארת לאפשרות שאין לה `material`: היא נכונה רק כשכל החיתוכים
 * יושבים בתוך המסגרת ואינם נוגעים זה בזה — ההנחה שהדוגמאות הפרמטריות
 * ההיסטוריות קיימו, ועיצוב אמיתי עם חיתוכי קצה אינו מקיים.
 */
export function showcaseMaterial(story: ShowcaseStory, optionIndex: number): MultiPolygon {
  const option = story.options[optionIndex];
  if (!option) return [];
  if (option.material) return option.material;
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
