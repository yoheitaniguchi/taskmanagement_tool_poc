import { describe, expect, it } from "vitest";
import { parsePreviewPr, PREVIEW_PR } from "./buildInfo";

describe("ビルドの種類（PR プレビューの番号）", () => {
  it("[@security] PR の番号として正しい値だけを受け付ける（名前空間に入るため）", () => {
    expect(parsePreviewPr("1")).toBe(1);
    expect(parsePreviewPr("1234567")).toBe(1234567);
    for (const v of [undefined, null, "", "0", "01", "12345678", "-1", "1.5", "1:", "../1", " 1", 1]) {
      expect(parsePreviewPr(v)).toBeNull();
    }
  });

  it("テストのビルドは本番と同じ扱い（プレビューではない）", () => {
    expect(PREVIEW_PR).toBeNull();
  });
});
