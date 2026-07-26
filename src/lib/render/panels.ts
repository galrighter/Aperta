// כמה הדמיות לבקש, ואיך לחתוך אותן למועמדים.
//
// מודל התמונה לא מצייר את היחס שמבקשים ממנו — הוא נמשך ליחס "נוח" משלו. נמדד על
// 45 הרצות (26.7): בקשה ל-4.0 חזרה כ-4.8, בקשה ל-6.4 חזרה כ-5.9, ובקשה ל-16
// חזרה כ-8.3. ניסוח לא מזיז את זה.
//
// מה שכן מזיז אותו הוא צורת הקנבס. כשמבקשים ממנו לחלק את התמונה ל-N שורות, כל
// שורה היא מסגרת צרה, והנטייה שלו למלא את השטח שלו עובדת לטובתנו:
//   שורה אחת → ~6.5 · שתיים → ~7.8 · ארבע → ~10.5 · שש → ~12.8
// מכאן מספר השורות: זה שהיחס הטבעי שלו הקרוב ביותר למה שהוזמן.
//
// ובונוס שהוא בעצם העיקר: כל שורה היא וריאציה נפרדת, כלומר מועמד לבחירת הלקוחה
// באותו מחיר. כשהיחס המבוקש נמוך ושורה אחת מספיקה, המועמדים מגיעים מקריאות
// נפרדות במקום משורות.

import { cropImage, decodePng, encodePng, type RawImage } from "./png";

/** היחס שהמודל מצייר בפועל כפונקציה של מספר השורות — מהמדידות שלמעלה. */
const NATURAL_RATIO = (rows: number) => 5.3 + 1.25 * rows;

export const MAX_ROWS = 6;

/** כמה מועמדים להביא בכל יצירה — כמה שמסך התוצאה מציג ללקוחה. */
export const CANDIDATE_TARGET = 4;

export interface RenderPlan {
  /** שורות בתוך תמונה אחת. */
  rows: number;
  /** כמה קריאות למודל. */
  calls: number;
  /** מועמדים צפויים — rows × calls. */
  candidates: number;
}

/**
 * מתכנן הרצה: כמה שורות בכל תמונה וכמה תמונות, כדי לקבל `target` מועמדים
 * ולהתקרב כמה שאפשר ליחס שהוזמן.
 */
export function planRender(ratio: number, target: number): RenderPlan {
  let rows = 1;
  for (let r = 2; r <= MAX_ROWS; r++) {
    if (Math.abs(NATURAL_RATIO(r) - ratio) < Math.abs(NATURAL_RATIO(rows) - ratio)) rows = r;
  }
  const calls = Math.max(1, Math.ceil(target / rows));
  return { rows, calls, candidates: rows * calls };
}

export interface Band {
  y0: number;
  y1: number;
}

/**
 * מוצא את פסי המתכת בתמונה: רצפים של שורות פיקסלים שיש בהן כהה.
 * הצל הרך שהמודל מוסיף בהיר מהסף ולכן אינו נספר.
 */
export function findBands(img: RawImage, opts?: { threshold?: number; minCoverage?: number }): Band[] {
  const threshold = opts?.threshold ?? 128;
  const minPixels = Math.max(2, Math.round(img.width * (opts?.minCoverage ?? 0.005)));
  const dark: boolean[] = new Array(img.height);
  for (let y = 0; y < img.height; y++) {
    let n = 0;
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      // luma מקורב; אלפא שקוף נחשב רקע.
      const l = (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000;
      if (img.data[i + 3] > 128 && l < threshold) n++;
      if (n >= minPixels) break;
    }
    dark[y] = n >= minPixels;
  }

  const bands: Band[] = [];
  let start: number | null = null;
  for (let y = 0; y < img.height; y++) {
    if (dark[y] && start === null) start = y;
    if (!dark[y] && start !== null) {
      bands.push({ y0: start, y1: y });
      start = null;
    }
  }
  if (start !== null) bands.push({ y0: start, y1: img.height });

  // פסים שמופרדים ברווח זעיר הם אותו פס שהצל או החלקה קטעו.
  const merged: Band[] = [];
  const minGap = Math.max(4, Math.round(img.height * 0.01));
  for (const b of bands) {
    const last = merged[merged.length - 1];
    if (last && b.y0 - last.y1 < minGap) last.y1 = b.y1;
    else merged.push({ ...b });
  }
  const minHeight = Math.max(4, Math.round(img.height * 0.015));
  return merged.filter((b) => b.y1 - b.y0 >= minHeight);
}

/**
 * חותך רנדר לתמונות מועמד — אחת לכל פס. משאיר שוליים לבנים סביב כל פס, כי
 * הווקטורייזר גוזר את המסגרת מהתיבה החוסמת של המתכת ולא מגודל הקובץ.
 */
export async function splitRender(bytes: Uint8Array): Promise<Uint8Array[]> {
  const img = await decodePng(bytes);
  const bands = findBands(img);
  if (bands.length <= 1) return [bytes];
  const out: Uint8Array[] = [];
  for (const b of bands) {
    const pad = Math.max(4, Math.round((b.y1 - b.y0) * 0.15));
    out.push(await encodePng(cropImage(img, 0, b.y0 - pad, img.width, b.y1 - b.y0 + pad * 2)));
  }
  return out;
}
