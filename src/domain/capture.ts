// 収集（F01。CLAUDE.md 4.1・5.3、docs/design.md 1章・3.1・4.5）。
// 収集箱の項目を作るのは、この関数だけ（「収集箱には戻らない」：明確化した結果やほかの置き場の要素を、収集箱の項目に戻す関数は作らない）。
// GTD の収集は「評価せずに入れる」ので、ここで確かめるのは、保存できる形かどうかだけにする
import { charCount, hasForbiddenControl, hasNewline, isBlank, normalizeText } from "./text";
import type { AppState, InboxItem, OpResult } from "./types";
import { LIMITS, stateSize } from "./validate";

/** 収集の入力欄の上限（内容の上限と同じ。docs/design.md 3.1・4.7） */
export const CAPTURE_MAX_CHARS = LIMITS.textLength;

/**
 * 入力の文字だけを見て、入れられない理由を返す（入れられるなら null）。
 * 画面で入力のたびに呼び、［入れる］を押せるかと、入力欄の下の表示に使う。空白だけのときは理由を出さない（ボタンを押せなくするだけ）
 */
export function captureTextError(text: string): string | null {
  const normalized = normalizeText(text);
  if (normalized === "") return null;
  const n = charCount(normalized);
  if (n > CAPTURE_MAX_CHARS) return `${CAPTURE_MAX_CHARS}字までです（今 ${n}字）`;
  if (hasNewline(normalized) || hasForbiddenControl(normalized)) return "改行や制御文字は入れられません";
  return null;
}

/** 入れられる入力か（空白だけでなく、上限などの理由も無い） */
export function canCapture(text: string): boolean {
  return !isBlank(text) && captureTextError(text) === null;
}

/**
 * 収集箱の末尾（いちばん新しい位置）に項目を足す。収集日時・作成日時・更新日時は now。
 * 内容は前後の空白を除いて NFC に正規化する（docs/design.md 4.1）
 */
export function capture(state: AppState, text: string, now: Date, newId: () => string): OpResult {
  if (isBlank(text)) return { ok: false, error: "入れる内容がありません" };
  const textError = captureTextError(text);
  if (textError !== null) return { ok: false, error: textError };
  if (state.inbox.length >= LIMITS.itemsPerList) {
    return { ok: false, error: `収集箱は ${LIMITS.itemsPerList.toLocaleString("ja-JP")}件までです。明確化して減らしてから入れてください` };
  }
  const at = now.toISOString();
  const item: InboxItem = { id: newId(), text: normalizeText(text), capturedAt: at, createdAt: at, updatedAt: at };
  const next: AppState = { ...state, inbox: [...state.inbox, item] };
  if (stateSize(next) > LIMITS.stateChars) {
    return { ok: false, error: "保存できる大きさの上限に達しています。資料やメモなどを減らしてから入れてください" };
  }
  return { ok: true, state: next };
}
