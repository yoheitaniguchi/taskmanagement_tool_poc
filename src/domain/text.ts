// 文字列の約束（docs/design.md 4.1）。文字数はコードポイントで数える（見た目の1文字にほぼ等しい）

/** 文字数（コードポイントの数）。サロゲートペアの絵文字などを2文字と数えない */
export function charCount(value: string): number {
  return Array.from(value).length;
}

/** 保存する前の形：前後の空白を除き、NFC に正規化する */
export function normalizeText(value: string): string {
  return value.normalize("NFC").trim();
}

// 改行（\n・\r）とタブのほかの制御文字（C0・DEL・C1）。制御文字を見つけるための正規表現なので、no-control-regex を外す
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_NEWLINE_TAB = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const NEWLINE = /[\n\r]/;

/** 改行とタブのほかの制御文字を含むか */
export function hasForbiddenControl(value: string): boolean {
  return CONTROL_EXCEPT_NEWLINE_TAB.test(value);
}

export function hasNewline(value: string): boolean {
  return NEWLINE.test(value);
}

/** 空白だけ（または空）か */
export function isBlank(value: string): boolean {
  return value.trim() === "";
}
