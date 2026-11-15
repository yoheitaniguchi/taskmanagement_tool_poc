// 単独の次のアクションのテーマのボタンの並び（R-2、計画 1.2・2.2）
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { THEMES } from "../domain/themes";
import { OPTIONAL_THEME_CHOICES, ThemeChoice } from "./ThemeChoice";

const render = (value: string) => renderToStaticMarkup(createElement(ThemeChoice, { name: "t", value, onChange: () => {} }));

describe("テーマのボタンの並び（任意）", () => {
  it("「なし」を初めに置き、続けて7つのテーマを並べる", () => {
    expect(OPTIONAL_THEME_CHOICES.map((t) => t.id)).toEqual(["", ...THEMES.map((t) => t.id)]);
    expect(render("").match(/type="radio"/g)).toHaveLength(8);
  });

  it("選んだ値の1つだけに印が付く", () => {
    expect(render("").match(/checked=""/g)).toHaveLength(1);
    expect(render("health").match(/checked=""/g)).toHaveLength(1);
    expect(render("health")).toMatch(/checked=""\/>健康/);
  });
});
