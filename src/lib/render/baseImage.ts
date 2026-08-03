import { svgFrame } from "@/lib/geometry/frame";
import { type Canvas } from "./canvas";

// תמונת הבסיס לעריכה: העיצוב שהלקוחה רואה עכשיו, מצויר בדיוק כמו הדמיה של מודל
// התמונה — מתכת שחורה מט על לבן שטוח — כדי שאפשר יהיה למסור אותו כרפרנס ל-
// images/edits במקום לבקש עיצוב חדש מאפס.
//
// למה לא ה-PNG ששמור ב-storage: renderPngPath הוא ההדמיה *הראשונה* של ההרצה,
// והיא מכילה עד שש וריאציות מוערמות זו מעל זו. הגרסה שנשמרה עשויה להגיע מקריאה
// אחרת לגמרי, כך שהתמונה השמורה לא בהכרח מכילה את הפריט שהלקוחה מסתכלת עליו.
// ה-SVG הקנוני של הגרסה, לעומת זאת, *הוא* הפריט — כולל בחירת מועמד ושחזור גרסה.
//
// היפוך: ב-SVG הקנוני החיתוכים הם המסלולים השחורים; בהדמיה המתכת היא השחורה
// והחיתוכים הם הרקע הלבן שנראה מבעדם. לכן החיתוכים נכנסים כמסכה על פס מלא.

/** כמה מהקנבס הפריט תופס. שוליים לבנים נדיבים, כמו בהדמיה אמיתית. */
const FILL = 0.9;

const CUTOUTS_G = /<g id="cutouts"[^>]*>([\s\S]*?)<\/g>/;
const PATH_D = /<path\b[^>]*\bd="([^"]*)"/g;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** רק ה-`d` של שכבת ה-cutouts עובר הלאה — שום דבר אחר מה-SVG השמור לא מגיע
 *  לרסטרייזר. */
function cutoutPathData(svg: string): string[] {
  const inner = CUTOUTS_G.exec(svg)?.[1] ?? "";
  return [...inner.matchAll(PATH_D)].map((m) => m[1]).filter((d) => d.trim().length > 0);
}

/**
 * בונה SVG לרסטור על הקופסה: פס מתכת שחור עם החיתוכים פתוחים ללבן, ממורכז על
 * קנבס לבן ביחס ההדמיה. מחזיר null אם אין מה לצייר — ואז העריכה נופלת חזרה
 * ליצירה רגילה במקום למסור למודל תמונה ריקה.
 *
 * לקנבס אין ברירת מחדל בכוונה: הוא חייב להיות **אותו** קנבס שנשלח למודל
 * באותה קריאה. ברירת מחדל לרוחב היא איך שעריכה של פריט בפס הקנבס-לאורך
 * (lib/render/canvas.ts) שלחה ייחוס רחב מול קנבס צר — והמודל החזיר פריט
 * חתוך בקצוות.
 */
export function buildBaseRenderSvg(
  canonicalSvg: string | null | undefined,
  canvas: Canvas,
): string | null {
  if (!canonicalSvg) return null;
  const frame = svgFrame(canonicalSvg);
  if (!frame) return null;
  const ds = cutoutPathData(canonicalSvg);
  if (ds.length === 0) return null;

  const { widthPx: cw, heightPx: ch } = canvas;
  const scale = Math.min((cw * FILL) / frame.lengthMm, (ch * FILL) / frame.widthMm);
  const x = (cw - frame.lengthMm * scale) / 2;
  const y = (ch - frame.widthMm * scale) / 2;
  const l = r2(frame.lengthMm);
  const w = r2(frame.widthMm);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" viewBox="0 0 ${cw} ${ch}">` +
    `<rect width="${cw}" height="${ch}" fill="#ffffff"/>` +
    `<defs><mask id="cutouts" maskUnits="userSpaceOnUse" x="0" y="0" width="${l}" height="${w}">` +
    `<rect width="${l}" height="${w}" fill="#ffffff"/>` +
    ds.map((d) => `<path d="${d}" fill="#000000"/>`).join("") +
    `</mask></defs>` +
    `<g transform="translate(${r2(x)} ${r2(y)}) scale(${r6(scale)})">` +
    `<rect width="${l}" height="${w}" fill="#111111" mask="url(#cutouts)"/>` +
    `</g></svg>`
  );
}
