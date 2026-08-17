import { FAB, resolveFab } from "@/lib/fabrication.config";
import { NATURAL_RATIO } from "@/lib/render/panels";

// הפרומפט שנשלח למודל התמונה.
//
// **הקריאה עצמה כבר לא כאן.** ה-Worker בונה את הטקסט; מי שמדבר עם OpenAI הוא
// שירות הרנדר בקופסה (src/lib/render/service.ts → vectorizer). עד 30.7 ישבה
// כאן גם `generateRenderPng`, שהקורא היחיד שלה היה מסלול ההרצה של הבק־אופיס —
// הצינור השני שנמחק. עם מחיקתו ה-Worker הפסיק להחזיק לקוח של מודל תמונה בכלל,
// כלומר מקום אחד פחות שמחזיק מפתח שעולה כסף.
//
// עלות (הפרמטר היקר ביותר בצינור — נשמר כאן במספרים כדי שלא ייעלם):
//   gpt-image-1-mini · low  · 1536x1024  ≈ $0.006 לקריאה  ← ברירת המחדל
//   gpt-image-2      · low  · 1536x1024  ≈ $0.021 לקריאה  ← הרצה עם כיתוב
//   gpt-image-1-mini · high · 1536x1024  ≈ $0.05
//   gpt-image-1      · high · 1536x1024  ≈ $0.25          ← מה שהיה עד 26.7
// ומאז 30.7 יש בדיוק קריאה אחת להרצה, גם ביצירה וגם בעריכה — ראה panels.ts.
//
// שתי השורות הראשונות **נמדדו** (31/07) מאותה בקשה בדיוק — images/edits עם
// תמונת ייחוס, מה-`usage` שהתשובה מחזירה, כפול המחיר לטוקן מ-
// developers.openai.com/api/docs/pricing:
//   gpt-image-1-mini  853 טקסט + 323 תמונה נכנסת + 400 יוצאת → $0.0057 · 11 שנ׳
//   gpt-image-2       828 טקסט + 1536 תמונה נכנסת + 158 יוצאת → $0.0212 · 20 שנ׳
// כלומר הכיתוב עולה פי 3.7, ‎+$0.0155 להרצה. הפער כולו בתמונה הנכנסת:
// gpt-image-2 מקודד את הייחוס בפי 4.75 טוקנים — הוא באמת **מסתכל** עליו,
// וזה גם מה שרואים בתוצאה (0/4 חלופות נכונות מול 3–4/4).

/**
 * מודל התמונה להרצה שנושאת כיתוב.
 *
 * ברירת המחדל של הצינור היא `gpt-image-1-mini`, והיא נשארת כך לכל השאר: היא
 * זולה (~$0.006 להדמיה) ומספיקה לעיטור. מול כיתוב היא לא מספיקה — היא כותבת
 * טקסט משלה במקום להעתיק את הייחוס.
 *
 * הפרש מדוד (31/07, אותה תמונת ייחוס ואותו פרומפט, ארבע חלופות):
 * `gpt-image-1-mini` 0 מתוך 4 נכונות — ג׳יבריש. `gpt-image-2` 3–4 מתוך 4.
 *
 * **זה הדיוק שעליו הכיתוב נשען**, מאז שהוסר השלב שהחליף את האותיות בנתיבי
 * הפונט (31/07): מה שהמודל מחזיר הוא מה שנחתך. הפער בין המודלים הוא ההבדל
 * בין "רוב החלופות נכונות" לבין "אף אחת".
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

/**
 * מעל היחס הזה בלבד הפרומפט אומר על הפריט `long and narrow` — **6.55**.
 *
 * זה לא מספר שנבחר אלא `NATURAL_RATIO(1, 1)`: היחס שהמודל מצייר על קנבס לרוחב
 * שלם, כשאין שום שורה שמצרה לו את התא (render/panels.ts, מכויל על 45 הרצות).
 * מעליו התיאור נכון והוא גם עושה עבודה — שם מבקשים פריט **דק ממה שהמודל מצייר
 * מעצמו**, והמילים מחזיקות אותו שם. מתחתיו הוא שקר על הפריט: פריט ביחס 2.2 אינו
 * "long and narrow", והמשפט דוחף בדיוק לכיוון שהמדידה מראה שהוא כבר נוטה אליו.
 *
 * **ולמה זה חשוב עד כדי לחלק את המשפט לשניים.** בקשה ליחס נמוך מציבה שתי דרישות
 * שאי אפשר לקיים יחד על הקנבס הזה: לתפוס את מלוא הרוחב, ולהשאיר לבן למעלה ולמטה.
 * המודל פותר את הסתירה בכך שהוא מקטין את הגובה וממשיך למתוח את האורך — עד שקצה
 * אחד יוצא מהמסגרת. נמדד ביומן (17.8): מתוך 121 הרצות ביחס 8 ומעלה **אף אחת** לא
 * נחתכה בקצה, ומתוך 12 ההרצות שמתחת ל-8 נחתכו 6 — כולן ביחס מוזמן שקטן מ-6.55,
 * ו-AP-0250 (יחס 2.2) בקצה: המתכת נגעה בגבול השמאלי גם ברנדר הראשון וגם בניסיון
 * החוזר, והלקוחה קיבלה פריט שקצהו נחתך על ידי המסגרת.
 */
const SAY_LONG_AND_NARROW_ABOVE = NATURAL_RATIO(1, 1);

/** מודל התמונה מציית למילה טוב יותר מלספרה כשמדובר בכמות. */
const WORD: Record<number, string> = {
  2: "TWO", 3: "THREE", 4: "FOUR", 5: "FIVE", 6: "SIX",
  7: "SEVEN", 8: "EIGHT", 9: "NINE", 10: "TEN", 11: "ELEVEN", 12: "TWELVE",
};

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
 * **הצללית.** בסבב הראשון הוסרו המילים שכפו מלבן — "strip" שמונה פעמים,
 * "exactly that proportion", "design intent for the cut-out pattern" — ולא
 * נוספה שום הנחיה במקומן: הפרופורציה מדברת על ה-bounding box, והבריף הוא לפריט
 * כולו. זה לא הספיק, והעיצובים המשיכו לחזור עם שוליים ישרים. מה שנשאר היה
 * **אילוצים בניסוח חיובי מול היתרים בניסוח שלילי**: "no part of the metal
 * thinner than 2.25mm", "spanning almost the full width", "cuff", "do not add
 * … at either end" מול "Nothing here fixes the outline". הסבב השני מטפל בדיוק
 * בזה — ראה את ההערות בגוף הפונקציה, ואת הטבלה ב-docs/REMOVED_CONSTRAINTS.md.
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
  /** כמה עמודות בתמונה. נלווה ל-`rows`: מספר הפריטים הוא המכפלה, וצורת התא —
   *  זו שקובעת את היחס המצויר — היא היחס ביניהם. ראה planRender ב-panels.ts. */
  cols = 1,
  /**
   * story mode — שני ההבדלים של המסלול הפשוט, בפרמטר אחד.
   *
   * **`widthRange`** — טווח הרוחב שמותר לעיצוב, במקום רוחב אחד. במסלול Story
   * הלקוחה אינה בוחרת רוחב: האורך נגזר מהיקף הגוף שלה והרוחב הוא של העיצוב,
   * בתוך טווח הייצור. הפסקה למטה מוסרת אז אורך מדויק וטווח רוחב במקום מידה
   * אחת ויחס — ומה שיצא בפועל נמדד מהציור עצמו (lib/story/mode.ts).
   * `d.widthMm` עדיין נמסר כעוגן ("בערך כזה"), כי הוא זה שקבע את צורת הקנבס
   * ואת מספר הפאנלים; בלי שום עוגן המודל מצייר פס עבה מדי — נמדד, ראה ההערה
   * על PROPORTIONS למטה.
   *
   * **המגוון** — כשיש יותר מפריט אחד, המסלול מבקש שהם יהיו קריאות שונות
   * *באמת* של אותו סיפור. משפט ה-LAYOUT הקיים כבר אומר "וריאציה אחרת של אותה
   * כוונה", וזה מספיק כשהלקוחה תיארה עיצוב מסוים; כאן זה לא מספיק, כי הבחירה
   * בין הפרשנויות **היא** המוצר. ארבע הצעות שנבדלות בעיטור בלבד אינן בחירה.
   *
   * ריק = ההתנהגות הקיימת, מילה במילה.
   */
  story?: { widthRange: readonly [number, number] },
): string {
  const widthRange = story?.widthRange;
  const product = FAB.products[productType];
  const d: RenderDims = dims ?? {
    lengthMm: product.defaultLengthMm,
    widthMm: product.defaultWidthMm,
    thicknessMm: FAB.defaultThicknessMm,
  };
  const fab = resolveFab(d.thicknessMm, productType);
  const ratio = round1(d.lengthMm / d.widthMm);
  // ‏`long and narrow` נאמר רק כשזה נכון על הפריט שהוזמן — ראה
  // `SAY_LONG_AND_NARROW_ABOVE`. מתחת לסף המשפט חוזר לנוסח של מסלול Story, שבו
  // הוא ממילא לא היה מעולם: "…taking up exactly that much room and do not
  // thicken it…".
  const narrow = ratio >= SAY_LONG_AND_NARROW_ABOVE ? ", long and narrow," : "";
  // מה שהשורות *הן* תלוי במסלול, ורק המשפט האחרון משתנה. ביצירה כל שורה היא
  // עיצוב אחר באותה רוח; בעריכה כולן אותו פריט, ומה שנבדל ביניהן הוא איך השינוי
  // המבוקש מיושם. בלי ההבחנה הזו הפרומפט סתר את עצמו: "כל שורה היא עיצוב אחר"
  // מול "שמור על הפריט המצורף בדיוק כפי שהוא".
  const pieces = rows * cols;
  const word = WORD[pieces] ?? pieces;
  const rowWord = WORD[rows] ?? rows;
  const colWord = WORD[cols] ?? cols;
  const piecesAre = editing
    ? `Every piece is the attached piece with the change request (below) applied — the same piece each time, ` +
      `${word} different ways of carrying out that one change, and nothing else about it altered.`
    : "Each piece is a different variation of the same design intent: the same spirit, a different design.";
  // שלוש צורות, ובכוונה נפרדות: פריט יחיד; טור אחד (הניסוח שנמדד — לא נוגעים בו);
  // ורשת, שנוספה לפריט קצר שטור לבדו מחזיר לו חלופה אחת. ברשת ההבדל היחיד
  // שחשוב הוא שהפריט נפרס על רוחב **העמודה** ולא על רוחב התמונה — שם נמצא היחס.
  const layout =
    pieces <= 1
      ? " Show the whole piece, unclipped, with plain white all around it."
      : cols <= 1
        ? (editing
            ? ` LAYOUT: the attached image shows the piece once; this image contains exactly ${word} copies of it, `
            : ` LAYOUT: the image contains exactly ${word} separate pieces, `) +
          `stacked one above another as ${word} evenly spaced horizontal rows, with plain white space between them ` +
          "and no line, frame, divider or caption of any kind. Each row is a complete piece on its own, taking up the " +
          "same overall extent as above, its bounding box spanning almost the full width of the image with a thin " +
          `white margin at each end. ${piecesAre} Show every piece whole and unclipped.`
        : (editing
            ? ` LAYOUT: the attached image shows the piece once; this image contains exactly ${word} copies of it, `
            : ` LAYOUT: the image contains exactly ${word} separate pieces, `) +
          `laid out as a grid of ${rowWord} evenly spaced horizontal rows by ${colWord} evenly spaced vertical ` +
          "columns, with plain white space between every piece and no line, frame, divider, grid line or caption of " +
          "any kind. Each cell holds one complete piece on its own, taking up the same overall extent as above, its " +
          "bounding box spanning almost the full width of its own column with a thin white margin at each end — a " +
          `piece never runs across the full width of the image. ${piecesAre} Show every piece whole and unclipped.`;

  // שם העצם של המוצר. `cuff` הוא מה ש-`strip`/`band` היו לפניו: "צמיד קשיח
  // שטוח" הוא מחלקת תמונות שכולה מלבנים עם קצוות מעוגלים, ולכן המילה מציירת
  // צללית עוד לפני שהבריף נקרא. היא נשארת במשפט ה-CLOSURE בלבד — שם היא נושאת
  // משמעות (נסגר בכיפוף, בלי אבזם) ולא צורה.
  const object =
    productType === "ring"
      ? "a laser-cut matte black metal ring, opened out and lying completely flat (this is the flat blank that gets rolled into a ring)"
      : "a laser-cut matte black metal piece worn around the wrist, opened out and lying completely flat";

  // הפריט נסגר בכיפוף, ואין לו אבזם. בלי המשפט הזה המודל הוסיף לשני הקצוות
  // חריצים, לולאות ולשוניות — בכל הרצה, בכל שם, בשתי הפולריות. "צמיד שטוח
  // לחיתוך" הוא מחלקת תמונות שכמעט תמיד יש בה סגירה, והוא השלים אותה. החריצים
  // אוכלים בדיוק את הקצוות שבהם endMargin דורש מתכת מלאה, והווקטורייזר מתרגם
  // אותם לחורים אמיתיים ב-DXF.
  //
  // ארבע השלילות אומרות מה אסור *על* הקצה, והדרך הפשוטה ביותר לציית להן היא לא
  // לגעת בקצה בכלל — כלומר להשאיר אותו חתוך ישר. המשפט השני הוא ההיתר החיובי
  // שמפריד בין השניים: הצורה של הקצה שייכת לעיצוב, החומרה של הסגירה לא קיימת.
  const ends =
    " The ends themselves may be rounded, pointed or shaped as the design asks — what they may not carry is fastening hardware.";
  const closure =
    productType === "ring"
      ? "CLOSURE: the band is rolled into a ring and has no clasp or fastening — do not add slots, loops, fastening holes or tabs at either end." + ends
      : "CLOSURE: the cuff is closed by bending it around the wrist and has no buckle or fastening — do not add slots, loops, fastening holes or tabs at either end." + ends;

  // הכיתוב מגיע מהפונט, לא מהמודל — הוא כבר חתוך בתמונה המצורפת, וכל מה שנדרש
  // כאן הוא שהמודל לא יגע בו. אין מסלול שבו המודל ממציא אותיות בעצמו.
  //
  // **הבלוק הזה הוא כל מה שמגן על האיות.** עד 31/07 היה אחריו שלב שהחליף את
  // האותיות שהמודל צייר בנתיבי הפונט, כך שנוסח גרוע היה עולה בעיטור בלבד.
  // הוא הוסר, ומה שהמודל מחזיר הוא מה שנחתך.
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
  // **הסדר הוא ההוראה.** הניסוח לא השתנה, המיקום כן: הבקשה של הלקוחה קודמת,
  // והשימור בא אחריה כסייג. קודם המודל קרא "שמור על הצללית, הפרופורציות וכל
  // דוגמת החיתוך" ורק אז מה התבקש לשנות — כלומר בקשה שנוגעת בדיוק באחד
  // השלושה (״קצה גלי״) הגיעה אחרי משפט שאוסר עליה. זהו הסגנון הכללי: קודם
  // לעשות את מה שהתבקש, ואז לא לגעת במה שלא התבקש.
  //
  // המילה היחידה שזזה איתם היא `below` → `above`, כי היא מצביעה על הבקשה.
  const intent = editing
    ? [
        "CHANGE REQUEST (apply only this): " + userPrompt.trim().replace(/[.\s]+$/, "") + ".",
        "The attached image is the CURRENT piece — the one being edited. Keep it: its outline, its proportions and its whole cut pattern stay exactly as they are in the attached image, and only what the change request above asks for changes. Anything the request does not mention stays identical to the attached image. This is an edit of an existing design, not a new design.",
      ]
    : [
        // הצללית כנושא של משפט עם פועל, וצמוד לבריף.
        //
        // עד כה כל מה שנאמר עליה היה **שלילת אילוץ** — "Nothing here fixes the
        // outline", "what its outline does within that room is the design's",
        // "along its edges alike". שלושה משפטים, ואף אחד מהם אינו הוראה: מודל
        // תמונה פועל על שמות עצם ופעלים חיוביים, ו"לא אסרנו עליך X" אינו כזה.
        // זה אותו כשל שכבר תועד ב-REMOVED_CONSTRAINTS — ההיתר שוכתב ונשאר היתר.
        //
        // **ביצירה בלבד.** בעריכה זה יסתור את השימור שלמעלה, וזה בדיוק ההפך
        // ממה שעריכה אמורה לעשות.
        "THE OUTER EDGE IS PART OF THE DESIGN, not a given frame: it rises and falls, narrows and swells, tapers or scallops along the length exactly as the design intent asks.",
        "Design intent for the piece: " + userPrompt.trim().replace(/[.\s]+$/, "") + ".",
        // story mode — הבחירה בין הפרשנויות היא המוצר, ולכן המגוון הוא דרישה
        // ולא נעימות. נכתב כהיתר חיובי ומפורש ("שונות זו מזו ב-X, ב-Y וב-Z"),
        // מאותו נימוק שמתועד מעל משפט הצללית: מודל תמונה פועל על שמות עצם
        // ופעלים, לא על "אל תחזור על עצמך".
        //
        // רק כשיש על מה לדבר: פריט יחיד, ועריכה — שבה כל הפריטים הם *אותו*
        // פריט עם שינוי אחד — יוצאים מכאן.
        ...(story && pieces > 1
          ? [
              "VARIETY: these pieces are different readings of that one intent, not one design redrawn. " +
              "Across them the silhouette changes, the cutting goes from open and airy in some to dense and close in others, " +
              "the rhythm shifts from regular to irregular, and the pattern sits differently along the length — " +
              "so that seeing them side by side is a real choice between distinct pieces.",
            ]
          : []),
      ];

  return [
    `A flat, top-down, orthographic product image of ${object}, on a completely flat pure #FFFFFF white background.`,
    "It is one single piece of solid matte black metal, cut out of one flat sheet. Its whole shape is the design's — the outline as much as what is cut out of it. Nothing here fixes the outline.",

    // פרופורציה: יחס הצדדים של הרנדר הוא שקובע את אורך הפס בהמשך הצינור.
    // המדידה חלה על השטח שהפריט תופס (bounding box), לא על צורת המתאר.
    //
    // ⚠ **הלבן נדרש בארבעת הכיוונים, ו-`plenty` ירד.** עד 17.8 המשפט ביקש
    // `plenty of plain white above and below it` — כלומר הצהיר על ציר אחד בלבד,
    // והשאיר את הציר שבו הפריט באמת נחתך (הקצוות) למשפט הכללי `with plain white
    // all around it` שב-`layout`. זה לא הספיק: ב-AP-0250 שני רנדרים ברצף שמו
    // מתכת על הגבול השמאלי של הקנבס. `plenty` ירד באותה הזדמנות — הוא כמת רק את
    // הציר האנכי, וכימות לא סימטרי הוא בדיוק מה שהטה את הפריט להתרחב לצדדים.
    (widthRange
      ? // story mode: האורך הוא המדידה, הרוחב הוא של העיצוב. אותו מבנה משפט
        // בדיוק — מה שהוחלף הוא חצי המשפט על הרוחב.
        `PROPORTIONS: the piece is exactly ${round1(d.lengthMm)}mm long — that length is a measurement and is fixed. How wide it is, is the design's own call: anywhere from ${round1(widthRange[0])}mm to ${round1(widthRange[1])}mm, whatever the design intent asks for, with around ${round1(d.widthMm)}mm being the usual. Lay it out horizontally taking up exactly that much room and do not thicken it to fill the picture — leave plain white above and below it and beyond both of its ends.`
        + ` The length says how much room the piece occupies along its span; what its outline does within that room is the design's.`
      : `PROPORTIONS (this is a measurement, not a style): the piece is ${round1(d.lengthMm)}mm long and ${round1(d.widthMm)}mm wide — overall it is ${ratio} times longer than it is wide. Lay it out horizontally taking up exactly that much room${narrow} and do not thicken it to fill the picture — leave plain white above and below it and beyond both of its ends.`
        + ` The measurement says how much room the piece occupies; what its outline does within that room is the design's.`
    ) + layout,

    closure,

    "Wherever the metal is cut away — inside the piece and along its edges alike — the same pure white background shows through.",
    ...intent,
    ...(lettering ? [lettering] : []),

    // ייצור: אילוץ פיזי, לא כלל סגנון. חלק מתכת מנותק פשוט נופל מהגיליון.
    //
    // **הרצפה היא `minLetterBridgeMm` (0.75) ולא `minBridgeBend` (2.25).**
    // הכלל חל כאן על *כל* המתכת שנשארת, כלומר גם על הצללית: ב-2.25 מ"מ כל
    // התחדדות, כל קצה שמתעגל וכל שן בקצה גלי אסורים, ופס ברוחב אחיד הוא
    // התשובה הבטוחה היחידה. 2.25 הוא גם המספר ש**הוולידציה כבר לא אוכפת** —
    // V4-ערגול הוסר (docs/REMOVED_CONSTRAINTS.md), ומה שנאכף בפועל הוא בדיוק
    // הרצפה שנכתבת כאן. הפרומפט הפסיק לאכוף מה שהמנוע ויתר עליו.
    `MANUFACTURING (physical constraint): the piece is cut from one sheet of ${d.thicknessMm}mm metal with a laser, so all the metal must remain a single connected piece — every part of the metal is joined to the rest, with no detached island that would simply fall out of the sheet once the cutting is done. At this scale nothing can be cut finer than ${round2(fab.minHole)}mm, and no part of the remaining metal may be thinner than ${round2(FAB.minLetterBridgeMm)}mm across, or it will break as it is cut. Within those limits the design is free to be whatever the design intent asks.`,

    "CRITICAL: absolutely NO drop shadow, NO cast shadow, NO ambient occlusion, NO reflection, NO gradient — the background is one uniform flat white with zero shading, and the metal sits flush like a flat vector illustration.",
    "Perfectly even flat lighting, straight overhead orthographic view, no perspective, no bevel, no depth, no hands, no props. Nothing may be added around the piece: no caption, no label, no watermark, no dimension annotation and no frame around the image — but lettering that is itself part of the cut pattern is welcome when the design asks for it.",
    "Maximum contrast: the metal is one deep, uniform matte black (about #111111) with no sheen, no highlight and no colour cast, so it separates from the pure white background and from the openings as sharply as possible.",
  ].join(" ");
}
