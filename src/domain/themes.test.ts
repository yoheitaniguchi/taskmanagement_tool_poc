import { describe, expect, it } from "vitest";
import { isThemeId, themeLabel, THEMES } from "./themes";

describe("テーマ（CLAUDE.md 5.1）", () => {
  it("7件固定で、決まった順と表示名", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["work", "startup", "health", "relationships", "finance", "hobby_learning", "other"]);
    expect(THEMES.map((t) => t.label)).toEqual(["仕事", "起業", "健康", "人間関係", "家計", "趣味・学び", "その他"]);
    expect(themeLabel("hobby_learning")).toBe("趣味・学び");
  });

  it("[@security] 知らないテーマID を拒否する", () => {
    expect(isThemeId("work")).toBe(true);
    for (const v of ["Work", "仕事", "", "toString", "__proto__", null, 1]) expect(isThemeId(v)).toBe(false);
  });
});
