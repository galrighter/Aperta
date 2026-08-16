import { FAB } from "@/lib/fabrication.config";
import type { Canvas } from "@/lib/render/canvas";
import type { RenderProductType } from "@/lib/llm/imagegen";

// story mode — הפרומפט של המסלול הפשוט, בקובץ נפרד.
//
// **למה נפרד מ-`buildRenderPrompt`.** הפרומפט הקיים נבנה סביב הזמנה: הלקוחה
// בחרה מוצר, מידה, רוחב ומאפיינים, והפרומפט מוסר אותם למודל כאילוצים. במסלול
// Story אין הזמנה כזו — יש סיפור, ומה שמתבקש מהמודל הוא **תרגום** שלו לצורה.
// הניסוח משנה את מה שחוזר: פרומפט שמתחיל ב"פריט באורך X ורוחב Y" מקבל וריאציות
// על אותו פס, ופרומפט שמתחיל בסיפור מקבל פרשנויות שלו. לכן זה לא פרמטר נוסף
// על הקיים אלא טקסט משלו.
//
// **מה שנשמר מהקיים, ולמה הוא לא ניתן למחיקה.** שלושת האילוצים שהצינור נשען
// עליהם ממשיכים להיאמר, בניסוח של הפרומפט הזה: שחור מט מלא על לבן שטוח בלי
// צל/גרדיאנט/השתקפות (מה שהווקטורייזר צריך כדי להפריד מתכת מרקע), פריט אחד
// מחובר שנחתך מגיליון יחיד (`MANUFACTURING`), ופריסה של N פריטים בשורות —
// המספר מגיע מ-`planRender` ולא מהטקסט, כי הוא זה שנחתך בפועל.
//
// **מה שיצא, במפורש.** המידות במ"מ. הפרומפט הזה אינו אומר אורך, רוחב או יחס —
// הוא מבקש "פרופורציות אמינות", והמידה נכנסת אחר כך, בשלב ההזמנה, כשהעיצוב
// שנבחר ממוסגר מחדש לאורך שנמדד (`storyFrameDims`). זו כל הנקודה של הסידור
// החדש: הלקוחה מספרת, מקבלת, ורק אז נמדדת.

/** `[open cuff bracelet / open ring]` — מה שנשאר אחרי מחיקת האפשרות השנייה. */
const OBJECT: Record<RenderProductType, string> = {
  bracelet: "open cuff bracelet",
  ring: "open ring",
};

/** מודל התמונה מציית למילה טוב יותר מלספרה כשמדובר בכמות (כמו ב-imagegen). */
const WORD: Record<number, string> = {
  1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six",
  7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve",
};
/** מיוצא כי הפרומפט הדו-שלבי (designStage.ts) סופר את אותם פריטים באותה תמונה,
 *  ושתי טבלאות מילים לאותו מספר הן שתי טבלאות שיכולות להיפרד. */
export const numberWord = (n: number): string => WORD[n] ?? String(n);
const word = numberWord;

export interface StoryPromptInput {
  /** הסיפור של הלקוחה, כפי שנכתב. נכנס במקום `[USER_STORY]`. */
  story: string;
  productType: RenderProductType;
  /** שורות בתמונה, מ-`planRender`. זה מה שהקופסה חותכת בפועל. */
  rows: number;
  /** עמודות בתמונה, מ-`planRender`. 1 ברוב המקרים; 2 בפריט קצר. */
  cols?: number;
  /** צורת הקנבס שתתבקש, מ-`canvasFor`. קובעת אם התמונה לאורך או לרוחב. */
  canvas?: Canvas;
  /** עובי הגיליון במ"מ. ברירת המחדל היא זו של המערכת. */
  thicknessMm?: number;
}

/**
 * הפרומפט שנשלח למודל התמונה במסלול Story — יצירה בלבד.
 *
 * בקשת שינוי אינה עוברת כאן: שם התמונה המצורפת היא העיצוב הקיים, והפרומפט
 * חייב לדבר עליה ("שנה רק את X"). זה בדיוק מה ש-`buildRenderPrompt` עושה
 * במצב `editing`, והוא ממשיך לעשות זאת גם במסלול הזה.
 */
export function buildStoryRenderPrompt({
  story,
  productType,
  rows,
  cols = 1,
  canvas,
  thicknessMm = FAB.defaultThicknessMm,
}: StoryPromptInput): string {
  const object = OBJECT[productType];
  const pieces = Math.max(1, rows * cols);
  const n = word(pieces);
  const portrait = canvas ? canvas.widthPx < canvas.heightPx : false;

  // הפריסה נגזרת מהתכנון ולא מהטקסט: `plan.rows × plan.cols` הוא מה שהקופסה
  // חותכת, ומספר אחר בפרומפט היה מייצר תמונה שחלקה נזרק או פסים חתוכים.
  const composition =
    pieces <= 1
      ? [
          `Create one single image with a ${portrait ? "portrait / tall" : "landscape / wide"} canvas.`,
          "The image must contain exactly one flat jewelry blank, centred cleanly on the page, shown whole and unclipped with plain white all around it.",
        ]
      : cols <= 1
        ? [
            `Create one single image with a ${portrait ? "portrait / tall" : "landscape / wide"} canvas.`,
            `The image must contain exactly ${n} separate flat jewelry blanks, arranged one above the next, in ${n} horizontal rows, evenly spaced vertically, centred cleanly on the page.`,
            "Each row contains one complete design, shown whole and unclipped, its bounding box spanning almost the full width of the image with a thin white margin at each end.",
            `Do not overlap the ${n} designs.`,
          ]
        : [
            `Create one single image with a ${portrait ? "portrait / tall" : "landscape / wide"} canvas.`,
            `The image must contain exactly ${n} separate flat jewelry blanks, laid out as a grid of ${word(rows)} evenly spaced horizontal rows by ${word(cols)} evenly spaced vertical columns, centred cleanly on the page.`,
            "Each cell contains one complete design, shown whole and unclipped, its bounding box spanning almost the full width of its own column with a thin white margin at each end — a piece never runs across the full width of the image.",
            `Do not overlap the ${n} designs.`,
          ];

  // פסקת הפרופורציות: רק המשפט של המוצר שנבחר נשאר. שניהם יחד היו מוסרים
  // למודל שתי הגדרות של "פרופורציה נכונה" לפריט אחד.
  const proportions =
    productType === "ring"
      ? "Preserve realistic flat-ring proportions and do not stretch the piece unnaturally."
      : "The overall length should clearly be much greater than the width.";

  return [
    "Create a clean product-design image for Aperta, a modern jewelry brand that transforms a personal idea, memory, feeling, or story into a manufacturable jewelry design.",

    // USER INPUT
    `USER INPUT — the user's story / design instruction is: "${story.trim().replace(/\s+/g, " ")}".`,
    "Interpret this input as the creative source for the designs.",
    "Do not illustrate the story literally unless explicitly requested. Do not simply place recognizable objects, symbols, scenery, icons or text from the story onto the jewelry.",
    "Instead, translate the story into form: rhythm, geometry, negative space, proportion, tension, repetition, interruption, movement, density, asymmetry, softness, sharpness, or other visual characteristics suggested by the user's idea.",
    "The final designs should feel like sophisticated abstract interpretations of the story rather than illustrations of it.",

    // PRODUCT
    `PRODUCT: design ${n} different ${object} flat ${pieces > 1 ? "blanks" : "blank"}.`,
    `${pieces > 1 ? "These are not finished worn jewelry pieces." : "This is not a finished worn jewelry piece."} Show only the flat unbent ${pieces > 1 ? "layouts" : "layout"}, as if each piece was already laser-cut from sheet metal and is shown before rolling / bending into the final ${object}.`,
    `Each design must be physically manufacturable from one single flat sheet of ${thicknessMm}mm brass, using only laser cutting, rolling / bending into the final form, and normal finishing.`,
    "No soldering. No welding. No added parts. No stones. No chains. No hinges. No clasps. No layered pieces. No floating or disconnected elements. No impossible overlapping geometry.",
    "Each design must clearly be a single connected manufacturable piece.",
    "Avoid hair-thin bridges, fragile connections, tiny holes, excessive micro-detail, decorative filigree, random perforation patterns, and shapes that would be weak or unrealistic to manufacture.",
    "The design should feel intentional and premium.",
    "Negative space may be a major part of the design. The outer silhouette itself may also participate in expressing the concept; do not automatically limit the piece to a plain rectangular strip.",

    // IMAGE COMPOSITION
    ...composition,
    "No text. No captions. No labels. No dimensions. No arrows. No frame. No decorative graphic elements.",

    // VISUAL STYLE
    "VISUAL STYLE: show the pieces as flat, top-down, orthographic design layouts.",
    "Strict visual rules: pure white background; jewelry material shown as solid black; all cut-through areas shown as the same pure white background; perfectly flat appearance; straight overhead orthographic view; zero perspective; zero bevel; zero depth; zero texture; zero reflection; zero gradient; zero cast shadow; zero ambient shadow.",
    "The result should read clearly as: BLACK = METAL THAT REMAINS, WHITE = MATERIAL REMOVED BY LASER.",

    // PROPORTIONS
    `PROPORTIONS: each design should preserve the believable flat proportions of an ${object}. The important thing is the proportion between length and width.`,
    "Do not artificially thicken or enlarge the design just to fill the frame. The pieces may appear relatively narrow within the canvas, with generous white space around them.",
    (pieces > 1 ? "The width may vary between the examples. " : "") +
      "The designs do not need to fill the available space.",
    proportions,

    // DESIGN VARIATION — רק כשיש בין מה למה. בפריט יחיד המשפט מדבר על עצמו.
    ...(pieces > 1
      ? [
          `DESIGN VARIATION: create ${n} clearly different design options based on the same user story.`,
          `All ${n} should belong to the same overall design language and interpret the same idea, but they should differ in composition, rhythm, silhouette, cutout structure, balance, and use of negative space.`,
          `Each option should feel like a strong, distinct direction. Do not create ${n} nearly identical versions.`,
        ]
      : []),

    // DESIGN PRIORITY
    "DESIGN PRIORITY: the image should communicate a system that transforms story → abstract form → manufacturable flat jewelry design. Favor strong, memorable, intentional design. Avoid generic decoration, floral ornament, or random hole patterns.",
  ].join(" ");
}
