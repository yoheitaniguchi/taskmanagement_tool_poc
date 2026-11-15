// ライトモードの色のコントラストを確かめる（振り返り 7.1、計画 2.1、docs/design.md 7章）。
// src/index.css のいちばん上の :root（@media の中の :root ではない）と、PRプレビューで比べる案の値を読み、
// 文字と背景の組み合わせが WCAG AA の 4.5:1 以上であることを確かめる
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");

/** セレクタがちょうど一致するブロックの、色のカスタムプロパティを読む */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0 && !css.startsWith(`${selector} {`)) throw new Error(`${selector} が見つからない`);
  const from = start < 0 ? 0 : start;
  const body = css.slice(css.indexOf("{", from) + 1, css.indexOf("}", from));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) out[m[1]] = m[2].toLowerCase();
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** [文字, 背景] の組み合わせ */
const PAIRS: [string, string][] = [
  ["--text", "--bg"],
  ["--text", "--surface"],
  ["--text", "--surface-2"],
  ["--text-muted", "--bg"],
  ["--text-muted", "--surface"],
  ["--text-muted", "--surface-2"],
  ["--accent", "--bg"],
  ["--accent", "--surface"],
  ["--accent", "--surface-2"],
  ["--accent", "--accent-soft"],
  ["--text", "--accent-soft"],
  ["--accent-fg", "--accent-solid"],
  ["--warn-text", "--warn-bg"],
  ["--danger-text", "--danger-bg"],
];

const base = tokens(":root");
const sets: [string, Record<string, string>][] = [["今の値（:root）", base]];
for (const v of ["a", "b", "c", "d", "e"]) {
  const selector = `:root[data-theme="light"][data-light-variant="${v}"]`;
  if (css.includes(`${selector} {`)) sets.push([`案 ${v.toUpperCase()}`, { ...base, ...tokens(selector) }]);
}

describe("ライトモードのコントラスト（WCAG AA 4.5:1）", () => {
  it("いちばん上の :root を読めている", () => {
    expect(base["--bg"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(base["--text"]).toMatch(/^#[0-9a-f]{6}$/);
  });

  for (const [name, t] of sets) {
    it(`${name}：文字と背景の組み合わせがすべて 4.5:1 以上`, () => {
      const low = PAIRS.filter(([fg, bg]) => contrast(t[fg], t[bg]) < 4.5).map(([fg, bg]) => `${fg} × ${bg}：${contrast(t[fg], t[bg]).toFixed(2)}`);
      expect(low).toEqual([]);
    });

    it(`${name}：選んだ状態の背景（--accent-soft）と面の明るさの比を、今の値より小さくしない`, () => {
      const now = contrast(base["--accent-soft"], base["--surface"]);
      expect(contrast(t["--accent-soft"], t["--surface"])).toBeGreaterThanOrEqual(now - 0.01);
    });
  }
});
