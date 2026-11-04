import { describe, expect, it } from "vitest";
import { FakeStorage } from "./fakeStorage";
import {
  backupFileName,
  clearStorage,
  exportFileName,
  isDataKey,
  loadDeviceMeta,
  loadFromStorage,
  parseExportText,
  readCorruptBackup,
  readItem,
  readUnreadableState,
  saveDeviceMeta,
  saveToStorage,
  serializeExport,
  STORAGE_NAMESPACE,
  storageKey,
  storageNamespace,
  storageUsage,
  writeItem,
} from "./persistence";
import { fullState, sampleState } from "./testData";
import { emptyDeviceMeta, markExported } from "./transfer";
import { SCHEMA_VERSION } from "./types";
import { LIMITS } from "./validate";

const now = new Date("2026-11-03T11:15:00.000Z"); // 日本時間 20:15

describe("保存のキー（CLAUDE.md 8.2・8.3、docs/design.md 6.1）", () => {
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
    expect(["v1:state", "v1:device", "theme", "corrupt-backup"].map((n) => storageKey(n as never))).toEqual([
      "taskmanagement_tool_poc:v1:state",
      "taskmanagement_tool_poc:v1:device",
      "taskmanagement_tool_poc:theme",
      "taskmanagement_tool_poc:corrupt-backup",
    ]);
  });

  it("別のタブでの変更を読み取り専用にするのは、この名前空間のデータのキーと全体の消去だけ（表示の切替は除く。docs/design.md 6.3）", () => {
    expect(isDataKey(storageKey("v1:state"))).toBe(true);
    expect(isDataKey(storageKey("v1:device"))).toBe(true);
    expect(isDataKey(storageKey("corrupt-backup"))).toBe(true);
    expect(isDataKey(null)).toBe(true);
    expect(isDataKey(storageKey("theme"))).toBe(false);
    expect(isDataKey("project_management_poc:state")).toBe(false);
    expect(isDataKey(`${storageNamespace(5)}v1:state`)).toBe(false);
  });

  it("読み書きできないとき（容量超過など）は、例外を投げずに失敗を返す", () => {
    const s = new FakeStorage();
    expect(writeItem("theme", "dark", s)).toBe(true);
    expect(readItem("theme", s)).toBe("dark");
    s.failOnWrite = true;
    expect(writeItem("theme", "light", s)).toBe(false);
    expect(readItem("theme", null)).toBeNull();
    expect(writeItem("theme", "dark", null)).toBe(false);
  });
});

describe("状態の保存と起動時の読込（docs/design.md 6.3）", () => {
  it("保存して読み込むと元に戻る", () => {
    const s = new FakeStorage();
    const state = sampleState();
    expect(saveToStorage(s, state)).toEqual({ ok: true });
    expect(loadFromStorage(s)).toEqual({ kind: "ok", state });
  });

  it("保存データが無ければ empty", () => {
    expect(loadFromStorage(new FakeStorage())).toEqual({ kind: "empty" });
  });

  it("読めない値は退避し、元の値も消さない（空の状態で上書きしない）", () => {
    const s = new FakeStorage();
    s.setItem(storageKey("v1:state"), "{壊れた値");
    const r = loadFromStorage(s);
    expect(r).toMatchObject({ kind: "corrupt", backedUp: true });
    expect(s.getItem(storageKey("v1:state"))).toBe("{壊れた値");
    expect(readCorruptBackup(s)).toBe("{壊れた値");
  });

  it("退避は1件だけ。同じ値なら増やさず、別の値が退避済みなら上書きしない", () => {
    const s = new FakeStorage();
    s.setItem(storageKey("v1:state"), "壊れた値1");
    loadFromStorage(s);
    loadFromStorage(s);
    expect(s.keys().filter((k) => k.endsWith("corrupt-backup"))).toHaveLength(1);
    s.setItem(storageKey("v1:state"), "壊れた値2");
    expect(loadFromStorage(s)).toMatchObject({ kind: "corrupt", backedUp: false });
    expect(readCorruptBackup(s)).toBe("壊れた値1");
    // 退避できなかった値も、元のキーからそのまま書き出せる（回復するまで元のキーは書き換えない）
    expect(readUnreadableState(s)).toBe("壊れた値2");
  });

  it("容量が足りずに退避できなくても、読めなかった値は元のキーに残り、そのまま読み出せる", () => {
    const s = new FakeStorage();
    s.setItem(storageKey("v1:state"), "{壊れた値");
    s.failOnWrite = true;
    const r = loadFromStorage(s);
    expect(r).toMatchObject({ kind: "corrupt", backedUp: false });
    expect(readCorruptBackup(s)).toBeNull();
    expect(readUnreadableState(s)).toBe("{壊れた値");
  });

  it("[@security] 未来の版のデータは読まずに、読めない値として扱う", () => {
    const s = new FakeStorage();
    s.setItem(storageKey("v1:state"), JSON.stringify({ ...sampleState(), schemaVersion: SCHEMA_VERSION + 1 }));
    const r = loadFromStorage(s);
    expect(r.kind).toBe("corrupt");
    if (r.kind === "corrupt") expect(r.errors[0]).toMatch("このアプリより新しい版");
  });

  it("検証に通らない状態は保存しない。保存に失敗したら理由を返す", () => {
    const s = new FakeStorage();
    const bad = sampleState();
    bad.projects[0].name = "";
    expect(saveToStorage(s, bad).ok).toBe(false);
    expect(s.length).toBe(0);
    s.failOnWrite = true;
    const r = saveToStorage(s, sampleState());
    expect(!r.ok && r.error).toMatch("JSONを書き出して保存してください");
  });

  it("[@security] 消去は、この名前空間のキーだけをすべて消す（ほかのアプリ・PR プレビューのキーは残す）", () => {
    const s = new FakeStorage();
    saveToStorage(s, sampleState());
    saveDeviceMeta(s, emptyDeviceMeta());
    s.setItem(storageKey("theme"), "dark");
    s.setItem(storageKey("corrupt-backup"), "x");
    s.setItem("project_management_poc:v1:state", "ほかのアプリ");
    s.setItem("taskmanagement_tool_poc-pr-preview-3:v1:state", "プレビュー");
    clearStorage(s);
    expect(s.keys().sort()).toEqual(["project_management_poc:v1:state", "taskmanagement_tool_poc-pr-preview-3:v1:state"]);
  });

  it("使っている容量は、この名前空間のキーと値の文字数の合計（ほかのアプリの分は数えない）", () => {
    const s = new FakeStorage();
    s.setItem(storageKey("theme"), "dark");
    s.setItem("other:key", "x".repeat(100));
    expect(storageUsage(s)).toBe("taskmanagement_tool_poc:theme".length + 4);
    expect(storageUsage(null)).toBe(0);
  });
});

describe("ブラウザの設定（docs/design.md 6.1）", () => {
  it("保存して読み込むと元に戻る", () => {
    const s = new FakeStorage();
    const meta = { ...markExported(emptyDeviceMeta(), "0123456789abcd", now), deviceName: "PC" };
    saveDeviceMeta(s, meta);
    expect(loadDeviceMeta(s)).toEqual(meta);
  });

  it("[@security] 形の違う値・危険なキー・読めない値は、既定値（名前なし・記録なし）に戻す", () => {
    for (const text of [
      "{",
      "null",
      JSON.stringify({ ...emptyDeviceMeta(), deviceName: "../PC" }),
      JSON.stringify({ ...emptyDeviceMeta(), extra: 1 }),
      '{"__proto__":{"deviceName":"PC"}}',
    ]) {
      const s = new FakeStorage();
      s.setItem(storageKey("v1:device"), text);
      expect(loadDeviceMeta(s)).toEqual(emptyDeviceMeta());
    }
    expect(loadDeviceMeta(new FakeStorage())).toEqual(emptyDeviceMeta());
  });
});

describe("書き出しと読み込み（docs/design.md 6.2）", () => {
  it("ファイル名は tmpoc-<端末名>-<端末の日時>.json", () => {
    expect(exportFileName("PC", now)).toBe("tmpoc-PC-20261103-2015.json");
    expect(exportFileName("スマホ", new Date("2026-12-31T15:05:00.000Z"))).toBe("tmpoc-スマホ-20270101-0005.json");
    expect(backupFileName(now)).toBe("tmpoc-backup-20261103-2015.json");
  });

  it("書き出し → 読み込みで元に戻る（外枠に書き出した日時と端末名が入る）", () => {
    const state = sampleState();
    const r = parseExportText(serializeExport(state, "PC", now));
    expect(r).toEqual({ ok: true, file: { app: "taskmanagement_tool_poc", exportedAt: now.toISOString(), deviceName: "PC", state } });
  });

  it("上限いっぱい（600万字、日本語）の状態を書き出して読み込める（書き出したJSONは必ず読み込める。8.2）", () => {
    const state = fullState();
    const text = serializeExport(state, "PC", now);
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(LIMITS.importBytes);
    const r = parseExportText(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.state.references).toHaveLength(state.references.length);
  });

  it("[@security] JSON として読めない・大きすぎる・外枠の無いファイルを拒否する", () => {
    expect(parseExportText("{")).toEqual({ ok: false, errors: ["JSON として読めません。このアプリで書き出したファイルか確かめてください"] });
    expect(parseExportText(" ".repeat(LIMITS.importBytes + 1))).toEqual({ ok: false, errors: ["ファイルが大きすぎます（上限は 32MiB）"] });
    expect(parseExportText(JSON.stringify(sampleState())).ok).toBe(false);
  });

  it("[@security] 未来の版のファイルを拒否する", () => {
    const text = serializeExport({ ...sampleState(), schemaVersion: (SCHEMA_VERSION + 1) as typeof SCHEMA_VERSION }, "PC", now);
    expect(parseExportText(text)).toEqual({ ok: false, errors: ["このアプリより新しい版のデータです。アプリを更新してから読み込んでください"] });
  });
});
