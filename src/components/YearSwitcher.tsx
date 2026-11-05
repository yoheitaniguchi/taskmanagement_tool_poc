// 年度の切替（年次目標・四半期シートとロードマップで共通。docs/design.md 3.7・3.8）。範囲は 2000〜2099年度
import { currentQuarter, FISCAL_YEAR_MAX, FISCAL_YEAR_MIN, fiscalYearLabel } from "../domain/fiscal";

export function YearSwitcher({ fiscalYear: fy, now, onChange }: { fiscalYear: number; now: Date; onChange: (fiscalYear: number) => void }) {
  const cur = currentQuarter(now).fiscalYear;
  return (
    <div className="plan-year" role="group" aria-label="年度の切替">
      <button type="button" aria-label="前の年度" disabled={fy <= FISCAL_YEAR_MIN} onClick={() => onChange(fy - 1)}>
        ◀
      </button>
      <p className="plan-year__label" aria-live="polite">
        {fiscalYearLabel(fy)}（{fy}年4月〜{fy + 1}年3月）
      </p>
      <button type="button" aria-label="次の年度" disabled={fy >= FISCAL_YEAR_MAX} onClick={() => onChange(fy + 1)}>
        ▶
      </button>
      {fy !== cur && (
        <button type="button" onClick={() => onChange(cur)}>
          今の年度へ
        </button>
      )}
    </div>
  );
}
