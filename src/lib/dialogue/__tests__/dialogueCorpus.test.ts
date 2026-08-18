import { describe, expect, it } from "vitest";
import { editPromptFor } from "@/components/create/model";
import { isEditRun, parseLegacyEditPrompt } from "../corpus";

/**
 * dialogue mode — פירוק הפרומפט הישן לקורפוס המדידה.
 *
 * **למה זה נבדק.** ‏§7 דורש "‏10 בקשות שינוי אמיתיות מתוך `generation_runs`",
 * ומה ששמור שם אינו הבקשה אלא הפרומפט שנבנה ממנה. פירוק שגוי היה מזין את
 * המדידה בקלט שאינו מה שהלקוחה כתבה — כלומר מייצר דוח על ניסוי שלא נערך.
 *
 * הטענה החזקה כאן היא ה**הלוך־ושוב**: מה ש-`editPromptFor` בונה, הפירוק
 * מחזיר. שתי הפונקציות נבדקות זו מול זו ולא כל אחת מול קבוע, כי בדיוק הפער
 * ביניהן הוא מה שיישבר בשקט.
 */

const REQUESTS = [
  "פחות בלאגן פה",
  "שיהיה יותר סימטרי",
  "משהו שיזכיר לי את סבתא",
  "תחזירי את הקצב שהיה בהתחלה",
  "לדלל את החיתוכים ולהשאיר יותר מתכת בקצה",
  "צר יותר, 3 מ\"מ בערך",
];

describe("parseLegacyEditPrompt — הלוך־ושוב מול editPromptFor", () => {
  for (const region of ["right", "center", "left", "all"] as const) {
    for (const request of REQUESTS) {
      it(`«${request}» · ${region}`, () => {
        const built = editPromptFor(region, request);
        const parsed = parseLegacyEditPrompt(built);
        expect(parsed.request).toBe(request);
        // ‏"הערה כללית" (`all`) אינה אזור אלא היעדר אזור, ולכן היא חוזרת
        // כ-`null` — וזה בדיוק מה ש-`editPromptFor` עשה איתה בכיוון השני.
        expect(parsed.region).toBe(region === "all" ? null : region);
      });
    }
  }

  it("`null` כאזור — כמו `all`", () => {
    const parsed = parseLegacyEditPrompt(editPromptFor(null, "פחות בלאגן"));
    expect(parsed).toEqual({ region: null, request: "פחות בלאגן" });
  });
});

describe("parseLegacyEditPrompt — מה שאינו מזוהה", () => {
  it("פרומפט מנוסח אחרת מוחזר שלם ולא נזרק", () => {
    // הקורפוס נבנה מהיסטוריה, ופרומפט מגרסה ישנה יותר של הקוד הוא עדיין
    // בקשה אמיתית של אדם — וזה כל מה שהמדידה צריכה ממנו. מה שהיה נזרק כאן
    // היה דווקא המקרים הלא-שגרתיים, שהם המעניינים.
    for (const odd of ["צמיד עם קווים", "שינוי בלי נקודתיים", "", "   "]) {
      expect(parseLegacyEditPrompt(odd)).toEqual({ region: null, request: odd.trim() });
    }
  });

  it("אזור שאינו מוכר — הבקשה נשמרת, האזור `null`", () => {
    expect(parseLegacyEditPrompt("שינוי באזור העליון של הפריט: יותר צר"))
      .toEqual({ region: null, request: "יותר צר" });
  });

  it("נקודתיים בתוך הבקשה עצמה אינן חותכות אותה", () => {
    // הפיצול הוא על ה**ראשונות** בלבד, שהן מה שהתבנית מייצרת.
    const parsed = parseLegacyEditPrompt("שינוי באזור ימין של הפריט: לדוגמה: פחות חורים");
    expect(parsed.region).toBe("right");
    expect(parsed.request).toBe("לדוגמה: פחות חורים");
  });

  it("בקשה ריקה אחרי הנקודתיים — המחרוזת כולה, ולא ריק", () => {
    const text = "שינוי בעיצוב כולו: ";
    expect(parseLegacyEditPrompt(text)).toEqual({ region: null, request: text.trim() });
  });
});

describe("isEditRun", () => {
  it("`editedFromCurrent` הוא הסימן", () => {
    expect(isEditRun({ editedFromCurrent: true })).toBe(true);
    expect(isEditRun({ editedFromCurrent: false })).toBe(false);
    expect(isEditRun({})).toBe(false);
    expect(isEditRun(null)).toBe(false);
  });
});
