// ドメインの関数に共通の小さな部品（docs/design.md 4.5）。
// - 失敗は例外ではなく、利用者向けの理由を持つ値で返す（知らない値を受け取ったときも。SEC-006）
// - 時刻は、端末の時計が遅れていても日時の順序が破れない形で決める（D15 と同じ考え方）
// - 件数・大きさの上限を超えるときは、黙って捨てずに理由を返す（docs/design.md 4.7）
import { isIsoDateTime } from "./fiscal";
import type { AppState, OpResult } from "./types";
import { LIMITS, stateSize } from "./validate";

export type Fail = { ok: false; error: string };
export const fail = (error: string): Fail => ({ ok: false, error });

export const NOT_FOUND = "その項目が見つかりません（別のタブで変更したなど）";

/** 2つの日時（ISO 8601 の文字列）の遅い方 */
export function laterOf(a: string, b: string): string {
  return a < b ? b : a;
}

/**
 * 変更の時刻：今の時刻と、要素の更新日時の遅い方。
 * 端末の時計が遅れていても「作成日時 ≦ 完了日時 ≦ 更新日時」が破れないように
 */
export function stampFor(item: { updatedAt: string }, now: Date): string {
  return laterOf(now.toISOString(), item.updatedAt);
}

/** 置き場ごとの件数の上限（各置き場 10,000件。D10） */
export function checkCount(list: readonly unknown[], label: string, adding = 1): Fail | null {
  return list.length + adding > LIMITS.itemsPerList ? fail(`${label}は ${LIMITS.itemsPerList.toLocaleString("ja-JP")}件までです`) : null;
}

/** 状態全体の大きさの上限（600万字。D10）を確かめてから返す */
export function checkSize(state: AppState, hint = "資料やメモなどを減らしてください"): OpResult {
  return stateSize(state) > LIMITS.stateChars ? fail(`保存できる大きさの上限に達しています。${hint}`) : { ok: true, state };
}

/** 操作に入れて渡した時刻を Date にする。読めない値なら null（reducer は何もしない。SEC-006） */
export function parseAt(at: unknown): Date | null {
  return isIsoDateTime(at) ? new Date(at) : null;
}

export function replaceIn<T extends { id: string }>(list: readonly T[], next: T): T[] {
  return list.map((x) => (x.id === next.id ? next : x));
}
