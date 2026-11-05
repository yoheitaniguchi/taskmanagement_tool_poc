// ロードマップ（F07。docs/design.md 3.8、D6・D7・D8・D16・D19）。
// 列＝四半期、行＝テーマ、カード＝プロジェクト。今の四半期の列を、文字と枠で目立たせる（色だけに頼らない）。
// 四半期を移すのは、カードのドラッグ（同じテーマの行のセルへ。ブラウザ標準）か、カードの［⋯］のメニュー（キーボード・スマホ）。
// ドラッグで受け取るのは、このアプリのカードの値だけ（roadmap.ts）。移す先は落としたセルから取り、テーマを変えないことは placeProject でも確かめる。
// 偏りや問題の判定はしない（並べるだけ。CLAUDE.md 4.3）
import { useEffect, useState, type DragEvent } from "react";
import { MenuButton } from "../components/MenuButton";
import { Modal } from "../components/Modal";
import { PlacementPicker } from "../components/ProjectForm";
import { YearSwitcher } from "../components/YearSwitcher";
import { currentQuarter, quarterLabel, quarterMonths } from "../domain/fiscal";
import { droppedProject, isProjectDrag, PROJECT_DRAG_TYPE } from "../domain/roadmap";
import { activeProjectsPlacedBefore, quarterOverview, roadmapCells, unplacedProjects } from "../domain/summaries";
import { THEMES, themeLabel, type ThemeId } from "../domain/themes";
import type { AppState, Placement, Project, Quarter } from "../domain/types";
import { routeHref } from "../route";

interface Props {
  state: AppState;
  now: Date;
  disabledReason: string | null;
  /** 置く四半期を変える。expectedThemeId は落としたセルの行のテーマ（ほかのテーマの行には移せない）。できなければ理由を返す */
  onPlace: (id: string, placement: Placement | null, expectedThemeId?: ThemeId) => string | null;
}

const QUARTERS: Quarter[] = [1, 2, 3, 4];

/** スマホの幅（720px 未満）ではドラッグを付けない（D19。長押しのドラッグがスクロールとぶつかるため） */
function useNarrow(): boolean {
  const query = "(max-width: 719.98px)";
  const get = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  const [narrow, setNarrow] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

/** メニューで移した後、移した先のカードにフォーカスを移す（表示の外へ移したときは見出しへ。docs/design.md 3.8） */
function focusCard(id: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"] .roadmap-card__name`) ?? document.querySelector<HTMLElement>("main h1");
    el?.focus();
  });
}

export function RoadmapScreen({ state, now, disabledReason, onPlace }: Props) {
  const cur = currentQuarter(now);
  const [fy, setFy] = useState(cur.fiscalYear);
  const [error, setError] = useState<string | null>(null);
  /** ドラッグ中のカード（落とせるセルを枠で示すため。落としたときの値は使わず、DataTransfer から読み直す） */
  const [dragging, setDragging] = useState<Project | null>(null);
  const [otherYear, setOtherYear] = useState<Project | null>(null);
  const narrow = useNarrow();
  const canDrag = !narrow && disabledReason === null;

  const cells = roadmapCells(state, fy);
  const focus = Object.fromEntries(QUARTERS.map((q) => [q, quarterOverview(state, fy, q).focusThemeIds])) as Record<Quarter, ThemeId[]>;
  const unplaced = unplacedProjects(state);
  const before = activeProjectsPlacedBefore(state, fy);
  const isCurrent = (q: Quarter) => cur.fiscalYear === fy && cur.quarter === q;

  const place = (p: Project, placement: Placement | null, expectedThemeId?: ThemeId, fromMenu = false) => {
    const e = onPlace(p.id, placement, expectedThemeId);
    setError(e);
    if (e === null && fromMenu) focusCard(p.id);
    return e;
  };

  const cardProps = (p: Project): CardProps => ({
    project: p,
    fiscalYear: fy,
    draggable: canDrag,
    blocked: disabledReason,
    onDragStart: () => setDragging(p),
    onDragEnd: () => setDragging(null),
    onMenuPlace: (placement) => place(p, placement, undefined, true),
    onOtherYear: () => setOtherYear(p),
  });

  /** セルに落とせるか（このアプリのカードで、同じテーマの行のときだけ） */
  const accepts = (e: DragEvent, theme: ThemeId) => canDrag && isProjectDrag(e.dataTransfer) && dragging !== null && dragging.themeId === theme;

  return (
    <>
      <h1 tabIndex={-1}>ロードマップ</h1>
      <YearSwitcher fiscalYear={fy} now={now} onChange={setFy} />
      {disabledReason !== null && <p className="hint">{disabledReason}</p>}
      {error !== null && (
        <p className="message--error" role="alert">
          {error}
        </p>
      )}
      <p className="hint">{narrow ? "四半期を移すときは、カードの ⋯ から選びます。" : "四半期を移すときは、カードを同じテーマの行の別の四半期へドラッグするか、カードの ⋯ から選びます。"}</p>

      <table className="roadmap">
        <colgroup>
          <col className="roadmap__theme-col" />
          {QUARTERS.map((q) => (
            <col key={q} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">テーマ</th>
            {QUARTERS.map((q) => {
              const m = quarterMonths(fy, q);
              return (
                <th key={q} scope="col" className={isCurrent(q) ? "roadmap__current" : undefined}>
                  第{q}四半期
                  <span className="roadmap__months">
                    （{m.year}年{m.startMonth}〜{m.endMonth}月）
                  </span>
                  {isCurrent(q) && <span className="plan-sheet__now">今の四半期</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {THEMES.map((t) => (
            <tr key={t.id}>
              <th scope="row">{t.label}</th>
              {QUARTERS.map((q) => {
                const list = cells[t.id][q];
                const droppable = dragging !== null && dragging.themeId === t.id && !(dragging.placement?.fiscalYear === fy && dragging.placement.quarter === q);
                const cls = ["roadmap__cell", isCurrent(q) ? "roadmap__current" : "", droppable ? "roadmap__cell--droppable" : ""].filter(Boolean).join(" ");
                return (
                  <td
                    key={q}
                    className={cls}
                    data-label={`${quarterLabel(fy, q, { short: true })}${isCurrent(q) ? "・今の四半期" : ""}`}
                    onDragOver={(e) => {
                      if (!accepts(e, t.id)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(null);
                      if (!canDrag) return;
                      // 落とされた値は、このアプリのカードの id だけを受け取る。移す先は、このセルから取る
                      const p = droppedProject(state, e.dataTransfer);
                      if (p === null) return;
                      place(p, { fiscalYear: fy, quarter: q }, t.id);
                    }}
                  >
                    {focus[q].includes(t.id) && <span className="roadmap__focus">重点</span>}
                    {list.length > 0 && (
                      <ul className="roadmap__cards">
                        {list.map((p) => (
                          <li key={p.id}>
                            <Card {...cardProps(p)} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <details className="roadmap__more">
        <summary>四半期に置いていないプロジェクト（{unplaced.length}件）</summary>
        {THEMES.map((t) => {
          const list = unplaced.filter((p) => p.themeId === t.id);
          return list.length === 0 ? null : (
            <div key={t.id} className="roadmap__group">
              <h3>{t.label}</h3>
              <ul className="roadmap__cards roadmap__cards--row">
                {list.map((p) => (
                  <li key={p.id}>
                    <Card {...cardProps(p)} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </details>

      <details className="roadmap__more">
        <summary>前の年度までに置いた、進行中のプロジェクト（{before.length}件）</summary>
        {before.length > 0 && (
          <ul className="roadmap__before">
            {before.map((p) => (
              <li key={p.id}>
                <span className="roadmap__before-label">{p.placement ? quarterLabel(p.placement.fiscalYear, p.placement.quarter) : ""}：</span>
                <Card {...cardProps(p)} />
              </li>
            ))}
          </ul>
        )}
      </details>

      {otherYear !== null && (
        <OtherYearDialog
          project={otherYear}
          now={now}
          fiscalYear={fy}
          blocked={disabledReason}
          onClose={() => setOtherYear(null)}
          onMove={(placement) => {
            const p = otherYear;
            const e = onPlace(p.id, placement);
            if (e === null) {
              setOtherYear(null);
              setError(null);
              focusCard(p.id);
            }
            return e;
          }}
        />
      )}
    </>
  );
}

interface CardProps {
  project: Project;
  /** 表示している年度（メニューの「第N四半期へ」の年度） */
  fiscalYear: number;
  draggable: boolean;
  blocked: string | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMenuPlace: (placement: Placement | null) => void;
  onOtherYear: () => void;
}

function Card({ project: p, fiscalYear: fy, draggable, blocked, onDragStart, onDragEnd, onMenuPlace, onOtherYear }: CardProps) {
  const done = p.status === "done";
  const here = (q: Quarter) => p.placement?.fiscalYear === fy && p.placement.quarter === q;
  return (
    <div
      className={`roadmap-card${done ? " roadmap-card--done" : ""}`}
      data-card-id={p.id}
      draggable={draggable}
      onDragStart={(e) => {
        // 入れるのは、このアプリの種類の id だけ（名称などは入れない。docs/plans/milestone-3.md 2.3）
        e.dataTransfer.setData(PROJECT_DRAG_TYPE, p.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <a className="roadmap-card__name" href={routeHref("projects", p.id)} draggable={false}>
        {p.name}
      </a>
      {done && <span className="roadmap-card__done">✓完了</span>}
      <MenuButton label={`「${p.name}」の四半期を移す`} className="roadmap-card__menu">
        {QUARTERS.map((q) => (
          <button key={q} type="button" disabled={blocked !== null || here(q)} onClick={() => onMenuPlace({ fiscalYear: fy, quarter: q })}>
            第{q}四半期へ{here(q) ? "（今ここ）" : ""}
          </button>
        ))}
        {p.placement !== null && (
          <button type="button" disabled={blocked !== null} onClick={() => onMenuPlace(null)}>
            四半期から外す
          </button>
        )}
        <button type="button" disabled={blocked !== null} onClick={onOtherYear}>
          別の年度へ…
        </button>
      </MenuButton>
    </div>
  );
}

/** 「別の年度へ…」：年度と四半期を選んで移す */
function OtherYearDialog({
  project,
  now,
  fiscalYear,
  blocked,
  onClose,
  onMove,
}: {
  project: Project;
  now: Date;
  fiscalYear: number;
  blocked: string | null;
  onClose: () => void;
  onMove: (placement: Placement | null) => string | null;
}) {
  const [value, setValue] = useState<Placement | null>(project.placement ?? { fiscalYear, quarter: 1 });
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`「${project.name}」を別の年度へ移す`} onClose={onClose}>
      <form
        className="item-edit"
        onSubmit={(e) => {
          e.preventDefault();
          setError(onMove(value));
        }}
      >
        <p>テーマ：{themeLabel(project.themeId)}（テーマは変わりません）</p>
        <PlacementPicker value={value} onChange={setValue} now={now} idPrefix="roadmap-other-year" />
        {error !== null && (
          <p className="message--error" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" onClick={onClose}>
            やめる
          </button>
          <button type="submit" className="button--primary" disabled={blocked !== null}>
            移す
          </button>
        </div>
      </form>
    </Modal>
  );
}
