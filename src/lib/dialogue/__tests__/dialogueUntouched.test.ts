import { describe, expect, it } from "vitest";
import { INITIAL, buildEditPrompt, type CreateState } from "@/components/create/model";
import { buildRenderPrompt } from "@/lib/llm/imagegen";
import { DIALOGUE_MODE, isDialogue, runsEditStage } from "../mode";
import { runsRespec } from "../spec";

/**
 * dialogue mode — **טסט אי־הפגיעה** (§8 ב-DIALOGUE_PLAN, בתבנית §4.6 ב-
 * STORY_FLOW_PLAN).
 *
 * הטענה: `/design` בלי `?dialogue=1` אינו עובר באף אחד מהענפים החדשים.
 * ‏`mode` לא נשלח, `editStage` לא נקרא, ומה שנשלח למודל התמונה הוא
 * `buildEditPrompt` — מילה במילה כמו לפני הניסוי.
 *
 * **למה טסט ולא קריאה חוזרת של הנתיב.** ההבדל בין שני המסלולים הוא תנאי אחד
 * בתוך 900 שורות, וכל שינוי עתידי שם יכול להזיז אותו בלי שאיש ישים לב. הכשל
 * הזה שקט במיוחד: לקוחה שאינה בניסוי תקבל עריכה שעברה שלב טקסט, כלומר תוצאה
 * שונה — בלי שגיאה, בלי התראה, ובתוספת עלות. לכן התנאי חולץ ל-`runsEditStage`
 * והוא נבדק כאן ישירות.
 */

const state = (over: Partial<CreateState> = {}): CreateState => ({ ...INITIAL, ...over });

describe("isDialogue", () => {
  it("רק המחרוזת המדויקת", () => {
    expect(isDialogue(DIALOGUE_MODE)).toBe(true);
    for (const other of [undefined, null, "", "story", "Dialogue", "dialogue ", "studio"]) {
      expect(isDialogue(other)).toBe(false);
    }
  });
});

describe("runsEditStage — המסלול הרגיל אינו נכנס", () => {
  /** מה ש-`/design` בלי הדגל שולח בכל אחת מהפעולות שלו. */
  const EXISTING = [
    { name: "יצירה מאפס", req: { userPrompt: "צמיד עם קווים", currentSvg: null } },
    { name: "בקשת שינוי", req: { userPrompt: "שינוי באזור ימין של הפריט: פחות חורים", currentSvg: "<svg/>" } },
    { name: "יצירה עם כיתוב", req: { userPrompt: "צמיד", currentSvg: null, text: "אורי" } },
    { name: "מסלול Story — יצירה", req: { mode: "story", userPrompt: "הקיץ שהיינו בים", currentSvg: null } },
    { name: "מסלול Story — שינוי", req: { mode: "story", userPrompt: "שינוי בעיצוב כולו: יותר צר", currentSvg: "<svg/>" } },
    { name: "כיול מהבק־אופיס", req: { userPrompt: "x", currentSvg: "<svg/>", promptOverride: "PROMPT" } },
  ];

  for (const { name, req } of EXISTING) {
    it(`${name} — לא`, () => {
      expect(runsEditStage(req)).toBe(false);
    });
  }

  it("עם הדגל ועם עיצוב קיים — כן. זה הענף היחיד", () => {
    expect(runsEditStage({
      mode: DIALOGUE_MODE,
      userPrompt: "פחות בלאגן פה",
      currentSvg: "<svg/>",
    })).toBe(true);
  });

  it("עם הדגל, בלי עיצוב קיים — לא: יצירה במסלול הזה היא שלב B", () => {
    expect(runsEditStage({ mode: DIALOGUE_MODE, userPrompt: "צמיד", currentSvg: null })).toBe(false);
  });

  it("עם הדגל, עם `promptOverride` — לא: הבק־אופיס מבקש לשלוח את מה שכתב", () => {
    expect(runsEditStage({
      mode: DIALOGUE_MODE, userPrompt: "x", currentSvg: "<svg/>", promptOverride: "PROMPT",
    })).toBe(false);
  });

  it("עם הדגל, בלי בקשה — לא: אין מה לתרגם", () => {
    for (const empty of ["", "   ", undefined]) {
      expect(runsEditStage({ mode: DIALOGUE_MODE, userPrompt: empty, currentSvg: "<svg/>" })).toBe(false);
    }
  });
});

describe("buildEditPrompt — הפרומפט של היום לא השתנה", () => {
  // `editPromptFor` חולץ מתוכו כדי שהרתמה תוכל לבנות את הזרוע הקיימת
  // מהמקור ולא מעותק. החילוץ אינו אמור לשנות ולו תו — וזה מה שנבדק.
  it("עם אזור", () => {
    expect(buildEditPrompt(state({ region: "right", editReq: "פחות חורים" })))
      .toBe("שינוי באזור ימין של הפריט: פחות חורים");
    expect(buildEditPrompt(state({ region: "center", editReq: "יותר מתכת" })))
      .toBe("שינוי באזור מרכז של הפריט: יותר מתכת");
    expect(buildEditPrompt(state({ region: "left", editReq: "קצה גלי" })))
      .toBe("שינוי באזור שמאל של הפריט: קצה גלי");
  });

  it("הערה כללית", () => {
    expect(buildEditPrompt(state({ region: "all", editReq: "יותר סימטרי" })))
      .toBe("שינוי בעיצוב כולו: יותר סימטרי");
    expect(buildEditPrompt(state({ region: null, editReq: "יותר סימטרי" })))
      .toBe("שינוי בעיצוב כולו: יותר סימטרי");
  });

  it("רווחים בקצוות הבקשה נחתכים, כמו קודם", () => {
    expect(buildEditPrompt(state({ region: "all", editReq: "  יותר צר  " })))
      .toBe("שינוי בעיצוב כולו: יותר צר");
  });
});

describe("מה שנשלח למודל התמונה בעריכה רגילה", () => {
  const dims = { lengthMm: 160, widthMm: 18, thicknessMm: 1.5 };
  const legacy = buildEditPrompt(state({ region: "right", editReq: "פחות חורים" }));
  const prompt = buildRenderPrompt(legacy, "bracelet", dims, 3, true);

  it("הבקשה נכנסת כמו שהיא — בעברית, בלי תרגום", () => {
    expect(prompt).toContain("CHANGE REQUEST (apply only this): שינוי באזור ימין של הפריט: פחות חורים.");
  });

  it("פסקת השימור באה **אחרי** הבקשה, כמו שנמדד", () => {
    // הסדר הוא ההוראה: קודם לעשות את מה שהתבקש, ואז לא לגעת במה שלא. ראה
    // ההערה מעל `intent` ב-imagegen.ts.
    expect(prompt.indexOf("CHANGE REQUEST")).toBeLessThan(prompt.indexOf("The attached image is the CURRENT piece"));
  });

  it("שום דבר מהמסלול החדש אינו נכנס", () => {
    for (const foreign of [
      "Leave these exactly as they are", "preserve", "image_instruction", "updated_spec",
      // ומאז respec — גם שפת הפרומפט שנבנה מהמפרט. עריכה רגילה תמיד מדברת
      // על התמונה המצורפת, לעולם לא "מפרט סגור שמציירים ממנו".
      "SPECIFICATION", "closed every decision", "copies of that one piece",
    ]) {
      expect(prompt).not.toContain(foreign);
    }
  });

  it("אותה קריאה, אותו פלט — הפרומפט של העריכה יציב", () => {
    expect(buildRenderPrompt(legacy, "bracelet", dims, 3, true)).toBe(prompt);
  });
});

describe("runsRespec — המסלול הרגיל לעולם אינו מגיע לשם", () => {
  // בנתיב היצירה `runsRespec` נקרא רק על החלטה של שלב הטקסט, ושלב הטקסט רץ
  // רק כש-`runsEditStage` אישר — כלומר רק עם הדגל. הטענה הנבדקת כאן היא
  // הקצה: גם אם מישהו יקרא לפונקציה בלי החלטה (המצב של המסלול הרגיל),
  // התשובה היא לא — תמונת הייחוס נשארת, `/v1/images/edits` נשאר.
  it("בלי החלטה של שלב הטקסט — לעולם לא respec", () => {
    expect(runsRespec({ decision: null, priorSpec: { outer_silhouette: "a band" } })).toBe(false);
    expect(runsRespec({})).toBe(false);
  });
});
