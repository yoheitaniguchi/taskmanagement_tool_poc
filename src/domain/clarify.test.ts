import { describe, expect, it } from "vitest";
import { clarify, clarifyBulk, type Decision } from "./clarify";
import { initialRoot, reducer } from "./reducer";
import { emptyState, type AppState, type InboxItem, type Project } from "./types";
import { validateState } from "./validate";

const CAPTURED = "2026-11-01T00:00:00.000Z";
const NOW = new Date("2026-11-05T03:00:00.000Z");
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(500000 + ++seq).padStart(12, "0")}`;

function inboxItem(text: string, capturedAt = CAPTURED): InboxItem {
  return { id: uuid(), text, capturedAt, createdAt: capturedAt, updatedAt: capturedAt };
}

function project(status: "active" | "done" = "active"): Project {
  return {
    id: uuid(),
    createdAt: CAPTURED,
    updatedAt: CAPTURED,
    capturedAt: null,
    movedAt: null,
    name: "テスト用のプロジェクト",
    outcome: "テスト用の成果",
    themeId: "work",
    placement: null,
    status,
    completedAt: status === "done" ? CAPTURED : null,
    note: "",
  };
}

/** 収集箱に3件、進行中と完了のプロジェクトが1件ずつある状態 */
function setup() {
  const state = emptyState();
  const items = [inboxItem("テスト用の項目1"), inboxItem("テスト用の項目2"), inboxItem("テスト用の項目3")];
  state.inbox = items;
  const active = project("active");
  const done = project("done");
  state.projects = [active, done];
  return { state, items, active, done };
}

function run(state: AppState, itemId: string, decision: Decision, now = NOW): AppState {
  const r = clarify(state, itemId, decision, now, uuid);
  if (!r.ok) throw new Error(r.error);
  expect(validateState(r.state).ok).toBe(true);
  expect(r.state.inbox.some((x) => x.id === itemId)).toBe(false);
  return r.state;
}

const AT = NOW.toISOString();

describe("明確化：出口ごとの結果（CLAUDE.md 6.4 の表、docs/design.md 4.5）", () => {
  it("削除・カレンダーへ：何も作らず、項目だけが消える", () => {
    const { state, items } = setup();
    for (const exit of ["delete", "calendar"] as const) {
      const after = run(state, items[0].id, { exit });
      expect(after.inbox.map((x) => x.id)).toEqual([items[1].id, items[2].id]);
      expect({ ...after, inbox: [] }).toEqual({ ...state, inbox: [] });
    }
  });

  it("いつか・多分：内容＝収集した文言、収集日時を引き継ぎ、作成日時は確定した時刻", () => {
    const { state, items } = setup();
    const after = run(state, items[0].id, { exit: "someday" });
    expect(after.someday).toEqual([
      { id: expect.any(String), text: "テスト用の項目1", note: "", capturedAt: CAPTURED, createdAt: AT, updatedAt: AT, movedAt: null },
    ]);
  });

  it("資料：件名＝収集した文言、本文は空", () => {
    const { state, items } = setup();
    const after = run(state, items[0].id, { exit: "reference" });
    expect(after.references).toEqual([{ id: expect.any(String), title: "テスト用の項目1", body: "", capturedAt: CAPTURED, createdAt: AT, updatedAt: AT, movedAt: null }]);
  });

  it("自分で後でやる：未着手のアクション（内容は書き直した次の一手）。単独なら任意でテーマを持つ", () => {
    const { state, items } = setup();
    const after = run(state, items[0].id, { exit: "next", text: "  書き直した一手  ", projectId: null, themeId: "health" });
    expect(after.actions).toEqual([
      { id: expect.any(String), text: "書き直した一手", projectId: null, themeId: "health", status: "todo", completedAt: null, note: "", capturedAt: CAPTURED, createdAt: AT, updatedAt: AT, movedAt: null },
    ]);
  });

  it("自分で後でやる：既存の進行中のプロジェクトを選ぶと、その projectId を持ち、テーマは持たない", () => {
    const { state, items, active } = setup();
    const after = run(state, items[0].id, { exit: "next", text: "一手", projectId: active.id, themeId: "health" });
    expect(after.actions[0]).toMatchObject({ projectId: active.id, themeId: null });
  });

  it("今やる（2分）：完了済みのアクション。完了日時＝確定した時刻", () => {
    const { state, items } = setup();
    const after = run(state, items[0].id, { exit: "twoMinutes", text: "やったこと" });
    expect(after.actions[0]).toMatchObject({ text: "やったこと", status: "done", completedAt: AT, createdAt: AT, projectId: null, themeId: null });
  });

  it("誰かに任せる：待ちの連絡待ち（相手・依頼日）。既存のプロジェクトを選べる", () => {
    const { state, items, active } = setup();
    const after = run(state, items[0].id, { exit: "delegate", text: "頼んだこと", party: "テスト相手", requestedOn: "2026-11-05", projectId: active.id });
    expect(after.waitingFors).toEqual([
      {
        id: expect.any(String),
        text: "頼んだこと",
        party: "テスト相手",
        requestedOn: "2026-11-05",
        projectId: active.id,
        status: "waiting",
        completedAt: null,
        note: "",
        capturedAt: CAPTURED,
        createdAt: AT,
        updatedAt: AT,
        movedAt: null,
      },
    ]);
  });

  it("プロジェクト：進行中のプロジェクトと、最初の一手（次のアクション）を一緒に作る", () => {
    const { state, items } = setup();
    const after = run(state, items[0].id, {
      exit: "project",
      project: { name: "新しいプロジェクト", outcome: "終わった状態", themeId: "hobby_learning", placement: { fiscalYear: 2026, quarter: 3 } },
      first: { exit: "next", text: "最初の一手" },
    });
    const p = after.projects.at(-1)!;
    expect(p).toMatchObject({ name: "新しいプロジェクト", outcome: "終わった状態", themeId: "hobby_learning", placement: { fiscalYear: 2026, quarter: 3 }, status: "active", capturedAt: CAPTURED, createdAt: AT });
    expect(after.actions).toEqual([expect.objectContaining({ text: "最初の一手", projectId: p.id, themeId: null, status: "todo", capturedAt: CAPTURED })]);
  });

  it("プロジェクト：最初の一手を連絡待ちにもできる", () => {
    const { state, items } = setup();
    const after = run(state, items[0].id, {
      exit: "project",
      project: { name: "新しいプロジェクト", outcome: "終わった状態", themeId: "work", placement: null },
      first: { exit: "delegate", text: "頼む", party: "テスト相手", requestedOn: "2026-11-05" },
    });
    expect(after.waitingFors[0]).toMatchObject({ projectId: after.projects.at(-1)!.id, party: "テスト相手" });
    expect(after.actions).toEqual([]);
  });
});

describe("明確化：必須の入力が欠けたら、何も変えない（全部作るか、何も作らない）", () => {
  const { state, items, done } = setup();
  const id = items[0].id;
  const cases: [string, Decision][] = [
    ["次の一手が空", { exit: "next", text: "  ", projectId: null, themeId: null }],
    ["次の一手が501字", { exit: "next", text: "あ".repeat(501), projectId: null, themeId: null }],
    ["次の一手に改行", { exit: "twoMinutes", text: "一\n二" }],
    ["相手が空", { exit: "delegate", text: "頼む", party: "", requestedOn: "2026-11-05", projectId: null }],
    ["依頼日が実在しない", { exit: "delegate", text: "頼む", party: "相手", requestedOn: "2026-02-30", projectId: null }],
    ["完了したプロジェクトを選んだ", { exit: "next", text: "一手", projectId: done.id, themeId: null }],
    ["無いプロジェクトを選んだ", { exit: "delegate", text: "頼む", party: "相手", requestedOn: "2026-11-05", projectId: uuid() }],
    ["知らないテーマ", { exit: "next", text: "一手", projectId: null, themeId: "unknown" as never }],
    [
      "プロジェクトのテーマが無い",
      { exit: "project", project: { name: "名前", outcome: "成果", themeId: null, placement: null }, first: { exit: "next", text: "一手" } },
    ],
    [
      "プロジェクトの成果が空",
      { exit: "project", project: { name: "名前", outcome: " ", themeId: "work", placement: null }, first: { exit: "next", text: "一手" } },
    ],
    [
      "プロジェクトの名称が101字",
      { exit: "project", project: { name: "あ".repeat(101), outcome: "成果", themeId: "work", placement: null }, first: { exit: "next", text: "一手" } },
    ],
    [
      "最初の一手が空",
      { exit: "project", project: { name: "名前", outcome: "成果", themeId: "work", placement: null }, first: { exit: "next", text: "" } },
    ],
    [
      "置く四半期が範囲の外",
      { exit: "project", project: { name: "名前", outcome: "成果", themeId: "work", placement: { fiscalYear: 2026, quarter: 5 as never } }, first: { exit: "next", text: "一手" } },
    ],
    [
      "最初の一手に2択のほかを渡した",
      { exit: "project", project: { name: "名前", outcome: "成果", themeId: "work", placement: null }, first: { exit: "twoMinutes", text: "一手" } as never },
    ],
  ];
  for (const [name, decision] of cases) {
    it(name, () => {
      const r = clarify(state, id, decision, NOW, uuid);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/\S/);
    });
  }

  it("収集箱に無い項目は振り分けない", () => {
    expect(clarify(state, uuid(), { exit: "delete" }, NOW, uuid).ok).toBe(false);
  });
});

describe("明確化：端末の時計のずれ（D15）", () => {
  it("確定した時刻が収集日時より前なら、作成日時（と完了日時）を収集日時に揃え、検証を通る", () => {
    const { state } = setup();
    const future = inboxItem("時計の進んだ端末で収集", "2026-11-10T00:00:00.000Z");
    state.inbox = [future];
    const after = run(state, future.id, { exit: "twoMinutes", text: "やった" }, NOW);
    expect(after.actions[0]).toMatchObject({ createdAt: future.capturedAt, updatedAt: future.capturedAt, completedAt: future.capturedAt });
  });
});

describe("一括振り分け（D9）", () => {
  it("選んだ項目を収集箱の並びで1つの出口に送る。収集した文言が内容・件名になる", () => {
    const { state, items } = setup();
    const r = clarifyBulk(state, [items[2].id, items[0].id], "next", NOW, uuid);
    if (!r.ok) throw new Error(r.error);
    expect(validateState(r.state).ok).toBe(true);
    expect(r.state.inbox.map((x) => x.id)).toEqual([items[1].id]);
    expect(r.state.actions.map((a) => [a.text, a.status, a.projectId, a.capturedAt])).toEqual([
      ["テスト用の項目1", "todo", null, CAPTURED],
      ["テスト用の項目3", "todo", null, CAPTURED],
    ]);
    const ref = clarifyBulk(state, [items[1].id], "reference", NOW, uuid);
    expect(ref.ok && ref.state.references[0].title).toBe("テスト用の項目2");
    const sd = clarifyBulk(state, [items[1].id], "someday", NOW, uuid);
    expect(sd.ok && sd.state.someday[0].text).toBe("テスト用の項目2");
    const del = clarifyBulk(state, items.map((x) => x.id), "delete", NOW, uuid);
    expect(del.ok && del.state.inbox).toEqual([]);
  });

  it("1件でも無い項目・重なりがあれば、何も変えない。空の選択も断る", () => {
    const { state, items } = setup();
    expect(clarifyBulk(state, [items[0].id, uuid()], "next", NOW, uuid).ok).toBe(false);
    expect(clarifyBulk(state, [items[0].id, items[0].id], "delete", NOW, uuid).ok).toBe(false);
    expect(clarifyBulk(state, [], "delete", NOW, uuid).ok).toBe(false);
  });
});

describe("reducer：明確化と「元に戻す」（D1、docs/design.md 6.4）", () => {
  it("確定の直後の「元に戻す」で、同じ id・収集日時の項目が元の位置に戻り、作ったものは消える", () => {
    const { state, items } = setup();
    const root = initialRoot(state);
    const next = reducer(root, { type: "clarify", itemId: items[0].id, decision: { exit: "someday" }, at: AT, ids: [uuid()] });
    expect(next.state.someday).toHaveLength(1);
    expect(next.undo?.message).toBe("いつか・多分に置きました");
    const undone = reducer(next, { type: "undo" });
    expect(undone.state).toBe(state);
    expect(undone.state.inbox[0]).toEqual(items[0]);
  });

  it("一括の「元に戻す」は件数を示し、すべて戻す", () => {
    const { state, items } = setup();
    const next = reducer(initialRoot(state), { type: "clarifyBulk", itemIds: items.map((x) => x.id), exit: "delete", at: AT, ids: [] });
    expect(next.undo?.message).toBe("3件を削除しました");
    expect(reducer(next, { type: "undo" }).state).toBe(state);
  });

  it("[@security] 渡した id が足りないと、id の検証に通らないので何も変えない", () => {
    const { state, items } = setup();
    const root = initialRoot(state);
    const decision: Decision = {
      exit: "project",
      project: { name: "名前", outcome: "成果", themeId: "work", placement: null },
      first: { exit: "next", text: "一手" },
    };
    expect(reducer(root, { type: "clarify", itemId: items[0].id, decision, at: AT, ids: [uuid()] })).toBe(root);
    expect(reducer(root, { type: "clarify", itemId: items[0].id, decision, at: AT, ids: [uuid(), uuid()] }).state.projects).toHaveLength(3);
  });

  it("失敗した明確化は、状態も「元に戻す」も変えない", () => {
    const { state, items } = setup();
    const root = initialRoot(state);
    expect(reducer(root, { type: "clarify", itemId: items[0].id, decision: { exit: "next", text: "", projectId: null, themeId: null }, at: AT, ids: [uuid()] })).toBe(root);
  });
});
