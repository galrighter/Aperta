// המסגרת של עיצוב — האורך והרוחב במ"מ — נקראת מה-viewBox של ה-SVG הקנוני.
//
// זהו מקור האמת היחיד למידות שנחתכות בפועל: הרשומה של העיצוב שומרת את מה
// שהלקוחה הזמינה, וה-SVG שומר את המסגרת שהגרסה הזו באמת יושבת בה. השתיים
// חופפות באורך תמיד, ועשויות להיבדל ברוחב עד כדי הסטייה המותרת.
// חסר תלויות בכוונה: גם השרת וגם הדפדפן משתמשים בו.

export interface DesignFrame {
  lengthMm: number;
  widthMm: number;
}

const VIEWBOX = /viewBox\s*=\s*"([^"]+)"/;

/** קורא את מסגרת ה-SVG. null אם אין viewBox תקין. */
export function svgFrame(svg: string | null | undefined): DesignFrame | null {
  if (!svg) return null;
  const m = VIEWBOX.exec(svg);
  if (!m) return null;
  const parts = m[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [, , w, h] = parts;
  if (w <= 0 || h <= 0) return null;
  return { lengthMm: w, widthMm: h };
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * מותח cutouts SVG למסגרת יעד. ה-vectorizer פולט `M`/`L`/`C`/`Z` בקואורדינטות
 * מוחלטות (`vectorizer/app/core/svg_builder.py`), ולכן ההמרה היא הכפלה של כל
 * זוג מספרים — גם נקודות עיגון וגם ידיות של עקומה קובית.
 *
 * **למה `C` מותרת, ולמה זה לא ויתור על הכלל.** מתיחה לא-אחידה של בזייה קובית
 * היא הפעלת אותה טרנספורמציה אפינית על ארבע נקודות הבקרה שלה, והעקומה שיוצאת
 * היא **בדיוק** המתיחה של העקומה שנכנסה — לא קירוב שלה. אין כאן שום פרשנות
 * שהיא עלולה לטעות בה.
 *
 * כל פקודה אחרת עדיין זורקת: `H`/`V` נושאות מספר בודד ולא זוג, ו-`A` נושאת
 * רדיוסים ודגלים שאינם קואורדינטות כלל — הכפלה עיוורת שלהם היא פריט פגום ולא
 * באג ויזואלי.
 *
 * **מה שנשבר בלי זה.** ב-10.8.26 החל ה-vectorizer להתאים עקומות במקום לפלוט
 * פוליגון (#198). מאותו רגע כל יצירה מתה כאן, אחרי שכבר שולם עליה — הרנדר רץ,
 * המעקב הצליח, והלקוחה קיבלה "משהו השתבש" (AP-0096, AP-0097; ארבע הרצות, כולן
 * `unsupported path command "C"`). המסגור הוא גם השלב שמריץ ולידציה ומחזיר
 * גשרים, ולכן נפילה כאן פירושה שגם שום מועמד לא נבדק ושום גשר לא הוחזר.
 */
export function rescaleCutoutsSvg(svg: string, to: DesignFrame): string {
  const from = svgFrame(svg);
  if (!from) throw new Error("cutouts SVG has no usable viewBox");
  const sx = to.lengthMm / from.lengthMm;
  const sy = to.widthMm / from.widthMm;
  if (Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9) return svg;

  const scaled = svg.replace(/\sd\s*=\s*"([^"]*)"/g, (_full, d: string) => ` d="${scalePath(d, sx, sy)}"`);
  return scaled.replace(VIEWBOX, `viewBox="0 0 ${round4(to.lengthMm)} ${round4(to.widthMm)}"`);
}

function scalePath(d: string, sx: number, sy: number): string {
  const tokens = d.match(/[A-Za-z]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? [];
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      const cmd = t.toUpperCase();
      if (cmd !== "M" && cmd !== "L" && cmd !== "C" && cmd !== "Z") {
        throw new Error(`rescaleCutoutsSvg: unsupported path command "${t}"`);
      }
      out.push(t);
      continue;
    }
    const y = tokens[i + 1];
    if (y === undefined || /^[A-Za-z]$/.test(y)) {
      throw new Error("rescaleCutoutsSvg: path coordinate without a pair");
    }
    i++;
    out.push(`${round4(Number(t) * sx)} ${round4(Number(y) * sy)}`);
  }
  // הרווחים סביב אותיות הפקודה מיותרים; ה-SVG הקנוני נכתב בלעדיהם.
  return out.join(" ").replace(/\s*([A-Za-z])\s*/g, "$1").trim();
}
