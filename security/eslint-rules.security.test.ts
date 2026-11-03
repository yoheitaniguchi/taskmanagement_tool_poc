// ESLint の禁止の設定が効いていることを確かめる（CLAUDE.md 8.2・8.3、docs/security/checklist.md B・C・E）。
// 設定を書き換えて禁止が黙って外れる退行を防ぐ
import { join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const eslint = new ESLint({ cwd: root });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(root, filePath) });
  const errors = result.messages.filter((m) => m.severity === 2);
  // 構文エラー（ruleId が無い）で「エラーになった」と数えない
  if (errors.some((m) => m.ruleId === null)) throw new Error(`構文エラー: ${errors.map((m) => m.message).join(", ")}`);
  return errors.map((m) => m.ruleId as string);
}

const APP_FILE = "src/components/Example.tsx";
const PERSISTENCE_FILE = "src/domain/persistence.ts";

describe("[@security] ESLint による禁止", () => {
  const forbiddenEverywhere: [string, string][] = [
    ["fetch", 'export const f = () => fetch("https://example.com");'],
    ["window.fetch", 'export const f = () => window.fetch("https://example.com");'],
    ["XMLHttpRequest", "export const x = new XMLHttpRequest();"],
    ["WebSocket", 'export const w = new WebSocket("wss://example.com");'],
    ["navigator.sendBeacon", 'export const b = () => navigator.sendBeacon("https://example.com", "x");'],
    ["innerHTML", 'export const h = (el: HTMLElement, s: string) => { el.innerHTML = s; };'],
    ["insertAdjacentHTML", 'export const h = (el: HTMLElement, s: string) => el.insertAdjacentHTML("beforeend", s);'],
    ["eval", 'export const e = (s: string) => eval(s);'],
  ];
  for (const [label, code] of forbiddenEverywhere) {
    it(`[@security] ${label} は、どのファイルでもエラーになる`, async () => {
      expect((await ruleIds(code, APP_FILE)).length).toBeGreaterThan(0);
      expect((await ruleIds(code, PERSISTENCE_FILE)).length).toBeGreaterThan(0);
    });
  }

  it("[@security] dangerouslySetInnerHTML はエラーになる", async () => {
    const code = 'export const C = ({ s }: { s: string }) => <div dangerouslySetInnerHTML={{ __html: s }} />;';
    expect(await ruleIds(code, APP_FILE)).toContain("no-restricted-syntax");
  });

  const storageCode: [string, string][] = [
    ["localStorage", 'export const r = () => localStorage.getItem("k");'],
    ["window.localStorage", 'export const r = () => window.localStorage.getItem("k");'],
    ["sessionStorage", 'export const r = () => sessionStorage.getItem("k");'],
    ["indexedDB", 'export const r = () => indexedDB.open("k");'],
  ];
  for (const [label, code] of storageCode) {
    it(`[@security] ${label} は、persistence.ts の外ではエラーになる`, async () => {
      expect(await ruleIds(code, APP_FILE)).not.toEqual([]);
      expect(await ruleIds(code, "src/theme.ts")).not.toEqual([]);
    });
  }

  it("[@security] persistence.ts では localStorage を使える", async () => {
    expect(await ruleIds('export const r = () => window.localStorage.getItem("k");', PERSISTENCE_FILE)).toEqual([]);
  });
});
