// 入力欄の見出しに添える「必須」「任意」の印（docs/design.md 3.10。発注者の要望 2026-11-05）。
// 色だけでなく文字で示す（CLAUDE.md 7.1）
export function FieldMark({ required }: { required: boolean }) {
  return required ? <span className="field-mark field-mark--required">必須</span> : <span className="field-mark">任意</span>;
}
