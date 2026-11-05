// 保存したデータを読めなくしない回帰テスト（docs/plans/milestone-3.md 2.1）。
// PR 2b 以降、本番のブラウザには実データが入っている。節目2のドメイン関数が実際に作る形
// （明確化で作ったプロジェクトと最初の一手、完了した子、時計の遅れで揃えた日時）を、架空のデータで作り、
// 書き出し → 読み込み、localStorage への保存 → 起動時の読込のどちらでも読めることを確かめる。
// このテストが落ちたら、検証を厳しくした（本番のデータが読めなくなる）ことを疑う
import { describe, expect, it } from "vitest";
import { FakeStorage } from "./fakeStorage";
import { loadFromStorage, parseExportText, saveToStorage, serializeExport } from "./persistence";
import { initialRoot, reducer, type Action, type Root } from "./reducer";
import { emptyState } from "./types";

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(900000 + ++seq).padStart(12, "0")}`;

/** 節目2の操作を順に行った状態（どれも reducer を通す。失敗したらテストを落とす） */
function milestone2State(): Root {
  let root = initialRoot(emptyState());
  const run = (action: Action) => {
    const next = reducer(root, action);
    expect(next.state, `操作が反映されませんでした：${action.type}`).not.toBe(root.state);
    root = next;
  };
  const T = (h: number) => `2026-11-05T${String(h).padStart(2, "0")}:00:00.000Z`;
  for (let i = 1; i <= 7; i++) run({ type: "capture", text: `テスト用の項目${i}`, at: T(i), id: uuid() });
  const inbox = () => root.state.inbox[0].id;
  // プロジェクト（最初の一手は次のアクション）。時計の遅れた端末で確定（収集日時より前）
  run({
    type: "clarify",
    itemId: inbox(),
    decision: { exit: "project", project: { name: "テストのプロジェクト", outcome: "テストの成果", themeId: "work", placement: { fiscalYear: 2026, quarter: 3 } }, first: { exit: "next", text: "テストの最初の一手" } },
    at: T(0),
    ids: [uuid(), uuid()],
  });
  const projectId = root.state.projects[0].id;
  // プロジェクト（最初の一手は連絡待ち。四半期に置かない）
  run({
    type: "clarify",
    itemId: inbox(),
    decision: { exit: "project", project: { name: "テストのプロジェクト2", outcome: "テストの成果2", themeId: "health", placement: null }, first: { exit: "delegate", text: "テストの依頼", party: "テスト相手", requestedOn: "2026-11-05" } },
    at: T(9),
    ids: [uuid(), uuid()],
  });
  run({ type: "clarify", itemId: inbox(), decision: { exit: "next", text: "既存のプロジェクトの次の一手", projectId, themeId: null }, at: T(10), ids: [uuid()] });
  run({ type: "clarify", itemId: inbox(), decision: { exit: "twoMinutes", text: "2分でやった" }, at: T(11), ids: [uuid()] });
  run({ type: "clarify", itemId: inbox(), decision: { exit: "next", text: "単独の次のアクション", projectId: null, themeId: "finance" }, at: T(12), ids: [uuid()] });
  run({ type: "clarifyBulk", itemIds: root.state.inbox.map((x) => x.id), exit: "someday", at: T(13), ids: [uuid(), uuid()] });
  // 完了と、時計の遅れた端末での編集・完了の取り消し
  const child = root.state.actions.find((a) => a.projectId === projectId && a.status === "todo")!;
  run({ type: "completeItem", ref: { kind: "action", id: child.id }, at: T(14) });
  run({ type: "editItem", edit: { kind: "action", id: child.id, text: "直した一手", projectId, themeId: null, note: "メモ\n2行目" }, at: T(1) });
  run({ type: "uncompleteItem", ref: { kind: "action", id: child.id }, at: T(2) });
  run({ type: "completeItem", ref: { kind: "waiting", id: root.state.waitingFors[0].id }, at: T(15) });
  run({ type: "editItem", edit: { kind: "someday", id: root.state.someday[0].id, text: "直したいつか", note: "" }, at: T(16) });
  return root;
}

describe("節目2で作ったデータを読めること（回帰テスト）", () => {
  it("書き出したJSONを、読み込みの検証に通せる", () => {
    const { state } = milestone2State();
    const parsed = parseExportText(serializeExport(state, "テスト端末", new Date("2026-11-05T17:00:00.000Z")));
    expect(parsed.ok ? [] : parsed.errors).toEqual([]);
    if (parsed.ok) expect(parsed.file.state).toEqual(state);
  });

  it("localStorage に保存した状態を、起動時の読込で読める", () => {
    const { state } = milestone2State();
    const storage = new FakeStorage();
    expect(saveToStorage(storage, state).ok).toBe(true);
    expect(loadFromStorage(storage)).toEqual({ kind: "ok", state });
  });
});
