"use client";

/**
 * תמונת השיתוף: ההדמיה למעלה, הפריסה מתחתיה — תמונה אחת.
 *
 * **למה.** ההדמיה המעורגלת היא מה שמוכר את הפריט, אבל היא גם מתכת מבריקה על
 * גליל: בעיצובים מסוימים הברק והעיקול בולעים בדיוק את מה ששותפו — הגרפיקה
 * (גל, 2.8: "בגלל הצורה והברק לא בכל עיצוב ניתן לראות את הגרפיקה"). הפריסה
 * השטוחה מראה את אותה גרפיקה ישר ובניגודיות מלאה, והיא כבר קיימת בדף השיתוף
 * כלשונית שנייה — אבל מי שרואה את הלינק בוואטסאפ רואה **רק** את התמונה, ולא
 * לוחץ כדי לבדוק אם יש עוד מצב תצוגה.
 *
 * לכן ההרכבה נעשית כאן, בדפדפן, ברגע השיתוף: אין ספריית תמונות ב-Worker, וגם
 * לו הייתה — ההדמיה עצמה נולדת רק כאן, כצילום של הקנבס.
 *
 * הפריסה מצוירת מה-SVG של הגרסה דרך `Image` עם data URL, כלומר אותו ציור בדיוק
 * שהאתר מראה (`RolledPreview`) ולא ציור שני שיסטה ממנו בגוון או בעיגול. data
 * URL אינו "מזהם" קנבס, ולכן `toDataURL` אחריו עדיין מותר.
 */

/** מה שדרוש כדי לצייר את הפריסה: תוכן שכבת ה-cutouts ומסגרת הגרסה במ"מ. */
export interface FlatSource {
  cutouts: string;
  lengthMm: number;
  widthMm: number;
}

/** גודל תמונת השיתוף. 1200x630 הוא היחס שזחלני התצוגה המקדימה פורסים לפיו. */
const W = 1200;
const H = 630;
/** רקע הפורצלן — אותו גוון שהקנבס מצייר בו את הצילום (`Preview3D`), כדי
 *  שההדמיה תתמזג בתוך התמונה במקום לשבת עליה כמלבן. */
const BG = "#f4f1eb";
const PAD = 40;
/** אוויר מעל ומתחת לפריסה בתוך הרצועה שלה. */
const BAND_PAD = 24;
const BAND_MIN = 140;
const BAND_MAX = 260;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}

/**
 * הפריסה כ-SVG עצמאי — אותם גרדיאנטים ואותה מסכה כמו ב-`RolledPreview`.
 *
 * המסכה היא מה שהופך את החיתוכים לחורים אמיתיים: לבן = מתכת, שחור = מוסר.
 * ה-cutouts של ה-SVG הקנוני נושאים `fill="black"` משלהם, וזה בדיוק מה שנדרש.
 */
export function flatSvg(flat: FlatSource, width: number, height: number): string {
  const { cutouts, lengthMm, widthMm } = flat;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${lengthMm} ${widthMm}">` +
    `<defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="#9C7C2C"/><stop offset="18%" stop-color="#C9A34E"/>` +
    `<stop offset="42%" stop-color="#F0DA9A"/><stop offset="64%" stop-color="#E4C877"/>` +
    `<stop offset="100%" stop-color="#9C7C2C"/></linearGradient>` +
    `<linearGradient id="s" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0%" stop-color="#000" stop-opacity="0.22"/>` +
    `<stop offset="26%" stop-color="#fff" stop-opacity="0.16"/>` +
    `<stop offset="72%" stop-color="#fff" stop-opacity="0.04"/>` +
    `<stop offset="100%" stop-color="#000" stop-opacity="0.22"/></linearGradient>` +
    `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${lengthMm}" height="${widthMm}">` +
    `<rect x="0" y="0" width="${lengthMm}" height="${widthMm}" fill="#fff"/>` +
    `<g fill="#000" stroke="none">${cutouts}</g></mask>` +
    `</defs>` +
    `<g mask="url(#m)">` +
    `<rect x="0" y="0" width="${lengthMm}" height="${widthMm}" fill="url(#g)"/>` +
    `<rect x="0" y="0" width="${lengthMm}" height="${widthMm}" fill="url(#s)"/>` +
    `</g></svg>`
  );
}

/** גובה הרצועה התחתונה: כמה שהפריסה צריכה ברוחב המלא, בתוך גבולות שפויים. */
export function bandHeight(flat: FlatSource): number {
  const natural = ((W - 2 * PAD) * flat.widthMm) / flat.lengthMm;
  return Math.min(BAND_MAX, Math.max(BAND_MIN, Math.round(natural) + 2 * BAND_PAD));
}

/** ציור בתוך תיבה, בלי לעוות ובלי לחתוך — הצורה שולטת, לא התיבה. */
function contain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  boxW: number,
  boxH: number,
) {
  const scale = Math.min(boxW / img.width, boxH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, x + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
}

/**
 * מרכיב את תמונת השיתוף. מחזיר data URL של JPEG, או את ההדמיה כמו שהיא כשאין
 * ממה להרכיב — ובשני המקרים `null` אינו שגיאה אלא "אין תמונה", בדיוק כמו קודם:
 * השרת נופל אז להדמיה של מודל התמונה.
 */
export async function composeShareImage(
  render: string | null,
  flat: FlatSource | null,
): Promise<string | null> {
  if (!flat?.cutouts || !(flat.lengthMm > 0) || !(flat.widthMm > 0)) return render;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return render;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    const band = bandHeight(flat);
    // בלי הדמיה (טאב הפריסה בסטודיו, דפדפן בלי WebGL) הפריסה מקבלת את הבמה
    // כולה. זה עדיין מה ששותף, ועדיין עדיף על ההדמיה של מודל התמונה — היא
    // הקלט לצינור ולא הפריט.
    const top = render ? H - band : 0;
    const bandTop = render ? top : 0;
    const bandH = render ? band : H;

    if (render) {
      const shot = await loadImage(render);
      contain(ctx, shot, 0, 0, W, top);
      ctx.fillStyle = "rgba(32,35,38,0.12)";
      ctx.fillRect(PAD, top, W - 2 * PAD, 1);
    }

    const boxW = W - 2 * PAD;
    const boxH = bandH - 2 * BAND_PAD;
    // מידות ה-SVG נקבעות מראש לפי התיבה, כדי שהרסטור ייצא בחדות של היעד ולא
    // ימתח תמונה קטנה.
    const scale = Math.min(boxW / flat.lengthMm, boxH / flat.widthMm);
    const drawW = Math.round(flat.lengthMm * scale);
    const drawH = Math.round(flat.widthMm * scale);
    const strip = await loadImage(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(flatSvg(flat, drawW, drawH))}`,
    );
    ctx.drawImage(strip, (W - drawW) / 2, bandTop + (bandH - drawH) / 2, drawW, drawH);

    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    // הרכבה שנכשלה לא אמורה לבטל שיתוף. חוזרים למה שהיה עד היום.
    return render;
  }
}
