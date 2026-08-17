import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// הניקוי שמוציא את הקנרית מיומן היצירות.
//
// מה שנבדק כאן הוא **מה נמחק ובאיזה סדר** — שתי ההחלטות שהפרתן שקטה: מחיקה
// של הרצה שנכשלה מוחקת את הראיה היחידה שיש, ומחיקה בסדר הפוך משאירה בייטים
// שאיש כבר לא יודע עליהם ושורת job שחוזרת ליומן כ"ניסיון בלי הרצה".

const listPurgeableCanaryRuns = vi.fn();
const deleteRuns = vi.fn();
const deleteJobsForRuns = vi.fn();
const removeFiles = vi.fn();
/** סדר הקריאות בין המודולים — מה שאי אפשר לבדוק בכל mock בנפרד. */
const calls: string[] = [];

vi.mock("@/lib/db/runs", () => ({
  listPurgeableCanaryRuns: (...a: unknown[]) => listPurgeableCanaryRuns(...a),
  deleteRuns: (...a: unknown[]) => {
    calls.push("runs");
    return deleteRuns(...a);
  },
}));
vi.mock("@/lib/db/jobs", () => ({
  deleteJobsForRuns: (...a: unknown[]) => {
    calls.push("jobs");
    return deleteJobsForRuns(...a);
  },
}));
vi.mock("@/lib/db/storage", () => ({
  removeFiles: (...a: unknown[]) => {
    calls.push("files");
    return removeFiles(...a);
  },
}));

const { purgeHealthyCanaryRuns, filesOf, CANARY_PURGE_LIMIT } = await import("../canary");

const run = (id: string) => ({
  id,
  render_path: `renders/x/${id}-0.png`,
  stage_paths: { conditioned: `runs/${id}/conditioned.png`, overlay: `runs/${id}/overlay.png` },
  input_image_path: null,
});

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  removeFiles.mockResolvedValue(undefined);
  deleteJobsForRuns.mockResolvedValue(0);
  deleteRuns.mockImplementation((ids: string[]) => Promise.resolve(ids.length));
});

describe("ניקוי הרצות הקנרית", () => {
  it("מוחק את הקבצים לפני השורה", async () => {
    // הסדר הוא מה שהופך נפילה באמצע לתיקון-מעצמו: כל עוד השורה כאן, הסבב
    // הבא ימצא אותה שוב עם אותם נתיבים. מחיקה של השורה קודם מאבדת אותם.
    listPurgeableCanaryRuns.mockResolvedValue([run("a")]);
    await purgeHealthyCanaryRuns();
    expect(calls).toEqual(["files", "jobs", "runs"]);
    expect(removeFiles).toHaveBeenCalledWith([
      "renders/x/a-0.png", "runs/a/conditioned.png", "runs/a/overlay.png",
    ]);
  });

  it("מוחק את שורת ה-job לפני שורת ההרצה", async () => {
    // בקשה בלי הרצה חוזרת ליומן כ"ניסיון שלא הגיע לשורת הרצה" (runs/orphans).
    // כלומר הסדר ההפוך מחליף רעש ברעש, ולרגע גם מייצר כישלון שלא קרה.
    listPurgeableCanaryRuns.mockResolvedValue([run("a")]);
    await purgeHealthyCanaryRuns();
    expect(calls.indexOf("jobs")).toBeLessThan(calls.indexOf("runs"));
    expect(deleteJobsForRuns).toHaveBeenCalledWith(["a"]);
  });

  it("מדווח כמה נמחק", async () => {
    listPurgeableCanaryRuns.mockResolvedValue([run("a"), run("b")]);
    deleteJobsForRuns.mockResolvedValue(1);
    const report = await purgeHealthyCanaryRuns();
    expect(report).toEqual({ runs: 2, jobs: 1, files: 6 });
  });

  it("לא נוגע בכלום כשאין מה לנקות", async () => {
    listPurgeableCanaryRuns.mockResolvedValue([]);
    expect(await purgeHealthyCanaryRuns()).toEqual({ runs: 0, jobs: 0, files: 0 });
    expect(removeFiles).not.toHaveBeenCalled();
    expect(deleteRuns).not.toHaveBeenCalled();
    expect(deleteJobsForRuns).not.toHaveBeenCalled();
  });

  it("עובר עם תקרה — סבב שנחתך נאסף בסבב הבא", async () => {
    listPurgeableCanaryRuns.mockResolvedValue([]);
    await purgeHealthyCanaryRuns();
    expect(listPurgeableCanaryRuns).toHaveBeenCalledWith(CANARY_PURGE_LIMIT);
  });

  it("אוסף את כל נתיבי השורה ומדלג על מה שאין", () => {
    expect(filesOf({ id: "a", render_path: null, stage_paths: null, input_image_path: null })).toEqual([]);
    expect(
      filesOf({
        id: "a",
        render_path: "renders/a.png",
        stage_paths: { conditioned: "runs/a/c.png", overlay: "" },
        input_image_path: "inputs/a.png",
      }),
    ).toEqual(["renders/a.png", "runs/a/c.png", "inputs/a.png"]);
  });
});

describe("מי מפעיל את הניקוי", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const WRANGLER = read("wrangler.jsonc");
  const ENTRY = read("worker-entry.js");
  const crons = [
    ...(WRANGLER.match(/"crons":\s*\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g),
  ].map((m) => m[1]);

  it("כל תזמון ב-wrangler יודע לאן ללכת", () => {
    // ‏`event.cron` הוא הביטוי כלשונו, וטבלת הניתוב ב-worker-entry ממופתחת בו.
    // תזמון שנוסף שם ולא כאן נופל בשקט לברירת המחדל — כלומר יורה בסריקה
    // ומדווח עליה בשמה, ומה שהוא נועד להריץ פשוט לא רץ.
    expect(crons.length).toBeGreaterThan(1);
    for (const cron of crons) expect(ENTRY).toContain(`"${cron}"`);
  });

  it("הניקוי רץ כל שעתיים — בקצב של הקנרית עצמה", () => {
    const purge = crons.find((c) => c.includes("*/2"));
    expect(purge).toMatch(/^\d+ \*\/2 \* \* \*$/);
    expect(ENTRY).toContain("/api/jobs/canary-purge");
  });

  it("ולא בדקה שבה הסריקה ממילא יורה", () => {
    // שני מתזמנים באותה דקה נכנסים לאותו isolate בלי שום צורך.
    const purgeMinute = Number(crons.find((c) => c.includes("*/2"))?.split(" ")[0]);
    expect(purgeMinute % 10).not.toBe(0);
  });
});

describe("מי נרשם כקנרית", () => {
  const RUNS = readFileSync(join(process.cwd(), "src/lib/db/runs.ts"), "utf8");
  const ROUTE = readFileSync(join(process.cwd(), "src/app/api/generate/route.ts"), "utf8");

  it("נשלף רק מה שהצליח — כישלון של הקנרית נשאר ביומן", () => {
    // זו הראיה היחידה שיש כשהקנרית מאדימה, והיא מה שהתורן האוטומטי קורא
    // (docs/AUTOFIX_ROUTINE.md). מחיקה שלה הופכת את הבדיקה לחסרת תוצאה.
    const fn = RUNS.slice(RUNS.indexOf("export async function listPurgeableCanaryRuns"));
    expect(fn.slice(0, fn.indexOf("\n}"))).toContain('.eq("status", "approved")');
  });

  it("הסימון עובר שער אדמין", () => {
    // בלי השער כל אחד היה יכול לסמן את ההרצה שלו כקנרית — כלומר לגרום
    // למחיקה שלה מהיומן שעתיים אחר כך.
    expect(ROUTE).toContain("body.canary) requireAdmin(req)");
  });
});
