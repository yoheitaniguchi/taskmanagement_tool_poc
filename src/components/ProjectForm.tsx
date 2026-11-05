// プロジェクトの属性の入力（作る・直す。docs/design.md 3.6）と、置く四半期の選択。
// 正規化と検証はドメインの関数（projects.ts）で行い、ここは入力欄の値をそのまま渡す
import { useId, useState } from "react";
import { FIELDS } from "../domain/fields";
import { currentQuarter, FISCAL_YEAR_MAX, FISCAL_YEAR_MIN, fiscalYearLabel, quarterMonths } from "../domain/fiscal";
import type { ProjectInput } from "../domain/projects";
import { THEMES, isThemeId } from "../domain/themes";
import type { Placement, Project, Quarter } from "../domain/types";
import { FieldMark } from "./FieldMark";
import { Field } from "./ItemRows";

/** 置く四半期の選択（年度と四半期の2つ）。年度は今の年度の前後と、今置いている年度 */
export function PlacementPicker({ value, onChange, now, idPrefix }: { value: Placement | null; onChange: (p: Placement | null) => void; now: Date; idPrefix: string }) {
  const cur = currentQuarter(now).fiscalYear;
  const lo = Math.max(FISCAL_YEAR_MIN, Math.min(cur - 1, value?.fiscalYear ?? cur));
  const hi = Math.min(FISCAL_YEAR_MAX, Math.max(cur + 2, value?.fiscalYear ?? cur));
  const years = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const fy = value?.fiscalYear ?? cur;
  return (
    <div className="placement-picker">
      <label htmlFor={`${idPrefix}-q`}>
        置く四半期 <FieldMark required={false} />
      </label>
      <div className="placement-picker__row">
        <select id={`${idPrefix}-fy`} aria-label="年度" value={fy} disabled={value === null} onChange={(e) => value && onChange({ fiscalYear: Number(e.target.value), quarter: value.quarter })}>
          {years.map((y) => (
            <option key={y} value={y}>
              {fiscalYearLabel(y)}
            </option>
          ))}
        </select>
        <select
          id={`${idPrefix}-q`}
          value={value === null ? "" : String(value.quarter)}
          onChange={(e) => onChange(e.target.value === "" ? null : { fiscalYear: fy, quarter: Number(e.target.value) as Quarter })}
        >
          <option value="">置かない</option>
          {([1, 2, 3, 4] as Quarter[]).map((q) => {
            const m = quarterMonths(fy, q);
            return (
              <option key={q} value={q}>
                第{q}四半期（{m.year}年{m.startMonth}〜{m.endMonth}月）
              </option>
            );
          })}
        </select>
      </div>
      <p className="hint">この四半期に終わらせる主要なプロジェクトだけ置きます</p>
    </div>
  );
}

interface FormProps {
  title: string;
  initial: Project | null;
  /** 作るときだけ、置く四半期も入れられる */
  withPlacement: boolean;
  now: Date;
  disabledReason: string | null;
  submitLabel: string;
  /** できなければ理由を返す */
  onSubmit: (input: ProjectInput, placement: Placement | null) => string | null;
  onCancel: () => void;
}

export function ProjectForm({ title, initial, withPlacement, now, disabledReason, submitLabel, onSubmit, onCancel }: FormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [outcome, setOutcome] = useState(initial?.outcome ?? "");
  const [themeId, setThemeId] = useState<string>(initial?.themeId ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [placement, setPlacement] = useState<Placement | null>(initial?.placement ?? null);
  const [error, setError] = useState<string | null>(null);
  const themeName = `project-theme${useId()}`;
  return (
    <form
      className="item-edit project-form"
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSubmit({ name, outcome, themeId: isThemeId(themeId) ? themeId : null, note }, placement));
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <Field name="project-name" spec={FIELDS.projectName} value={name} onChange={setName} autoFocus />
      <Field name="project-outcome" spec={FIELDS.outcome} value={outcome} onChange={setOutcome} />
      <fieldset className="clarify__themes">
        <legend>
          テーマ <FieldMark required />
        </legend>
        {THEMES.map((t) => (
          <label key={t.id} className="chip">
            <input type="radio" name={themeName} checked={themeId === t.id} onChange={() => setThemeId(t.id)} />
            {t.label}
          </label>
        ))}
      </fieldset>
      {withPlacement && <PlacementPicker value={placement} onChange={setPlacement} now={now} idPrefix="project-form-placement" />}
      <Field name="project-note" spec={FIELDS.note} value={note} onChange={setNote} />
      {error !== null && (
        <p className="message--error" role="alert">
          {error}
        </p>
      )}
      <div className="item-edit__actions">
        <button type="submit" className="button--primary" disabled={disabledReason !== null}>
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
      {disabledReason !== null && <p className="hint">{disabledReason}</p>}
    </form>
  );
}
