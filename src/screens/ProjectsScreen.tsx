// プロジェクトの一覧（F04 の一部。docs/design.md 3.6）。
// 件数は数字で出すだけで、0件を強調・警告しない（CLAUDE.md 4.3）。プロジェクトを直接足す操作は節目3で足す
import { useState } from "react";
import { quarterLabel } from "../domain/fiscal";
import { projectSummaries, sortProjects, type ProjectOrder } from "../domain/summaries";
import { themeLabel } from "../domain/themes";
import type { AppState } from "../domain/types";
import { routeHref } from "../route";

const ORDERS: { id: ProjectOrder; label: string }[] = [
  { id: "theme", label: "テーマ順" },
  { id: "quarter", label: "四半期順" },
  { id: "name", label: "名前順" },
];

export function ProjectsScreen({ state }: { state: AppState }) {
  const [order, setOrder] = useState<ProjectOrder>("theme");
  const [showDone, setShowDone] = useState(false);
  const all = projectSummaries(state);
  const active = all.filter((x) => x.project.status === "active");
  const doneCount = all.length - active.length;
  const rows = sortProjects(showDone ? all : active, order);

  return (
    <>
      <h1 tabIndex={-1}>プロジェクト</h1>
      <section aria-labelledby="project-list">
        <div className="inbox__head">
          <h2 id="project-list">
            進行中 <strong>{active.length}</strong>件
          </h2>
          <label className="project-order">
            並べ方
            <select value={order} onChange={(e) => setOrder(e.target.value as ProjectOrder)}>
              {ORDERS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {rows.length === 0 ? (
          <p>まだありません。収集箱から明確化すると、ここに置かれます。</p>
        ) : (
          <table className="project-table">
            <thead>
              <tr>
                <th scope="col">名称</th>
                <th scope="col">目的とする成果</th>
                <th scope="col">テーマ</th>
                <th scope="col">置いた四半期</th>
                <th scope="col">次のアクション</th>
                <th scope="col">連絡待ち</th>
                <th scope="col">状態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ project: p, nextActions, waiting }) => (
                <tr key={p.id} className={p.status === "done" ? "project-table__row--done" : undefined}>
                  <th scope="row" className="project-table__name">
                    <a href={routeHref("projects", p.id)}>{p.name}</a>
                  </th>
                  <td className="project-table__outcome" data-label="目的とする成果">
                    {p.outcome.split("\n", 1)[0]}
                  </td>
                  <td data-label="テーマ">{themeLabel(p.themeId)}</td>
                  <td data-label="四半期">{p.placement ? quarterLabel(p.placement.fiscalYear, p.placement.quarter) : "置いていない"}</td>
                  <td data-label="次のアクション">{nextActions}件</td>
                  <td data-label="連絡待ち">{waiting}件</td>
                  <td data-label="状態">{p.status === "active" ? "進行中" : "✓完了"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <label className="show-done">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          完了したものも表示（{doneCount}件）
        </label>
      </section>
    </>
  );
}
