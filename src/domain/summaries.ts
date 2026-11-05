// 数えて並べるだけの関数（docs/design.md 4.5）。「問題かどうか」の判定はしない（CLAUDE.md 4.3）
import { THEMES } from "./themes";
import type { AppState, Placement, Project } from "./types";

export interface Counts {
  /** 収集箱の未処理 */
  inbox: number;
  /** 次のアクション（未着手のアクション） */
  nextActions: number;
  /** 連絡待ち（待ち） */
  waiting: number;
  /** 進行中のプロジェクト */
  activeProjects: number;
  someday: number;
  references: number;
}

export function counts(state: AppState): Counts {
  return {
    inbox: state.inbox.length,
    nextActions: state.actions.filter((a) => a.status === "todo").length,
    waiting: state.waitingFors.filter((w) => w.status === "waiting").length,
    activeProjects: state.projects.filter((p) => p.status === "active").length,
    someday: state.someday.length,
    references: state.references.length,
  };
}

/** 画面に並べる順と表示名（付録Bの用語集に合わせる） */
export const COUNT_LABELS: [keyof Counts, string][] = [
  ["inbox", "収集箱"],
  ["nextActions", "次のアクション"],
  ["waiting", "連絡待ち"],
  ["activeProjects", "プロジェクト（進行中）"],
  ["someday", "いつか・多分"],
  ["references", "資料"],
];

/** プロジェクトの一覧の1行（docs/design.md 3.6）。件数を数えるだけで、0件かどうかの判定はしない（4.3） */
export interface ProjectSummary {
  project: Project;
  /** 未着手の次のアクションの件数 */
  nextActions: number;
  /** 待ちの連絡待ちの件数 */
  waiting: number;
}

export function projectSummaries(state: AppState): ProjectSummary[] {
  const next = new Map<string, number>();
  const waiting = new Map<string, number>();
  for (const a of state.actions) if (a.projectId !== null && a.status === "todo") next.set(a.projectId, (next.get(a.projectId) ?? 0) + 1);
  for (const w of state.waitingFors) if (w.projectId !== null && w.status === "waiting") waiting.set(w.projectId, (waiting.get(w.projectId) ?? 0) + 1);
  return state.projects.map((project) => ({ project, nextActions: next.get(project.id) ?? 0, waiting: waiting.get(project.id) ?? 0 }));
}

/**
 * プロジェクトの並べ替え（docs/design.md 3.6。4.3 で許されている、テーマ・四半期・名前の順だけ）。
 * 件数で並べる（0件を先頭に集めるなど）並べ替えは作らない（フェーズ2の判定になるため）
 */
export type ProjectOrder = "theme" | "quarter" | "name";

const THEME_ORDER = new Map<string, number>(THEMES.map((t, i) => [t.id, i]));
const byName = (a: Project, b: Project) => a.name.localeCompare(b.name, "ja");
const byTheme = (a: Project, b: Project) => (THEME_ORDER.get(a.themeId) ?? 0) - (THEME_ORDER.get(b.themeId) ?? 0);
/** 置いた四半期の早い順。置いていないものは最後 */
const byQuarter = (a: Project, b: Project) => placementKey(a.placement) - placementKey(b.placement);
function placementKey(p: Placement | null): number {
  return p === null ? Number.MAX_SAFE_INTEGER : p.fiscalYear * 10 + p.quarter;
}

export function sortProjects<T extends { project: Project }>(list: readonly T[], order: ProjectOrder): T[] {
  const cmp =
    order === "theme"
      ? (a: Project, b: Project) => byTheme(a, b) || byName(a, b)
      : order === "quarter"
        ? (a: Project, b: Project) => byQuarter(a, b) || byTheme(a, b) || byName(a, b)
        : (a: Project, b: Project) => byName(a, b) || byTheme(a, b);
  return [...list].sort((x, y) => cmp(x.project, y.project));
}
