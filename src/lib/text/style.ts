import { FACES, DEFAULT_FONT, type FontId } from "./fonts";

// טיפוגרפיה שנגזרת מהבריף — **בלי מודל נוסף**.
//
// הבחירה היא התאמת מחרוזות מול טבלה קבועה. זה נראה פרימיטיבי מול קריאה
// למודל, ובדיוק בגלל זה הוא נבחר: התוצאה דטרמיניסטית (אותו בריף → אותה
// טיפוגרפיה, תמיד), לא עולה כלום, לא נכשלת, ולא מוסיפה עוד מקום שבו בקשת
// הלקוחה יכולה להשתנות בדרך. הכיתוב הוא הדבר היחיד בצינור שחייב לצאת בדיוק
// כפי שהוזמן; לא נכניס אליו אי-ודאות כדי לבחור פונט.
//
// התאמה בעברית עובדת יפה עם גזעים: תחיליות (ו/ה/ב/ל/מ/ש/כ) וסופיות נטייה
// נשארות מסביב לגזע, כך ש-"ורומנטית" ו-"רומנטי" נתפסים באותו מפתח.

export interface LetteringStyle {
  fontId: FontId;
  /** מרווח בין־אותי כשבריר מגובה האות. */
  trackingEm: number;
  /** גובה האות כשבריר מרוחב הפס. */
  heightRatio: number;
}

const BASE: Omit<LetteringStyle, "fontId"> = { trackingEm: 0, heightRatio: 0.5 };

/** הסדר הוא סדר ההכרעה בתיקו — הראשון שמתאים גובר. */
const TABLE: Array<{ style: LetteringStyle; words: string[] }> = [
  {
    style: { fontId: "delicate", trackingEm: 0.08, heightRatio: 0.55 },
    words: ["עדין", "רומנטי", "פרחוני", "נשי", "כלה", "פרפר", "רך", "אוורירי", "חלומי"],
  },
  {
    style: { fontId: "script", trackingEm: 0, heightRatio: 0.55 },
    words: ["כתב יד", "חתימה", "אישי", "זורם", "אורגני", "טבעי", "חופשי"],
  },
  {
    style: { fontId: "serif", trackingEm: 0.02, heightRatio: 0.5 },
    words: ["קלאסי", "יוקרתי", "חגיגי", "אלגנטי", "מלכותי", "וינטג", "עתיק", "מסורתי", "תנכי"],
  },
  {
    style: { fontId: "sans", trackingEm: 0.04, heightRatio: 0.45 },
    words: ["מודרני", "נקי", "מינימל", "גיאומטרי", "קווי", "ישר", "טכני", "עכשווי"],
  },
  {
    style: { fontId: "round", trackingEm: 0, heightRatio: 0.5 },
    words: ["כיפי", "ילדותי", "שובב", "חמוד", "צעיר", "משחקי", "מעוגל", "רכות"],
  },
  {
    style: { fontId: "display", trackingEm: -0.02, heightRatio: 0.55 },
    words: ["חזק", "בולט", "מאסיבי", "נועז", "דרמטי", "כבד", "עוצמ", "גדול"],
  },
];

/** ברירת המחדל — הפונט והפרמטרים שאיתם רצו כל הניסויים. */
export const DEFAULT_STYLE: LetteringStyle = { ...BASE, fontId: DEFAULT_FONT };

const normalize = (s: string) =>
  s.toLowerCase().replace(/[֑-ׇ]/g, "").replace(/["'׳״]/g, "");

/**
 * הטיפוגרפיה שהבריף מבקש. בלי התאמה — ברירת המחדל, ולא ניחוש: לקוחה שכתבה
 * "צמיד עם השם שלי" לא ביקשה שום אופי טיפוגרפי, וכל בחירה שאינה הניטרלית
 * היא פרשנות שלנו.
 */
export function styleForBrief(brief: string): LetteringStyle {
  const text = normalize(brief);
  if (!text.trim()) return DEFAULT_STYLE;
  let best: { style: LetteringStyle; hits: number } | null = null;
  for (const entry of TABLE) {
    const hits = entry.words.filter((w) => text.includes(w)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { style: entry.style, hits };
  }
  return best?.style ?? DEFAULT_STYLE;
}

/**
 * כל הטיפוגרפיות, בסדר ההעדפה שהבריף מכתיב.
 *
 * הצינור ממילא מחזיר `rows` מועמדים שהלקוחה בוחרת ביניהם (lib/render/panels.ts),
 * והם היו עד היום זהים בכיתוב. כאן כל שורה מקבלת פנים אחרות: מה שהבריף ביקש
 * ראשון, ואחריו משלימים מרוחקים ממנו באופי. הלקוחה רואה כמה טיפוגרפיות
 * ובוחרת — וזה מגוון **בלי** שאף אחד יצטרך לנחש נכון, ובלי קריאה נוספת
 * למודל: כל השורות יושבות באותה תמונת ייחוס אחת.
 *
 * הרשימה מוחזרת שלמה ולא חתוכה ל-`rows`, כי לא כל פנים נכנסות לכל פס והקורא
 * לוקח את הראשונות שהצליחו.
 */
export function stylesForBrief(brief: string): LetteringStyle[] {
  const first = styleForBrief(brief);
  // סדר ההשלמה נבחר להיות מנוגד: אחרי כל פנים באות הפנים הרחוקות ממנה
  // באופי, כדי ששלוש החלופות לא ייראו כמו אותה טיפוגרפיה שלוש פעמים.
  const rest: LetteringStyle[] = ([
    { ...BASE, fontId: "secular" },
    { ...BASE, fontId: "serif", trackingEm: 0.02 },
    { ...BASE, fontId: "sans", trackingEm: 0.04, heightRatio: 0.45 },
    { ...BASE, fontId: "display", trackingEm: -0.02, heightRatio: 0.55 },
    { ...BASE, fontId: "round" },
    { ...BASE, fontId: "script", heightRatio: 0.55 },
    { ...BASE, fontId: "delicate", trackingEm: 0.08, heightRatio: 0.55 },
    { ...BASE, fontId: "condensed", heightRatio: 0.55 },
  ] as LetteringStyle[]).filter((s) => s.fontId !== first.fontId);

  return [first, ...rest];
}

/** שם הפנים לתצוגה — ליומן ולבק־אופיס. */
export const styleLabel = (s: LetteringStyle): string => FACES[s.fontId].label;
