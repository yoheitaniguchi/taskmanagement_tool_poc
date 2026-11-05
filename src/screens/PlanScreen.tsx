// 年次目標・四半期シート（F05・F06。docs/design.md 3.7・3.9）。
// 年度の切替、年次目標の表（年度 × テーマ）、4つの四半期シート（重点テーマ・主要プロジェクト・やらないこと）。
// 主要プロジェクトは「その四半期に置いたプロジェクト」で、ここから置く・外すこともできる（5.1。変えるのは placeProject だけ）。
// 状態の表示だけを置き、空欄は「未記入」と出すだけにする（警告しない。CLAUDE.md 4.3・12.2）
import { useEffect, useRef, useState } from "react";
import { Field } from "../components/Field";
import { currentQuarter, FISCAL_YEAR_MAX, FISCAL_YEAR_MIN, fiscalYearLabel, quarterLabel, quarterMonths } from "../domain/fiscal";
import { FOCUS_MAX, PLAN_FIELDS } from "../domain/plan";
import { placedProjectsByTheme, quarterOverview, type QuarterOverview } from "../domain/summaries";
import { THEMES, themeLabel, type ThemeId } from "../domain/themes";
import type { AppState, Placement, Project, Quarter } from "../domain/types";
import { routeHref } from "../route";

/** この画面の操作。どれも、できなければ理由を返す */
export interface PlanHandlers {
  onSetGoal: (fiscalYear: number, themeId: ThemeId, text: string) => string | null;
  onToggleFocus: (fiscalYear: number, quarter: Quarter, themeId: ThemeId) => string | null;
  onSetWontDo: (fiscalYear: number, quarter: Quarter, text: string) => string | null;
  onPlaceProject: (id: string, placement: Placement | null) => string | null;
}

interface Props {
  state: AppState;
  now: Date;
  /** 表示する年度（URLには持たない。docs/plans/milestone-3.md 2.2） */
  fiscalYear: number;
  onChangeYear: (fiscalYear: number) => void;
  disabledReason: string | null;
  handlers: PlanHandlers;
}

const QUARTERS: Quarter[] = [1, 2, 3, 4];

/** 「第3四半期（2026年10〜12月）」（年度の見出しの下で使う。暦の年も出す） */
function sheetTitle(fiscalYear: number, quarter: Quarter): string {
  const m = quarterMonths(fiscalYear, quarter);
  return `第${quarter}四半期（${m.year}年${m.startMonth}〜${m.endMonth}月）`;
}

export function PlanScreen({ state, now, fiscalYear: fy, onChangeYear, disabledReason, handlers }: Props) {
  const cur = currentQuarter(now);
  const placed = placedProjectsByTheme(state, fy);
  return (
    <>
      <h1 tabIndex={-1}>年次目標・四半期シート</h1>
      <div className="plan-year" role="group" aria-label="年度の切替">
        <button type="button" aria-label="前の年度" disabled={fy <= FISCAL_YEAR_MIN} onClick={() => onChangeYear(fy - 1)}>
          ◀
        </button>
        <p className="plan-year__label" aria-live="polite">
          {fiscalYearLabel(fy)}（{fy}年4月〜{fy + 1}年3月）
        </p>
        <button type="button" aria-label="次の年度" disabled={fy >= FISCAL_YEAR_MAX} onClick={() => onChangeYear(fy + 1)}>
          ▶
        </button>
        {fy !== cur.fiscalYear && (
          <button type="button" onClick={() => onChangeYear(cur.fiscalYear)}>
            今の年度へ
          </button>
        )}
      </div>
      {disabledReason !== null && <p className="hint">{disabledReason}</p>}

      <section aria-labelledby="plan-goals">
        <h2 id="plan-goals">年次目標</h2>
        <table className="project-table plan-goals">
          <thead>
            <tr>
              <th scope="col">テーマ</th>
              <th scope="col">年次目標（どうなっていたいか）</th>
              <th scope="col">この年度に置いたプロジェクト</th>
            </tr>
          </thead>
          <tbody>
            {THEMES.map((t) => (
              <tr key={t.id}>
                <th scope="row">{t.label}</th>
                <td data-label="年次目標">
                  <GoalCell
                    // 年度を変えたら、書きかけの入力を閉じる
                    key={fy}
                    text={state.annualGoals.find((g) => g.fiscalYear === fy && g.themeId === t.id)?.text ?? null}
                    themeLabel={t.label}
                    blocked={disabledReason}
                    onSave={(text) => handlers.onSetGoal(fy, t.id, text)}
                  />
                </td>
                <td data-label="置いたプロジェクト">
                  <PlacedList projects={placed.get(t.id) ?? []} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="plan-sheets">
        <h2 id="plan-sheets">四半期シート</h2>
        <div className="plan-sheets">
          {QUARTERS.map((q) => (
            <QuarterSheetCard
              key={`${fy}-${q}`}
              overview={quarterOverview(state, fy, q)}
              isCurrent={cur.fiscalYear === fy && cur.quarter === q}
              projects={state.projects}
              blocked={disabledReason}
              handlers={handlers}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function PlacedList({ projects }: { projects: Project[] }) {
  if (projects.length === 0) return <>なし</>;
  return (
    <ul className="plan-placed">
      {projects.map((p) => (
        <li key={p.id}>
          第{p.placement?.quarter}四半期：<a href={routeHref("projects", p.id)}>{p.name}</a>
          {p.status === "done" && <span className="project-status">✓完了</span>}
        </li>
      ))}
    </ul>
  );
}

/** 文章を1つ表示し、［編集］で書き直す（年次目標・やらないこと） */
function TextCell({
  text,
  spec,
  editLabel,
  description,
  blocked,
  onSave,
}: {
  text: string | null;
  spec: typeof PLAN_FIELDS.goal | typeof PLAN_FIELDS.wontDo;
  editLabel: string;
  description: string;
  blocked: string | null;
  onSave: (text: string) => string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text ?? "");
  const [error, setError] = useState<string | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    // 入力欄を閉じたら、フォーカスを［編集］に戻す（キーボードで操作していても位置を見失わないように）
    if (!editing && refocus.current) {
      refocus.current = false;
      editButton.current?.focus();
    }
  }, [editing]);
  const close = () => {
    refocus.current = true;
    setEditing(false);
  };
  if (!editing) {
    return (
      <div className="plan-text">
        <span className={text === null || text === "" ? "plan-text__empty" : "pre-wrap"}>{text === null || text === "" ? "未記入" : text}</span>{" "}
        <button
          ref={editButton}
          type="button"
          className="link-button"
          aria-label={editLabel}
          disabled={blocked !== null}
          onClick={() => {
            setValue(text ?? "");
            setError(null);
            setEditing(true);
          }}
        >
          編集
        </button>
      </div>
    );
  }
  return (
    <form
      className="item-edit"
      aria-label={editLabel}
      onSubmit={(e) => {
        e.preventDefault();
        const err = onSave(value);
        setError(err);
        if (err === null) close();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <Field name="plan-text" spec={spec} value={value} onChange={setValue} autoFocus />
      <p className="hint">{description}</p>
      {error !== null && (
        <p className="message--error" role="alert">
          {error}
        </p>
      )}
      <div className="item-edit__actions">
        <button type="submit" className="button--primary" disabled={blocked !== null}>
          保存
        </button>
        <button type="button" onClick={close}>
          キャンセル
        </button>
      </div>
    </form>
  );
}

function GoalCell({ text, themeLabel: label, blocked, onSave }: { text: string | null; themeLabel: string; blocked: string | null; onSave: (text: string) => string | null }) {
  return (
    <TextCell
      text={text}
      spec={PLAN_FIELDS.goal}
      editLabel={`「${label}」の年次目標の編集`}
      description="今年度の終わりに、どうなっていたいかを書きます（作業の一覧ではなく、状態）。空にして保存すると、この年次目標を消します。"
      blocked={blocked}
      onSave={onSave}
    />
  );
}

function QuarterSheetCard({
  overview: o,
  isCurrent,
  projects,
  blocked,
  handlers,
}: {
  overview: QuarterOverview;
  isCurrent: boolean;
  projects: readonly Project[];
  blocked: string | null;
  handlers: PlanHandlers;
}) {
  const [error, setError] = useState<string | null>(null);
  const { fiscalYear: fy, quarter: q } = o;
  const headingId = `plan-sheet-${q}`;
  const full = o.focusThemeIds.length >= FOCUS_MAX;
  return (
    <section className={`plan-sheet${isCurrent ? " plan-sheet--current" : ""}`} aria-labelledby={headingId}>
      <h3 id={headingId}>
        {sheetTitle(fy, q)}
        {isCurrent && <span className="plan-sheet__now">今の四半期</span>}
      </h3>
      {error !== null && (
        <p className="message--error" role="alert">
          {error}
        </p>
      )}

      <fieldset className="plan-sheet__focus">
        <legend>重点テーマ（{FOCUS_MAX}つまで）</legend>
        <div className="clarify__themes">
          {THEMES.map((t) => {
            const checked = o.focusThemeIds.includes(t.id);
            return (
              <label key={t.id} className="chip">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={blocked !== null || (full && !checked)}
                  onChange={() => setError(handlers.onToggleFocus(fy, q, t.id))}
                />
                {t.label}
              </label>
            );
          })}
        </div>
        <p className="hint">{full ? `${FOCUS_MAX}つ選んでいます。変えるときは、どれかを外してください` : `${FOCUS_MAX}つまで選べます（今 ${o.focusThemeIds.length}つ）`}</p>
      </fieldset>

      <h4>主要プロジェクト（この四半期に置いたもの）</h4>
      {o.projects.length === 0 ? (
        <p>なし</p>
      ) : (
        <ul className="plan-sheet__projects">
          {o.projects.map((p) => (
            <li key={p.id}>
              <a href={routeHref("projects", p.id)}>{p.name}</a>
              <span className="plan-sheet__meta">
                {themeLabel(p.themeId)}・{p.status === "done" ? "✓完了" : "進行中"}
              </span>
              <button type="button" className="link-button" aria-label={`「${p.name}」をこの四半期から外す`} disabled={blocked !== null} onClick={() => setError(handlers.onPlaceProject(p.id, null))}>
                外す
              </button>
            </li>
          ))}
        </ul>
      )}
      <PlaceForm fiscalYear={fy} quarter={q} projects={projects} blocked={blocked} onPlace={(id) => handlers.onPlaceProject(id, { fiscalYear: fy, quarter: q })} />

      <h4>やらないこと</h4>
      <TextCell
        text={o.sheet?.wontDo ?? null}
        spec={PLAN_FIELDS.wontDo}
        editLabel={`${sheetTitle(fy, q)}のやらないことの編集`}
        description="この四半期にやらないと決めたことを書きます。空欄のままでもかまいません。"
        blocked={blocked}
        onSave={(text) => handlers.onSetWontDo(fy, q, text)}
      />
    </section>
  );
}

/** 進行中のプロジェクトを、この四半期に置く（別の四半期に置いているものは「〜から移す」と添える） */
function PlaceForm({
  fiscalYear: fy,
  quarter: q,
  projects,
  blocked,
  onPlace,
}: {
  fiscalYear: number;
  quarter: Quarter;
  projects: readonly Project[];
  blocked: string | null;
  onPlace: (id: string) => string | null;
}) {
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selectId = `plan-place-${q}`;
  const here = (p: Project) => p.placement?.fiscalYear === fy && p.placement.quarter === q;
  const from = (p: Project) =>
    p.placement === null ? "" : p.placement.fiscalYear === fy ? `（第${p.placement.quarter}四半期から移す）` : `（${quarterLabel(p.placement.fiscalYear, p.placement.quarter)}から移す）`;
  const groups = THEMES.map((t) => ({ theme: t, list: projects.filter((p) => p.status === "active" && p.themeId === t.id && !here(p)).sort((a, b) => a.name.localeCompare(b.name, "ja")) })).filter(
    (g) => g.list.length > 0,
  );
  // 置けるものが無いときは、状態だけを示す（指示ではない。CLAUDE.md 4.3）
  if (groups.length === 0) return <p className="hint">ほかに置ける進行中のプロジェクトはありません</p>;
  return (
    <form
      className="plan-place"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected === "") return;
        const err = onPlace(selected);
        setError(err);
        if (err === null) setSelected("");
      }}
    >
      <label htmlFor={selectId}>プロジェクトを置く</label>
      <div className="plan-place__row">
        <select id={selectId} value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">選んでください</option>
          {groups.map((g) => (
            <optgroup key={g.theme.id} label={g.theme.label}>
              {g.list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {from(p)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="submit" disabled={blocked !== null || selected === ""}>
          置く
        </button>
      </div>
      {error !== null && (
        <p className="message--error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
