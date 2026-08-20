import { describe, expect, it, vi, beforeEach } from "vitest";

// מחיקת עיצוב שיש לו דוגמאות. ה-FK מאפס `root_design_id` לבדו, ו-
// `designs_sample_fields_check` דורש ש-`sample_no` יתרוקן יחד איתו — כך שהמחיקה
// עצמה ייצרה את ההפרה ונדחתה ב-`23514`. בניקוי יומן היצירות (20.8) זה עצר את
// מחיקת AP-0111 על שלוש הדוגמאות שלו. השמירה כאן היא על הסדר: הניתוק חייב
// לקרות **לפני** ה-delete, אחרת אין לו את מי לנתק.

const requireDesignAccess = vi.fn();
const hasActiveOrderForDesign = vi.fn();
const detachSamples = vi.fn();
const listVersions = vi.fn();

/** רישום פעולות ה-DB לפי סדרן, כדי לבדוק סדר ולא רק קריאה. */
const steps: string[] = [];

const supabaseAdmin = () => ({
  from: (table: string) => ({
    delete: () => ({
      eq: (col: string, val: unknown) => {
        steps.push(`delete ${table} ${col}=${val}`);
        return Promise.resolve({ error: null });
      },
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: (col: string, val: unknown) => {
        steps.push(`update ${table}(${Object.keys(patch).join(",")}) ${col}=${val}`);
        return Promise.resolve({ error: null });
      },
    }),
  }),
});

vi.mock("@/lib/db/supabase", () => ({ supabaseAdmin: () => supabaseAdmin() }));
vi.mock("@/lib/designAccess", () => ({
  requireDesignAccess: (...a: unknown[]) => requireDesignAccess(...a),
}));
vi.mock("@/lib/db/orders", () => ({
  hasActiveOrderForDesign: (...a: unknown[]) => hasActiveOrderForDesign(...a),
}));
vi.mock("@/lib/db/designs", () => ({
  detachSamples: (...a: unknown[]) => detachSamples(...a),
  listVersions: (...a: unknown[]) => listVersions(...a),
}));

const { DELETE } = await import("../route");

const DESIGN_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const req = new Request(`https://aperta.test/api/designs/${DESIGN_ID}`, { method: "DELETE" });
const params = { params: Promise.resolve({ id: DESIGN_ID }) };

beforeEach(() => {
  steps.length = 0;
  vi.clearAllMocks();
  requireDesignAccess.mockResolvedValue({ id: DESIGN_ID });
  hasActiveOrderForDesign.mockResolvedValue(false);
  detachSamples.mockImplementation(async () => {
    steps.push("detachSamples");
  });
});

describe("DELETE /api/designs/[id] — עיצוב עם דוגמאות", () => {
  it("מנתק את הדוגמאות לפני מחיקת העיצוב", async () => {
    const res = await DELETE(req, params);

    expect(res.status).toBe(200);
    expect(detachSamples).toHaveBeenCalledWith(DESIGN_ID);

    const detachAt = steps.indexOf("detachSamples");
    const deleteAt = steps.indexOf(`delete designs id=${DESIGN_ID}`);
    expect(detachAt).toBeGreaterThanOrEqual(0);
    expect(deleteAt).toBeGreaterThanOrEqual(0);
    expect(detachAt).toBeLessThan(deleteAt);
  });

  it("מפסיק לפני כל נגיעה ב-DB כשיש הזמנה פעילה", async () => {
    hasActiveOrderForDesign.mockResolvedValue(true);

    const res = await DELETE(req, params);

    expect(res.status).toBe(409);
    expect(detachSamples).not.toHaveBeenCalled();
    expect(steps).toEqual([]);
  });
});
