// ロードマップのカードのドラッグで受け渡す値（docs/design.md 3.8、docs/plans/milestone-3.md 2.3、CLAUDE.md 7.2）。
// - カードが入れるのは、このアプリの種類のプロジェクトの id だけ（text/plain や名称は入れない。ほかのアプリへ落とされても内容が漏れないように）
// - 受け取るのは、その種類の値だけ。存在するプロジェクトの id かを確かめる（ほかのアプリから落とされた文字は無視する）
// - 移す先の年度・四半期・テーマは、落としたセルから取る（受け取った値からは取らない）。テーマを変えないことは placeProject でも確かめる
import type { AppState, Project } from "./types";

/** カードのドラッグで使う、このアプリだけの種類 */
export const PROJECT_DRAG_TYPE = "application/x-tmpoc-project";

/** DataTransfer のうち、ここで使う部分（テストで作れるように） */
export interface DragData {
  readonly types: readonly string[];
  getData(type: string): string;
}

/** ドラッグ中の値が、このアプリのカードのものか（dragover では値を読めないので、種類だけで判断する） */
export function isProjectDrag(data: Pick<DragData, "types">): boolean {
  return Array.from(data.types).includes(PROJECT_DRAG_TYPE);
}

/** 落とされた値から、移すプロジェクトを取り出す。このアプリのカードの値で、存在するプロジェクトのときだけ返す */
export function droppedProject(state: AppState, data: DragData): Project | null {
  if (!isProjectDrag(data)) return null;
  let raw: unknown;
  try {
    raw = data.getData(PROJECT_DRAG_TYPE);
  } catch {
    return null;
  }
  // id は UUID の形（36字）。長い値や文字列でない値は、探す前に捨てる
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 64) return null;
  return state.projects.find((p) => p.id === raw) ?? null;
}
