// 端末の間の受け渡し（CLAUDE.md 8.5、docs/design.md 6.1・6.2）。
// 端末名・最後に書き出した日時・最後に読み込んだ日時は、このブラウザの設定（DeviceMeta）として持ち、状態（AppState）には入れない
// （読み込みで、別の端末の値に置き換わってはいけないため）
import { charCount, normalizeText } from "./text";
import { emptyState, type AppState, type ExportFile } from "./types";
import { isIsoDateTime } from "./fiscal";

export const DEVICE_NAME_MAX = 16;

// 文字（日本語を含む）・数字・「-」・「_」だけ（D11）。ファイル名に入るので、パスの区切り・空白・記号・制御文字を入れない
const DEVICE_NAME_RE = /^[\p{L}\p{N}_-]+$/u;

/**
 * 保存されている（または JSON に書かれた）端末名が、許可リストに合うか。値は直さずにそのまま判定する
 * （同じオリジンのほかのアプリからも書けるため、読むたびに確かめる。docs/security/checklist.md E）
 */
export function isValidDeviceName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.normalize("NFC") &&
    DEVICE_NAME_RE.test(value) &&
    charCount(value) <= DEVICE_NAME_MAX
  );
}

/** 画面で入れた端末名を、前後の空白を除いて NFC にし、許可リストで判定する */
export function validateDeviceName(input: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = normalizeText(input);
  if (name === "") return { ok: false, error: "名前を入れてください" };
  if (charCount(name) > DEVICE_NAME_MAX) return { ok: false, error: `${DEVICE_NAME_MAX}字までです（今 ${charCount(name)}字）` };
  if (!isValidDeviceName(name)) return { ok: false, error: "使えるのは、文字・数字・「-」・「_」だけです（空白や記号は使えません）" };
  return { ok: true, name };
}

/** 最後に読み込んだファイルの書き出し元 */
export interface LastImport {
  /** このブラウザで読み込んだ日時 */
  at: string;
  /** 書き出した端末の名前 */
  fromDevice: string;
  /** 書き出した日時 */
  fromExportedAt: string;
}

/** このブラウザの設定（localStorage の v1:device。書き出さない。docs/design.md 6.1） */
export interface DeviceMeta {
  deviceName: string | null;
  lastExportedAt: string | null;
  lastImport: LastImport | null;
  /** 最後に書き出した・読み込んだときの状態の指紋。今の状態の指紋と違えば「書き出し後の変更あり」 */
  transferFingerprint: string | null;
  /** このブラウザで最後に状態を変えた日時（表示のためだけ） */
  lastChangedAt: string | null;
  /** 初めて開いたときの説明を閉じたか */
  introDismissed: boolean;
}

export function emptyDeviceMeta(): DeviceMeta {
  return { deviceName: null, lastExportedAt: null, lastImport: null, transferFingerprint: null, lastChangedAt: null, introDismissed: false };
}

const FINGERPRINT_RE = /^[0-9a-f]{14}$/;
const META_KEYS = ["deviceName", "lastExportedAt", "lastImport", "transferFingerprint", "lastChangedAt", "introDismissed"];
const IMPORT_KEYS = ["at", "fromDevice", "fromExportedAt"];

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function hasExactKeys(v: Record<string, unknown>, keys: string[]): boolean {
  const own = Object.keys(v);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(v, k));
}

const nullOr = <T>(v: unknown, check: (x: unknown) => x is T): v is T | null => v === null || check(v);

/**
 * 保存されていたブラウザの設定を検証する。同じオリジンのほかのアプリや PR プレビューからも書けるので、
 * 項目は決まったものだけ、端末名は許可リスト、日時は形式を確かめる。だめなら既定値（名前なし・記録なし）に戻す（docs/design.md 6.1）
 */
export function validateDeviceMeta(value: unknown): DeviceMeta {
  if (!isPlainRecord(value) || !hasExactKeys(value, META_KEYS)) return emptyDeviceMeta();
  const { deviceName, lastExportedAt, lastImport, transferFingerprint, lastChangedAt, introDismissed } = value;
  if (!nullOr(deviceName, isValidDeviceName)) return emptyDeviceMeta();
  if (!nullOr(lastExportedAt, isIsoDateTime) || !nullOr(lastChangedAt, isIsoDateTime)) return emptyDeviceMeta();
  if (!(transferFingerprint === null || (typeof transferFingerprint === "string" && FINGERPRINT_RE.test(transferFingerprint)))) {
    return emptyDeviceMeta();
  }
  if (typeof introDismissed !== "boolean") return emptyDeviceMeta();
  let imported: LastImport | null = null;
  if (lastImport !== null) {
    if (!isPlainRecord(lastImport) || !hasExactKeys(lastImport, IMPORT_KEYS)) return emptyDeviceMeta();
    const { at, fromDevice, fromExportedAt } = lastImport;
    if (!isIsoDateTime(at) || !isValidDeviceName(fromDevice) || !isIsoDateTime(fromExportedAt)) return emptyDeviceMeta();
    imported = { at, fromDevice, fromExportedAt };
  }
  return { deviceName, lastExportedAt, lastImport: imported, transferFingerprint, lastChangedAt, introDismissed };
}

/**
 * 状態の指紋（同じ内容かを比べるための短いハッシュ。秘密を守るためのものではない。docs/design.md 6.2）。
 * cyrb53（53ビット）を16進14桁にする
 */
export function stateFingerprint(state: AppState): string {
  const text = JSON.stringify(state);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

const EMPTY_FINGERPRINT = stateFingerprint(emptyState());

/**
 * 最後に書き出した（または読み込んだ）後に、このブラウザで変更があるか。状態の指紋で比べる（日時では比べない）。
 * まだ一度も書き出し・読み込みをしていなければ、空の状態と比べる（入れたものがあれば「変更あり」）
 */
export function changedSinceTransfer(meta: DeviceMeta, fingerprint: string): boolean {
  return fingerprint !== (meta.transferFingerprint ?? EMPTY_FINGERPRINT);
}

/** 書き出したことを記録する */
export function markExported(meta: DeviceMeta, fingerprint: string, now: Date): DeviceMeta {
  return { ...meta, lastExportedAt: now.toISOString(), transferFingerprint: fingerprint };
}

/** 読み込んで置き換えたことを記録する。読み込みで置き換えたことは「変更」に数えない */
export function markImported(meta: DeviceMeta, file: Pick<ExportFile, "deviceName" | "exportedAt">, fingerprint: string, now: Date): DeviceMeta {
  return {
    ...meta,
    lastImport: { at: now.toISOString(), fromDevice: file.deviceName, fromExportedAt: file.exportedAt },
    transferFingerprint: fingerprint,
  };
}

/** このブラウザで状態を変えたことを記録する（表示のためだけ） */
export function markChanged(meta: DeviceMeta, now: Date): DeviceMeta {
  return { ...meta, lastChangedAt: now.toISOString() };
}
