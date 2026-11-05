// プロジェクトの操作（F04。CLAUDE.md 5.3、docs/design.md 3.6・4.4・4.5）。
// - プロジェクトは目的とする成果とテーマを必ず持つ。置く四半期は0か1つで、変えるのは placeProject の1か所だけ
// - 完了したプロジェクトに、未着手のアクション・待ちの連絡待ちを残さない（完了にするときは子も一緒に完了にする。D2）
// - 完了を取り消しても、子の状態は変えない
// - 削除では、子を一緒に消すか、単独のものとして残すかを選ぶ（D3）。残す次のアクションはテーマを引き継ぐ（D18）
import { checkCount, checkSize, fail, laterOf, replaceIn, stampFor, type Fail } from "./common";
import { FIELDS, readField } from "./fields";
import { isFiscalYear, isQuarter } from "./fiscal";
import { isThemeId, type ThemeId } from "./themes";
import type { AppState, OpResult, Placement, Project } from "./types";

/** プロジェクトの属性の入力（画面の入力欄の値そのまま。正規化と検証はここで行う） */
export interface ProjectInput {
  name: string;
  outcome: string;
  themeId: ThemeId | null;
  note: string;
}

/** 削除するときの子の扱い（D3） */
export type ChildPolicy = "delete" | "detach";

const PROJECT_NOT_FOUND = "そのプロジェクトが見つかりません（別のタブで変更したなど）";

type Attrs = { name: string; outcome: string; themeId: ThemeId; note: string };

function readAttrs(input: ProjectInput): { ok: true; value: Attrs } | Fail {
  // 型の外の値（今のコードからは作れない）でも、例外にせず失敗を返す（SEC-006）
  if (typeof input !== "object" || input === null) return fail("入力が正しくありません");
  const name = readField(input.name, FIELDS.projectName);
  if (!name.ok) return name;
  const outcome = readField(input.outcome, FIELDS.outcome);
  if (!outcome.ok) return outcome;
  if (input.themeId === null) return fail("テーマを選んでください");
  if (!isThemeId(input.themeId)) return fail("テーマが正しくありません");
  const note = readField(input.note, FIELDS.note);
  if (!note.ok) return note;
  return { ok: true, value: { name: name.value, outcome: outcome.value, themeId: input.themeId, note: note.value } };
}

function checkPlacement(p: Placement | null): Fail | null {
  if (p === null) return null;
  if (typeof p !== "object") return fail("置く四半期が正しくありません");
  return isFiscalYear(p.fiscalYear) && isQuarter(p.quarter) ? null : fail("置く四半期が正しくありません");
}

function findProject(state: AppState, id: string): Project | null {
  return state.projects.find((x) => x.id === id) ?? null;
}

/**
 * プロジェクトの画面から、プロジェクトを直接作る（D12）。収集箱を通らないので、収集日時は持たない。
 * 最初の一手は求めない（「1つ以上」は強制しない。5.3）
 */
export function createProject(state: AppState, input: ProjectInput, placement: Placement | null, now: Date, newId: () => string): OpResult {
  const attrs = readAttrs(input);
  if (!attrs.ok) return attrs;
  const pe = checkPlacement(placement);
  if (pe) return pe;
  const ce = checkCount(state.projects, "プロジェクト");
  if (ce) return ce;
  const at = now.toISOString();
  const project: Project = {
    id: newId(),
    createdAt: at,
    updatedAt: at,
    capturedAt: null,
    movedAt: null,
    ...attrs.value,
    placement,
    status: "active",
    completedAt: null,
  };
  return checkSize({ ...state, projects: [...state.projects, project] });
}

/** 名称・目的とする成果・テーマ・メモを直す。置く四半期は placeProject で変える（変える経路を1つにするため） */
export function editProject(state: AppState, id: string, input: ProjectInput, now: Date): OpResult {
  const project = findProject(state, id);
  if (!project) return fail(PROJECT_NOT_FOUND);
  const attrs = readAttrs(input);
  if (!attrs.ok) return attrs;
  return checkSize({ ...state, projects: replaceIn(state.projects, { ...project, ...attrs.value, updatedAt: stampFor(project, now) }) });
}

/**
 * 置く四半期を変える（null なら四半期から外す）。完了したプロジェクトも変えられる（D17）。
 * expectedThemeId を渡したら、プロジェクトのテーマと同じことを確かめる（ロードマップでは、ほかのテーマの行に落とせない。docs/design.md 3.8）
 */
export function placeProject(state: AppState, id: string, placement: Placement | null, now: Date, expectedThemeId?: ThemeId): OpResult {
  const project = findProject(state, id);
  if (!project) return fail(PROJECT_NOT_FOUND);
  const pe = checkPlacement(placement);
  if (pe) return pe;
  if (expectedThemeId !== undefined && expectedThemeId !== project.themeId) return fail("ほかのテーマの行には移せません（テーマはプロジェクトの編集で変えてください）");
  const same = project.placement === null ? placement === null : placement !== null && project.placement.fiscalYear === placement.fiscalYear && project.placement.quarter === placement.quarter;
  if (same) return { ok: true, state };
  return checkSize({ ...state, projects: replaceIn(state.projects, { ...project, placement, updatedAt: stampFor(project, now) }) });
}

/** 完了にしたときに一緒に完了になる、未完了の子の件数（「元に戻す」の文言に使う。docs/design.md 4.4） */
export function openChildCount(state: AppState, projectId: string): number {
  return (
    state.actions.filter((a) => a.projectId === projectId && a.status === "todo").length +
    state.waitingFors.filter((w) => w.projectId === projectId && w.status === "waiting").length
  );
}

/**
 * 完了にする（D2）。未完了の子も一緒に完了にする。
 * 子の完了日時は、プロジェクトの完了日時と子の作成日時の遅い方、子の更新日時はその完了日時と子の更新日時の遅い方
 * （時計の遅れた端末でも、子の「作成日時 ≦ 完了日時 ≦ 更新日時」が破れないように。docs/design.md 4.4）
 */
export function completeProject(state: AppState, id: string, now: Date): OpResult {
  const project = findProject(state, id);
  if (!project) return fail(PROJECT_NOT_FOUND);
  if (project.status === "done") return fail("もう完了しています");
  const at = stampFor(project, now);
  const finishChild = <T extends { createdAt: string; updatedAt: string }>(child: T) => {
    const completedAt = laterOf(at, child.createdAt);
    return { ...child, completedAt, updatedAt: laterOf(completedAt, child.updatedAt) };
  };
  return {
    ok: true,
    state: {
      ...state,
      projects: replaceIn(state.projects, { ...project, status: "done", completedAt: at, updatedAt: at }),
      actions: state.actions.map((a) => (a.projectId === id && a.status === "todo" ? { ...finishChild(a), status: "done" } : a)),
      waitingFors: state.waitingFors.map((w) => (w.projectId === id && w.status === "waiting" ? { ...finishChild(w), status: "done" } : w)),
    },
  };
}

/** 完了を取り消す。子の状態は変えない（5.3） */
export function uncompleteProject(state: AppState, id: string, now: Date): OpResult {
  const project = findProject(state, id);
  if (!project) return fail(PROJECT_NOT_FOUND);
  if (project.status !== "done") return fail("完了していません");
  return { ok: true, state: { ...state, projects: replaceIn(state.projects, { ...project, status: "active", completedAt: null, updatedAt: stampFor(project, now) }) } };
}

/**
 * 削除する（確認画面で子の扱いを選んでから呼ぶ。D3）。
 * detach：子を単独のものとして残す。次のアクションはプロジェクトのテーマを引き継ぐ（D18。連絡待ちはテーマを持たない）
 */
export function deleteProject(state: AppState, id: string, childPolicy: ChildPolicy, now: Date): OpResult {
  const project = findProject(state, id);
  if (!project) return fail(PROJECT_NOT_FOUND);
  const projects = state.projects.filter((x) => x.id !== id);
  if (childPolicy === "delete") {
    return {
      ok: true,
      state: { ...state, projects, actions: state.actions.filter((a) => a.projectId !== id), waitingFors: state.waitingFors.filter((w) => w.projectId !== id) },
    };
  }
  if (childPolicy !== "detach") return fail("子の扱いが正しくありません");
  return {
    ok: true,
    state: {
      ...state,
      projects,
      actions: state.actions.map((a) => (a.projectId === id ? { ...a, projectId: null, themeId: project.themeId, updatedAt: stampFor(a, now) } : a)),
      waitingFors: state.waitingFors.map((w) => (w.projectId === id ? { ...w, projectId: null, updatedAt: stampFor(w, now) } : w)),
    },
  };
}
