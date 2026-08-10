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
 * מותח cutouts SVG למסגרת יעד.
 *
 * הפקודות הנתמכות הן אלה שכל הארגומנטים שלהן הם זוגות קואורדינטות —
 * M/L/C/Q/S/T (וגם היחסיות: הזזה יחסית נמתחת באותם מקדמים, כי המתיחה
 * ליניארית סביב הראשית) — ושם ההמרה היא הכפלה של כל זוג. עקומת בזייה נמתחת
 * **במדויק** דרך נקודות הבקרה שלה: בזייה שקופה לטרנספורמציה אפינית.
 *
 * עד 10.8 נתמכו M/L/Z בלבד — הנחה שהייתה נכונה עד שהווקטורייזר עבר להתאמת
 * עקומות (#198) והתחיל לפלוט `C`. כל יצירה נפלה אז על השורה למטה עם
 * `internal · 500`, שלוש שעות אחרי המיזוג.
 *
 * H/V/A עדיין זורקות ולא מנוסות להתפרש: ל-H/V ארגומנט בודד שהסורק הזוגי היה
 * קורא לא נכון, וקשת (A) אינה נמתחת דרך המספרים שלה במתיחה לא-אחידה.
 * הגאומטריה הזו נחתכת במתכת, ופרשנות שגויה היא פריט פגום ולא באג ויזואלי.
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
      if (!["M", "L", "Z", "C", "Q", "S", "T"].includes(cmd)) {
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
