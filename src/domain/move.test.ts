import { describe, expect, it } from "vitest";
import { appendedOnMove, droppedOnMove, moveItem, moveTargets, type MoveInput, type PlaceKind } from "./move";
import { initialRoot, reducer } from "./reducer";
import { emptyState, type Action, type AppState, type OpResult, type Project, type ReferenceItem, type SomedayItem, type WaitingFor } from "./types";
import { LIMITS, validateState } from "./validate";

const T0 = "2026-11-01T00:00:00.000Z";
const T1 = "2026-11-02T00:00:00.000Z";
const NOW = new Date("2026-11-05T03:00:00.000Z");
const AT = NOW.toISOString();
const BEHIND = new Date("2026-10-01T00:00:00.000Z");
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(600000 + ++seq).padStart(12, "0")}`;
const base = () => ({ id: uuid(), createdAt: T0, updatedAt: T1, capturedAt: T0, movedAt: null });

function project(over: Partial<Project> = {}): Project {
  const done = over.status === "done";
  return { ...base(), name: "テストのプロジェクト", outcome: "テストの成果", themeId: "work", placement: { fiscalYear: 2026, quarter: 3 }, status: "active", completedAt: done ? T1 : null, note: "プロジェクトのメモ", ...over };
}
function action(over: Partial<Action> = {}): Action {
  const done = over.status === "done";
  return { ...base(), text: "テストのアクション", projectId: null, themeId: null, status: "todo", completedAt: done ? T1 : null, note: "アクションのメモ", ...over };
}
function waiting(over: Partial<WaitingFor> = {}): WaitingFor {
  const done = over.status === "done";
  return { ...base(), text: "テストの連絡待ち", party: "テスト相手", requestedOn: "2026-11-01", projectId: null, status: "waiting", completedAt: done ? T1 : null, note: "連絡待ちのメモ", ...over };
}
const someday = (): SomedayItem => ({ ...base(), text: "テストのいつか", note: "いつかのメモ" });
const reference = (): ReferenceItem => ({ ...base(), title: "テストの資料", body: "資料の本文" });

function setup() {
  const parent = project({ name: "親のプロジェクト", placement: null, note: "" });
  const movable = project({ name: "移すプロジェクト" });
  const doneChild = action({ projectId: movable.id, status: "done" });
  const a = action({ projectId: parent.id });
  const lone = action({ themeId: "health" });
  const w = waiting({ projectId: parent.id });
  const s = someday();
  const r = reference();
  const state: AppState = { ...emptyState(), projects: [parent, movable], actions: [a, lone, doneChild], waitingFors: [w], someday: [s], references: [r] };
  expect(validateState(state).ok).toBe(true);
  return { state, parent, movable, doneChild, a, lone, w, s, r };
}

const input = (over: Partial<MoveInput> = {}): MoveInput => ({ text: "移した内容", outcome: "移した成果", themeId: "finance", placement: null, party: "移した相手", requestedOn: "2026-11-05", ...over });

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

const LIST = { action: "actions", waiting: "waitingFors", project: "projects", someday: "someday", reference: "references" } as const;
type AnyItem = { id: string; createdAt: string; capturedAt: string | null; movedAt: string | null; updatedAt: string };
const find = (state: AppState, kind: PlaceKind, id: string) => (state[LIST[kind]] as readonly AnyItem[]).find((x) => x.id === id);

// 移動の表（docs/design.md 4.3）の各マスで、移動先に入る中身。移動元は setup() の
// lone（単独・テーマ「健康」）、w（親のプロジェクトに属する）、movable（完了した子を持つ）、s、r。入力は input()
const AN = "アクションのメモ";
const WN = "連絡待ちのメモ\n相手：テスト相手（依頼日 2026-11-01）";
const PN = "プロジェクトのメモ\n目的とする成果：テストの成果";
const SN = "いつかのメモ";
const RB = "資料の本文";
const toAction = (note: string, themeId: string | null, projectId: "parent" | null = null) => ({ text: "移した内容", note, themeId, projectId, status: "todo", completedAt: null });
const toWaiting = (note: string) => ({ text: "移した内容", party: "移した相手", requestedOn: "2026-11-05", projectId: null, status: "waiting", completedAt: null, note });
const toProject = (note: string) => ({ name: "移した内容", outcome: "移した成果", themeId: "finance", placement: null, status: "active", completedAt: null, note });
const toSomeday = (note: string) => ({ text: "移した内容", note });
const toReference = (body: string) => ({ title: "移した内容", body });
const CONTENT: Record<PlaceKind, Partial<Record<PlaceKind, Record<string, unknown>>>> = {
  // 単独のアクションのテーマは、プロジェクトへ移すときだけ入力のテーマに変わり、ほかでは捨てる
  action: { waiting: toWaiting(AN), project: toProject(AN), someday: toSomeday(AN), reference: toReference(AN) },
  // 属するプロジェクトは次のアクションへ移すときだけ引き継ぎ（下の it で確かめる）、相手・依頼日は書き足す
  waiting: { action: { text: "移した内容", note: WN, themeId: null, status: "todo" }, project: toProject(WN), someday: toSomeday(WN), reference: toReference(WN) },
  // 目的とする成果は書き足し、テーマは次のアクションへ移すときだけ引き継ぐ。資料の本文は成果を先に置く
  project: { action: toAction(PN, "work"), waiting: toWaiting(PN), someday: toSomeday(PN), reference: toReference("目的とする成果：テストの成果\nプロジェクトのメモ") },
  // 単独の次のアクションへ移すときは、入力のテーマを任意で持てる
  someday: { action: toAction(SN, "finance"), waiting: toWaiting(SN), project: toProject(SN), reference: toReference(SN) },
  // 資料の本文はメモになる
  reference: { action: toAction(RB, "finance"), waiting: toWaiting(RB), project: toProject(RB), someday: toSomeday(RB) },
};
const META = { id: "", createdAt: "", updatedAt: "", capturedAt: null, movedAt: null };
const SHAPE: Record<PlaceKind, object> = {
  action: { ...META, text: "", projectId: null, themeId: null, status: "", completedAt: null, note: "" },
  waiting: { ...META, text: "", party: "", requestedOn: "", projectId: null, status: "", completedAt: null, note: "" },
  project: { ...META, name: "", outcome: "", themeId: "", placement: null, status: "", completedAt: null, note: "" },
  someday: { ...META, text: "", note: "" },
  reference: { ...META, title: "", body: "" },
};

describe("移動の表の全マス（docs/design.md 4.3）", () => {
  const KINDS: PlaceKind[] = ["action", "waiting", "project", "someday", "reference"];
  for (const from of KINDS) {
    for (const to of moveTargets(from)) {
      it(`${from} → ${to}：id・作成日時・収集日時を引き継ぎ、移動日時と更新日時を記録し、中身は表のとおり`, () => {
        const f = setup();
        const id = { action: f.lone.id, waiting: f.w.id, project: f.movable.id, someday: f.s.id, reference: f.r.id }[from];
        const next = ok(moveItem(f.state, { kind: from, id }, to, input(), NOW));
        expect(find(next, from, id)).toBeUndefined();
        expect(find(next, to, id)).toMatchObject({ id, createdAt: T0, capturedAt: T0, movedAt: AT, updatedAt: AT, ...CONTENT[from][to] });
        // 移動先に無い属性（テーマ・属するプロジェクトなど）を持ち越さない
        expect(Object.keys(find(next, to, id) ?? {}).sort()).toEqual(Object.keys(SHAPE[to]).sort());
      });
    }
  }
  it("同じ置き場には移せない。表は20マス", () => {
    const f = setup();
    expect(err(moveItem(f.state, { kind: "someday", id: f.s.id }, "someday", input(), NOW))).toBe("同じ置き場には移せません");
    expect(KINDS.flatMap((k) => moveTargets(k))).toHaveLength(20);
  });
});

describe("移動先ごとの中身（D5：捨てずに書き足す）", () => {
  it("次のアクション → 連絡待ち：属するプロジェクトを引き継ぎ、相手・依頼日を入れる", () => {
    const f = setup();
    const next = ok(moveItem(f.state, { kind: "action", id: f.a.id }, "waiting", input(), NOW));
    expect(find(next, "waiting", f.a.id)).toMatchObject({ text: "移した内容", party: "移した相手", requestedOn: "2026-11-05", projectId: f.parent.id, status: "waiting", note: "アクションのメモ" });
  });

  it("連絡待ち → 次のアクション：属するプロジェクトを引き継ぎ、相手・依頼日はメモに書き足す。テーマは持たない", () => {
    const f = setup();
    const next = ok(moveItem(f.state, { kind: "waiting", id: f.w.id }, "action", input(), NOW));
    expect(find(next, "action", f.w.id)).toMatchObject({ projectId: f.parent.id, themeId: null, note: "連絡待ちのメモ\n相手：テスト相手（依頼日 2026-11-01）" });
  });

  it("連絡待ち → 資料：本文はメモと相手・依頼日", () => {
    const f = setup();
    const next = ok(moveItem(f.state, { kind: "waiting", id: f.w.id }, "reference", input(), NOW));
    expect(find(next, "reference", f.w.id)).toMatchObject({ title: "移した内容", body: "連絡待ちのメモ\n相手：テスト相手（依頼日 2026-11-01）" });
  });

  it("次のアクション → プロジェクト：名称・目的とする成果・テーマを入れ、属していたプロジェクトとのつながりは捨てる", () => {
    const f = setup();
    const next = ok(moveItem(f.state, { kind: "action", id: f.a.id }, "project", input({ placement: { fiscalYear: 2026, quarter: 4 } }), NOW));
    expect(find(next, "project", f.a.id)).toMatchObject({ name: "移した内容", outcome: "移した成果", themeId: "finance", placement: { fiscalYear: 2026, quarter: 4 }, status: "active", note: "アクションのメモ" });
  });

  it("プロジェクト → 次のアクション：テーマを単独のアクションのテーマとして引き継ぎ、目的とする成果はメモに書き足す。置いた四半期は捨てる", () => {
    const f = setup();
    const next = ok(moveItem(f.state, { kind: "project", id: f.movable.id }, "action", input({ themeId: "hobby_learning" }), NOW));
    expect(find(next, "action", f.movable.id)).toMatchObject({ text: "移した内容", projectId: null, themeId: "work", note: "プロジェクトのメモ\n目的とする成果：テストの成果" });
  });

  it("プロジェクト → 資料：本文は目的とする成果とメモ", () => {
    const f = setup();
    const next = ok(moveItem(f.state, { kind: "project", id: f.movable.id }, "reference", input(), NOW));
    expect(find(next, "reference", f.movable.id)).toMatchObject({ body: "目的とする成果：テストの成果\nプロジェクトのメモ" });
  });

  it("プロジェクトを移すと、完了した子は単独のものとして切り離し、次のアクションはテーマを引き継ぐ（D4・D18）", () => {
    const f = setup();
    const next = ok(moveItem(f.state, { kind: "project", id: f.movable.id }, "someday", input(), NOW));
    expect(next.actions.find((x) => x.id === f.doneChild.id)).toMatchObject({ projectId: null, themeId: "work", status: "done", updatedAt: AT });
  });

  it("資料 → 次のアクション：内容＝件名（書き直せる）、メモ＝本文。単独ならテーマを任意で持てる", () => {
    const f = setup();
    const next = ok(moveItem(f.state, { kind: "reference", id: f.r.id }, "action", input({ themeId: null }), NOW));
    expect(find(next, "action", f.r.id)).toMatchObject({ text: "移した内容", note: "資料の本文", themeId: null, projectId: null });
  });

  it("単独の次のアクション → いつか・多分：テーマは捨てる", () => {
    const f = setup();
    const next = ok(moveItem(f.state, { kind: "action", id: f.lone.id }, "someday", input(), NOW));
    expect(find(next, "someday", f.lone.id)).toEqual({ id: f.lone.id, createdAt: T0, updatedAt: AT, capturedAt: T0, movedAt: AT, text: "移した内容", note: "アクションのメモ" });
  });
});

describe("移せないとき（全部変えるか、何も変えないか）", () => {
  it("完了したもの（アクション・連絡待ち・プロジェクト）は移せない", () => {
    const f = setup();
    const doneW = waiting({ status: "done" });
    const doneP = project({ status: "done" });
    const state: AppState = { ...f.state, waitingFors: [...f.state.waitingFors, doneW], projects: [...f.state.projects, doneP] };
    const msg = "完了したものは移せません。先に完了を取り消してください";
    expect(err(moveItem(state, { kind: "action", id: f.doneChild.id }, "someday", input(), NOW))).toBe(msg);
    expect(err(moveItem(state, { kind: "waiting", id: doneW.id }, "someday", input(), NOW))).toBe(msg);
    expect(err(moveItem(state, { kind: "project", id: doneP.id }, "someday", input(), NOW))).toBe(msg);
  });

  it("未完了の子があるプロジェクトは移せない（D4）", () => {
    const f = setup();
    expect(err(moveItem(f.state, { kind: "project", id: f.parent.id }, "someday", input(), NOW))).toBe("未完了の次のアクション・連絡待ちが2件あります。先に完了・移動・削除してください");
  });

  it("移動先で必須の入力が欠けたら、何も変えない", () => {
    const f = setup();
    const ref = { kind: "someday" as const, id: f.s.id };
    expect(err(moveItem(f.state, ref, "project", input({ outcome: " " }), NOW))).toBe("目的とする成果を入れてください");
    expect(err(moveItem(f.state, ref, "project", input({ themeId: null }), NOW))).toBe("テーマを選んでください");
    expect(err(moveItem(f.state, ref, "project", input({ placement: { fiscalYear: 2026, quarter: 9 as never } }), NOW))).toBe("置く四半期が正しくありません");
    expect(err(moveItem(f.state, ref, "waiting", input({ party: "" }), NOW))).toBe("相手を入れてください");
    expect(err(moveItem(f.state, ref, "waiting", input({ requestedOn: "2026-13-01" }), NOW))).toBe("依頼日を正しい日付で入れてください");
    expect(err(moveItem(f.state, ref, "action", input({ text: "" }), NOW))).toBe("内容を入れてください");
    expect(err(moveItem(f.state, ref, "project", input({ text: "あ".repeat(101) }), NOW))).toContain("100字までです");
  });

  it("書き足すと移動先の上限を超えるなら、移さない", () => {
    const f = setup();
    const longNote = waiting({ note: "あ".repeat(LIMITS.longTextLength - 5) });
    const state: AppState = { ...f.state, waitingFors: [...f.state.waitingFors, longNote] };
    expect(err(moveItem(state, { kind: "waiting", id: longNote.id }, "someday", input(), NOW))).toContain("メモが長すぎるため移せません");
    const longBody: ReferenceItem = { ...reference(), body: "あ".repeat(LIMITS.longTextLength + 1) };
    const s2: AppState = { ...f.state, references: [longBody] };
    expect(err(moveItem(s2, { kind: "reference", id: longBody.id }, "someday", input(), NOW))).toContain("メモが長すぎるため移せません");
  });

  it("移動先の件数の上限を超えるなら、移さない", () => {
    const f = setup();
    const full: AppState = { ...f.state, someday: Array.from({ length: LIMITS.itemsPerList }, () => someday()) };
    expect(err(moveItem(full, { kind: "action", id: f.lone.id }, "someday", input(), NOW))).toBe("いつか・多分は 10,000件までです");
  });

  it("[@security] 型の外の値（知らない種類・移動先・入力が無い）でも、例外にせず失敗を返す", () => {
    const f = setup();
    expect(err(moveItem(f.state, { kind: "inbox" as never, id: f.s.id }, "action", input(), NOW))).toBe("移す項目の種類が正しくありません");
    expect(err(moveItem(f.state, { kind: "toString" as never, id: f.s.id }, "action", input(), NOW))).toBe("移す項目の種類が正しくありません");
    expect(err(moveItem(f.state, { kind: "someday", id: f.s.id }, "inbox" as never, input(), NOW))).toBe("移す先が正しくありません");
    expect(err(moveItem(f.state, { kind: "someday", id: f.s.id }, "action", undefined as never, NOW))).toBe("入力が正しくありません");
    expect(err(moveItem(f.state, null as never, "action", input(), NOW))).toBe("移す項目の種類が正しくありません");
  });
});

describe("時計の遅れと「元に戻す」", () => {
  it("時計が遅れていても、移動日時・更新日時は前の更新日時より前にならない", () => {
    const f = setup();
    const next = ok(moveItem(f.state, { kind: "someday", id: f.s.id }, "reference", input(), BEHIND));
    expect(find(next, "reference", f.s.id)).toMatchObject({ movedAt: T1, updatedAt: T1 });
  });

  it("移した直後の「元に戻す」で、移す前に戻る", () => {
    const f = setup();
    const moved = reducer(initialRoot(f.state), { type: "moveItem", source: { kind: "someday", id: f.s.id }, target: "action", input: input(), at: AT });
    expect(moved.undo?.message).toBe("次のアクションに移しました");
    expect(reducer(moved, { type: "undo" }).state).toBe(f.state);
  });
});

describe("移動の画面に出すもの", () => {
  it("引き継がれないもの・書き足すものを示す", () => {
    const f = setup();
    expect(droppedOnMove(f.state, { kind: "action", id: f.a.id }, "someday")).toEqual(["属するプロジェクト"]);
    expect(droppedOnMove(f.state, { kind: "action", id: f.a.id }, "waiting")).toEqual([]);
    expect(droppedOnMove(f.state, { kind: "action", id: f.lone.id }, "waiting")).toEqual(["テーマ"]);
    expect(droppedOnMove(f.state, { kind: "project", id: f.movable.id }, "action")).toEqual(["置いた四半期", "完了した次のアクション・連絡待ちとのつながり（単独のものとして残ります）"]);
    expect(appendedOnMove(f.state, { kind: "waiting", id: f.w.id }, "action")).toBe("相手・依頼日をメモの末尾に書き足します");
    expect(appendedOnMove(f.state, { kind: "waiting", id: f.w.id }, "reference")).toBe("メモは本文に入れ、相手・依頼日を本文の末尾に書き足します");
    expect(appendedOnMove(f.state, { kind: "project", id: f.movable.id }, "reference")).toBe("目的とする成果とメモを本文に入れます");
    expect(appendedOnMove(f.state, { kind: "project", id: f.parent.id }, "reference")).toBe("目的とする成果を本文に入れます");
    expect(appendedOnMove(f.state, { kind: "someday", id: f.s.id }, "action")).toBeNull();
    expect(appendedOnMove(f.state, { kind: "someday", id: f.s.id }, "reference")).toBe("メモは本文に入れます");
    expect(appendedOnMove(f.state, { kind: "action", id: f.lone.id }, "reference")).toBe("メモは本文に入れます");
    expect(appendedOnMove(f.state, { kind: "reference", id: f.r.id }, "someday")).toBe("本文はメモに入れます");
  });

  it("メモ・本文が空なら、それを写すとは示さない", () => {
    const empty = reference();
    const s = { ...emptyState(), references: [{ ...empty, body: "" }], someday: [{ ...someday(), note: "" }] };
    expect(appendedOnMove(s, { kind: "reference", id: empty.id }, "action")).toBeNull();
    expect(appendedOnMove(s, { kind: "someday", id: s.someday[0].id }, "reference")).toBeNull();
  });
});
