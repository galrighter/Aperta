import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// E4 ב-docs/TODO.md היה "לוודא שאין מסלול נוסף בלי שער" — grep חד־פעמי. הטסט
// הזה הופך אותו לשמירה קבועה: ארבעת מסלולי ה-debug נותרו פתוחים לציבור במשך
// חודשים בלי שאיש שם לב, והדרך היחידה שזה לא יקרה שוב היא שהמסלול החמישי
// ייכשל בבנייה ולא בייצור.

const API = join(process.cwd(), "src/app/api");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

/** מסלולים שחייבים שער אדמין: יומן ההרצות (טקסט חופשי של לקוחות, פרומפטים
 *  והדמיות) והאבחון שפונה ל-OpenAI עם המפתח שלנו. */
const ADMIN_ONLY = [
  join(API, "debug"),
  join(API, "llm-health"),
  join(API, "inquiries"),
];

describe("admin-only API routes", () => {
  const guarded = ADMIN_ONLY.flatMap(routeFiles);

  it("covers every debug route", () => {
    // אם נוסף מסלול debug והמספר לא עודכן — סימן שמישהו צריך להסתכל עליו.
    expect(routeFiles(join(API, "debug")).length).toBe(4);
  });

  it.each(guarded.map((f) => [f.slice(API.length + 1), f]))(
    "%s calls requireAdmin",
    (_name, file) => {
      expect(readFileSync(file, "utf8")).toContain("requireAdmin(req)");
    },
  );
});

/** מסלולים שמקבלים מזהה של עיצוב קיים (ישירות, או דרך גרסה/הרצה) ולכן חייבים
 *  לבדוק בעלות. מזהה עיצוב אינו סוד — הוא עובר בכתובות, ביומנים ובקישורים. */
const OWNERSHIP_ROUTES = [
  "designs/[id]/route.ts",
  "designs/[id]/choose/route.ts",
  "designs/[id]/duplicate/route.ts",
  "generate/route.ts",
  "generate/[jobId]/route.ts",
  "vectorize/route.ts",
  "export/route.ts",
];

describe("routes that take a design id", () => {
  it.each(OWNERSHIP_ROUTES)("%s resolves ownership", (rel) => {
    expect(readFileSync(join(API, rel), "utf8")).toMatch(
      /requireDesignAccess\(req,|assertDesignAccess\(req,/,
    );
  });
});
