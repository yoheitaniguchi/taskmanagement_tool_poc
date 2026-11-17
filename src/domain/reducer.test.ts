import { describe, expect, it } from "vitest";
import { applyResult, commitAction, initialRoot, operate, reducer, type Operation } from "./reducer";
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

describe("操作の対応（operate。reducer と画面の失敗の理由が同じものを使う。docs/design.md 4.5）", () => {
  const at = "2026-11-17T00:00:00.000Z";
  const newId = "00000000-0000-4000-8000-000000009999";
  const actionId = "00000000-0000-4000-8000-000000000020";

  it("成功した操作は、reducer が operate の結果と文言をそのまま反映する", () => {
    const root = initialRoot(sampleState());
    const op = { type: "completeItem", ref: { kind: "action", id: actionId }, at } as const;
    const outcome = operate(root.state, op);
    expect(outcome?.result.ok).toBe(true);
    expect(outcome?.undoMessage).toBe("完了にしました");
    const next = reducer(root, op);
    expect(next.state).toEqual(outcome?.result.ok ? outcome.result.state : null);
    expect(next.undo?.message).toBe("完了にしました");
  });

  it("失敗した操作は、operate が利用者向けの理由を返し、reducer は何も変えない（画面はこの理由を出す）", () => {
    const root = initialRoot(sampleState());
    const op = { type: "capture", text: "  ", at, id: newId } as const;
    expect(operate(root.state, op)?.result).toEqual({ ok: false, error: "入れる内容がありません" });
    expect(reducer(root, op)).toBe(root);
  });

  it("[@security] operate が成功しても、状態全体の検証に通らない結果は反映しない（検証は reducer に残す）", () => {
    // 検証を通っていない状態（id の重複）を、わざと置く。収集そのものは成功する
    const bad = sampleState();
    bad.actions.push({ ...bad.actions[0] });
    const root = initialRoot(bad);
    const op = { type: "capture", text: "架空の思いつき", at, id: newId } as const;
    expect(operate(root.state, op)?.result.ok).toBe(true);
    expect(reducer(root, op)).toBe(root);
  });

  it("[@security] 読めない時刻・知らない操作は null で、reducer は何もしない（SEC-006）", () => {
    const root = initialRoot(sampleState());
    const badTime = { type: "capture", text: "架空", at: "きのう", id: newId } as const;
    expect(operate(root.state, badTime)).toBeNull();
    expect(reducer(root, badTime)).toBe(root);
    const unknown = { type: "dropTable" } as unknown as Operation;
    expect(operate(root.state, unknown)).toBeNull();
    expect(reducer(root, unknown)).toBe(root);
  });

  it("四半期の移動の文言は、移す前の状態から作る（置いた／移した）", () => {
    const state = sampleState();
    const project = state.projects[0];
    const op = { type: "placeProject", id: project.id, placement: { fiscalYear: 2026, quarter: 4 }, at } as const;
    const expected = project.placement === null ? "に置きました" : "に移しました";
    expect(operate(state, op)?.undoMessage).toContain(expected);
  });
});

describe("反映してよいかの判定（commitAction。reducer は操作1回につき1回だけ呼ぶ。docs/design.md 6.3）", () => {
  const at = "2026-11-17T00:00:00.000Z";
  const op = { type: "capture", text: "架空の思いつき", at, id: "00000000-0000-4000-8000-000000009999" } as const;

  it("ふだんは反映し、変更ありに数える", () => {
    const root = initialRoot(sampleState());
    const commit = commitAction(root, op, false);
    expect(commit?.root.state.inbox.length).toBe(root.state.inbox.length + 1);
    expect(commit?.changed).toBe(true);
  });

  it("[@security] 読み取り専用のタブでは反映しない（別のタブの保存を黙って上書きしないため）", () => {
    expect(commitAction(initialRoot(sampleState()), op, true)).toBeNull();
    expect(commitAction(initialRoot(sampleState()), { type: "replaceState", state: sampleState() }, true)).toBeNull();
  });

  it("[@security] 受け付けられなかった操作は反映しない（検証に通らない読み込みなど）", () => {
    const bad = sampleState();
    bad.projects[0].themeId = "unknown" as never;
    expect(commitAction(initialRoot(sampleState()), { type: "replaceState", state: bad }, false)).toBeNull();
    expect(commitAction(initialRoot(sampleState()), { ...op, text: "" }, false)).toBeNull();
  });

  it("読み込み・消去・表示の切替は、変更ありに数えない", () => {
    const withUndo = applyResult(initialRoot(emptyState()), { ok: true, state: sampleState() }, "テストの操作をしました");
    expect(commitAction(withUndo, { type: "replaceState", state: sampleState() }, false)?.changed).toBe(false);
    expect(commitAction(withUndo, { type: "reset" }, false)?.changed).toBe(false);
    expect(commitAction(withUndo, { type: "dismissUndo" }, false)?.changed).toBe(false);
    expect(commitAction(withUndo, { type: "forgetUndo" }, false)?.changed).toBe(false);
  });

  it("「元に戻す」で状態が戻るのは、変更ありに数える", () => {
    const before = initialRoot(emptyState());
    const after = applyResult(before, { ok: true, state: sampleState() }, "テストの操作をしました");
    expect(commitAction(after, { type: "undo" }, false)?.changed).toBe(true);
  });
});
