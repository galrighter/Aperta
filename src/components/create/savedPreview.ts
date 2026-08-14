/**
 * מסגרת הציור של כרטיס ב"העיצובים שלי".
 *
 * הכרטיס צייר עד היום בתוך `viewBox` שנבנה מהמידות **שהוזמנו** (`lengthMm`
 * מהרשומה, `widthMm` מהטופס), בזמן שה-path עצמו חי במסגרת שהגרסה באמת יושבת
 * בה — זו שנקראת מה-viewBox של ה-SVG בשרת (`lib/designPreview`). כששתיהן
 * נבדלות, וזה המצב הרגיל ולא החריג, החלק של הפריט שנופל מחוץ למסגרת פשוט
 * נחתך: שורש ה-SVG גוזם את מה שמחוץ ל-viewBox. זה מה שנראה על המסך — קטע
 * מוגדל של קו אחד במקום התכשיט.
 *
 * לכן המסגרת נלקחת מהאיחוד: המלבן שהוזמן **ועוד** תיבת החוסמת של הציור עצמו.
 * מה שקיים בציור תמיד נכנס, גם ברשומה ישנה שנשמרה לפני התיקון ושהמידות שלה
 * לא תואמות לה.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const NUM = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi;

/**
 * התיבה החוסמת של path.
 *
 * הסריקה מזווגת מספרים, וזה נכון כי המקור היחיד לציורים האלה הוא
 * `mpToPreviewPath` — פוליגונים ב-M/L/Z בלבד, שכל הארגומנטים שלהם הם זוגות
 * קואורדינטות. `null` על מחרוזת שאין בה זוג אחד שלם.
 */
export function pathBounds(d: string): Box | null {
  const nums = d.match(NUM);
  if (!nums || nums.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i]);
    const y = Number(nums[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** שוליים במ"מ סביב המסגרת, כדי שקו המתאר לא יישב על הקצה. */
const PAD = 1;

export interface PreviewFrame {
  /** מה שנכנס ל-`viewBox` של הכרטיס. */
  viewBox: string;
  /** יחס רוחב/גובה של המסגרת — הכרטיס גוזר ממנו את גובה התיבה. */
  ratio: number;
}

/**
 * ה-`viewBox` שמכיל גם את המלבן שהוזמן וגם את הציור כולו.
 *
 * `lengthMm`/`widthMm` הן המסגרת המוצהרת של הרשומה; הן נשמרות בתוך התוצאה גם
 * כשהציור קטן מהן, אחרת פריט עם חיתוך אחד בקצה היה נראה כאילו הוא נגמר שם.
 */
export function previewFrame(path: string, lengthMm: number, widthMm: number): PreviewFrame {
  const b = pathBounds(path);
  const minX = Math.min(0, b?.x ?? 0);
  const minY = Math.min(0, b?.y ?? 0);
  const maxX = Math.max(lengthMm > 0 ? lengthMm : 0, b ? b.x + b.w : 0);
  const maxY = Math.max(widthMm > 0 ? widthMm : 0, b ? b.y + b.h : 0);
  const w = maxX - minX + PAD * 2;
  const h = maxY - minY + PAD * 2;
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    viewBox: `${r(minX - PAD)} ${r(minY - PAD)} ${r(w)} ${r(h)}`,
    ratio: h > 0 ? w / h : 1,
  };
}
