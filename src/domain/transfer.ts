// 端末の間の受け渡し（CLAUDE.md 8.5、docs/design.md 6.2）。
// PR 2a では、書き出した JSON の外枠の検証に要る端末名の検証だけを置く。受け渡しの状態の表示は PR 2b で足す
import { charCount } from "./text";

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
