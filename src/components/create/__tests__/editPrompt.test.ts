import { describe, it, expect } from "vitest";
import { INITIAL, buildEditPrompt, type CreateState } from "../model";

const state = (patch: Partial<CreateState>): CreateState => ({ ...INITIAL, ...patch });

describe("buildEditPrompt", () => {
  it("asks for the change, and says where", () => {
    expect(buildEditPrompt(state({ editReq: "לדלל את החיתוכים", region: "right" })))
      .toBe("שינוי באזור ימין של הפריט: לדלל את החיתוכים");
    expect(buildEditPrompt(state({ editReq: "לדלל את החיתוכים", region: "all" })))
      .toBe("שינוי בעיצוב כולו: לדלל את החיתוכים");
  });

  it("says nothing about tuning while the sliders are untouched", () => {
    const p = buildEditPrompt(state({ editReq: "פחות חיתוכים" }));
    expect(p).not.toContain("צפיפות");
    expect(p).not.toContain("גשרים");
  });

  it("carries the tuning only once the customer has moved a slider", () => {
    expect(buildEditPrompt(state({ editReq: "x", cutDensity: 14 })))
      .toContain("כוונן את הצפיפות לכ-14 חיתוכים לאורך");
    expect(buildEditPrompt(state({ editReq: "x", bridgeMm: 4 })))
      .toContain('עובי גשרים של לפחות 4 מ"מ');
  });
});
