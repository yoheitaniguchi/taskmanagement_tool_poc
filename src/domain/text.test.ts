import { describe, expect, it } from "vitest";
import { charCount, hasForbiddenControl, hasNewline, isBlank, normalizeText } from "./text";

describe("文字列の約束（docs/design.md 4.1）", () => {
  it("文字数はコードポイントで数える", () => {
    expect(charCount("あいう")).toBe(3);
    expect(charCount("𠮷野家")).toBe(3);
    expect(charCount("📝")).toBe(1);
  });

  it("前後の空白を除き、NFC に正規化する", () => {
    expect(normalizeText("  テスト　\n")).toBe("テスト");
    expect(normalizeText("ガ")).toBe("ガ");
  });

  it("改行とタブのほかの制御文字を見つける", () => {
    expect(hasForbiddenControl("a\tb\nc\r\n")).toBe(false);
    for (const c of ["\u0000", "\u0007", "\u001b", "\u007f", "\u0085"]) expect(hasForbiddenControl(`a${c}b`)).toBe(true);
    expect(hasNewline("a\nb")).toBe(true);
    expect(hasNewline("a\rb")).toBe(true);
    expect(isBlank(" \t　")).toBe(true);
  });
});
