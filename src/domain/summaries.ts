// 数えて並べるだけの関数（docs/design.md 4.5）。「問題かどうか」の判定はしない（CLAUDE.md 4.3）
import type { AppState } from "./types";

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
