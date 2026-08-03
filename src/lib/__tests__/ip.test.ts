import { describe, expect, it } from "vitest";
import { clientIp } from "../ip";

const req = (headers: Record<string, string>) => new Request("https://x/", { headers });

describe("clientIp", () => {
  it("prefers cf-connecting-ip", () => {
    expect(clientIp(req({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
  });

  it("falls back to the first x-forwarded-for entry", () => {
    expect(clientIp(req({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
  });

  it("returns unknown when no ip header is present", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});
