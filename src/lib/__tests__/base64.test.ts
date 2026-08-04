import { describe, expect, it } from "vitest";
import { base64ToBytes } from "../base64";

// הניסוח שהוחלף כאן, `Uint8Array.from(atob(s), fn)`, עלה 1,921ms ו-149MB על
// תמונה של 5MB — פעולה בודדת מעל תקרת ה-isolate. מה שנבדק הוא שההחלפה שומרת
// על ההתנהגות, כולל הזריקה על קלט פסול שהיא הסיבה להישאר עם `atob`.

describe("base64ToBytes", () => {
  it("מפענח בייטים בדיוק", () => {
    // "Hello" — הבדיקה היא על הערכים, לא על האורך בלבד.
    expect(Array.from(base64ToBytes("SGVsbG8="))).toEqual([72, 101, 108, 108, 111]);
  });

  it("שומר על בייטים מעל 127", () => {
    // כאן נשבר פענוח שמניח UTF-8: תמונה היא בינארית, לא טקסט.
    const bytes = base64ToBytes(btoa(String.fromCharCode(0, 127, 128, 255)));
    expect(Array.from(bytes)).toEqual([0, 127, 128, 255]);
  });

  it("מחזיר Uint8Array באורך הנכון על מטען גדול", () => {
    const raw = String.fromCharCode(...Array.from({ length: 4096 }, (_, i) => i % 256));
    const bytes = base64ToBytes(btoa(raw));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(4096);
    expect(bytes[4095]).toBe(4095 % 256);
  });

  it("זורק על base64 פסול", () => {
    // זו הסיבה שנשארנו עם `atob` ולא עברנו ל-`Buffer.from(s, 'base64')`,
    // שמדלג על תווים לא-חוקיים בשקט. מה שעובר כאן הוא קלט של משתמשת.
    expect(() => base64ToBytes("not base64 !!")).toThrow();
  });

  it("מחזיר ריק על מחרוזת ריקה", () => {
    expect(base64ToBytes("").length).toBe(0);
  });
});
