// 置き場の間の移動（CLAUDE.md 5.3、docs/design.md 4.3 の移動の表、D4・D5・D18）。
// 週次レビューで、明確化の結果や状況の変化を直すための操作。
// - id・作成日時・収集日時は引き継ぐ。最後に移した日時（movedAt）と更新日時を記録する
// - 完了したもの（完了のアクション・連絡待ち・プロジェクト）は移せない（完了を取り消してから移す）
// - 移動先に無い文章（相手・依頼日・目的とする成果）はメモの末尾に書き足し、捨てない（D5）
// - 未完了の子があるプロジェクトは移せない。完了した子だけなら、単独のものとして切り離す（D4。次のアクションはテーマを引き継ぐ D18）
// - 収集箱は移動先にならない（「収集箱には戻らない」5.3）
import { checkCount, checkSize, fail, NOT_FOUND, stampFor, type Fail } from "./common";
import { FIELDS, readField, type FieldSpec } from "./fields";
import { isFiscalYear, isQuarter, isValidDate } from "./fiscal";
import { charCount } from "./text";
import { isThemeId, type ThemeId } from "./themes";
import type { Action, AppState, OpResult, Placement, Project, ReferenceItem, SomedayItem, WaitingFor } from "./types";

/** 置き場の種類（移動元・移動先） */
export type PlaceKind = "action" | "waiting" | "project" | "someday" | "reference";

export const PLACE_LABELS: Record<PlaceKind, string> = {
  action: "次のアクション",
  waiting: "連絡待ち",
  project: "プロジェクト",
  someday: "いつか・多分",
  reference: "資料",
};

export interface MoveRef {
  kind: PlaceKind;
  id: string;
}

/**
 * 移す画面で入れる値（画面の入力欄の値そのまま。正規化と検証はここで行う）。移動先が使わない項目は無視する
 * - text：移動先の内容・名称・件名（初期値は移動元の文言）
 * - outcome・themeId・placement：プロジェクトへ移すとき（themeId は単独の次のアクションへ移すときも任意で使う）
 * - party・requestedOn：連絡待ちへ移すとき
 */
export interface MoveInput {
  text: string;
  outcome: string;
  themeId: ThemeId | null;
  placement: Placement | null;
  party: string;
  requestedOn: string;
}

/** 移動元から取り出した、移動先に渡す中身 */
interface Source {
  base: { id: string; createdAt: string; capturedAt: string | null };
  /** 変更の時刻（今の時刻と更新日時の遅い方） */
  at: string;
  note: string;
  /** メモ（または資料の本文）の末尾に書き足す文章（D5） */
  extra: string[];
  projectId: string | null;
  /** 引き継げるテーマ（単独のアクションのテーマ、またはプロジェクトのテーマ） */
  themeId: ThemeId | null;
}

const LISTS = { action: "actions", waiting: "waitingFors", project: "projects", someday: "someday", reference: "references" } as const;

function isPlaceKind(v: unknown): v is PlaceKind {
  return typeof v === "string" && Object.hasOwn(LISTS, v);
}

/** 移す前に、移動元の状態を確かめて中身を取り出す */
function readSource(state: AppState, ref: MoveRef, now: Date): { ok: true; source: Source } | Fail {
  const doneError = fail("完了したものは移せません。先に完了を取り消してください");
  switch (ref.kind) {
    case "action": {
      const a = state.actions.find((x) => x.id === ref.id);
      if (!a) return fail(NOT_FOUND);
      if (a.status === "done") return doneError;
      return { ok: true, source: { base: a, at: stampFor(a, now), note: a.note, extra: [], projectId: a.projectId, themeId: a.themeId } };
    }
    case "waiting": {
      const w = state.waitingFors.find((x) => x.id === ref.id);
      if (!w) return fail(NOT_FOUND);
      if (w.status === "done") return doneError;
      return { ok: true, source: { base: w, at: stampFor(w, now), note: w.note, extra: [`相手：${w.party}（依頼日 ${w.requestedOn}）`], projectId: w.projectId, themeId: null } };
    }
    case "project": {
      const p = state.projects.find((x) => x.id === ref.id);
      if (!p) return fail(NOT_FOUND);
      if (p.status === "done") return doneError;
      const open =
        state.actions.filter((a) => a.projectId === p.id && a.status === "todo").length + state.waitingFors.filter((w) => w.projectId === p.id && w.status === "waiting").length;
      if (open > 0) return fail(`未完了の次のアクション・連絡待ちが${open}件あります。先に完了・移動・削除してください`);
      return { ok: true, source: { base: p, at: stampFor(p, now), note: p.note, extra: [`目的とする成果：${p.outcome}`], projectId: null, themeId: p.themeId } };
    }
    case "someday": {
      const s = state.someday.find((x) => x.id === ref.id);
      if (!s) return fail(NOT_FOUND);
      return { ok: true, source: { base: s, at: stampFor(s, now), note: s.note, extra: [], projectId: null, themeId: null } };
    }
    case "reference": {
      const r = state.references.find((x) => x.id === ref.id);
      if (!r) return fail(NOT_FOUND);
      return { ok: true, source: { base: r, at: stampFor(r, now), note: r.body, extra: [], projectId: null, themeId: null } };
    }
    default:
      return fail("移す項目の種類が正しくありません");
  }
}

/** メモに書き足した結果を、移動先の上限で確かめる（超えるなら移さない。docs/design.md 4.3） */
function joined(parts: string[], spec: FieldSpec): { ok: true; value: string } | Fail {
  const value = parts.filter((x) => x !== "").join("\n");
  const n = charCount(value);
  if (n > spec.max) return fail(`${spec.label}が長すぎるため移せません（書き足すと ${n.toLocaleString("ja-JP")}字。${spec.max.toLocaleString("ja-JP")}字まで）。短くしてから移してください`);
  return { ok: true, value };
}

function checkPlacement(p: Placement | null): Fail | null {
  if (p === null) return null;
  if (typeof p !== "object") return fail("置く四半期が正しくありません");
  return isFiscalYear(p.fiscalYear) && isQuarter(p.quarter) ? null : fail("置く四半期が正しくありません");
}

/**
 * 置き場の間を移す（docs/design.md 4.3 の移動の表）。失敗のときは状態を変えない（全部変えるか、何も変えないか）。
 * 属するプロジェクトを変える（別のプロジェクトへ、単独へ）のは移動ではなく編集（editItem）で行う
 */
export function moveItem(state: AppState, source: MoveRef, target: PlaceKind, input: MoveInput, now: Date): OpResult {
  if (typeof source !== "object" || source === null || !isPlaceKind(source.kind)) return fail("移す項目の種類が正しくありません");
  if (!isPlaceKind(target)) return fail("移す先が正しくありません");
  if (typeof input !== "object" || input === null) return fail("入力が正しくありません");
  if (source.kind === target) return fail("同じ置き場には移せません");
  const read = readSource(state, source, now);
  if (!read.ok) return read;
  const s = read.source;
  const common = { id: s.base.id, createdAt: s.base.createdAt, capturedAt: s.base.capturedAt, movedAt: s.at, updatedAt: s.at };

  // 移動元を消した状態（プロジェクトなら、完了した子を単独のものとして切り離す。D4・D18）
  let rest: AppState = { ...state, [LISTS[source.kind]]: (state[LISTS[source.kind]] as readonly { id: string }[]).filter((x) => x.id !== s.base.id) };
  if (source.kind === "project") {
    const themeId = s.themeId;
    rest = {
      ...rest,
      actions: rest.actions.map((a) => (a.projectId === s.base.id ? { ...a, projectId: null, themeId, updatedAt: stampFor(a, now) } : a)),
      waitingFors: rest.waitingFors.map((w) => (w.projectId === s.base.id ? { ...w, projectId: null, updatedAt: stampFor(w, now) } : w)),
    };
  }

  switch (target) {
    case "action": {
      const text = readField(input.text, FIELDS.text);
      if (!text.ok) return text;
      const note = joined([s.note, ...s.extra], FIELDS.note);
      if (!note.ok) return note;
      // 連絡待ちから戻すときだけ、属するプロジェクトを引き継ぐ（その後に付け替えるのは編集で）
      const projectId = source.kind === "waiting" ? s.projectId : null;
      if (projectId !== null && state.projects.find((p) => p.id === projectId)?.status !== "active") return fail("属するプロジェクトが完了しているため移せません");
      let themeId: ThemeId | null = null;
      if (projectId === null) {
        // プロジェクトから移すときはそのテーマを引き継ぐ。ほかは移す画面で任意に選ぶ
        themeId = source.kind === "project" ? s.themeId : input.themeId;
        if (themeId !== null && !isThemeId(themeId)) return fail("テーマが正しくありません");
      }
      const ce = checkCount(rest.actions, "アクション");
      if (ce) return ce;
      const a: Action = { ...common, text: text.value, projectId, themeId, status: "todo", completedAt: null, note: note.value };
      return checkSize({ ...rest, actions: [...rest.actions, a] });
    }
    case "waiting": {
      const text = readField(input.text, FIELDS.text);
      if (!text.ok) return text;
      const party = readField(input.party, FIELDS.party);
      if (!party.ok) return party;
      if (typeof input.requestedOn !== "string" || !isValidDate(input.requestedOn)) return fail("依頼日を正しい日付で入れてください");
      const note = joined([s.note, ...s.extra], FIELDS.note);
      if (!note.ok) return note;
      // 次のアクションから移すときは、属するプロジェクトを引き継ぐ（テーマは捨てる）
      const projectId = source.kind === "action" ? s.projectId : null;
      const ce = checkCount(rest.waitingFors, "連絡待ち");
      if (ce) return ce;
      const w: WaitingFor = { ...common, text: text.value, party: party.value, requestedOn: input.requestedOn, projectId, status: "waiting", completedAt: null, note: note.value };
      return checkSize({ ...rest, waitingFors: [...rest.waitingFors, w] });
    }
    case "project": {
      const name = readField(input.text, FIELDS.projectName);
      if (!name.ok) return name;
      const outcome = readField(input.outcome, FIELDS.outcome);
      if (!outcome.ok) return outcome;
      if (input.themeId === null) return fail("テーマを選んでください");
      if (!isThemeId(input.themeId)) return fail("テーマが正しくありません");
      const pe = checkPlacement(input.placement);
      if (pe) return pe;
      const note = joined([s.note, ...s.extra], FIELDS.note);
      if (!note.ok) return note;
      const ce = checkCount(rest.projects, "プロジェクト");
      if (ce) return ce;
      const p: Project = { ...common, name: name.value, outcome: outcome.value, themeId: input.themeId, placement: input.placement, status: "active", completedAt: null, note: note.value };
      return checkSize({ ...rest, projects: [...rest.projects, p] });
    }
    case "someday": {
      const text = readField(input.text, FIELDS.text);
      if (!text.ok) return text;
      const note = joined([s.note, ...s.extra], FIELDS.note);
      if (!note.ok) return note;
      const ce = checkCount(rest.someday, "いつか・多分");
      if (ce) return ce;
      const item: SomedayItem = { ...common, text: text.value, note: note.value };
      return checkSize({ ...rest, someday: [...rest.someday, item] });
    }
    case "reference": {
      const title = readField(input.text, FIELDS.title);
      if (!title.ok) return title;
      // 資料には書き足したものを本文に入れる（プロジェクトなら「目的とする成果とメモ」。表の並びに合わせ、書き足すものを先に置く）
      const body = joined(source.kind === "project" ? [...s.extra, s.note] : [s.note, ...s.extra], FIELDS.body);
      if (!body.ok) return body;
      const ce = checkCount(rest.references, "資料");
      if (ce) return ce;
      const r: ReferenceItem = { ...common, title: title.value, body: body.value };
      return checkSize({ ...rest, references: [...rest.references, r] });
    }
    default:
      return fail("移す先が正しくありません");
  }
}

/**
 * 移すと引き継がれないもの（移動の画面に出す。docs/design.md 4.3）。
 * 書き足すもの（メモの末尾へ）は「捨てる」に入れない
 */
export function droppedOnMove(state: AppState, source: MoveRef, target: PlaceKind): string[] {
  const out: string[] = [];
  if (source.kind === "action") {
    const a = state.actions.find((x) => x.id === source.id);
    if (a?.projectId && target !== "waiting") out.push("属するプロジェクト");
    if (a?.themeId && target !== "project") out.push("テーマ");
  }
  if (source.kind === "waiting") {
    const w = state.waitingFors.find((x) => x.id === source.id);
    if (w?.projectId && target !== "action") out.push("属するプロジェクト");
  }
  if (source.kind === "project") {
    const p = state.projects.find((x) => x.id === source.id);
    if (p?.placement) out.push("置いた四半期");
    if (target !== "action") out.push("テーマ");
    const children = state.actions.some((a) => a.projectId === source.id) || state.waitingFors.some((w) => w.projectId === source.id);
    if (children) out.push("完了した次のアクション・連絡待ちとのつながり（単独のものとして残ります）");
  }
  return out;
}

/** 移すと書き足されるもの（移動の画面に出す） */
export function appendedOnMove(source: MoveRef, target: PlaceKind): string | null {
  if (source.kind === "waiting") return target === "reference" ? "相手・依頼日を本文の末尾に書き足します" : "相手・依頼日をメモの末尾に書き足します";
  if (source.kind === "project") return target === "reference" ? "目的とする成果を本文に入れます" : "目的とする成果をメモの末尾に書き足します";
  if (source.kind === "reference" && target !== "reference") return "本文はメモに入れます";
  return null;
}

/** 移す先の候補（同じ置き場のほか全部。表の全マスが「可」） */
export function moveTargets(kind: PlaceKind): PlaceKind[] {
  return (Object.keys(PLACE_LABELS) as PlaceKind[]).filter((k) => k !== kind);
}
