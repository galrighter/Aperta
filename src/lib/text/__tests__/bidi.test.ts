import { describe, it, expect } from "vitest";
import { visualOrder } from "../stencil";

// opentype מצייר תמיד משמאל לימין, ולכן המחרוזת נמסרת לו בסדר חזותי. מה
// שנבדק כאן הוא בדיוק מה שנשבר קודם: השם יצא נכון והמספר יצא הפוך.

describe("visual order for a right-to-left string", () => {
  it("reverses Hebrew so it reads right to left when drawn LTR", () => {
    expect(visualOrder("ענבל")).toBe("לבנע");
  });

  it("leaves a purely Latin string alone", () => {
    expect(visualOrder("Hayley 2026")).toBe("Hayley 2026");
  });

  it("keeps digits readable inside a Hebrew string", () => {
    // הספרות עולות משמאל לימין גם במשפט עברי — "2026" ולא "6202"
    expect(visualOrder("היילי 2026")).toContain("2026");
  });

  it("keeps a Latin word readable inside a Hebrew string", () => {
    const out = visualOrder("היילי ABC");
    expect(out).toContain("ABC");
    expect(out).not.toContain("CBA");
  });

  it("mirrors brackets, so the order flip does not turn ( into )", () => {
    const out = visualOrder("(ענבל)");
    expect(out.startsWith("(")).toBe(true);
    expect(out.endsWith(")")).toBe(true);
  });
});
