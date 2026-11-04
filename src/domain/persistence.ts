// ブラウザの保存（localStorage）への入口（CLAUDE.md 8.2、docs/design.md 6.1）。
// Storage API に触るのはこのファイルだけにする（ほかのファイルからの参照は eslint.config.js で禁じている）。
// 初期構築（節目2の PR 1）では、表示の切替の保存だけを扱う。状態の保存・起動時の読込・退避・消去は PR 2b で足す
import { PREVIEW_PR } from "../buildInfo";

export const APP_NAME = "taskmanagement_tool_poc";

/**
 * 保存のキーの名前空間。PR プレビューは本番と別の名前空間にし、本番の保存データを読み書きしない（CLAUDE.md 8.3）。
 * 同じオリジンのほかのアプリと分けるための取り決めであり、隔離ではない
 */
export function storageNamespace(previewPr: number | null): string {
  return previewPr === null ? `${APP_NAME}:` : `${APP_NAME}-pr-preview-${previewPr}:`;
}

export const STORAGE_NAMESPACE = storageNamespace(PREVIEW_PR);

/** 名前空間の中で使うキーの名前。ここに無い名前では読み書きできない（名前空間の外のキーを作らないため） */
export type StorageName = "theme";

export function storageKey(name: StorageName, namespace: string = STORAGE_NAMESPACE): string {
  return `${namespace}${name}`;
}

/** 使えるときだけ localStorage を返す（プライベートブラウズ等で参照だけで例外になる環境がある） */
function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 保存値をそのまま読む。読めなければ null。値の検証は呼び出し側で必ず行う（同じオリジンのほかのアプリからも書けるため） */
export function readItem(name: StorageName, storage: Storage | null = browserStorage()): string | null {
  try {
    return storage?.getItem(storageKey(name)) ?? null;
  } catch {
    return null;
  }
}

/** 保存する。value が null なら消す。保存できたかを返す */
export function writeItem(name: StorageName, value: string | null, storage: Storage | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    if (value === null) storage.removeItem(storageKey(name));
    else storage.setItem(storageKey(name), value);
    return true;
  } catch {
    return false;
  }
}
