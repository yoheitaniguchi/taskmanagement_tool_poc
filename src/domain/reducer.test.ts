import { describe, expect, it } from "vitest";
import { applyResult, initialRoot, reducer } from "./reducer";
import { sampleState } from "./testData";
import { emptyState } from "./types";

describe("reducer：任意の状態を置く経路（docs/design.md 4.5・6.4）", () => {
  it("[@security] 読み込みの置き換えは、reducer の中で検証し直し、通らなければ何もしない", () => {
    const root = initialRoot(emptyState());
    const bad = sampleState();
    bad.projects[0].themeId = "unknown" as never;
    expect(reducer(root, { type: "replaceState", state: bad })).toBe(root);
  });

  it("読み込みで置き換えると、検証済みの写しが入り、「元に戻す」は捨てる", () => {
    const withUndo = applyResult(initialRoot(emptyState()), { ok: true, state: sampleState() }, "テストの操作をしました");
    const incoming = sampleState();
    const next = reducer(withUndo, { type: "replaceState", state: incoming });
    expect(next.state).toEqual(incoming);
    expect(next.state).not.toBe(incoming);
    expect(next.undo).toBeNull();
  });

  it("消去で空の状態にし、「元に戻す」は捨てる（消したデータが戻って保存し直されないように）", () => {
    const withUndo = applyResult(initialRoot(emptyState()), { ok: true, state: sampleState() }, "テストの操作をしました");
    expect(reducer(withUndo, { type: "reset" })).toEqual({ state: emptyState(), undo: null });
  });
});

describe("「元に戻す」（D1、docs/design.md 6.4）", () => {
  const before = initialRoot(emptyState());
  const after = applyResult(before, { ok: true, state: sampleState() }, "テストの操作をしました");

  it("直後の状態のままなら、直前の状態に戻る", () => {
    expect(after.undo?.message).toBe("テストの操作をしました");
    const undone = reducer(after, { type: "undo" });
    expect(undone.state).toBe(before.state);
    expect(undone.undo).toBeNull();
  });

  it("ほかの変更が挟まると戻さない", () => {
    const other = sampleState();
    other.someday = [];
    const changed = { ...after, state: other };
    expect(reducer(changed, { type: "undo" })).toEqual({ state: other, undo: null });
  });

  it("元に戻せない操作（undoMessage なし）は、覚えていた組を捨てる", () => {
    const next = applyResult(after, { ok: true, state: emptyState() }, null);
    expect(next.undo).toBeNull();
  });

  it("表示を閉じる・別のタブの変更を検知すると、覚えていた組を捨てる", () => {
    expect(reducer(after, { type: "dismissUndo" }).undo).toBeNull();
    expect(reducer(after, { type: "forgetUndo" }).undo).toBeNull();
    expect(reducer(before, { type: "dismissUndo" })).toBe(before);
  });

  it("ドメインの関数が失敗した・検証に通らない結果は、何も変えない", () => {
    expect(applyResult(after, { ok: false, error: "テストの失敗" }, "x")).toBe(after);
    const bad = sampleState();
    bad.inbox[0].text = "";
    expect(applyResult(after, { ok: true, state: bad }, "x")).toBe(after);
  });
});

describe("型の外の値を受け取ったとき（SEC-006）", () => {
  const root = initialRoot(sampleState());
  const item = root.state.inbox[0];

  it("[@security] 読めない時刻の操作は、例外にせず何もしない", () => {
    expect(reducer(root, { type: "capture", text: "テスト", at: "not-a-date", id: "00000000-0000-4000-8000-000000999001" })).toBe(root);
    expect(reducer(root, { type: "completeItem", ref: { kind: "action", id: root.state.actions[0].id }, at: "" })).toBe(root);
  });

  it("[@security] 知らない出口・置き場の種類・操作は、例外にせず何もしない", () => {
    const at = "2026-11-05T03:00:00.000Z";
    expect(reducer(root, { type: "clarify", itemId: item.id, decision: { exit: "unknown" } as never, at, ids: [] })).toBe(root);
    expect(reducer(root, { type: "clarifyBulk", itemIds: [item.id], exit: "unknown" as never, at, ids: [] })).toBe(root);
    expect(reducer(root, { type: "deleteItem", ref: { kind: "unknown" as never, id: item.id } })).toBe(root);
    expect(reducer(root, { type: "deleteItem", ref: { kind: "toString" as never, id: item.id } })).toBe(root);
    expect(reducer(root, { type: "editItem", edit: { kind: "unknown" } as never, at })).toBe(root);
    expect(reducer(root, { type: "completeItem", ref: { kind: "someday" as never, id: item.id }, at })).toBe(root);
    expect(reducer(root, { type: "unknown" } as never)).toBe(root);
  });
});
