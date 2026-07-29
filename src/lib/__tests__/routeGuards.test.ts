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
  // "מי עיצב מה" וקבצי הייצור שלו. הייצוא כאן מקבל מזהה עיצוב ובכל זאת אינו
  // נבדק על בעלות (למטה) — בכוונה: הבק־אופיס מוריד עיצוב של לקוחה, כלומר
  // עיצוב שאיש מהמסלולים המזוהים אינו הבעלים שלו. השער הוא ADMIN_TOKEN, והוא
  // חייב להופיע בכל מסלול בתיקייה.
  join(API, "admin/designs"),
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


/**
 * מספרי המיגרציות. ה-runner מריץ את כל הקבצים בסדר שמות בכל push, ולכן שני
 * קבצים באותו מספר עדיין *עובדים* — ובדיוק בגלל זה אף אחד לא שם לב. זה קרה
 * כאן פעמיים: פעם על 0004 ופעם על 0009, כששני ענפים פתוחים בחרו את אותו מספר
 * בלי לדעת זה על זה. הבדיקה עולה שורה, וההתנגשות מתגלה ב-PR ולא בקריאה
 * מקרית של לוג פריסה.
 */
describe("migration numbering", () => {
  it("has no duplicate prefixes", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      const n = f.slice(0, 4);
      const prev = seen.get(n);
      if (prev) dupes.push(`${n}: ${prev} + ${f}`);
      else seen.set(n, f);
    }
    expect(dupes).toEqual([]);
  });
});
