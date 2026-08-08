import { describe, expect, it, vi, afterEach } from "vitest";
import { newOrderKey } from "../model";

// המפתח נשלח כ-uuid ונבדק ככזה בשרת (`z.string().uuid()`). מפתח בצורה אחרת
// אינו "פחות ייחודי" — הוא 400 על הזמנה מלאה.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("newOrderKey", () => {
  it("uuid v4 תקין", () => {
    expect(newOrderKey()).toMatch(UUID_V4);
  });

  it("מפתח חדש בכל קריאה — אחרת שתי הזמנות נפרדות נראות כאותו ניסיון", () => {
    const keys = new Set(Array.from({ length: 50 }, () => newOrderKey()));
    expect(keys.size).toBe(50);
  });

  it("גם בלי randomUUID — הקשר לא מאובטח אינו סיבה שכפתור השליחה יזרוק", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: real.getRandomValues.bind(real) });
    expect(newOrderKey()).toMatch(UUID_V4);
  });

  it("וגם בלי crypto בכלל", () => {
    vi.stubGlobal("crypto", undefined);
    expect(newOrderKey()).toMatch(UUID_V4);
  });
});
