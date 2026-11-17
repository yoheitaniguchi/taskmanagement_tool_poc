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
    ["navigator.storage", "export const r = () => navigator.storage.persist();"],
    ["window.navigator.storage", "export const r = () => window.navigator.storage.persisted();"],
    ["const { storage } = navigator", "export const r = () => { const { storage } = navigator; return storage; };"],
    ["document.cookie", "export const r = () => document.cookie;"],
    ["cookieStore", 'export const r = () => cookieStore.get("k");'],
    ["caches", 'export const r = () => caches.open("k");'],
    ['navigator["storage"]', 'export const r = () => navigator["storage"].persist();'],
    ["navigator.storageBuckets", 'export const r = () => navigator.storageBuckets.open("k");'],
    ["openDatabase", 'export const r = () => openDatabase("k", "1", "k", 1);'],
  ];
  // ほかの規則のエラー（未定義の変数など）で通ってしまわないよう、保存の禁止の規則で止まったことを確かめる
  const STORAGE_RULES = ["no-restricted-globals", "no-restricted-properties"];
  const stoppedByStorageRule = (ids: string[]) => ids.some((id) => STORAGE_RULES.includes(id));
  for (const [label, code] of storageCode) {
    it(`[@security] ${label} は、persistence.ts の外ではエラーになる`, async () => {
      expect(stoppedByStorageRule(await ruleIds(code, APP_FILE))).toBe(true);
      expect(stoppedByStorageRule(await ruleIds(code, "src/theme.ts"))).toBe(true);
    });
  }

  // SEC-009：名前で決まらない参照のうち、よくある形を止める（eslint.config.js の REFLECT・noDynamicGlobalAccess）
  const dynamicCode: [string, string][] = [
    ['Reflect.get(navigator, "storage")', 'export const r = () => Reflect.get(navigator, "storage");'],
    ["const R = Reflect", "export const R = Reflect;"],
    ['window["local" + "Storage"]', 'export const r = () => window["local" + "Storage"];'],
    ["navigator[k]", "export const r = (k: string) => navigator[k as keyof Navigator];"],
    ["document[`cookie`]", "export const r = () => document[`cookie`];"],
    ["globalThis[k]", "export const r = (k: string) => globalThis[k as keyof typeof globalThis];"],
    ["self[k]", "export const r = (k: string) => self[k as keyof typeof self];"],
    ["parent[k]", "export const r = (k: string) => parent[k as keyof Window];"],
  ];
  const DYNAMIC_RULES = ["no-restricted-globals", "no-restricted-syntax"];
  for (const [label, code] of dynamicCode) {
    it(`[@security] ${label} は、どのファイルでもエラーになる（SEC-009）`, async () => {
      for (const file of [APP_FILE, PERSISTENCE_FILE]) {
        expect((await ruleIds(code, file)).some((id) => DYNAMIC_RULES.includes(id))).toBe(true);
      }
    });
  }

  it("[@security] window などでないものへの、変数をキーにした参照は使える（配列の添字など）", async () => {
    expect(await ruleIds("export const r = (a: number[], i: number) => a[i];", APP_FILE)).toEqual([]);
    expect(await ruleIds("export const r = (o: Record<string, number>, k: string) => o[k];", APP_FILE)).toEqual([]);
  });

  // 構文の検査では止まらない形（限界。レビューで守る。docs/design.md 6.1）。止まるようになったら、ここを直して上へ移す
  const notStopped: [string, string][] = [
    ["const w = window; w[k]", "export const r = (k: string) => { const w: Record<string, unknown> = window as unknown as Record<string, unknown>; return w[k]; };"],
    ["window.window[k]", "export const r = (k: string) => window.window[k as keyof Window];"],
    ['Object.getOwnPropertyDescriptor(window, "x")', 'export const r = () => Object.getOwnPropertyDescriptor(window, "x");'],
  ];
  for (const [label, code] of notStopped) {
    it(`${label} は、構文の検査では止まらない（限界の記録。SEC-009）`, async () => {
      expect(await ruleIds(code, APP_FILE)).toEqual([]);
    });
  }

  it("[@security] persistence.ts では localStorage を使える", async () => {
    expect(await ruleIds('export const r = () => window.localStorage.getItem("k");', PERSISTENCE_FILE)).toEqual([]);
  });

  it("[@security] persistence.ts では navigator.storage を使える（保存の保護。IMP-07）", async () => {
    expect(await ruleIds("export const r = () => navigator.storage.persist();", PERSISTENCE_FILE)).toEqual([]);
  });
});
