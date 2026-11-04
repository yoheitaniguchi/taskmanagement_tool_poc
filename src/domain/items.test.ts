import { describe, expect, it } from "vitest";
import { completeItem, deleteItem, editItem, uncompleteItem } from "./items";
import { initialRoot, reducer } from "./reducer";
import { projectSummaries, sortProjects } from "./summaries";
import { emptyState, type Action, type AppState, type OpResult, type Project, type ReferenceItem, type SomedayItem, type WaitingFor } from "./types";
import { validateState } from "./validate";

const T0 = "2026-11-01T00:00:00.000Z";
const NOW = new Date("2026-11-05T03:00:00.000Z");
const AT = NOW.toISOString();
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(700000 + ++seq).padStart(12, "0")}`;
const base = () => ({ id: uuid(), createdAt: T0, updatedAt: T0, capturedAt: T0, movedAt: null });

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

function setup() {
  const active = project({ name: "進行中" });
  const done = project({ name: "完了済み", status: "done" });
  const a = action();
  const aInDone = action({ projectId: done.id, status: "done" });
  const w = waiting({ projectId: active.id });
  const s: SomedayItem = { ...base(), text: "テストのいつか", note: "" };
  const r: ReferenceItem = { ...base(), title: "テストの資料", body: "" };
  const state: AppState = { ...emptyState(), projects: [active, done], actions: [a, aInDone], waitingFors: [w], someday: [s], references: [r] };
  expect(validateState(state).ok).toBe(true);
  return { state, active, done, a, aInDone, w, s, r };
}

function ok(r: OpResult): AppState {
  if (!r.ok) throw new Error(r.error);
  expect(validateState(r.state).ok).toBe(true);
  return r.state;
}

describe("置き場の要素の編集（docs/design.md 3.3）", () => {
  it("次のアクション：内容・メモを正規化して直し、更新日時を記録する。作成日時・収集日時は変えない", () => {
    const { state, a } = setup();
    const next = ok(editItem(state, { kind: "action", id: a.id, text: "  直した内容 ", projectId: null, themeId: "health", note: "メモ\r\n2行目" }, NOW));
    expect(next.actions[0]).toEqual({ ...a, text: "直した内容", themeId: "health", note: "メモ\n2行目", updatedAt: AT });
  });

  it("次のアクション：進行中のプロジェクトに付け替えると、テーマは持たない", () => {
    const { state, a, active } = setup();
    const next = ok(editItem(state, { kind: "action", id: a.id, text: "内容", projectId: active.id, themeId: "health", note: "" }, NOW));
    expect(next.actions[0]).toMatchObject({ projectId: active.id, themeId: null });
  });

  it("完了したプロジェクト・無いプロジェクトには付け替えられない", () => {
    const { state, a, done } = setup();
    expect(editItem(state, { kind: "action", id: a.id, text: "内容", projectId: done.id, themeId: null, note: "" }, NOW).ok).toBe(false);
    expect(editItem(state, { kind: "action", id: a.id, text: "内容", projectId: uuid(), themeId: null, note: "" }, NOW).ok).toBe(false);
  });

  it("完了したプロジェクトに属する、完了した子のメモは直せる（付け替えないなら）", () => {
    const { state, aInDone, done } = setup();
    const next = ok(editItem(state, { kind: "action", id: aInDone.id, text: "内容", projectId: done.id, themeId: null, note: "あとで書いたメモ" }, NOW));
    expect(next.actions[1].note).toBe("あとで書いたメモ");
  });

  it("連絡待ち：相手・依頼日を直せる。相手が空・依頼日が実在しないなら何も変えない", () => {
    const { state, w, active } = setup();
    const next = ok(editItem(state, { kind: "waiting", id: w.id, text: "内容", party: "別の相手", requestedOn: "2026-11-04", projectId: active.id, note: "" }, NOW));
    expect(next.waitingFors[0]).toMatchObject({ party: "別の相手", requestedOn: "2026-11-04" });
    expect(editItem(state, { kind: "waiting", id: w.id, text: "内容", party: " ", requestedOn: "2026-11-04", projectId: null, note: "" }, NOW).ok).toBe(false);
    expect(editItem(state, { kind: "waiting", id: w.id, text: "内容", party: "相手", requestedOn: "2026-02-30", projectId: null, note: "" }, NOW).ok).toBe(false);
  });

  it("いつか・多分と資料を直せる。資料の本文は10,000字まで", () => {
    const { state, s, r } = setup();
    expect(ok(editItem(state, { kind: "someday", id: s.id, text: "直した", note: "メモ" }, NOW)).someday[0]).toMatchObject({ text: "直した", note: "メモ" });
    expect(ok(editItem(state, { kind: "reference", id: r.id, title: "件名", body: "あ".repeat(10_000) }, NOW)).references[0].body).toHaveLength(10_000);
    expect(editItem(state, { kind: "reference", id: r.id, title: "件名", body: "あ".repeat(10_001) }, NOW).ok).toBe(false);
    expect(editItem(state, { kind: "reference", id: r.id, title: "", body: "" }, NOW).ok).toBe(false);
  });

  it("内容が空・501字・改行入り、メモが2,001字なら、何も変えない", () => {
    const { state, a } = setup();
    for (const [text, note] of [["", ""], ["あ".repeat(501), ""], ["一\n二", ""], ["内容", "あ".repeat(2001)]]) {
      expect(editItem(state, { kind: "action", id: a.id, text, projectId: null, themeId: null, note }, NOW).ok).toBe(false);
    }
  });
});

describe("完了と完了の取り消し（docs/design.md 3.3・4.4）", () => {
  it("完了にすると完了日時を持ち、取り消すと消える", () => {
    const { state, a, w } = setup();
    const done = ok(completeItem(state, { kind: "action", id: a.id }, NOW));
    expect(done.actions[0]).toMatchObject({ status: "done", completedAt: AT, updatedAt: AT });
    const back = ok(uncompleteItem(done, { kind: "action", id: a.id }, NOW));
    expect(back.actions[0]).toMatchObject({ status: "todo", completedAt: null });
    const wd = ok(completeItem(state, { kind: "waiting", id: w.id }, NOW));
    expect(wd.waitingFors[0]).toMatchObject({ status: "done", completedAt: AT });
    expect(ok(uncompleteItem(wd, { kind: "waiting", id: w.id }, NOW)).waitingFors[0]).toMatchObject({ status: "waiting", completedAt: null });
  });

  it("端末の時計が遅れていても、完了日時は作成日時・更新日時より前にならない（D15）", () => {
    const { state, a } = setup();
    const late = ok(completeItem(state, { kind: "action", id: a.id }, new Date("2026-10-01T00:00:00.000Z")));
    expect(late.actions[0]).toMatchObject({ completedAt: T0, updatedAt: T0 });
  });

  it("属するプロジェクトが完了なら、完了を取り消せない（完了したプロジェクトに未完了の子を残さない）", () => {
    const { state, aInDone } = setup();
    const r = uncompleteItem(state, { kind: "action", id: aInDone.id }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("先にプロジェクトの完了を取り消してください");
  });

  it("二重の完了・未完了の取り消し・無い要素は断る", () => {
    const { state, a, aInDone } = setup();
    expect(completeItem(state, { kind: "action", id: aInDone.id }, NOW).ok).toBe(false);
    expect(uncompleteItem(state, { kind: "action", id: a.id }, NOW).ok).toBe(false);
    expect(completeItem(state, { kind: "waiting", id: uuid() }, NOW).ok).toBe(false);
  });
});

describe("削除と「元に戻す」（D1、docs/design.md 6.4）", () => {
  it("4つの置き場から削除できる。無いものは断る", () => {
    const { state, a, w, s, r } = setup();
    expect(ok(deleteItem(state, { kind: "action", id: a.id })).actions).toHaveLength(1);
    expect(ok(deleteItem(state, { kind: "waiting", id: w.id })).waitingFors).toEqual([]);
    expect(ok(deleteItem(state, { kind: "someday", id: s.id })).someday).toEqual([]);
    expect(ok(deleteItem(state, { kind: "reference", id: r.id })).references).toEqual([]);
    expect(deleteItem(state, { kind: "someday", id: a.id }).ok).toBe(false);
  });

  it("完了・削除の直後は「元に戻す」で元の状態に戻る。編集・完了の取り消しは「元に戻す」を出さない", () => {
    const { state, a } = setup();
    const done = reducer(initialRoot(state), { type: "completeItem", ref: { kind: "action", id: a.id }, at: AT });
    expect(done.undo?.message).toBe("完了にしました");
    expect(reducer(done, { type: "undo" }).state).toBe(state);
    const del = reducer(initialRoot(state), { type: "deleteItem", ref: { kind: "action", id: a.id } });
    expect(del.undo?.message).toBe("削除しました");
    expect(reducer(del, { type: "undo" }).state).toBe(state);
    const edited = reducer(done, { type: "editItem", edit: { kind: "action", id: a.id, text: "直した", projectId: null, themeId: null, note: "" }, at: AT });
    expect(edited.undo).toBeNull();
    expect(reducer(done, { type: "uncompleteItem", ref: { kind: "action", id: a.id }, at: AT }).undo).toBeNull();
  });
});

describe("プロジェクトの一覧の件数と並べ替え（docs/design.md 3.6、CLAUDE.md 4.3）", () => {
  it("未着手の次のアクションと、待ちの連絡待ちだけを数える", () => {
    const p = project();
    const state: AppState = {
      ...emptyState(),
      projects: [p],
      actions: [action({ projectId: p.id }), action({ projectId: p.id }), action({ projectId: p.id, status: "done" }), action()],
      waitingFors: [waiting({ projectId: p.id, status: "done" })],
    };
    expect(projectSummaries(state)).toEqual([{ project: p, nextActions: 2, waiting: 0 }]);
  });

  it("テーマ順・四半期順（置いていないものは最後）・名前順に並べる", () => {
    const list = [
      project({ name: "い", themeId: "health", placement: { fiscalYear: 2026, quarter: 2 } }),
      project({ name: "あ", themeId: "finance", placement: null }),
      project({ name: "う", themeId: "work", placement: { fiscalYear: 2026, quarter: 3 } }),
    ].map((p) => ({ project: p }));
    const names = (order: "theme" | "quarter" | "name") => sortProjects(list, order).map((x) => x.project.name).join("");
    expect(names("theme")).toBe("ういあ");
    expect(names("quarter")).toBe("いうあ");
    expect(names("name")).toBe("あいう");
  });
});
