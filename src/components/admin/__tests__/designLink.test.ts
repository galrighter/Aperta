import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// "לחצתי על העיצוב ביומן היצירות והוא לקח אותי למסך היצירה" — 11.8.
//
// הקישור מהיומן הצביע על המשפך של הלקוחה (`/design?resume=<id>`), ושם הקריאה
// עוברת דרך `requireDesignAccess`, כלומר דרך **בעלות**. אדמין שפתח עיצוב של
// לקוחה קיבל 403, המשפך נשאר במצב ההתחלתי, וההודעה על הכשל מוצגת רק בתוך
// מגירת "העיצובים שלי" — שאינה מרונדרת כשאין רשימה מקומית. כלומר: נחיתה שקטה
// על מסך בחירת המוצר בזמן שהעיצוב מוכן ושמור.
//
// שלושת החלקים נשמרים כאן יחד, כי תיקון של אחד בלי השני מחזיר את אותה חוויה:
// (א) היומן מצביע על מסלול שעובר בשער האדמין, (ב) המסלול הזה קיים ומגודר,
// (ג) כשל בפתיחת עיצוב נשאר גלוי גם בלי רשימה מקומית.

const SRC = join(process.cwd(), "src");
const RUNS_LOG = readFileSync(join(SRC, "components/admin/RunsLog.tsx"), "utf8");
const API_ROUTE = join(SRC, "app/api/admin/designs/[id]/route.ts");
const PAGE = join(SRC, "app/admin/designs/[id]/page.tsx");

describe("the runs log link to a design", () => {
  it("points at the admin route and not at the ownership-gated funnel", () => {
    expect(RUNS_LOG).toContain("href={`/admin/designs/${it.designId}`}");
    // `/design?resume=` נפתח רק אצל מי שהעיצוב רשום עליו — ולבק־אופיס זה אף
    // פעם לא המקרה בעיצוב של לקוחה. הבדיקה על ה-`href` ולא על הקובץ: ההסבר
    // למה הקישור השתנה מזכיר את הכתובת הישנה, וזה בדיוק מה שצריך להישאר כתוב.
    expect(RUNS_LOG).not.toMatch(/href=\{[^}]*\/design\?resume=/);
  });

  it("has a page to land on", () => {
    expect(existsSync(PAGE)).toBe(true);
  });

  it("reads the design through the admin gate, not through ownership", () => {
    expect(existsSync(API_ROUTE)).toBe(true);
    const route = readFileSync(API_ROUTE, "utf8");
    expect(route).toContain("requireAdmin(req)");
    expect(route).not.toContain("requireDesignAccess");
  });
});

describe("a failed resume", () => {
  it("stays visible even when there is no local list to hang it on", () => {
    const saved = readFileSync(join(SRC, "components/create/SavedDesigns.tsx"), "utf8");
    const empty = saved.slice(saved.indexOf("if (items.length === 0)"));
    expect(empty).not.toBe("");
    // הענף הריק חייב להזכיר את `error` לפני שהוא מחזיר `null`.
    const branch = empty.slice(0, empty.indexOf("return (\n    <div className=\"border border-graphite/10 bg-white\">"));
    expect(branch).toContain("error");
  });
});
