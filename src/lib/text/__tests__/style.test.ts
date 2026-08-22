import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE, briefPicksStyle, styleForBrief, stylesForBrief } from "../style";
import { FONT_IDS } from "../fonts";

/**
 * הטיפוגרפיה שהבריף מבקש — ובעיקר **ההבחנה** שנוספה עם הכיתוב בשיחה:
 * האם הבריף בחר אופי, או שנפל לברירת המחדל. זו ההכרעה בין "פנים אחת לכל
 * השורות" ל"פנים לכל שורה" (החלטת גל), ולכן היא חייבת להיות טהורה ונבדקת:
 * טעות לכיוון אחד מציגה מגוון למי שכבר בחרה, ולכיוון השני נועלת אופי על מי
 * שלא ביקשה כלום.
 */

describe("briefPicksStyle", () => {
  it("מילת אופי בבריף — בחירה ברורה", () => {
    for (const brief of [
      "צמיד קלאסי עם השם",
      "משהו עדין לאמא",
      "נקי ומינימלי",
      "בכתב יד, כמו חתימה",
      "משהו חזק ובולט",
    ]) {
      expect(briefPicksStyle(brief)).toBe(true);
    }
  });

  it("בלי מילת אופי — אין בחירה, וזה לא ניחוש אלא היעדר", () => {
    for (const brief of ["", "   ", "צמיד עם השם שלי", "בשביל יום הולדת"]) {
      expect(briefPicksStyle(brief)).toBe(false);
    }
  });

  it("גזעים: תחיליות וסופיות נטייה נתפסות באותו מפתח", () => {
    // "ורומנטית" ו-"רומנטי" — אותו גזע, אותה בחירה. זה מה שמחזיק התאמה
    // בעברית מדוברת, וזה גם מה שהופך את הגזירה לשמישה על תמליל שיחה.
    expect(briefPicksStyle("ורומנטית")).toBe(true);
    expect(briefPicksStyle("עיצוב גיאומטרי")).toBe(true);
  });

  it("עקבי עם `styleForBrief`: אין בחירה ⇔ ברירת המחדל", () => {
    // שתי הפונקציות חייבות להסכים — אחרת "בחירה ברורה" הייתה נועלת את
    // הפונט הניטרלי על כל השורות, כלומר מציגה פחות ולא מכבדת יותר.
    expect(styleForBrief("צמיד עם השם שלי")).toEqual(DEFAULT_STYLE);
    expect(briefPicksStyle("צמיד עם השם שלי")).toBe(false);
    expect(styleForBrief("צמיד קלאסי")).not.toEqual(DEFAULT_STYLE);
    expect(briefPicksStyle("צמיד קלאסי")).toBe(true);
  });
});

describe("stylesForBrief", () => {
  it("מה שהבריף ביקש ראשון, ואחריו כל היתר — בלי כפילות", () => {
    const list = stylesForBrief("צמיד קלאסי");
    expect(list[0]).toEqual(styleForBrief("צמיד קלאסי"));
    expect(list).toHaveLength(FONT_IDS.length);
    expect(new Set(list.map((s) => s.fontId)).size).toBe(FONT_IDS.length);
  });

  it("הרשימה שלמה גם בלי בחירה — לא כל פנים נכנסות לכל פס", () => {
    // הקורא לוקח את הראשונות **שהצליחו**: זו הנפילה-לאחור שמונעת "הטקסט
    // ארוך מדי" על טקסט שנכנס יפה בפנים צרות יותר.
    expect(stylesForBrief("")).toHaveLength(FONT_IDS.length);
  });
});
