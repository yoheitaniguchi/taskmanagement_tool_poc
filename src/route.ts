// 画面の切替と URL（docs/design.md 2.1・2.3、D14）。
// URL の #/... で決めるのは、どの画面を出すかだけ（URL から読み込み・消去などの操作は起こさない）。
// 決まった値だけを受け付け、知らない値・読めない値はホームにする
export type ScreenId = "home" | "inbox" | "next" | "waiting" | "projects" | "someday" | "reference" | "plan" | "roadmap";

export interface Screen {
  id: ScreenId;
  /** 切替の表示名（付録Bの用語集） */
  label: string;
  path: string;
  /** スマホの下部のタブバーに出すか（出さないものは「メニュー」の中に並べる。docs/design.md 2.3） */
  phoneTab: boolean;
}

/** 週次レビューで見て回る順（docs/design.md 2.1。ホームは先頭） */
export const SCREENS: readonly Screen[] = [
  { id: "home", label: "ホーム", path: "", phoneTab: true },
  { id: "inbox", label: "収集箱", path: "inbox", phoneTab: true },
  { id: "next", label: "次のアクション", path: "next", phoneTab: true },
  { id: "waiting", label: "連絡待ち", path: "waiting", phoneTab: false },
  { id: "projects", label: "プロジェクト", path: "projects", phoneTab: true },
  { id: "someday", label: "いつか・多分", path: "someday", phoneTab: false },
  { id: "reference", label: "資料", path: "reference", phoneTab: false },
  { id: "plan", label: "年次目標・四半期シート", path: "plan", phoneTab: false },
  { id: "roadmap", label: "ロードマップ", path: "roadmap", phoneTab: false },
];

export interface Route {
  screen: ScreenId;
  /** プロジェクトの詳細（#/projects/<id>）のときだけ。UUID の形のものだけ */
  projectId: string | null;
}

export const HOME: Route = { screen: "home", projectId: null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * location.hash を画面に直す。知らない値・読めない値はホーム。
 * #/projects/<id> の id が UUID の形でなければ、プロジェクトの一覧にする（id が実際にあるかは画面で確かめる）
 */
export function parseRoute(hash: string): Route {
  let path: string;
  try {
    path = decodeURIComponent(hash.replace(/^#\/?/, ""));
  } catch {
    return HOME;
  }
  const parts = path.split("/");
  if (parts.length > 2) return HOME;
  const screen = SCREENS.find((s) => s.path === parts[0]);
  if (!screen) return HOME;
  if (parts.length === 2) {
    if (screen.id !== "projects") return HOME;
    return { screen: "projects", projectId: UUID_RE.test(parts[1]) ? parts[1] : null };
  }
  return { screen: screen.id, projectId: null };
}

/** 画面の URL（a 要素の href にそのまま使う） */
export function routeHref(screen: ScreenId, projectId: string | null = null): string {
  const s = SCREENS.find((x) => x.id === screen) ?? SCREENS[0];
  if (screen === "projects" && projectId !== null && UUID_RE.test(projectId)) return `#/projects/${projectId}`;
  return `#/${s.path}`;
}

export function screenLabel(id: ScreenId): string {
  return SCREENS.find((s) => s.id === id)?.label ?? "";
}

/**
 * ブラウザのタブの名前。利用者の文字（プロジェクト名など）は入れない（ブラウザの履歴の同期で端末の外に出るため。docs/design.md 2.1）
 */
export function documentTitle(route: Route): string {
  return `${screenLabel(route.screen)} - タスク管理`;
}
