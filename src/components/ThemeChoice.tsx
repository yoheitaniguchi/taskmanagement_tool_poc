// 単独の次のアクションの任意のテーマを、ボタンの並び（「なし」と7つ）で1回押して決める部品（R-2。振り返り 7.2 の A、
// 計画 docs/plans/improvements-after-retrospective.md 1.2・2.2）。明確化・次のアクションの編集の形・移動の画面で同じ形にする。
// プロジェクトのテーマ（必須で「なし」が無い）は、各画面の同じ見た目の並び（.clarify__themes）を使う
import { THEMES } from "../domain/themes";
import { FieldMark } from "./FieldMark";

/** 選択肢：「なし」（値は空文字）を初めに置き、続けて7つのテーマ */
export const OPTIONAL_THEME_CHOICES: readonly { id: string; label: string }[] = [{ id: "", label: "なし" }, ...THEMES];

/** value は "" か テーマID。name は画面の中で一意にする（同じ画面のほかのラジオボタンと混ざらないように） */
export function ThemeChoice({ name, value, onChange }: { name: string; value: string; onChange: (id: string) => void }) {
  return (
    <fieldset className="clarify__themes">
      <legend>
        テーマ <FieldMark required={false} />
      </legend>
      {OPTIONAL_THEME_CHOICES.map((t) => (
        <label key={t.id} className="chip">
          <input type="radio" name={name} checked={value === t.id} onChange={() => onChange(t.id)} />
          {t.label}
        </label>
      ))}
    </fieldset>
  );
}
