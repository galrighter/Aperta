import { describe, it, expect } from "vitest";
import { imageVersion, shareImageUrl } from "../shareImageUrl";

const BASE = "https://rmjewel.com";

describe("shareImageUrl", () => {
  it("emits an image for a share that has only a capture", () => {
    // הבאג שהיה כאן: התנאי היה על `render_path` בלבד, בזמן שהמסלול מגיש
    // `preview_path ?? render_path`. שיתוף עם צילום ובלי הדמיה נשלח בלי תמונה
    // בכלל — כשהתמונה שלו מוכנה ומחכה.
    const url = shareImageUrl(BASE, "F3k53omiv1yX", {
      preview_path: "shares/abc-1754140000000.jpg",
      render_path: null,
    });
    expect(url).toMatch(/^https:\/\/rmjewel\.com\/d\/F3k53omiv1yX\/render\?v=[0-9a-f]{8}$/);
  });

  it("prefers the capture over the model's render, like the route does", () => {
    const withBoth = shareImageUrl(BASE, "t", {
      preview_path: "shares/abc-1.jpg",
      render_path: "renders/x.png",
    });
    const captureOnly = shareImageUrl(BASE, "t", { preview_path: "shares/abc-1.jpg" });
    expect(withBoth).toBe(captureOnly);
  });

  it("falls back to the render when there is no capture", () => {
    const url = shareImageUrl(BASE, "t", { preview_path: null, render_path: "renders/x.png" });
    expect(url).toBe(`${BASE}/d/t/render?v=${imageVersion("renders/x.png")}`);
  });

  it("emits nothing when the share has no image at all", () => {
    expect(shareImageUrl(BASE, "t", { preview_path: null, render_path: null })).toBeNull();
  });
});

describe("imageVersion", () => {
  it("changes when the uploaded path changes — that is the whole point", () => {
    // כל העלאה נוחתת על נתיב עם חותמת זמן משלה, ולכן שיתוף חוזר מייצר כתובת
    // אחרת. בלי זה `immutable` היה משמר לנצח את התמונה שהוחלפה.
    expect(imageVersion("shares/abc-1754140000000.jpg")).not.toBe(
      imageVersion("shares/abc-1754140099999.jpg"),
    );
  });

  it("is stable for the same path", () => {
    expect(imageVersion("shares/abc-1.jpg")).toBe(imageVersion("shares/abc-1.jpg"));
  });

  it("is eight hex characters, so it stays a short query value", () => {
    expect(imageVersion("shares/legacy.jpg")).toMatch(/^[0-9a-f]{8}$/);
  });
});
