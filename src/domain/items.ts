// 置き場の要素（次のアクション・連絡待ち・いつか・多分・資料）の編集・完了・完了の取り消し・削除（F03。CLAUDE.md 5.3、docs/design.md 3.3・4.4・4.5）。
// 置き場の間の移動（move.ts）と、プロジェクトの画面から子を足す操作は節目3で足す。
// - 失敗のときは状態を変えない（全部変えるか、何も変えないか）
// - 完了のものは完了日時を持ち、未完了のものは持たない
// - 完了したプロジェクトに未完了の子を残さない（付け替え・完了の取り消しのどちらでも）
// - プロジェクトに属するアクションはテーマを持たない
import { checkSize, fail, NOT_FOUND, replaceIn, stampFor, type Fail } from "./common";
import { FIELDS, readField } from "./fields";
import { isValidDate } from "./fiscal";
import { isThemeId, type ThemeId } from "./themes";
import type { Action, AppState, OpResult, ReferenceItem, SomedayItem, WaitingFor } from "./types";

export type ItemKind = "action" | "waiting" | "someday" | "reference";
/** 完了の状態を持つもの */
export type CompletableKind = "action" | "waiting";

export interface ItemRef<K extends ItemKind = ItemKind> {
  kind: K;
  id: string;
}

/** 編集の入力（画面の入力欄の値そのまま。正規化と検証はここで行う） */
export type ItemEdit =
  | { kind: "action"; id: string; text: string; projectId: string | null; themeId: ThemeId | null; note: string }
  | { kind: "waiting"; id: string; text: string; party: string; requestedOn: string; projectId: string | null; note: string }
  | { kind: "someday"; id: string; text: string; note: string }
  | { kind: "reference"; id: string; title: string; body: string };

const LIST_KEY = { action: "actions", waiting: "waitingFors", someday: "someday", reference: "references" } as const;

function finish(state: AppState): OpResult {
  return checkSize(state);
}

/**
 * 属するプロジェクトを確かめる。付け替えるとき（今と違うプロジェクトにするとき）は、付け替え先が進行中であること。
 * 今と同じなら、完了したプロジェクトのままでよい（完了した子のメモを直すときなど）
 */
function checkProject(state: AppState, current: string | null, next: string | null): Fail | null {
  if (next === null || next === current) return null;
  const p = state.projects.find((x) => x.id === next);
  if (!p) return fail("選んだプロジェクトが見つかりません");
  if (p.status !== "active") return fail("完了したプロジェクトには付け替えられません");
  return null;
}

export function editItem(state: AppState, edit: ItemEdit, now: Date): OpResult {
  switch (edit.kind) {
    case "action": {
      const item = state.actions.find((x) => x.id === edit.id);
      if (!item) return fail(NOT_FOUND);
      const text = readField(edit.text, FIELDS.text);
      if (!text.ok) return text;
      const note = readField(edit.note, FIELDS.note);
      if (!note.ok) return note;
      const bad = checkProject(state, item.projectId, edit.projectId);
      if (bad) return bad;
      if (edit.themeId !== null && !isThemeId(edit.themeId)) return fail("テーマが正しくありません");
      // 未完了のアクションを完了したプロジェクトに残さない（付け替え先は checkProject で進行中に限っている）
      const at = stampFor(item, now);
      const next: Action = {
        ...item,
        text: text.value,
        note: note.value,
        projectId: edit.projectId,
        themeId: edit.projectId === null ? edit.themeId : null,
        updatedAt: at,
      };
      return finish({ ...state, actions: replaceIn(state.actions, next) });
    }
    case "waiting": {
      const item = state.waitingFors.find((x) => x.id === edit.id);
      if (!item) return fail(NOT_FOUND);
      const text = readField(edit.text, FIELDS.text);
      if (!text.ok) return text;
      const party = readField(edit.party, FIELDS.party);
      if (!party.ok) return party;
      const note = readField(edit.note, FIELDS.note);
      if (!note.ok) return note;
      if (!isValidDate(edit.requestedOn)) return fail("依頼日を正しい日付で入れてください");
      const bad = checkProject(state, item.projectId, edit.projectId);
      if (bad) return bad;
      const next: WaitingFor = {
        ...item,
        text: text.value,
        party: party.value,
        requestedOn: edit.requestedOn,
        projectId: edit.projectId,
        note: note.value,
        updatedAt: stampFor(item, now),
      };
      return finish({ ...state, waitingFors: replaceIn(state.waitingFors, next) });
    }
    case "someday": {
      const item = state.someday.find((x) => x.id === edit.id);
      if (!item) return fail(NOT_FOUND);
      const text = readField(edit.text, FIELDS.text);
      if (!text.ok) return text;
      const note = readField(edit.note, FIELDS.note);
      if (!note.ok) return note;
      const next: SomedayItem = { ...item, text: text.value, note: note.value, updatedAt: stampFor(item, now) };
      return finish({ ...state, someday: replaceIn(state.someday, next) });
    }
    case "reference": {
      const item = state.references.find((x) => x.id === edit.id);
      if (!item) return fail(NOT_FOUND);
      const title = readField(edit.title, FIELDS.title);
      if (!title.ok) return title;
      const body = readField(edit.body, FIELDS.body);
      if (!body.ok) return body;
      const next: ReferenceItem = { ...item, title: title.value, body: body.value, updatedAt: stampFor(item, now) };
      return finish({ ...state, references: replaceIn(state.references, next) });
    }
    default:
      // 型の外の値（今のコードからは作れない）でも、例外にせず失敗を返す（SEC-006）
      return fail("編集する項目の種類が正しくありません");
  }
}

/** 完了にする（次のアクション・連絡待ち）。完了日時は今の時刻（時計の遅れは stampFor で揃える） */
export function completeItem(state: AppState, ref: ItemRef<CompletableKind>, now: Date): OpResult {
  if (ref.kind !== "action" && ref.kind !== "waiting") return fail("完了にする項目の種類が正しくありません");
  if (ref.kind === "action") {
    const item = state.actions.find((x) => x.id === ref.id);
    if (!item) return fail(NOT_FOUND);
    if (item.status === "done") return fail("もう完了しています");
    const at = stampFor(item, now);
    return finish({ ...state, actions: replaceIn(state.actions, { ...item, status: "done", completedAt: at, updatedAt: at }) });
  }
  const item = state.waitingFors.find((x) => x.id === ref.id);
  if (!item) return fail(NOT_FOUND);
  if (item.status === "done") return fail("もう完了しています");
  const at = stampFor(item, now);
  return finish({ ...state, waitingFors: replaceIn(state.waitingFors, { ...item, status: "done", completedAt: at, updatedAt: at }) });
}

/** 完了を取り消す。属するプロジェクトが完了なら取り消せない（完了したプロジェクトに未完了の子を残さないため。docs/design.md 4.4） */
export function uncompleteItem(state: AppState, ref: ItemRef<CompletableKind>, now: Date): OpResult {
  if (ref.kind !== "action" && ref.kind !== "waiting") return fail("完了を取り消す項目の種類が正しくありません");
  const item = ref.kind === "action" ? state.actions.find((x) => x.id === ref.id) : state.waitingFors.find((x) => x.id === ref.id);
  if (!item) return fail(NOT_FOUND);
  if (item.status !== "done") return fail("完了していません");
  if (item.projectId !== null && state.projects.find((p) => p.id === item.projectId)?.status === "done") {
    return fail("先にプロジェクトの完了を取り消してください");
  }
  const at = stampFor(item, now);
  if (ref.kind === "action") {
    const a = item as Action;
    return finish({ ...state, actions: replaceIn(state.actions, { ...a, status: "todo", completedAt: null, updatedAt: at }) });
  }
  const w = item as WaitingFor;
  return finish({ ...state, waitingFors: replaceIn(state.waitingFors, { ...w, status: "waiting", completedAt: null, updatedAt: at }) });
}

/** 削除する（確認は出さず、直後の「元に戻す」で救う。7.1） */
export function deleteItem(state: AppState, ref: ItemRef): OpResult {
  if (!Object.hasOwn(LIST_KEY, ref.kind)) return fail("削除する項目の種類が正しくありません");
  const key = LIST_KEY[ref.kind];
  const list = state[key] as readonly { id: string }[];
  if (!list.some((x) => x.id === ref.id)) return fail(NOT_FOUND);
  return { ok: true, state: { ...state, [key]: list.filter((x) => x.id !== ref.id) } };
}
