import { describe, expect, it } from "vitest";
import { buildShareSnapshot } from "../shareSnapshot";
import type { DesignRow, VersionRow } from "../db/designs";

// הצילום הוא כל מה שדף השיתוף יראה לנצח. מה שנבדק כאן הוא בדיוק ההחלטות
// שהמיגרציה מנמקת: המסגרת נלקחת מה-SVG ולא משורת העיצוב, ונתיב ההדמיה נקרא
// בהגנה מתוך דוח שנכתב אולי לפני שהשדה הזה היה קיים.

const design = (over: Partial<DesignRow> = {}): DesignRow => ({
  id: "d-1",
  profile_id: "p-1",
  serial: 47,
  root_design_id: null,
  root_serial: null,
  sample_no: null,
  name: "צמיד",
  product_type: "bracelet",
  length_mm: 160,
  width_mm: 18,
  gap_mm: 25,
  thickness_mm: 1.5,
  current_version_id: "v-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

const svg = (viewBox: string, cutouts = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><g id="cutouts">${cutouts}</g></svg>`;

const version = (over: Partial<VersionRow> = {}): VersionRow => ({
  id: "v-1",
  design_id: "d-1",
  version_no: 1,
  svg: svg("0 0 160 18"),
  source: "generate",
  user_prompt: null,
  annotation_png_path: null,
  validation_report: {},
  validation_status: "pass",
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("buildShareSnapshot", () => {
  it("takes the frame from the SVG, not from the design row", () => {
    // שורת העיצוב שומרת את מה שהוזמן; ה-SVG שומר את מה שנחתך. השיתוף מציג
    // את השני.
    const snap = buildShareSnapshot(
      design({ length_mm: 160, width_mm: 18 }),
      version({ svg: svg("0 0 171.4 17.6") }),
    );
    expect(snap.length_mm).toBe(171.4);
    expect(snap.width_mm).toBe(17.6);
  });

  it("falls back to the design row when the SVG has no usable viewBox", () => {
    const snap = buildShareSnapshot(
      design(),
      version({ svg: "<svg xmlns='http://www.w3.org/2000/svg'></svg>" }),
    );
    expect(snap.length_mm).toBe(160);
    expect(snap.width_mm).toBe(18);
  });

  it("copies the SVG itself, so a later overwrite of the version cannot change it", () => {
    const v = version({ svg: svg("0 0 160 18", '<path d="M1 1L2 2L1 2Z" fill="black"/>') });
    expect(buildShareSnapshot(design(), v).svg).toBe(v.svg);
  });

  it("reads the render path out of the validation report", () => {
    const snap = buildShareSnapshot(
      design(),
      version({ validation_report: { status: "pass", renderPngPath: "renders/d-1/9.png" } }),
    );
    expect(snap.render_path).toBe("renders/d-1/9.png");
  });

  it("survives a report written before that field existed", () => {
    for (const report of [null, {}, { renderPngPath: 42 }, { renderPngPath: "" }, "not an object"]) {
      expect(
        buildShareSnapshot(design(), version({ validation_report: report })).render_path,
      ).toBeNull();
    }
  });

  it("carries the serial, so the page can show AP-0047", () => {
    expect(buildShareSnapshot(design({ serial: 47 }), version()).serial).toBe(47);
    expect(buildShareSnapshot(design({ serial: null }), version()).serial).toBeNull();
  });

  it("shares an unparsable design without geometry instead of throwing", () => {
    // ההדמיה תיפול לפריסה השטוחה; מה שאסור הוא ששיתוף ייכשל בגלל זה.
    const snap = buildShareSnapshot(design(), version({ svg: svg("0 0 160 18", "<nope/>") }));
    expect(snap.svg).toContain("nope");
  });
});

// תוכנית גשרי הכיתוב נוסעת עם הצילום (0021). בלעדיה, "להזמין כזה" מטפל בכל
// חלל של אות כאי בעיטור — גשר לפי הקישור הקצר ביותר, ובעברית זה הכיוון הלא נכון.
describe("buildShareSnapshot — תוכנית הגשרים", () => {
  const plan = [{ char: "ם", counter: [13, 4.5, 15, 5.5], rects: [[11.5, 4.6, 14, 5.4]], widthMm: 0.75 }];

  it("נושא את התוכנית שנשמרה על הגרסה", () => {
    const snap = buildShareSnapshot(design(), version({ validation_report: { letterBridges: plan } }));
    expect(snap.letter_bridges).toEqual(plan);
  });

  it("גרסה בלי כיתוב, ודוח מלפני השדה — null ולא כשל", () => {
    // זה הרוב הקיים במסד, ואימוץ בלעדיה הוא בדיוק ההתנהגות שהייתה עד כה.
    expect(buildShareSnapshot(design(), version()).letter_bridges).toBeNull();
    expect(
      buildShareSnapshot(design(), version({ validation_report: { letterBridges: null } })).letter_bridges,
    ).toBeNull();
    expect(
      buildShareSnapshot(design(), version({ validation_report: { letterBridges: [] } })).letter_bridges,
    ).toBeNull();
  });

  it("מסנן רשומה פגומה במקום להפיל שיתוף שכבר תקין", () => {
    const snap = buildShareSnapshot(
      design(),
      version({ validation_report: { letterBridges: [...plan, { char: "x" }, null] } }),
    );
    expect(snap.letter_bridges).toEqual(plan);
  });
});
