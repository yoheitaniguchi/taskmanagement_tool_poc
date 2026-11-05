// 明確化（F02。CLAUDE.md 5.3・6章、docs/design.md 3.4・3.5・4.5）。
// 人間が決めた出口（decision）を受け取り、正しい置き場に要素を作る。判断はしない（1.3「判断する地点と、仕組みに任せる地点を分ける」）。
// - 全部作るか、何も作らない（途中までの状態を残さない。6.4）
// - 元の収集箱の項目は状態から消える。作るものは収集日時を引き継ぐ
// - 作成日時は確定した時刻。ただし端末の時計が遅れていて収集日時より前になるときは、収集日時に揃える（D15）
import { checkCount, checkSize, fail, type Fail } from "./common";
import { FIELDS, readField } from "./fields";
import { isFiscalYear, isQuarter, isValidDate } from "./fiscal";
import { isThemeId, type ThemeId } from "./themes";
import type { Action, AppState, InboxItem, OpResult, Placement, Project, ReferenceItem, SomedayItem, WaitingFor } from "./types";

/** 自分で後でやる（次のアクション）。既存のプロジェクトに属させるか、単独なら任意でテーマを持つ */
export interface NextDecision {
  exit: "next";
  text: string;
  projectId: string | null;
  themeId: ThemeId | null;
}

/** 誰かに任せる（連絡待ち） */
export interface DelegateDecision {
  exit: "delegate";
  text: string;
  party: string;
  /** 依頼日 YYYY-MM-DD */
  requestedOn: string;
  projectId: string | null;
}

/** 明確化の出口（6.4 の表）。どれも、画面で人間が決めたもの */
export type Decision =
  | { exit: "delete" }
  | { exit: "calendar" }
  | { exit: "someday" }
  | { exit: "reference" }
  | { exit: "twoMinutes"; text: string }
  | NextDecision
  | DelegateDecision
  | {
      exit: "project";
      project: { name: string; outcome: string; themeId: ThemeId | null; placement: Placement | null };
      /** 最初の一手は「自分で後でやる」「誰かに任せる」の2択（6.1）。属するのは作るプロジェクト */
      first: { exit: "next"; text: string } | { exit: "delegate"; text: string; party: string; requestedOn: string };
    };

export type Exit = Decision["exit"];

/** 一括振り分けで使える出口（追加の入力が要らないもの。D9） */
export type BulkExit = "next" | "someday" | "reference" | "delete";

/** 確定の後に出す「〇〇しました」（「元に戻す」の帯。docs/design.md 3.5） */
export const EXIT_MESSAGES: Record<Exit, string> = {
  delete: "削除しました",
  calendar: "カレンダーへ送りました",
  someday: "いつか・多分に置きました",
  reference: "資料に置きました",
  twoMinutes: "完了として記録しました",
  next: "次のアクションに置きました",
  delegate: "連絡待ちに置きました",
  project: "プロジェクトを作りました",
};

const BULK_LABELS: Record<BulkExit, string> = { next: "次のアクションに置きました", someday: "いつか・多分に置きました", reference: "資料に置きました", delete: "削除しました" };

export function bulkMessage(exit: BulkExit, count: number): string {
  return `${count}件を${BULK_LABELS[exit]}`;
}

/** 作成日時：確定した時刻と収集日時の遅い方（D15） */
function createdAtFor(item: InboxItem, now: Date): string {
  const at = now.toISOString();
  return at < item.capturedAt ? item.capturedAt : at;
}

/** 明確化で作る要素の共通の項目 */
function placedFrom(item: InboxItem, id: string, at: string) {
  return { id, createdAt: at, updatedAt: at, capturedAt: item.capturedAt, movedAt: null };
}

/** 既存のプロジェクトを選んだとき、それが進行中のプロジェクトか（完了したプロジェクトには足せない。5.3） */
function checkProject(state: AppState, projectId: string | null): Fail | null {
  if (projectId === null) return null;
  const p = state.projects.find((x) => x.id === projectId);
  if (!p) return fail("選んだプロジェクトが見つかりません");
  if (p.status !== "active") return fail("完了したプロジェクトには足せません");
  return null;
}

function checkRequestedOn(value: string): Fail | null {
  return isValidDate(value) ? null : fail("依頼日を正しい日付で入れてください");
}

function checkPlacement(p: Placement | null): Fail | null {
  if (p === null) return null;
  return isFiscalYear(p.fiscalYear) && isQuarter(p.quarter) ? null : fail("置く四半期が正しくありません");
}

/** 1件を、決めた出口へ送ったときの状態（収集箱からは消さない。呼ぶ側で消す） */
function place(state: AppState, item: InboxItem, decision: Decision, now: Date, newId: () => string): OpResult {
  const at = createdAtFor(item, now);
  switch (decision.exit) {
    case "delete":
    case "calendar":
      // ツールには何も残さない（カレンダーへの登録は、発注者がツールの外で行う。企画書4章①）
      return { ok: true, state };
    case "someday": {
      const e = checkCount(state.someday, "いつか・多分");
      if (e) return e;
      const s: SomedayItem = { ...placedFrom(item, newId(), at), text: item.text, note: "" };
      return { ok: true, state: { ...state, someday: [...state.someday, s] } };
    }
    case "reference": {
      const e = checkCount(state.references, "資料");
      if (e) return e;
      const r: ReferenceItem = { ...placedFrom(item, newId(), at), title: item.text, body: "" };
      return { ok: true, state: { ...state, references: [...state.references, r] } };
    }
    case "twoMinutes":
    case "next": {
      const text = readField(decision.text, FIELDS.nextStep);
      if (!text.ok) return text;
      const e = checkCount(state.actions, "アクション");
      if (e) return e;
      let projectId: string | null = null;
      let themeId: ThemeId | null = null;
      if (decision.exit === "next") {
        const pe = checkProject(state, decision.projectId);
        if (pe) return pe;
        projectId = decision.projectId;
        // プロジェクトに属するアクションはテーマを持たない（テーマはプロジェクトを通じて決まる。5.1）
        if (projectId === null && decision.themeId !== null) {
          if (!isThemeId(decision.themeId)) return fail("テーマが正しくありません");
          themeId = decision.themeId;
        }
      }
      const done = decision.exit === "twoMinutes";
      const a: Action = {
        ...placedFrom(item, newId(), at),
        text: text.value,
        projectId,
        themeId,
        status: done ? "done" : "todo",
        completedAt: done ? at : null,
        note: "",
      };
      return { ok: true, state: { ...state, actions: [...state.actions, a] } };
    }
    case "delegate": {
      const w = makeWaiting(state, item, decision, decision.projectId, at, newId);
      if (!w.ok) return w;
      return { ok: true, state: { ...state, waitingFors: [...state.waitingFors, w.value] } };
    }
    case "project": {
      const name = readField(decision.project.name, FIELDS.projectName);
      if (!name.ok) return name;
      const outcome = readField(decision.project.outcome, FIELDS.outcome);
      if (!outcome.ok) return outcome;
      if (decision.project.themeId === null) return fail("テーマを選んでください");
      if (!isThemeId(decision.project.themeId)) return fail("テーマが正しくありません");
      const pe = checkPlacement(decision.project.placement);
      if (pe) return pe;
      const ce = checkCount(state.projects, "プロジェクト");
      if (ce) return ce;
      const project: Project = {
        ...placedFrom(item, newId(), at),
        name: name.value,
        outcome: outcome.value,
        themeId: decision.project.themeId,
        placement: decision.project.placement,
        status: "active",
        completedAt: null,
        note: "",
      };
      const withProject: AppState = { ...state, projects: [...state.projects, project] };
      const first = decision.first;
      if (first.exit === "next") {
        const text = readField(first.text, { ...FIELDS.nextStep, label: "最初の一手" });
        if (!text.ok) return text;
        const ae = checkCount(state.actions, "アクション");
        if (ae) return ae;
        const a: Action = { ...placedFrom(item, newId(), at), text: text.value, projectId: project.id, themeId: null, status: "todo", completedAt: null, note: "" };
        return { ok: true, state: { ...withProject, actions: [...state.actions, a] } };
      }
      if (first.exit === "delegate") {
        const w = makeWaiting(withProject, item, { ...first, text: first.text }, project.id, at, newId, "最初の一手");
        if (!w.ok) return w;
        return { ok: true, state: { ...withProject, waitingFors: [...state.waitingFors, w.value] } };
      }
      // 最初の一手は2択だけ（「今やる」「日時が決まっている」は選べない。6.1）
      return fail("最初の一手は「自分で後でやる」か「誰かに任せる」から選んでください");
    }
    default:
      // 型の外の値（今のコードからは作れない）でも、例外にせず失敗を返す（SEC-006）
      return fail("明確化の出口が正しくありません");
  }
}

function makeWaiting(
  state: AppState,
  item: InboxItem,
  input: { text: string; party: string; requestedOn: string },
  projectId: string | null,
  at: string,
  newId: () => string,
  textLabel: string = FIELDS.nextStep.label,
): { ok: true; value: WaitingFor } | Fail {
  const text = readField(input.text, { ...FIELDS.nextStep, label: textLabel });
  if (!text.ok) return text;
  const party = readField(input.party, FIELDS.party);
  if (!party.ok) return party;
  const de = checkRequestedOn(input.requestedOn);
  if (de) return de;
  const pe = checkProject(state, projectId);
  if (pe) return pe;
  const ce = checkCount(state.waitingFors, "連絡待ち");
  if (ce) return ce;
  return {
    ok: true,
    value: { ...placedFrom(item, newId(), at), text: text.value, party: party.value, requestedOn: input.requestedOn, projectId, status: "waiting", completedAt: null, note: "" },
  };
}

function finish(result: OpResult): OpResult {
  return result.ok ? checkSize(result.state, "資料やメモなどを減らしてから明確化してください") : result;
}

/**
 * 収集箱の1件を、決めた出口へ送る。元の項目は収集箱から消える。
 * 失敗したら状態を変えず、利用者向けの理由を返す（全部作るか、何も作らない）
 */
export function clarify(state: AppState, itemId: string, decision: Decision, now: Date, newId: () => string): OpResult {
  const item = state.inbox.find((x) => x.id === itemId);
  if (!item) return fail("収集箱にその項目がありません（別のタブで振り分けたなど）");
  const placed = place(state, item, decision, now, newId);
  if (!placed.ok) return placed;
  return finish({ ok: true, state: { ...placed.state, inbox: placed.state.inbox.filter((x) => x.id !== itemId) } });
}

/**
 * 一覧で選んだ複数の項目を、追加の入力が要らない1つの出口へまとめて送る（D9）。
 * 収集した文言が、作られる要素の内容（資料なら件名）になる。1件でも送れなければ、何も変えない
 */
export function clarifyBulk(state: AppState, itemIds: readonly string[], exit: BulkExit, now: Date, newId: () => string): OpResult {
  if (!Object.hasOwn(BULK_LABELS, exit)) return fail("一括振り分けの出口が正しくありません");
  const ids = new Set(itemIds);
  if (ids.size === 0) return fail("項目を選んでください");
  if (ids.size !== itemIds.length) return fail("同じ項目が重なっています");
  // 収集箱の並び（古い順）で送る（作られる要素の並びも古い順になるように）
  const items = state.inbox.filter((x) => ids.has(x.id));
  if (items.length !== ids.size) return fail("収集箱に無い項目が含まれています（別のタブで振り分けたなど）");
  let next = state;
  for (const item of items) {
    const decision: Decision = exit === "next" ? { exit: "next", text: item.text, projectId: null, themeId: null } : { exit };
    const placed = place(next, item, decision, now, newId);
    if (!placed.ok) return placed;
    next = placed.state;
  }
  return finish({ ok: true, state: { ...next, inbox: next.inbox.filter((x) => !ids.has(x.id)) } });
}
