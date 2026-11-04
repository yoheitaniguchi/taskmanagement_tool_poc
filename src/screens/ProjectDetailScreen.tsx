// プロジェクトの詳細（F04 の一部。docs/design.md 3.6・3.9）。
// 属性と、年次目標・四半期とのつながり、次のアクション・連絡待ちを表示し、子の完了・編集・削除ができる。
// プロジェクトそのものの編集・完了・移動・削除と、子を足す操作は節目3で足す
import { useState } from "react";
import { ItemRows, type RowContext } from "../components/ItemRows";
import { currentQuarter, fiscalYearLabel, quarterLabel } from "../domain/fiscal";
import { themeLabel } from "../domain/themes";
import type { AppState, Project } from "../domain/types";
import { routeHref } from "../route";

interface Props {
  project: Project;
  state: AppState;
  ctx: Omit<RowContext, "showProject">;
}

export function ProjectDetailScreen({ project: p, state, ctx }: Props) {
  const [showDone, setShowDone] = useState(false);
  const rowCtx: RowContext = { ...ctx, showProject: false };
  const actions = state.actions.filter((a) => a.projectId === p.id);
  const waitings = state.waitingFors.filter((w) => w.projectId === p.id);
  const openActions = actions.filter((a) => a.status === "todo");
  const openWaitings = waitings.filter((w) => w.status === "waiting");
  const doneCount = actions.length - openActions.length + (waitings.length - openWaitings.length);

  // つながり（5.1）：置いた四半期があればその年度、無ければ今の年度の、同じテーマの年次目標
  const fy = p.placement?.fiscalYear ?? currentQuarter(ctx.now).fiscalYear;
  const goal = state.annualGoals.find((g) => g.fiscalYear === fy && g.themeId === p.themeId);
  const sheet = p.placement ? state.quarterSheets.find((s) => s.fiscalYear === p.placement?.fiscalYear && s.quarter === p.placement?.quarter) : undefined;
  const focus = sheet?.focusThemeIds.includes(p.themeId) ?? false;

  return (
    <>
      <p>
        <a href={routeHref("projects")}>← プロジェクトの一覧</a>
      </p>
      <h1 tabIndex={-1}>
        {p.name} <span className="project-status">{p.status === "active" ? "進行中" : "✓完了"}</span>
      </h1>
      <section aria-labelledby="project-attrs">
        <h2 id="project-attrs">プロジェクト</h2>
        <dl className="attrs">
          <dt>目的とする成果</dt>
          <dd className="pre-wrap">{p.outcome}</dd>
          <dt>テーマ</dt>
          <dd>{themeLabel(p.themeId)}</dd>
          <dt>置く四半期</dt>
          <dd>{p.placement ? quarterLabel(p.placement.fiscalYear, p.placement.quarter) : "置いていない"}</dd>
          <dt>メモ</dt>
          <dd className="pre-wrap">{p.note === "" ? "なし" : p.note}</dd>
        </dl>
      </section>
      <section aria-labelledby="project-links">
        <h2 id="project-links">つながり</h2>
        <p>
          {fiscalYearLabel(fy)}の「{themeLabel(p.themeId)}」の年次目標：
          <span className="pre-wrap">{goal ? goal.text : "未記入"}</span>
        </p>
        <p>
          {p.placement
            ? `${quarterLabel(p.placement.fiscalYear, p.placement.quarter)}に置いています（この四半期の重点テーマ${focus ? "です" : "ではありません"}）`
            : "四半期に置いていません"}
          {" "}
          <a href={routeHref("plan")}>年次目標・四半期シート</a>
        </p>
      </section>
      <section aria-labelledby="project-next">
        <h2 id="project-next">
          次のアクション <strong>{openActions.length}</strong>件
        </h2>
        {(showDone ? actions : openActions).length === 0 ? <p>ありません</p> : <ItemRows kind="action" items={showDone ? [...openActions, ...actions.filter((a) => a.status === "done")] : openActions} ctx={rowCtx} />}
      </section>
      <section aria-labelledby="project-waiting">
        <h2 id="project-waiting">
          連絡待ち <strong>{openWaitings.length}</strong>件
        </h2>
        {(showDone ? waitings : openWaitings).length === 0 ? (
          <p>ありません</p>
        ) : (
          <ItemRows kind="waiting" items={showDone ? [...openWaitings, ...waitings.filter((w) => w.status === "done")] : openWaitings} ctx={rowCtx} />
        )}
        <label className="show-done">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          完了した次のアクション・連絡待ちも表示（{doneCount}件）
        </label>
      </section>
    </>
  );
}
