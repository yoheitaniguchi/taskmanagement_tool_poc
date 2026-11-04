// ブラウザの保存（localStorage）と、JSON の書き出し・読み込み（CLAUDE.md 8.2・8.5、docs/design.md 6章）。
// Storage API に触るのはこのファイルだけにする（ほかのファイルからの参照は eslint.config.js で禁じている）。
// 関数は Storage を引数で受け取る（テストで差し替えられるように）。localStorage を取り出すのは getBrowserStorage だけ
import { PREVIEW_PR } from "../buildInfo";
import { emptyDeviceMeta, validateDeviceMeta, type DeviceMeta } from "./transfer";
import type { AppState, ExportFile } from "./types";
import { findForbiddenKeys, LIMITS, validateExport, validateState } from "./validate";

export const APP_NAME = "taskmanagement_tool_poc";

/**
 * 保存のキーの名前空間。PR プレビューは本番と別の名前空間にし、本番の保存データを読み書きしない（CLAUDE.md 8.3）。
 * 本番の名前空間の前方一致にならない名前にして、本番の「保存データを消去」でもプレビューのものを消さない。
 * 同じオリジンのほかのアプリと分けるための取り決めであり、隔離ではない
 */
export function storageNamespace(previewPr: number | null): string {
  return previewPr === null ? `${APP_NAME}:` : `${APP_NAME}-pr-preview-${previewPr}:`;
}

export const STORAGE_NAMESPACE = storageNamespace(PREVIEW_PR);

/** 名前空間の中で使うキーの名前（docs/design.md 6.1）。ここに無い名前では読み書きできない */
export type StorageName = "v1:state" | "v1:device" | "theme" | "corrupt-backup";

export function storageKey(name: StorageName, namespace: string = STORAGE_NAMESPACE): string {
  return `${namespace}${name}`;
}

/** localStorage のうち、ここで使う操作だけ */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** 使えるときだけ localStorage を返す（プライベートブラウズ等で、参照しただけで例外になる環境がある） */
export function getBrowserStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 保存値をそのまま読む。読めなければ null。値の検証は呼び出し側で必ず行う（同じオリジンのほかのアプリからも書けるため） */
export function readItem(name: StorageName, storage: KeyValueStorage | null = getBrowserStorage()): string | null {
  try {
    return storage?.getItem(storageKey(name)) ?? null;
  } catch {
    return null;
  }
}

/** 保存する。value が null なら消す。保存できたかを返す */
export function writeItem(name: StorageName, value: string | null, storage: KeyValueStorage | null = getBrowserStorage()): boolean {
  if (!storage) return false;
  try {
    if (value === null) storage.removeItem(storageKey(name));
    else storage.setItem(storageKey(name), value);
    return true;
  } catch {
    return false;
  }
}

/** このアプリの名前空間のキー（別のタブの変更の検知と、消去で使う） */
export function isOwnKey(key: string | null): boolean {
  return key !== null && key.startsWith(STORAGE_NAMESPACE);
}

/**
 * 別のタブで変わったら、このタブを読み取り専用にするキーか（docs/design.md 6.3）。
 * 表示の切替（theme）はデータではないので除く（どこかのタブで表示を変えるたびに、ほかのタブが読み取り専用になるのを避けるため）。
 * e.key が null なのは、別のタブで localStorage 全体が消されたとき
 */
export function isDataKey(key: string | null, namespace: string = STORAGE_NAMESPACE): boolean {
  if (key === null) return true;
  return key.startsWith(namespace) && key !== storageKey("theme", namespace);
}

function ownKeys(storage: KeyValueStorage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k !== null && isOwnKey(k)) keys.push(k);
  }
  return keys;
}

// ---------------------------------------------------------------- 状態

export type LoadResult =
  | { kind: "empty" }
  | { kind: "ok"; state: AppState }
  /** 読めなかった。自動保存を止めること。元の値はそのまま残し、退避もした（backedUp。すでに別の値を退避していたら false） */
  | { kind: "corrupt"; errors: string[]; backedUp: boolean };

/** 起動時の読込。JSON の読み込みと同じ検証に通す（CLAUDE.md 8.2、docs/design.md 6.3） */
export function loadFromStorage(storage: KeyValueStorage): LoadResult {
  let text: string | null;
  try {
    text = storage.getItem(storageKey("v1:state"));
  } catch {
    return { kind: "corrupt", errors: ["このブラウザの保存領域を読めません"], backedUp: false };
  }
  if (text === null) return { kind: "empty" };
  const parsed = parseStateText(text);
  if (parsed.ok) return { kind: "ok", state: parsed.state };
  return { kind: "corrupt", errors: parsed.errors, backedUp: backUpCorrupt(storage, text) };
}

/**
 * 読めなかった値を退避する（1件だけ。容量を分け合うため）。同じ値がすでにあれば、それで退避済みとする。
 * 別の値が退避されていたら上書きしない（前に退避したものを失わないため。今の値は元のキーに残っている）
 */
function backUpCorrupt(storage: KeyValueStorage, text: string): boolean {
  try {
    const existing = storage.getItem(storageKey("corrupt-backup"));
    if (existing === text) return true;
    if (existing !== null) return false;
    storage.setItem(storageKey("corrupt-backup"), text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 起動時に読めなかった、元のキーにある値をそのまま返す（無ければ null）。
 * 退避（corrupt-backup）は容量不足や前の退避で書けないことがあるが、回復するまでは元のキーに必ず残っているので、こちらを書き出す
 */
export function readUnreadableState(storage: KeyValueStorage | null): string | null {
  return readItem("v1:state", storage);
}

/** 退避した値（無ければ null） */
export function readCorruptBackup(storage: KeyValueStorage | null): string | null {
  return readItem("corrupt-backup", storage);
}

export type ParseResult = { ok: true; state: AppState } | { ok: false; errors: string[] };

/** localStorage に保存した状態の文字列を、パース → 検証の順に通す */
export function parseStateText(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["保存データを JSON として読めません"] };
  }
  const result = validateState(raw);
  return result.ok ? { ok: true, state: result.state } : { ok: false, errors: result.errors };
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export function saveToStorage(storage: KeyValueStorage, state: AppState): SaveResult {
  // 次の起動で読み戻せないものは保存しない（保存した時点で不整合に気づけるように。最後の守り。docs/design.md 6.4）
  if (!validateState(state).ok) {
    return { ok: false, error: "保存しようとしたデータに不整合があるため、保存を止めました。直前の操作を報告してください" };
  }
  try {
    storage.setItem(storageKey("v1:state"), JSON.stringify(state));
    return { ok: true };
  } catch {
    return { ok: false, error: "このブラウザに保存できませんでした（容量の不足など）。今の内容はこの画面にだけあります。JSONを書き出して保存してください" };
  }
}

/** 「このブラウザの保存データを消去」。このアプリの名前空間のキーだけを、すべて消す（ほかのアプリ・PR プレビューのキーは消さない） */
export function clearStorage(storage: KeyValueStorage): void {
  for (const k of ownKeys(storage)) storage.removeItem(k);
}

/** このアプリが使っている保存データの大きさ（キーと値の文字数の合計。退避した値も含む）。表示するだけで、警告はしない（8.2） */
export function storageUsage(storage: KeyValueStorage | null): number {
  if (!storage) return 0;
  try {
    return ownKeys(storage).reduce((sum, k) => sum + k.length + (storage.getItem(k)?.length ?? 0), 0);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------- ブラウザの設定

export function loadDeviceMeta(storage: KeyValueStorage | null): DeviceMeta {
  const text = readItem("v1:device", storage);
  if (text === null) return emptyDeviceMeta();
  try {
    const raw: unknown = JSON.parse(text);
    if (findForbiddenKeys(raw).length > 0) return emptyDeviceMeta();
    return validateDeviceMeta(raw);
  } catch {
    return emptyDeviceMeta();
  }
}

export function saveDeviceMeta(storage: KeyValueStorage | null, meta: DeviceMeta): boolean {
  return writeItem("v1:device", JSON.stringify(meta), storage);
}

// ---------------------------------------------------------------- 書き出し・読み込み

/** 書き出すファイル名の接頭辞（.gitignore の tmpoc-* と揃える） */
export const EXPORT_FILE_PREFIX = "tmpoc-";

const pad = (n: number) => String(n).padStart(2, "0");
const localStamp = (now: Date) =>
  `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

/** 書き出すファイル名（例 tmpoc-PC-20261103-2015.json。日時は端末の時刻。端末名は許可リストを通したものだけを渡す） */
export function exportFileName(deviceName: string, now: Date): string {
  return `${EXPORT_FILE_PREFIX}${deviceName}-${localStamp(now)}.json`;
}

/** 退避した値を書き出すときのファイル名 */
export function backupFileName(now: Date): string {
  return `${EXPORT_FILE_PREFIX}backup-${localStamp(now)}.json`;
}

/** 書き出す JSON（docs/design.md 6.2 の外枠）。発注者が開いて読めるよう、字下げする */
export function serializeExport(state: AppState, deviceName: string, now: Date): string {
  const file: ExportFile = { app: APP_NAME, exportedAt: now.toISOString(), deviceName, state };
  return JSON.stringify(file, null, 2);
}

export type ExportParseResult = { ok: true; file: ExportFile } | { ok: false; errors: string[] };

/**
 * 読み込むファイルの中身を、大きさ → JSON として読めるか → 禁止のキーと入れ子の深さ → 外枠 → 版 → 4.6 の検証、の順に確かめる。
 * ファイルの大きさは、読む前に File.size でも確かめること（スマホのメモリを守るため。docs/design.md 4.7）
 */
export function parseExportText(text: string): ExportParseResult {
  if (new TextEncoder().encode(text).length > LIMITS.importBytes) return { ok: false, errors: [tooLargeMessage()] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["JSON として読めません。このアプリで書き出したファイルか確かめてください"] };
  }
  return validateExport(raw);
}

export function tooLargeMessage(): string {
  return `ファイルが大きすぎます（上限は ${LIMITS.importBytes / 1024 / 1024}MiB）`;
}
