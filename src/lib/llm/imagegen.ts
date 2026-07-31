import { FAB, resolveFab } from "@/lib/fabrication.config";

// הפרומפט שנשלח למודל התמונה.
//
// **הקריאה עצמה כבר לא כאן.** ה-Worker בונה את הטקסט; מי שמדבר עם OpenAI הוא
// שירות הרנדר בקופסה (src/lib/render/service.ts → vectorizer). עד 30.7 ישבה
// כאן גם `generateRenderPng`, שהקורא היחיד שלה היה מסלול ההרצה של הבק־אופיס —
// הצינור השני שנמחק. עם מחיקתו ה-Worker הפסיק להחזיק לקוח של מודל תמונה בכלל,
// כלומר מקום אחד פחות שמחזיק מפתח שעולה כסף.
//
// עלות (הפרמטר היקר ביותר בצינור — נשמר כאן במספרים כדי שלא ייעלם):
//   gpt-image-1-mini · low  · 1536x1024  ≈ $0.006 לקריאה  ← מה שרץ
//   gpt-image-1-mini · high · 1536x1024  ≈ $0.05
//   gpt-image-1      · high · 1536x1024  ≈ $0.25          ← מה שהיה עד 26.7
// ומאז 30.7 יש בדיוק קריאה אחת להרצה, גם ביצירה וגם בעריכה — ראה panels.ts.

/**
 * מודל התמונה להרצה שנושאת כיתוב.
 *
 * ברירת המחדל של הצינור היא `gpt-image-1-mini`, והיא נשארת כך לכל השאר: היא
 * זולה (~$0.006 להדמיה) ומספיקה לעיטור. אבל מול תמונת ייחוס עם כיתוב היא
 * כותבת טקסט משלה — שגוי **וארוך יותר** — וכמה מהאותיות שלה נוחתות מחוץ
 * למלבן שההחתמה מפנה ונשארות כשאריות צמודות לכיתוב. `gpt-image-2` מעתיק את
 * הכיתוב ברוחב שלנו ולא משאיר כלום.
 *
 * הפרש מדוד (31/07, אותה תמונת ייחוס ואותו פרומפט, ארבע שורות):
 * `gpt-image-1-mini` 0/4 שורות נכונות, `gpt-image-2` 4/4. אחרי ההחתמה שניהם
 * מאייתים נכון — ההבדל הוא במה שנשאר מסביב.
 *
 * ההחלטה כאן ולא בקופסה: הקופסה מריצה, forme מחליטה. הרשימה המותרת נאכפת שם
 * (`imagegen.ALLOWED_MODELS`).
 */
export const LETTERING_MODEL = "gpt-image-2";

export type RenderProductType = "bracelet" | "ring";

/** מידות הפס השטוח שההדמיה מתארת. הן קובעות את הפרופורציה ואת המינימומים. */
export interface RenderDims {
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
/** מינימומי הייצור נגזרים באינטרפולציה, ולכן יוצאים כ-1.7999999999999998. שתי
 *  ספרות שומרות על 2.25 האמיתי ומנקות את הרעש — מספר כזה בפרומפט הוא רעש למודל
 *  ושורה שבורה ביומן. הערך עצמו, זה שהוולידציה עובדת מולו, לא נוגעים בו. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** מודל התמונה מציית למילה טוב יותר מלספרה כשמדובר בכמות. */
const WORD: Record<number, string> = { 2: "TWO", 3: "THREE", 4: "FOUR", 5: "FIVE", 6: "SIX" };

/**
 * פרומפט מכוון: רנדר שטוח, top-down, פליז חם על רקע לבן — קלט אידיאלי ל-vectorizer.
 *
 * שלוש קבוצות אילוצים, ובכוונה רק שלוש:
 *  1. פרופורציה — הווקטורייזר גוזר את אורך הפס מיחס הצדדים של הרנדר, ולכן
 *     היחס הוא נתון ייצור ולא טעם. בלי אמירה מפורשת המודל מצייר פס עבה מדי
 *     (נמדד: בקשה ל-140 מ"מ חזרה כ-81).
 *  2. ייצור — חיתוך לייזר מגיליון אחד: כל המתכת חייבת להישאר מחוברת, ואי אפשר
 *     לחתוך מתחת למינימומים של resolveFab().
 *  3. רנדור — מה שהווקטורייזר צריך כדי להפריד מתכת מרקע: מתכת שחורה מט על לבן
 *     שטוח, בלי צללים. שחור-על-לבן הוא ההפרדה הגדולה ביותר שיש, ולכן הצינור
 *     עובר ל-color_key="dark" (255 פחות גווני האפור) במקום "warm" (R פחות B,
 *     שעל מתכת שחורה מחזיר אפס).
 * מה שאינו אחד מהשלושה הוא החלטת עיצוב ושייך ללקוחה, לא לפרומפט.
 *
 * ומה שבכוונה *לא* נאמר כאן: הצללית. הפרומפט קרא למוצר "strip" שמונה פעמים,
 * ביקש לצייר "exactly that proportion", ותיאר את בקשת הלקוחה כ"design intent
 * for the cut-out pattern" — שלושתם אומרים "מלבן עם חורים", ומשפט היתר היחיד
 * ("the outline can wave, taper or be scalloped") לא שרד מולם. שם עצם חוזר
 * גובר על היתר חד-פעמי, ולכן המילה הוסרה במקום להוסיף עוד הנחיה: הפרופורציה
 * מדברת על ה-bounding box, והבריף הוא לפריט כולו — הצללית בכלל זה.
 * הרישום המלא: docs/REMOVED_CONSTRAINTS.md.
 *
 * במצב `editing` הפרומפט מדבר על התמונה המצורפת ("שנה רק את X") במקום לתאר פריט
 * חדש. בלי זה בקשת שינוי הגיעה למודל כתיאור עצמאי על קנבס ריק, והתשובה הייתה
 * צמיד אחר לגמרי — הקלט שהעריכה אמורה לשמר לא הגיע אליו מעולם.
 *
 * גם משפט ה-LAYOUT משתנה איתו: הרפרנס מראה פריט אחד, הפלט מכיל `rows`, ומה
 * שנבדל בין השורות הוא איך השינוי מיושם — לא איזה עיצוב זה. השורות עצמן נשארות
 * מה שהן ביצירה: הידית על יחס הצדדים, וגם החלופות שהלקוחה בוחרת מהן (panels.ts).
 */
export function buildRenderPrompt(
  userPrompt: string,
  productType: RenderProductType = "bracelet",
  dims?: RenderDims,
  /** כמה פסים בתמונה אחת. ראה src/lib/render/panels.ts — צורת הקנבס היא
   *  הידית האמיתית על יחס הצדדים, והשורות הן גם מועמדים לבחירת הלקוחה. */
  rows = 1,
  /** עריכה: לתמונה מצורף העיצוב הקיים, ו-userPrompt הוא בקשת שינוי עליו ולא
   *  תיאור של פריט חדש. ראה src/lib/render/baseImage.ts. */
  editing = false,
  /** לתמונה מצורף כיתוב שכבר נחתך בפס מהפונט שלנו, והמודל רק מעצב סביבו.
   *  ברירת המחדל היא false, כי בלי תמונה כזו אין למודל "כיתוב מצורף" לשמר —
   *  והפרומפט שמדבר על תמונה שאינה שם הוא הזיה שהוא ימלא בעצמו. */
  letteringReference = false,
): string {
  const product = FAB.products[productType];
  const d: RenderDims = dims ?? {
    lengthMm: product.defaultLengthMm,
    widthMm: product.defaultWidthMm,
    thicknessMm: FAB.defaultThicknessMm,
  };
  const fab = resolveFab(d.thicknessMm, productType);
  const ratio = round1(d.lengthMm / d.widthMm);
  // מה שהשורות *הן* תלוי במסלול, ורק המשפט האחרון משתנה. ביצירה כל שורה היא
  // עיצוב אחר באותה רוח; בעריכה כולן אותו פריט, ומה שנבדל ביניהן הוא איך השינוי
  // המבוקש מיושם. בלי ההבחנה הזו הפרומפט סתר את עצמו: "כל שורה היא עיצוב אחר"
  // מול "שמור על הפריט המצורף בדיוק כפי שהוא".
  const word = WORD[rows] ?? rows;
  const rowsAre = editing
    ? `Every row is the attached piece with the change request (below) applied — the same piece each time, ` +
      `${word} different ways of carrying out that one change, and nothing else about it altered.`
    : "Each row is a different variation of the same design intent: the same spirit, a different design.";
  const layout =
    rows <= 1
      ? " Show the whole piece, unclipped, with plain white all around it."
      : (editing
          ? ` LAYOUT: the attached image shows the piece once; this image contains exactly ${word} copies of it, `
          : ` LAYOUT: the image contains exactly ${word} separate pieces, `) +
        `stacked one above another as ${word} evenly spaced horizontal rows, with plain white space between them ` +
        "and no line, frame, divider or caption of any kind. Each row is a complete piece on its own, taking up the " +
        "same overall extent as above, spanning almost the full width of the image with a thin white margin at each " +
        `end. ${rowsAre} Show every piece whole and unclipped.`;

  const object =
    productType === "ring"
      ? "a laser-cut matte black metal ring, opened out and lying completely flat (this is the flat blank that gets rolled into a ring)"
      : "a laser-cut matte black metal bracelet cuff, opened out and lying completely flat";

  // הפריט נסגר בכיפוף, ואין לו אבזם. בלי המשפט הזה המודל הוסיף לשני הקצוות
  // חריצים, לולאות ולשוניות — בכל הרצה, בכל שם, בשתי הפולריות. "צמיד שטוח
  // לחיתוך" הוא מחלקת תמונות שכמעט תמיד יש בה סגירה, והוא השלים אותה. החריצים
  // אוכלים בדיוק את הקצוות שבהם endMargin דורש מתכת מלאה, והווקטורייזר מתרגם
  // אותם לחורים אמיתיים ב-DXF.
  const closure =
    productType === "ring"
      ? "CLOSURE: the band is rolled into a ring and has no clasp or fastening — do not add slots, loops, fastening holes or tabs at either end."
      : "CLOSURE: the cuff is closed by bending it around the wrist and has no buckle or fastening — do not add slots, loops, fastening holes or tabs at either end.";

  // הכיתוב מגיע מהפונט, לא מהמודל — הוא כבר חתוך בתמונה המצורפת, וכל מה שנדרש
  // כאן הוא שהמודל לא יגע בו. אין מסלול שבו המודל מצייר אותיות בעצמו.
  //
  // המשפט על הצורה הלא-מוכרת מכוון לרפלקס שכן נמדד: המודל "מתקן" קלט שנראה לו
  // שגוי — appologize חזר כ-APOLOGIZE בכל הרצה. הסמ״ך המגושרת היא הגליף שהכי
  // חשוף לזה, כי אין לה מקבילה בשום פונט. עד כה היא שרדה בכל ההרצות, גם בגרסה
  // מקוצרת של ההוראה, ולכן המשפט הזה הוא ביטוח ולא תיקון של כשל שנמדד.
  const lettering = !letteringReference ? null :
    "LETTERING: the attached image already carries the lettering, cut into the piece. " +
    "Copy it across unchanged — the same glyphs in the same places, including the small bridges that hold the enclosed parts of letters in place. " +
    "Do not redraw, restyle or move a letter, and do not replace a shape that looks unfamiliar: those bridged letterforms are deliberate. " +
    "Design only in the empty metal around the lettering." +
    // כל שורה בייחוס נחתכה בפנים אחרות (lib/text/style.ts) — זה כל המגוון
    // הטיפוגרפי שהלקוחה תבחר ממנו. בלי המשפט הזה המודל מאחיד אותן, ושלוש
    // החלופות חוזרות עם אותו כיתוב בדיוק.
    (rows > 1
      ? ` The attached image already shows ${WORD[rows] ?? rows} rows, and the lettering is drawn in a different typeface in each one. Keep every row's own lettering exactly as it is in that row — do not carry one row's letterforms over to another.`
      : "");

  // עריכה מול יצירה — ההבדל היחיד בין השניים הוא שתי הפסקאות האלה. כל השאר
  // (פרופורציה, ייצור, רנדור) הוא מה שהצינור צריך מהתמונה ולא תלוי בשאלה אם
  // מדובר בפריט חדש או בשינוי על קיים.
  const intent = editing
    ? [
        "The attached image is the CURRENT piece — the one being edited. Keep it: its outline, its proportions and its whole cut pattern stay exactly as they are in the attached image, and only what the change request below asks for changes. Anything the request does not mention stays identical to the attached image. This is an edit of an existing design, not a new design.",
        "CHANGE REQUEST (apply only this): " + userPrompt.trim().replace(/[.\s]+$/, "") + ".",
      ]
    : ["Design intent for the piece: " + userPrompt.trim().replace(/[.\s]+$/, "") + "."];

  return [
    `A flat, top-down, orthographic product image of ${object}, on a completely flat pure #FFFFFF white background.`,
    "It is one single piece of solid matte black metal, cut out of one flat sheet. Its whole shape is the design's — the outline as much as what is cut out of it. Nothing here fixes the outline.",

    // פרופורציה: יחס הצדדים של הרנדר הוא שקובע את אורך הפס בהמשך הצינור.
    // המדידה חלה על השטח שהפריט תופס (bounding box), לא על צורת המתאר.
    `PROPORTIONS (this is a measurement, not a style): the piece is ${round1(d.lengthMm)}mm long and ${round1(d.widthMm)}mm wide — overall it is ${ratio} times longer than it is wide. Lay it out horizontally taking up exactly that much room, long and narrow, and do not thicken it to fill the picture — leave plenty of plain white above and below it. The measurement says how much room the piece occupies; what its outline does within that room is the design's.` + layout,

    closure,

    "Wherever the metal is cut away — inside the piece and along its edges alike — the same pure white background shows through.",
    ...intent,
    ...(lettering ? [lettering] : []),

    // ייצור: אילוץ פיזי, לא כלל סגנון. חלק מתכת מנותק פשוט נופל מהגיליון.
    `MANUFACTURING (physical constraint): the piece is cut from one sheet of ${d.thicknessMm}mm metal with a laser, so all the metal must remain a single connected piece — every part of the metal is joined to the rest, with no detached island that would simply fall out of the sheet once the cutting is done. At this scale nothing can be cut finer than ${round2(fab.minHole)}mm, and no part of the remaining metal may be thinner than ${round2(fab.minBridgeBend)}mm across, or it will not survive being rolled. Within those limits the design is free to be whatever the design intent asks.`,

    "CRITICAL: absolutely NO drop shadow, NO cast shadow, NO ambient occlusion, NO reflection, NO gradient — the background is one uniform flat white with zero shading, and the metal sits flush like a flat vector illustration.",
    "Perfectly even flat lighting, straight overhead orthographic view, no perspective, no bevel, no depth, no hands, no props. Nothing may be added around the piece: no caption, no label, no watermark, no dimension annotation and no frame around the image — but lettering that is itself part of the cut pattern is welcome when the design asks for it.",
    "Maximum contrast: the metal is one deep, uniform matte black (about #111111) with no sheen, no highlight and no colour cast, so it separates from the pure white background and from the openings as sharply as possible.",
  ].join(" ");
}
