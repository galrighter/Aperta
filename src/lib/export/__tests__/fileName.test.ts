import { describe, expect, it } from "vitest";
import { exportFileBase } from "../fileName";

describe("exportFileBase", () => {
  it("is the serial and the ordered dimensions", () => {
    expect(exportFileBase({ serial: 75 }, 120, 12)).toBe("0075-120-12");
  });

  it("keeps a tenth of a millimetre, and only when there is one", () => {
    // אורך נגזר מהיקף שנמדד ולכן כמעט לעולם אינו שלם. 104.4 הוא פריט אמיתי,
    // ו-"104" בשם הקובץ מתאר פריט אחר.
    expect(exportFileBase({ serial: 65 }, 104.4, 12)).toBe("0065-104.4-12");
    expect(exportFileBase({ serial: 65 }, 104.0, 12.0)).toBe("0065-104-12");
    expect(exportFileBase({ serial: 65 }, 104.44, 11.96)).toBe("0065-104.4-12");
  });

  it("falls back to the dimensions alone before the serial existed", () => {
    expect(exportFileBase({ serial: null }, 120, 12)).toBe("120-12");
    expect(exportFileBase({ serial: undefined }, 120, 12)).toBe("120-12");
  });

  it("uses the sample number under the root design's serial, not its own (0018)", () => {
    expect(exportFileBase({ serial: 86, root_serial: 85, sample_no: 2 }, 120, 12)).toBe(
      "0085.2-120-12",
    );
  });
});
