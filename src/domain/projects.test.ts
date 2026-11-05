import { describe, expect, it } from "vitest";
import { addActionToProject, addWaitingToProject, uncompleteItem } from "./items";
import { completeProject, createProject, deleteProject, editProject, openChildCount, placeProject, uncompleteProject } from "./projects";
import { completeProjectMessage, initialRoot, placeMessage, reducer } from "./reducer";
import { emptyState, type Action, type AppState, type OpResult, type Project, type WaitingFor } from "./types";
import { LIMITS, validateState } from "./validate";

const T0 = "2026-11-01T00:00:00.000Z";
const NOW = new Date("2026-11-05T03:00:00.000Z");
const AT = NOW.toISOString();
/** 端末の時計が遅れているときの今（どの要素の日時よりも前） */
const BEHIND = new Date("2026-10-01T00:00:00.000Z");
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(800000 + ++seq).padStart(12, "0")}`;
const base = () => ({ id: uuid(), createdAt: T0, updatedAt: T0, capturedAt: T0, movedAt: null });
const input = { name: "テストのプロジェクト", outcome: "テストの成果", themeId: "health" as const, note: "" };

function project(over: Partial<Project> = {}): Project {
  const done = over.status === "done";
  return { ...base(), capturedAt: null, name: "テストのプロジェクト", outcome: "テストの成果", themeId: "work", placement: null, status: "active", completedAt: done ? T0 : null, note: "", ...over };
}
function action(over: Partial<Action> = {}): Action {
  const done = over.status === "done";
  return { ...base(), text: "テストのアクション", projectId: null, themeId: null, status: "todo", completedAt: done ? T0 : null, note: "", ...over };
}
function waiting(over: Partial<WaitingFor> = {}): WaitingFor {
  const done = over.status === "done";
  return { ...base(), text: "テストの連絡待ち", party: "テスト相手", requestedOn: "2026-11-01", projectId: null, status: "waiting", completedAt: done ? T0 : null, note: "", ...over };
}

/** 進行中のプロジェクトに、未完了・完了の子を1件ずつ（アクション・連絡待ち）と、ほかのプロジェクトの子 */
function setup() {
  const p = project({ name: "進行中" });
  const other = project({ name: "ほかの" });
  const todo = action({ projectId: p.id });
  const doneA = action({ projectId: p.id, status: "done" });
  const w = waiting({ projectId: p.id });
  const doneW = waiting({ projectId: p.id, status: "done" });
  const otherA = action({ projectId: other.id });
  const loose = action({ themeId: "finance" });
  const state: AppState = { ...emptyState(), projects: [p, other], actions: [todo, doneA, otherA, loose], waitingFors: [w, doneW] };
  expect(validateState(state).ok).toBe(true);
  return { state, p, other, todo, doneA, w, doneW, otherA, loose };
}

function ok(r: OpResult): AppState {
  if (!r.ok) throw new Error(r.error);
  const v = validateState(r.state);
  expect(v.ok ? [] : v.errors).toEqual([]);
  return r.state;
}
function err(r: OpResult): string {
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error;
}

describe("プロジェクトを直接作る（D12）", () => {
  it("名称・目的とする成果・テーマを正規化して作る。収集日時は持たず、最初の一手は求めない", () => {
    const id = uuid();
    const next = ok(createProject(emptyState(), { ...input, name: "  作るもの ", note: "メモ" }, { fiscalYear: 2026, quarter: 3 }, NOW, () => id));
    expect(next.projects).toEqual([
      { id, createdAt: AT, updatedAt: AT, capturedAt: null, movedAt: null, name: "作るもの", outcome: "テストの成果", themeId: "health", note: "メモ", placement: { fiscalYear: 2026, quarter: 3 }, status: "active", completedAt: null },
    ]);
    expect(next.actions).toEqual([]);
  });

  it("必須の入力が欠けたら、何も変えない", () => {
    const s = emptyState();
    expect(err(createProject(s, { ...input, name: " " }, null, NOW, uuid))).toBe("プロジェクトの名称を入れてください");
    expect(err(createProject(s, { ...input, outcome: "" }, null, NOW, uuid))).toBe("目的とする成果を入れてください");
    expect(err(createProject(s, { ...input, themeId: null }, null, NOW, uuid))).toBe("テーマを選んでください");
    expect(err(createProject(s, { ...input, themeId: "unknown" as never }, null, NOW, uuid))).toBe("テーマが正しくありません");
    expect(err(createProject(s, input, { fiscalYear: 2100, quarter: 1 }, NOW, uuid))).toBe("置く四半期が正しくありません");
    expect(err(createProject(s, input, { fiscalYear: 2026, quarter: 5 as never }, NOW, uuid))).toBe("置く四半期が正しくありません");
  });

  it("件数の上限を超えるときは、理由を返して作らない（黙って捨てない）", () => {
    const s: AppState = { ...emptyState(), projects: Array.from({ length: LIMITS.itemsPerList }, () => project()) };
    expect(err(createProject(s, input, null, NOW, uuid))).toBe("プロジェクトは 10,000件までです");
  });
});

describe("プロジェクトの編集と、置く四半期", () => {
  it("名称・目的とする成果・テーマ・メモを直す。置く四半期は変えない。時計が遅れていても更新日時は戻らない", () => {
    const { state, p } = setup();
    const placed = ok(placeProject(state, p.id, { fiscalYear: 2026, quarter: 4 }, NOW));
    const next = ok(editProject(placed, p.id, { name: "直した", outcome: "直した成果", themeId: "hobby_learning", note: "メモ" }, BEHIND));
    expect(next.projects[0]).toMatchObject({ name: "直した", outcome: "直した成果", themeId: "hobby_learning", note: "メモ", placement: { fiscalYear: 2026, quarter: 4 }, updatedAt: AT });
  });

  it("完了したプロジェクトも、置く四半期を変えられる（D17）。外すこともできる", () => {
    const { state, p } = setup();
    const done = ok(completeProject(state, p.id, NOW));
    const placed = ok(placeProject(done, p.id, { fiscalYear: 2025, quarter: 4 }, NOW));
    expect(placed.projects[0].placement).toEqual({ fiscalYear: 2025, quarter: 4 });
    expect(ok(placeProject(placed, p.id, null, NOW)).projects[0].placement).toBeNull();
  });

  it("[@security] テーマを確かめるときは、ほかのテーマの行には移せない。年度の範囲外・知らない id は失敗にする", () => {
    const { state, p } = setup();
    expect(err(placeProject(state, p.id, { fiscalYear: 2026, quarter: 1 }, NOW, "health"))).toContain("ほかのテーマの行には移せません");
    expect(ok(placeProject(state, p.id, { fiscalYear: 2026, quarter: 1 }, NOW, "work")).projects[0].placement).toEqual({ fiscalYear: 2026, quarter: 1 });
    expect(err(placeProject(state, p.id, { fiscalYear: 1999, quarter: 1 }, NOW))).toBe("置く四半期が正しくありません");
    expect(err(placeProject(state, p.id, { fiscalYear: 2026.5, quarter: 1 }, NOW))).toBe("置く四半期が正しくありません");
    expect(err(placeProject(state, uuid(), null, NOW))).toContain("見つかりません");
  });

  it("同じ四半期に置き直しても、状態は変えない（「元に戻す」を出さない）", () => {
    const { state, p } = setup();
    expect(placeProject(state, p.id, null, NOW)).toEqual({ ok: true, state });
  });
});

describe("プロジェクトの完了と、子の扱い（docs/design.md 4.4）", () => {
  it("未完了の子も一緒に完了にする。完了した子・ほかのプロジェクトの子・単独のものは変えない", () => {
    const { state, p, todo, doneA, w, doneW, otherA, loose } = setup();
    expect(openChildCount(state, p.id)).toBe(2);
    const next = ok(completeProject(state, p.id, NOW));
    expect(next.projects[0]).toMatchObject({ status: "done", completedAt: AT, updatedAt: AT });
    expect(next.actions.find((a) => a.id === todo.id)).toMatchObject({ status: "done", completedAt: AT, updatedAt: AT });
    expect(next.waitingFors.find((x) => x.id === w.id)).toMatchObject({ status: "done", completedAt: AT, updatedAt: AT });
    for (const same of [doneA, otherA, loose]) expect(next.actions).toContainEqual(same);
    expect(next.waitingFors).toContainEqual(doneW);
  });

  it("時計の遅れた端末でも、子の「作成日時 ≦ 完了日時 ≦ 更新日時」が破れない", () => {
    // プロジェクトの更新日時より子の作成日時・更新日時が新しく、今の時刻はどれよりも前
    const p = project({ updatedAt: "2026-11-03T00:00:00.000Z" });
    const child = action({ projectId: p.id, createdAt: "2026-11-04T00:00:00.000Z", updatedAt: "2026-11-04T00:00:00.000Z", capturedAt: null });
    const later = action({ projectId: p.id, updatedAt: "2026-11-06T00:00:00.000Z" });
    const state: AppState = { ...emptyState(), projects: [p], actions: [child, later] };
    const next = ok(completeProject(state, p.id, BEHIND));
    expect(next.projects[0].completedAt).toBe("2026-11-03T00:00:00.000Z");
    expect(next.actions[0]).toMatchObject({ completedAt: "2026-11-04T00:00:00.000Z", updatedAt: "2026-11-04T00:00:00.000Z" });
    expect(next.actions[1]).toMatchObject({ completedAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-06T00:00:00.000Z" });
  });

  it("完了を取り消しても、子の状態は変えない。完了したプロジェクトの子の完了は取り消せない", () => {
    const { state, p, todo } = setup();
    const done = ok(completeProject(state, p.id, NOW));
    expect(err(uncompleteItem(done, { kind: "action", id: todo.id }, NOW))).toBe("先にプロジェクトの完了を取り消してください");
    const back = ok(uncompleteProject(done, p.id, NOW));
    expect(back.projects[0]).toMatchObject({ status: "active", completedAt: null });
    expect(back.actions).toEqual(done.actions);
    expect(back.waitingFors).toEqual(done.waitingFors);
  });

  it("もう完了している・完了していないものは、そのまま失敗にする", () => {
    const { state, p } = setup();
    expect(err(uncompleteProject(state, p.id, NOW))).toBe("完了していません");
    expect(err(completeProject(ok(completeProject(state, p.id, NOW)), p.id, NOW))).toBe("もう完了しています");
  });
});

describe("プロジェクトの削除（D3・D18）", () => {
  it("一緒に削除する：そのプロジェクトの子（完了したものも）だけを消す", () => {
    const { state, p, other, otherA, loose } = setup();
    const next = ok(deleteProject(state, p.id, "delete", NOW));
    expect(next.projects).toEqual([other]);
    expect(next.actions).toEqual([otherA, loose]);
    expect(next.waitingFors).toEqual([]);
  });

  it("単独のものとして残す：子を切り離し、次のアクションはプロジェクトのテーマを引き継ぐ", () => {
    const { state, p, todo, doneA, w } = setup();
    const next = ok(deleteProject(state, p.id, "detach", NOW));
    expect(next.projects.map((x) => x.id)).not.toContain(p.id);
    expect(next.actions.find((a) => a.id === todo.id)).toMatchObject({ projectId: null, themeId: "work", status: "todo", updatedAt: AT });
    expect(next.actions.find((a) => a.id === doneA.id)).toMatchObject({ projectId: null, themeId: "work", status: "done" });
    expect(next.waitingFors.find((x) => x.id === w.id)).toMatchObject({ projectId: null, status: "waiting" });
  });

  it("[@security] 知らない子の扱い・知らない id は、失敗にする", () => {
    const { state, p } = setup();
    expect(err(deleteProject(state, p.id, "unknown" as never, NOW))).toBe("子の扱いが正しくありません");
    expect(err(deleteProject(state, uuid(), "detach", NOW))).toContain("見つかりません");
  });
});

describe("プロジェクトの画面から子を足す", () => {
  it("進行中のプロジェクトに、次のアクション・連絡待ちを足す（収集日時は持たない）", () => {
    const { state, p } = setup();
    const a = uuid();
    const withA = ok(addActionToProject(state, p.id, "  足す一手 ", NOW, () => a));
    expect(withA.actions.at(-1)).toEqual({ id: a, createdAt: AT, updatedAt: AT, capturedAt: null, movedAt: null, text: "足す一手", projectId: p.id, themeId: null, status: "todo", completedAt: null, note: "" });
    const w = uuid();
    const withW = ok(addWaitingToProject(withA, p.id, { text: "頼むこと", party: "テスト相手", requestedOn: "2026-11-05" }, NOW, () => w));
    expect(withW.waitingFors.at(-1)).toMatchObject({ id: w, text: "頼むこと", party: "テスト相手", requestedOn: "2026-11-05", projectId: p.id, status: "waiting" });
  });

  it("完了したプロジェクト・無いプロジェクトには足せない。必須の入力が欠けたら何も変えない", () => {
    const { state, p } = setup();
    const done = ok(completeProject(state, p.id, NOW));
    expect(err(addActionToProject(done, p.id, "足す", NOW, uuid))).toBe("完了したプロジェクトには足せません");
    expect(err(addWaitingToProject(done, p.id, { text: "頼む", party: "相手", requestedOn: "2026-11-05" }, NOW, uuid))).toBe("完了したプロジェクトには足せません");
    expect(err(addActionToProject(state, uuid(), "足す", NOW, uuid))).toContain("見つかりません");
    expect(err(addActionToProject(state, p.id, " ", NOW, uuid))).toBe("次の一手を入れてください");
    expect(err(addWaitingToProject(state, p.id, { text: "頼む", party: "", requestedOn: "2026-11-05" }, NOW, uuid))).toBe("相手を入れてください");
    expect(err(addWaitingToProject(state, p.id, { text: "頼む", party: "相手", requestedOn: "2026-02-30" }, NOW, uuid))).toBe("依頼日を正しい日付で入れてください");
  });
});

describe("reducer：プロジェクトの操作と「元に戻す」（D2・D16）", () => {
  it("完了の「元に戻す」で、プロジェクトと子が完了の前に戻る。文言に未完了の子の件数を出す", () => {
    const { state, p } = setup();
    const root = initialRoot(state);
    const done = reducer(root, { type: "completeProject", id: p.id, at: AT });
    expect(done.state.projects[0].status).toBe("done");
    expect(done.undo?.message).toBe("プロジェクトと、未完了の2件を完了にしました");
    expect(reducer(done, { type: "undo" }).state).toBe(state);
    expect(completeProjectMessage(0)).toBe("プロジェクトを完了にしました");
  });

  it("四半期を移すと「元に戻す」を出し、年度まで書いた文言にする", () => {
    const { state, p } = setup();
    const placed = reducer(initialRoot(state), { type: "placeProject", id: p.id, placement: { fiscalYear: 2027, quarter: 1 }, at: AT });
    expect(placed.undo?.message).toBe("2027年度 第1四半期（2027年4〜6月）に置きました");
    expect(placeMessage(placed.state, p.id, { fiscalYear: 2027, quarter: 2 })).toBe("2027年度 第2四半期（2027年7〜9月）に移しました");
    expect(placeMessage(placed.state, p.id, null)).toBe("四半期から外しました");
    expect(reducer(placed, { type: "undo" }).state).toBe(state);
  });

  it("作成・編集・削除・完了の取り消し・子を足す操作は「元に戻す」を出さない", () => {
    const { state, p } = setup();
    const root = initialRoot(state);
    const steps = [
      reducer(root, { type: "createProject", input, placement: null, at: AT, id: uuid() }),
      reducer(root, { type: "editProject", id: p.id, input, at: AT }),
      reducer(root, { type: "deleteProject", id: p.id, childPolicy: "detach", at: AT }),
      reducer(root, { type: "addActionToProject", projectId: p.id, text: "足す", at: AT, id: uuid() }),
      reducer(root, { type: "addWaitingToProject", projectId: p.id, input: { text: "頼む", party: "相手", requestedOn: "2026-11-05" }, at: AT, id: uuid() }),
    ];
    for (const s of steps) {
      expect(s.state).not.toBe(state);
      expect(s.undo).toBeNull();
    }
  });
});
