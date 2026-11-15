// PRプレビューだけに出す、ライトモードの案の切替（計画 2.1）。本番に出ないことを確かめる
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LIGHT_VARIANTS, LightVariantSwitch } from "./LightVariantSwitch";

describe("ライトモードの案の切替", () => {
  it("@security 本番（PRプレビューの番号が無い）では何も出さない", () => {
    expect(renderToStaticMarkup(createElement(LightVariantSwitch, { previewPr: null }))).toBe("");
  });

  it("PRプレビューでは、今の色と5つの案を出す", () => {
    const html = renderToStaticMarkup(createElement(LightVariantSwitch, { previewPr: 99 }));
    for (const v of LIGHT_VARIANTS) expect(html).toContain(v.label);
  });

  it("選べる値は、固定の6つだけ", () => {
    expect(LIGHT_VARIANTS.map((v) => v.id)).toEqual(["", "a", "b", "c", "d", "e"]);
  });
});
