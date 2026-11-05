// 入力欄の値を、保存できる形に直して確かめる（docs/design.md 4.1・4.7）。
// 前後の空白を除いて NFC に正規化し、必須・上限・改行・制御文字を確かめる。保存の検証（validate.ts）と同じ約束にする
import { charCount, hasForbiddenControl, hasNewline, normalizeText } from "./text";
import { LIMITS } from "./validate";

export interface FieldSpec {
  /** 画面での名前（理由の文に使う） */
  label: string;
  max: number;
  required: boolean;
  multiline: boolean;
}

export const FIELDS = {
  text: { label: "内容", max: LIMITS.textLength, required: true, multiline: false },
  nextStep: { label: "次の一手", max: LIMITS.textLength, required: true, multiline: false },
  projectName: { label: "プロジェクトの名称", max: LIMITS.nameLength, required: true, multiline: false },
  outcome: { label: "目的とする成果", max: LIMITS.longTextLength, required: true, multiline: true },
  party: { label: "相手", max: LIMITS.nameLength, required: true, multiline: false },
  note: { label: "メモ", max: LIMITS.longTextLength, required: false, multiline: true },
  title: { label: "件名", max: LIMITS.textLength, required: true, multiline: false },
  body: { label: "本文", max: LIMITS.bodyLength, required: false, multiline: true },
} as const satisfies Record<string, FieldSpec>;

export type FieldResult = { ok: true; value: string } | { ok: false; error: string };

/** 改行（CRLF・CR）は LF に揃える（複数行の欄だけ） */
function unifyNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export function readField(value: string, spec: FieldSpec): FieldResult {
  const v = normalizeText(spec.multiline ? unifyNewlines(value) : value);
  if (v === "") return spec.required ? { ok: false, error: `${spec.label}を入れてください` } : { ok: true, value: "" };
  const n = charCount(v);
  if (n > spec.max) return { ok: false, error: `${spec.label}は${spec.max.toLocaleString("ja-JP")}字までです（今 ${n.toLocaleString("ja-JP")}字）` };
  if ((!spec.multiline && hasNewline(v)) || hasForbiddenControl(v)) return { ok: false, error: `${spec.label}に使えない文字（改行・制御文字）があります` };
  return { ok: true, value: v };
}

/** 入力の途中に出す理由（空のときは出さない。必須の不足は確定のときに出す） */
export function fieldHint(value: string, spec: FieldSpec): string | null {
  if (normalizeText(value) === "") return null;
  const r = readField(value, spec);
  return r.ok ? null : r.error;
}
