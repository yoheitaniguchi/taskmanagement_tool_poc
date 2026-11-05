// 入力欄の1つ分（見出し・必須／任意の印・入力欄・入力の途中の理由）。編集・移動・プロジェクトの入力で共通に使う
import { useId } from "react";
import { fieldHint, type FieldSpec } from "../domain/fields";
import { FieldMark } from "./FieldMark";

export function useFieldId(name: string) {
  return `edit-${name}${useId()}`;
}

export function Field({ name, spec, value, onChange, autoFocus }: { name: string; spec: FieldSpec; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const id = useFieldId(name);
  const hint = fieldHint(value, spec);
  return (
    <div className="item-edit__field">
      <label htmlFor={id}>
        {spec.label} <FieldMark required={spec.required} />
      </label>
      {spec.multiline ? (
        <textarea id={id} value={value} aria-required={spec.required} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} type="text" value={value} aria-required={spec.required} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint !== null && <p className="message--error">{hint}</p>}
    </div>
  );
}

