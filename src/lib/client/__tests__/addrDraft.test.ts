import { describe, expect, it, beforeEach, vi } from "vitest";
import { clearAddrDraft, loadAddrDraft, saveAddrDraft, type AddrDraft } from "../addrDraft";

// אחסון מקומי מדומה — הטסטים רצים ב-node, ומה שנבדק כאן הוא ההתנהגות מסביב
// לאחסון ולא האחסון עצמו.
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const ADDR: AddrDraft = {
  name: "דנה כהן", street: "הרצל 14", city: "תל אביב",
  zip: "6100001", phone: "050-1234567", email: "dana@example.com",
};

beforeEach(() => vi.stubGlobal("localStorage", fakeStorage()));

describe("טיוטת הכתובת", () => {
  it("מה שהוקלד חוזר אחרי רענון", () => {
    saveAddrDraft(ADDR);
    expect(loadAddrDraft()).toEqual(ADDR);
  });

  it("שדות ריקים אינם נשמרים — הם ייפתחו ממילא מהחשבון", () => {
    saveAddrDraft({ ...ADDR, zip: "", phone: "" });
    const draft = loadAddrDraft();
    expect(draft).not.toHaveProperty("zip");
    expect(draft).not.toHaveProperty("phone");
    expect(draft?.city).toBe("תל אביב");
  });

  it("טופס ריק לגמרי אינו כותב כלום", () => {
    saveAddrDraft({ name: "", street: "", city: "", zip: "", phone: "", email: "" });
    expect(loadAddrDraft()).toBeNull();
  });

  it("היציאה מהחשבון מוחקת — מחשב משותף אינו מקרה קצה", () => {
    saveAddrDraft(ADDR);
    clearAddrDraft();
    expect(loadAddrDraft()).toBeNull();
  });

  it("מה שנקרא מהדיסק אינו מה שנכתב אליו: זבל נזרק ולא מגיע לטופס", () => {
    localStorage.setItem("aperta.checkout.addr", "{ not json");
    expect(loadAddrDraft()).toBeNull();

    localStorage.setItem(
      "aperta.checkout.addr",
      JSON.stringify({ name: 42, city: "חיפה", evil: "<script>", zip: null }),
    );
    expect(loadAddrDraft()).toEqual({ city: "חיפה" });
  });
});
