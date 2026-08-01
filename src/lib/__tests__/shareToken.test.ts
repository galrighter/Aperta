import { describe, expect, it } from "vitest";
import { isShareToken, newShareToken, SHARE_TOKEN_LENGTH } from "../shareToken";

describe("newShareToken", () => {
  it("produces a token of the declared length", () => {
    expect(newShareToken()).toHaveLength(SHARE_TOKEN_LENGTH);
  });

  it("only uses characters the validator accepts", () => {
    for (let i = 0; i < 200; i++) expect(isShareToken(newShareToken())).toBe(true);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 500 }, newShareToken));
    expect(seen.size).toBe(500);
  });
});

describe("isShareToken", () => {
  it("rejects the characters that were left out on purpose", () => {
    // 0/O ו-I/l הוצאו מהאלפבית כדי שלינק שנקרא מהמסך לא ייקרא שגוי.
    for (const c of ["0", "O", "I", "l"]) {
      expect(isShareToken(c.repeat(SHARE_TOKEN_LENGTH))).toBe(false);
    }
  });

  it("rejects the wrong length", () => {
    expect(isShareToken("abc")).toBe(false);
    expect(isShareToken("a".repeat(SHARE_TOKEN_LENGTH + 1))).toBe(false);
  });

  it("rejects what a scanner puts in the path", () => {
    for (const bad of ["", null, undefined, "../../etc/passwd", "a b c d e f g h", "<script>xx"]) {
      expect(isShareToken(bad)).toBe(false);
    }
  });
});
