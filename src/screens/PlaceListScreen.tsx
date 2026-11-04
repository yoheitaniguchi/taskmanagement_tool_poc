// 置き場の一覧の画面（次のアクション・連絡待ち・いつか・多分・資料。F03、docs/design.md 3.3）。
// 並びは作成した順（古い順）。並べ替え・絞り込み・検索は作らない（CLAUDE.md 4.2）
import { useState } from "react";
import { ItemRows, type RowContext } from "../components/ItemRows";
import type { AppState } from "../domain/types";

export type PlaceKind = "action" | "waiting" | "someday" | "reference";

const TITLES: Record<PlaceKind, string> = { action: "次のアクション", waiting: "連絡待ち", someday: "いつか・多分", reference: "資料" };

interface Props {
  kind: PlaceKind;
  state: AppState;
  ctx: Omit<RowContext, "showProject">;
}

export function PlaceListScreen({ kind, state, ctx }: Props) {
  const [showDone, setShowDone] = useState(false);
  const rowCtx: RowContext = { ...ctx, showProject: true };
  const title = TITLES[kind];

  const body = (() => {
    switch (kind) {
      case "action": {
        const open = state.actions.filter((a) => a.status === "todo");
        const done = state.actions.filter((a) => a.status === "done");
        return { count: open.length, doneCount: done.length, rows: <ItemRows kind="action" items={showDone ? [...open, ...done] : open} ctx={rowCtx} /> };
      }
      case "waiting": {
        const open = state.waitingFors.filter((w) => w.status === "waiting");
        const done = state.waitingFors.filter((w) => w.status === "done");
        return { count: open.length, doneCount: done.length, rows: <ItemRows kind="waiting" items={showDone ? [...open, ...done] : open} ctx={rowCtx} /> };
      }
      case "someday":
        return { count: state.someday.length, doneCount: null, rows: <ItemRows kind="someday" items={state.someday} ctx={rowCtx} /> };
      case "reference":
        return { count: state.references.length, doneCount: null, rows: <ItemRows kind="reference" items={state.references} ctx={rowCtx} /> };
    }
  })();

  const empty = body.count === 0 && !(showDone && (body.doneCount ?? 0) > 0);

  return (
    <>
      <h1 tabIndex={-1}>{title}</h1>
      <section aria-labelledby="place-list">
        <h2 id="place-list">
          {title} <strong>{body.count}</strong>件
        </h2>
        {ctx.disabledReason !== null && <p className="message--warn">{ctx.disabledReason}</p>}
        {empty ? <p>まだありません。収集箱から明確化すると、ここに置かれます。</p> : body.rows}
        {body.doneCount !== null && (
          // 完了したものは、入れたときだけ薄い文字で末尾に並べる（D8）
          <label className="show-done">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            完了したものも表示（{body.doneCount}件）
          </label>
        )}
      </section>
    </>
  );
}
