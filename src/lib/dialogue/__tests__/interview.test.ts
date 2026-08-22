import { describe, expect, it } from "vitest";
import {
  INTERVIEW_QUESTION_CAP, INTERVIEW_SKIP, askedOf, buildInterviewDirectionsPrompt,
  buildInterviewTurnPrompt, coerceInterviewTurns, parseInterviewDirections, parseInterviewTurn,
  renderJsonOf, type InterviewTurn,
} from "../interview";
import type { EditSpec } from "../spec";

/**
 * dialogue mode — מנוע הראיון (שלב B).
 *
 * מה שנבדק כאן הוא מה שיכול להיות שגוי **בשקט**: פרומפט שלא נושא את מה
 * שהמודל חייב לדעת (התקרה, טוקן הדילוג, המקורות), פענוח שמקבל סבב בלי כלום
 * להציג, ומיזוג שמפשיר שדה `user` — הכשל ש-§1.3 קיים כדי למנוע.
 */

const turns: InterviewTurn[] = [
  { role: "interviewer", text: "חוזה המדיום.\n\nעל מה הפריט הזה?" },
  { role: "customer", text: "משהו עדין, בשביל אמא שלי" },
];

describe("buildInterviewTurnPrompt", () => {
  const prompt = buildInterviewTurnPrompt({
    productType: "bracelet",
    turns,
    spec: null,
    asked: 1,
  });

  it("התמליל נכנס, בתפקידים, ותו שורה בתשובה אינו שובר שורת תמליל", () => {
    expect(prompt).toContain("INTERVIEWER: חוזה המדיום. על מה הפריט הזה?");
    expect(prompt).toContain("CUSTOMER: משהו עדין, בשביל אמא שלי");
  });

  it("המניין והתקרה נמסרים — באפס נותרות המודל מחויב לסיכום", () => {
    expect(prompt).toContain(`1 of ${INTERVIEW_QUESTION_CAP} asked`);
    expect(prompt).toContain(`You have ${INTERVIEW_QUESTION_CAP - 1} questions left`);
  });

  it("טוקן הדילוג מוסבר — דילוג אינו 'לא משנה לי' על ציר", () => {
    expect(prompt).toContain(INTERVIEW_SKIP);
  });

  it("מפרט ריק אינו מוצג כ'לא תועד' — זו תחילת שיחה, לא חוסר בתיעוד", () => {
    expect(prompt).toContain("the conversation is just beginning");
    expect(prompt).not.toContain("Not recorded");
  });

  it("מפרט קיים מוצג עם תיוגי מקור — פרומפט התכנון רואה אותם", () => {
    const spec: EditSpec = {
      outer_silhouette: "a narrow band",
      sources: { outer_silhouette: "user" },
    };
    const p = buildInterviewTurnPrompt({ productType: "bracelet", turns, spec, asked: 2 });
    expect(p).toContain("Outer silhouette [user]: a narrow band");
  });

  it("‏utm נכנס רק כשהוא קיים (§3.4)", () => {
    expect(prompt).not.toContain("ARRIVED FROM AN AD");
    const p = buildInterviewTurnPrompt({
      productType: "bracelet", turns, spec: null, asked: 1, utm: "ad-story-01",
    });
    expect(p).toContain('creative id "ad-story-01"');
  });

  it("חוזה המדיום בפרומפט — בקשה מחוץ למדיום הופכת לשאלה (§2.5)", () => {
    expect(prompt).toContain("No engraving, no stones");
    // כיתוב מופנה לעורך ובאמת המכניקית: נקבע בתחילת יצירה, לא מתווסף אחר-כך.
    expect(prompt).toContain("full editor");
    expect(prompt).toContain("cannot be added to a finished piece");
  });

  it("דילוג לעולם אינו משאיר סבב בידיים ריקות — הכשל של הריצה החיה השנייה", () => {
    // דילוג מוקדם: המודל אינו רשאי לשאול שוב על הציר, ואם ירגיש שאין לו גם
    // מה לשאול וגם מה לסכם — יחזיר כלום, שנפסל, פעמיים, 502. הפרומפט סוגר
    // את הדלת: תמיד בדיוק אחד מ-ask/gallery/summary.
    expect(prompt).toContain("A skip never leaves the turn empty-handed");
    expect(prompt).toContain('exactly one of "ask" / "gallery" / "summary"');
  });

  it("פסקת הגלריה נכנסת עם אוצר התגים האמיתי — והתגים הם שפת אחזור, לא מרחב (§2.4)", () => {
    expect(prompt).toContain("THE GALLERY");
    // תג מהרשימה המאוצרת האמיתית של צמידים — הפרומפט נושא את האוצר עצמו.
    expect(prompt).toContain("מינימליסטי");
    // הגדר מול לקח 2: הרשימה מאנדקסת פריטים, אינה אוצר מילים למפרט.
    expect(prompt).toContain("not the design space");
    // גלריה נספרת בתקרה — ספירה אחת, מהתמליל.
    expect(prompt).toContain("A gallery counts as one of your questions");
  });

  it("בלוק הבחירה נכנס רק כשיש בחירה — ומקודד את inferred-בלי-להפשיר-user", () => {
    expect(prompt).not.toContain("SHE CHOSE FROM THE GALLERY");
    const p = buildInterviewTurnPrompt({
      productType: "bracelet",
      turns,
      spec: null,
      asked: 2,
      galleryChoice: "Concept: קו נודד\nCharacter: עדין",
    });
    expect(p).toContain("SHE CHOSE FROM THE GALLERY");
    expect(p).toContain("Concept: קו נודד");
    expect(p).toContain('as "inferred"');
    expect(p).toContain("it never overwrites her words");
  });
});

describe("parseInterviewTurn", () => {
  it("שאלה עם צ'יפים — סבב תקין", () => {
    const out = parseInterviewTurn(
      JSON.stringify({
        expectation: "quality",
        updated_spec: { metal_void_balance: "mostly open", sources: { metal_void_balance: "inferred" } },
        ask: { question: "שקט וסימטרי, או שבור?", chips: ["שקט", "שבור", 7, "  "] },
        summary: null,
      }),
      null,
    )!;
    expect(out.decision.ask).toEqual({ question: "שקט וסימטרי, או שבור?", chips: ["שקט", "שבור"] });
    expect(out.decision.summary).toBeNull();
    expect(out.decision.spec.metal_void_balance).toBe("mostly open");
    expect(out.decision.spec.sources?.metal_void_balance).toBe("inferred");
  });

  it("סיכום — סבב סוגר; וכששניהם הוחזרו, הסיכום גובר", () => {
    const out = parseInterviewTurn(
      JSON.stringify({
        ask: { question: "עוד שאלה?" },
        summary: "צמיד עדין ואוורירי — נכון?",
      }),
      null,
    )!;
    expect(out.decision.summary).toBe("צמיד עדין ואוורירי — נכון?");
    expect(out.decision.ask).toBeNull();
  });

  it("בלי שאלה ובלי סיכום — אין למסך מה להציג, הסבב פסול", () => {
    for (const raw of [
      JSON.stringify({ updated_spec: { elements: "three bars" } }),
      JSON.stringify({ ask: { question: "  " }, summary: "" }),
      "not json",
      "[]",
    ]) {
      expect(parseInterviewTurn(raw, null)).toBeNull();
    }
  });

  it("המיזוג אינו מפשיר `user` — הכשל ש-§1.3 קיים כדי למנוע", () => {
    const prior: EditSpec = {
      outer_silhouette: "a narrow band",
      sources: { outer_silhouette: "user" },
    };
    const out = parseInterviewTurn(
      JSON.stringify({
        // אותו ערך, מתויג מחדש נמוך יותר — התיוג המוחזק גובר.
        updated_spec: { outer_silhouette: "a narrow band", sources: { outer_silhouette: "inferred" } },
        ask: { question: "והקצוות?" },
      }),
      prior,
    )!;
    expect(out.decision.spec.sources?.outer_silhouette).toBe("user");
  });

  it("מפרט פסול בסבב אינו מוחק את הקודם — סבב בלי עדכון הוא מצב תקין", () => {
    const prior: EditSpec = { elements: "three bars", sources: { elements: "user" } };
    const out = parseInterviewTurn(
      JSON.stringify({ updated_spec: "garbage", ask: { question: "עוד?" } }),
      prior,
    )!;
    expect(out.decision.spec.elements).toBe("three bars");
    expect(out.decision.spec.sources?.elements).toBe("user");
  });

  it("גדר markdown אינה פוסלת סבב ששולם עליו", () => {
    const out = parseInterviewTurn(
      '```json\n{"ask": {"question": "מה הצללית?"}, "summary": null}\n```',
      null,
    );
    expect(out?.decision.ask?.question).toBe("מה הצללית?");
  });

  it("תור גלריה — סוג התור השלישי (§3.2): הזמנה ושאילתת תגים", () => {
    const out = parseInterviewTurn(
      JSON.stringify({
        gallery: { lead: "איזה מהם הכי מדבר אלייך?", tags: ["עדין", "אוורירי", 3, " "] },
        ask: null,
        summary: null,
      }),
      null,
    )!;
    expect(out.decision.gallery).toEqual({
      lead: "איזה מהם הכי מדבר אלייך?",
      tags: ["עדין", "אוורירי"],
    });
    expect(out.decision.ask).toBeNull();
    expect(out.decision.summary).toBeNull();
  });

  it("קדימות: סיכום גובר על גלריה, וגלריה על שאלה — בדיוק אחד מוצג", () => {
    const withSummary = parseInterviewTurn(
      JSON.stringify({
        gallery: { lead: "לבחור?", tags: [] },
        summary: "צמיד עדין — נכון?",
      }),
      null,
    )!;
    expect(withSummary.decision.summary).toBe("צמיד עדין — נכון?");
    expect(withSummary.decision.gallery).toBeNull();

    const withAsk = parseInterviewTurn(
      JSON.stringify({
        gallery: { lead: "לבחור?", tags: ["עדין"] },
        ask: { question: "עוד שאלה?" },
      }),
      null,
    )!;
    expect(withAsk.decision.gallery?.lead).toBe("לבחור?");
    expect(withAsk.decision.ask).toBeNull();
  });

  it("גלריה בלי הזמנה אינה תור — ובלי אף אחד משלושתם הסבב פסול", () => {
    const fallsToAsk = parseInterviewTurn(
      JSON.stringify({ gallery: { lead: " ", tags: ["עדין"] }, ask: { question: "מה חשוב לך?" } }),
      null,
    )!;
    expect(fallsToAsk.decision.gallery).toBeNull();
    expect(fallsToAsk.decision.ask?.question).toBe("מה חשוב לך?");
    expect(parseInterviewTurn(JSON.stringify({ gallery: { tags: ["עדין"] } }), null)).toBeNull();
  });

  it("שאילתה ריקה היא תור תקין — המסך נופל לגיוון על הרשימה המאוצרת", () => {
    const out = parseInterviewTurn(
      JSON.stringify({ gallery: { lead: "אולי נסתכל על כמה?", tags: "garbage" } }),
      null,
    )!;
    expect(out.decision.gallery).toEqual({ lead: "אולי נסתכל על כמה?", tags: [] });
  });
});

const DIRECTIONS = {
  product_type: "bracelet",
  designs: [
    {
      design_number: 1,
      length_to_width_ratio: 9,
      concept: "עדין וסימטרי",
      outer_silhouette: "a narrow band",
      metal_structure: "one rail",
      negative_space: "seven oval openings",
      rhythm_balance: "even",
      symmetry: "mirror along the length",
      ends_treatment: "straight",
      metal_void_balance: "about a third open",
      elements: "seven ovals, evenly spaced",
      region_map: "one continuous whole",
      manufacturability: "single connected piece",
      image_instruction: "draw a narrow band with seven oval openings",
      sources: { outer_silhouette: "user", symmetry: "inferred", ends_treatment: "chosen" },
    },
    {
      design_number: 2,
      length_to_width_ratio: 9,
      concept: "עדין וזורם",
      outer_silhouette: "a narrow band",
      metal_structure: "one rail",
      negative_space: "a travelling line",
      rhythm_balance: "flowing",
      manufacturability: "single connected piece",
      image_instruction: "draw a narrow band with a travelling line",
      sources: { outer_silhouette: "user" },
    },
    {
      design_number: 3,
      length_to_width_ratio: 9,
      concept: "עדין ונקי",
      outer_silhouette: "a narrow band",
      metal_structure: "solid",
      negative_space: "none",
      rhythm_balance: "calm",
      manufacturability: "single connected piece",
      image_instruction: "draw a plain narrow band",
      sources: { outer_silhouette: "user" },
    },
  ],
};

describe("parseInterviewDirections", () => {
  it("הקבילות היא בדיוק זו של designStage — אותו צינור, אותו רף", () => {
    const out = parseInterviewDirections(JSON.stringify(DIRECTIONS))!;
    expect(out.spec.designs).toHaveLength(3);
    // מעט מדי כיוונים — נפסל, כמו שם.
    expect(
      parseInterviewDirections(JSON.stringify({ designs: DIRECTIONS.designs.slice(0, 2) })),
    ).toBeNull();
    // כיוון בלי הוראת ציור — נפסל.
    const broken = structuredClone(DIRECTIONS);
    broken.designs[1].image_instruction = "";
    expect(parseInterviewDirections(JSON.stringify(broken))).toBeNull();
  });

  it("‏renderJson נקי מ-`sources` — תיוגי מקור אינם מגיעים לפרומפט הביצוע (§1.3)", () => {
    const out = parseInterviewDirections(JSON.stringify(DIRECTIONS))!;
    expect(out.renderJson).not.toContain("sources");
    expect(out.renderJson).not.toContain('"user"');
    // והגיאומטריה כן — כולל השדות המורחבים: הם עוד מפרט סגור.
    expect(out.renderJson).toContain("seven oval openings");
    expect(out.renderJson).toContain("mirror along the length");
    // ‏json המקורי נשאר עם המקורות — הוא מה שמזריע את העריכה.
    expect(out.json).toContain("sources");
  });

  it("‏renderJsonOf דטרמיניסטי — אותו מפרט, אותו טקסט, בכל קריאה", () => {
    const a = renderJsonOf(DIRECTIONS);
    expect(renderJsonOf(structuredClone(DIRECTIONS))).toBe(a);
  });
});

describe("buildInterviewDirectionsPrompt", () => {
  const spec: EditSpec = {
    outer_silhouette: "a narrow band",
    metal_void_balance: "about a third open",
    sources: { outer_silhouette: "user", metal_void_balance: "inferred" },
  };
  const prompt = buildInterviewDirectionsPrompt({
    productType: "bracelet",
    spec,
    summary: "צמיד צר ואוורירי — נכון?",
  });

  it("המפרט המוסכם נכנס עם מקורות, והסיכום המאושר לצידו", () => {
    expect(prompt).toContain("Outer silhouette [user]: a narrow band");
    expect(prompt).toContain("צמיד צר ואוורירי — נכון?");
  });

  it("הכלל המרכזי של §1.2/§1.3 כתוב: שדות user זהים בכל הכיוונים", () => {
    expect(prompt).toContain("IDENTICAL, word for word, in every direction");
    // והדמיון בין כיוונים של מי שסגרה הכול הוא נכון, לא כשל (§3.1).
    expect(prompt).toContain("that is correct");
  });
});

describe("askedOf / coerceInterviewTurns", () => {
  it("המניין מהתמליל: כל תור של המראיינת נספר — שמרני בכיוון שמקצר", () => {
    expect(askedOf(turns)).toBe(1);
    expect(askedOf([...turns, { role: "interviewer", text: "סיכום" }])).toBe(2);
  });

  it("ניקוי תמליל: תפקיד לא מוכר נקרא כלקוחה, ריק נזרק, ארוך נחתך", () => {
    const out = coerceInterviewTurns([
      { role: "interviewer", text: " שאלה " },
      { role: "boss", text: "x".repeat(3000) },
      { role: "customer", text: "   " },
      null,
      "junk",
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ role: "interviewer", text: "שאלה" });
    expect(out[1].role).toBe("customer");
    expect(out[1].text).toHaveLength(2000);
  });
});
