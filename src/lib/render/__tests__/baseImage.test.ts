import { describe, it, expect } from "vitest";
import { buildBaseRenderSvg } from "../baseImage";
import { LANDSCAPE, PORTRAIT } from "../canvas";
import { buildRenderPrompt } from "@/lib/llm/imagegen";

const canonical = (inner: string, l = 140, w = 15) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l} ${w}">` +
  `<g id="cutouts">${inner}</g></svg>`;

const CUTS = '<path d="M10 3L30 3L30 12L10 12Z" fill="black"/><path d="M50 3L70 3L70 12L50 12Z" fill="black"/>';

describe("buildBaseRenderSvg", () => {
  it("draws the piece the way a render looks: black metal, openings masked out to white", () => {
    const svg = buildBaseRenderSvg(canonical(CUTS), LANDSCAPE)!;
    expect(svg).toBeTruthy();
    // הפס עצמו — שחור, עם מסכת החיתוכים
    expect(svg).toContain('fill="#111111" mask="url(#cutouts)"');
    // המסכה: לבן = מתכת שנשארת, שחור = החיתוך שנפתח ללבן
    expect(svg).toContain('<rect width="140" height="15" fill="#ffffff"/>');
    expect(svg).toContain('<path d="M10 3L30 3L30 12L10 12Z" fill="#000000"/>');
    expect(svg).toContain('<path d="M50 3L70 3L70 12L50 12Z" fill="#000000"/>');
  });

  it("puts the piece on the render canvas, centred, with white margins", () => {
    const svg = buildBaseRenderSvg(canonical(CUTS), LANDSCAPE)!;
    expect(svg).toContain(`viewBox="0 0 ${LANDSCAPE.widthPx} ${LANDSCAPE.heightPx}"`);
    const scale = Number(/scale\(([\d.]+)\)/.exec(svg)![1]);
    // 140mm על קנבס 1536 עם 90% מילוי
    expect(scale).toBeCloseTo((LANDSCAPE.widthPx * 0.9) / 140, 4);
    const [, tx, ty] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(svg)!;
    expect(Number(tx)).toBeCloseTo(LANDSCAPE.widthPx * 0.05, 1);
    // הפס דק — הוא מרכזי אנכית, עם הרבה לבן מעל ומתחת
    expect(Number(ty)).toBeGreaterThan(LANDSCAPE.heightPx * 0.4);
  });

  // הרגרסיה של הצמיד החתוך: פריט בפס הקנבס-לאורך נערך, הייחוס צויר לרוחב
  // (1536 רוחב) והמודל התבקש לצייר על 1024 — והעתיק פריט רחב לקנבס צר.
  it("draws the reference on the same canvas the model will be asked for — portrait included", () => {
    const svg = buildBaseRenderSvg(canonical(CUTS), PORTRAIT)!;
    expect(svg).toContain(`viewBox="0 0 ${PORTRAIT.widthPx} ${PORTRAIT.heightPx}"`);
    const scale = Number(/scale\(([\d.]+)\)/.exec(svg)![1]);
    // הציר הארוך של הפריט נפרס על 1024 הפיקסלים של רוחב הקנבס, לא על 1536
    expect(scale).toBeCloseTo((PORTRAIT.widthPx * 0.9) / 140, 4);
  });

  it("carries nothing but the path data across to the rasteriser", () => {
    const nasty = canonical('<path d="M1 1L2 2Z" fill="black" onload="x()"/><script>y()</script>');
    const svg = buildBaseRenderSvg(nasty, LANDSCAPE)!;
    expect(svg).toContain('d="M1 1L2 2Z"');
    expect(svg).not.toContain("onload");
    expect(svg).not.toContain("script");
  });

  it("is null when there is nothing to draw from", () => {
    expect(buildBaseRenderSvg(null, LANDSCAPE)).toBeNull();
    expect(buildBaseRenderSvg("", LANDSCAPE)).toBeNull();
    // אין viewBox
    expect(buildBaseRenderSvg('<svg><g id="cutouts"><path d="M0 0Z"/></g></svg>', LANDSCAPE)).toBeNull();
    // אין חיתוכים — פס חלק אינו רפרנס
    expect(buildBaseRenderSvg(canonical(""), LANDSCAPE)).toBeNull();
  });
});

describe("buildRenderPrompt in edit mode", () => {
  const dims = { lengthMm: 140, widthMm: 15, thicknessMm: 1.2 };

  it("anchors the model on the attached piece instead of describing a new one", () => {
    const edit = buildRenderPrompt("לדלל את החיתוכים", "bracelet", dims, 1, true);
    expect(edit).toContain("The attached image is the CURRENT piece");
    expect(edit).toContain("CHANGE REQUEST (apply only this): לדלל את החיתוכים.");
    expect(edit).not.toContain("Design intent for the piece");
  });

  it("leaves the generate path exactly as it was", () => {
    const fresh = buildRenderPrompt("עלים", "bracelet", dims, 1);
    expect(fresh).toContain("Design intent for the piece: עלים.");
    expect(fresh).not.toContain("CURRENT piece");
  });

  it("keeps the constraints the pipeline depends on in both modes", () => {
    for (const p of [
      buildRenderPrompt("x", "bracelet", dims, 1, true),
      buildRenderPrompt("x", "bracelet", dims, 1, false),
    ]) {
      expect(p).toContain("PROPORTIONS");
      expect(p).toContain("MANUFACTURING");
      expect(p).toContain("NO drop shadow");
    }
  });

  // הרפרנס מראה פריט אחד, הפלט מכיל rows — והמודל צריך לדעת גם את זה וגם מה
  // אמור להיבדל בין השורות.
  it("tells the model the attached piece is drawn N times, varying only the change", () => {
    const edit = buildRenderPrompt("לדלל את החיתוכים", "bracelet", dims, 3, true);
    expect(edit).toContain("the attached image shows the piece once");
    expect(edit).toContain("exactly THREE copies of it");
    expect(edit).toContain("THREE different ways of carrying out that one change");
    // "עיצוב אחר" הוא בדיוק מה שעריכה אינה
    expect(edit).not.toContain("a different design");
  });

  it("still asks for N separate designs when generating", () => {
    const fresh = buildRenderPrompt("עלים", "bracelet", dims, 3);
    expect(fresh).toContain("exactly THREE separate pieces");
    expect(fresh).toContain("the same spirit, a different design");
    expect(fresh).not.toContain("attached image");
  });

  it("says nothing about rows at all when there is only one", () => {
    for (const editing of [true, false]) {
      const p = buildRenderPrompt("x", "bracelet", dims, 1, editing);
      expect(p).toContain("Show the whole piece, unclipped");
      expect(p).not.toContain("LAYOUT:");
    }
  });
});

// הצללית. עיצובים חזרו עם שוליים ישרים גם אחרי שהוסרו המילים שכפו מלבן, כי מה
// שנשאר היה אילוצים בניסוח חיובי מול היתרים בניסוח שלילי. הבדיקות כאן נועלות
// את ההפרדה: ביצירה הצללית היא הוראה, בעריכה היא נשמרת.
describe("buildRenderPrompt — הצללית", () => {
  const dims = { lengthMm: 140, widthMm: 15, thicknessMm: 1.5 };

  it("makes the outer edge an instruction, not a permission — when generating", () => {
    const p = buildRenderPrompt("עלים", "bracelet", dims, 1);
    expect(p).toContain("THE OUTER EDGE IS PART OF THE DESIGN");
    // וצמוד לבריף, לא ארבעה משפטים לפניו
    expect(p.indexOf("THE OUTER EDGE")).toBeLessThan(p.indexOf("Design intent for the piece"));
  });

  // ההפך הגמור ממה שעריכה אמורה לעשות: משפט שמזמין לצייר מתאר חדש, מול הוראה
  // לשמר את הקיים.
  it("says nothing of the kind when editing", () => {
    expect(buildRenderPrompt("לדלל", "bracelet", dims, 1, true)).not.toContain("THE OUTER EDGE");
  });

  // הבקשה קודמת, השימור אחריה כסייג. קודם היה הפוך, ולכן "קצה גלי" הגיע אחרי
  // משפט שאוסר לגעת בצללית.
  it("puts the change request before the sentence that preserves the piece", () => {
    const p = buildRenderPrompt("קצה גלי", "bracelet", dims, 1, true);
    expect(p.indexOf("CHANGE REQUEST")).toBeLessThan(p.indexOf("The attached image is the CURRENT piece"));
    // המילה שזזה עם המשפט — היא מצביעה על הבקשה
    expect(p).toContain("what the change request above asks for");
    expect(p).not.toContain("change request below");
  });

  // "cuff" הוא מה ש-strip/band היו לפניו. הוא נשאר במשפט אחד בלבד, זה שבו הוא
  // נושא משמעות ולא צורה.
  it("keeps the band noun out of the object description", () => {
    const p = buildRenderPrompt("עלים", "bracelet", dims, 1);
    expect(p).toContain("a laser-cut matte black metal piece worn around the wrist");
    expect(p.match(/cuff/g)).toHaveLength(1);
    expect(p).toContain("CLOSURE: the cuff is closed by bending it");
  });

  it("lets the ends be shaped, while still refusing fastening hardware", () => {
    for (const product of ["bracelet", "ring"] as const) {
      const p = buildRenderPrompt("עלים", product, dims, 1);
      expect(p).toContain("do not add slots, loops, fastening holes or tabs at either end");
      expect(p).toContain("The ends themselves may be rounded, pointed or shaped as the design asks");
    }
  });

  // 2.25 (minBridgeBend) חל על כל המתכת שנשארת, כלומר גם על הצללית — וכל
  // התחדדות אסורה תחתיו. הוא גם המספר שהוולידציה כבר לא אוכפת.
  it("states the floor validation actually enforces, not the one that was removed", () => {
    const p = buildRenderPrompt("עלים", "bracelet", dims, 1);
    expect(p).toContain("no part of the remaining metal may be thinner than 0.75mm across");
    expect(p).not.toContain("2.25mm across");
  });

  // המדידה חלה על השטח שהפריט תופס, לא על קצותיו: "נמתח מקצה לקצה" הוא מלבן.
  it("spans the width with the bounding box, not with the piece itself", () => {
    expect(buildRenderPrompt("עלים", "bracelet", dims, 3)).toContain(
      "its bounding box spanning almost the full width of the image",
    );
    expect(buildRenderPrompt("עלים", "ring", { lengthMm: 55.5, widthMm: 12, thicknessMm: 1.5 }, 2, false, false, 2))
      .toContain("its bounding box spanning almost the full width of its own column");
  });
});

// הכיתוב מגיע מהפונט כתמונה מצורפת, ולכן ההוראה לשמר אותו נכונה רק כשיש מה
// לשמר. בקריאה בלי תמונה כזו היא מפנה את המודל לקובץ שאינו קיים.
describe("lettering reference", () => {
  const dims = { lengthMm: 140, widthMm: 15, thicknessMm: 1.2 };

  it("stays silent unless a lettering reference is attached", () => {
    expect(buildRenderPrompt("עלים", "bracelet", dims, 3)).not.toContain("LETTERING");
  });

  it("asks for the attached lettering to be copied unchanged", () => {
    const p = buildRenderPrompt("עלים", "bracelet", dims, 1, false, true);
    expect(p).toContain("LETTERING");
    expect(p).toContain("Copy it across unchanged");
    expect(p).toContain("including the small bridges");
  });
});

// משפט ה-LAYOUT הוא מה שקובע כמה פריטים חוזרים בתמונה. עמודה שנייה נוספת לפריט
// קצר, ואז הפריט נפרס על רוחב **העמודה** — שם יושב היחס שהמודל מצייר.
describe("buildRenderPrompt layout", () => {
  const ring = { lengthMm: 55.5, widthMm: 12, thicknessMm: 1.2 };
  const dims = { lengthMm: 140, widthMm: 15, thicknessMm: 1.2 };

  it("says nothing about a layout for a single piece", () => {
    const p = buildRenderPrompt("עלים", "ring", ring, 1, false, false, 1);
    expect(p).not.toContain("LAYOUT");
    expect(p).toContain("Show the whole piece, unclipped");
  });

  it("keeps the measured stack wording when there is one column", () => {
    const p = buildRenderPrompt("עלים", "bracelet", dims, 3);
    expect(p).toContain("exactly THREE separate pieces");
    expect(p).toContain("stacked one above another");
    expect(p).not.toContain("grid of");
  });

  it("asks for a grid, and for the piece to span its column, when there are two", () => {
    const p = buildRenderPrompt("עלים", "ring", ring, 2, false, false, 2);
    expect(p).toContain("exactly FOUR separate pieces");
    expect(p).toContain("grid of TWO evenly spaced horizontal rows by TWO");
    expect(p).toContain("spanning almost the full width of its own column");
    expect(p).toContain("a piece never runs across the full width of the image");
  });

  it("counts the grid's pieces, not its rows, when it says how many copies to edit", () => {
    const p = buildRenderPrompt("לדלל", "ring", ring, 2, true, false, 2);
    expect(p).toContain("exactly FOUR copies of it");
    expect(p).toContain("FOUR different ways of carrying out that one change");
  });
});
