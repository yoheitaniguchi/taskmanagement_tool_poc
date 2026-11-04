import { describe, expect, it } from "vitest";
import { FakeStorage } from "./fakeStorage";
import { readItem, STORAGE_NAMESPACE, storageKey, storageNamespace, writeItem } from "./persistence";

describe("保存のキー（CLAUDE.md 8.2・8.3）", () => {
  it("[@security] 本番の名前空間は taskmanagement_tool_poc: で、テストのビルドは本番と同じ", () => {
    expect(storageNamespace(null)).toBe("taskmanagement_tool_poc:");
    expect(STORAGE_NAMESPACE).toBe("taskmanagement_tool_poc:");
  });

  it("[@security] PR プレビューは本番と別の名前空間で、本番の名前空間の前方一致にならない", () => {
    const ns = storageNamespace(12);
    expect(ns).toBe("taskmanagement_tool_poc-pr-preview-12:");
    expect(ns.startsWith(storageNamespace(null))).toBe(false);
  });

  it("[@security] キーは必ず名前空間の中にある", () => {
    expect(storageKey("theme")).toBe("taskmanagement_tool_poc:theme");
    expect(storageKey("theme", storageNamespace(3))).toBe("taskmanagement_tool_poc-pr-preview-3:theme");
  });
});

describe("読み書き", () => {
  it("名前空間の中のキーに書き、読み、null で消す", () => {
    const s = new FakeStorage();
    expect(writeItem("theme", "dark", s)).toBe(true);
    expect(s.keys()).toEqual(["taskmanagement_tool_poc:theme"]);
    expect(readItem("theme", s)).toBe("dark");
    expect(writeItem("theme", null, s)).toBe(true);
    expect(readItem("theme", s)).toBeNull();
    expect(s.length).toBe(0);
  });

  it("書けないとき（容量超過など）は例外を投げずに false を返す", () => {
    const s = new FakeStorage();
    s.failOnWrite = true;
    expect(writeItem("theme", "dark", s)).toBe(false);
  });

  it("Storage が使えないときは、読みは null、書きは false", () => {
    expect(readItem("theme", null)).toBeNull();
    expect(writeItem("theme", "dark", null)).toBe(false);
  });
});
