// プロジェクトの詳細（F04。docs/design.md 3.6・3.9・4.4）。
// 属性と、年次目標・四半期とのつながり、次のアクション・連絡待ちを表示する。
// プロジェクトの編集・置く四半期の変更・完了・完了の取り消し・置き場の間の移動・削除と、子を足す操作ができる
import { useState } from "react";
import { DeleteProjectDialog } from "../components/DeleteProjectDialog";
import { MoveDialog } from "../components/MoveDialog";
import { FieldMark } from "../components/FieldMark";
import { Field } from "../components/Field";
import { ItemRows, type RowContext } from "../components/ItemRows";
import { PlacementPicker, ProjectForm } from "../components/ProjectForm";
import { FIELDS } from "../domain/fields";
import { currentQuarter, fiscalYearLabel, quarterLabel, toLocalDate } from "../domain/fiscal";
import type { ChildPolicy, ProjectInput } from "../domain/projects";
import { themeLabel } from "../domain/themes";
import type { AppState, Placement, Project } from "../domain/types";
import type { PlaceKind } from "../domain/move";
import { routeHref, type ScreenId } from "../route";
import { replaceHash } from "../state/navigate";

/** プロジェクトそのものの操作。どれも、できなければ理由を返す */
export interface ProjectHandlers {
  onEditProject: (id: string, input: ProjectInput) => string | null;
  onPlaceProject: (id: string, placement: Placement | null) => string | null;
  onCompleteProject: (id: string) => string | null;
  onUncompleteProject: (id: string) => string | null;
  onDeleteProject: (id: string, policy: ChildPolicy) => string | null;
  onAddAction: (projectId: string, text: string) => string | null;
  onAddWaiting: (projectId: string, input: { text: string; party: string; requestedOn: string }) => string | null;
}

interface Props {
  project: Project;
  state: AppState;
  ctx: Omit<RowContext, "showProject">;
  handlers: ProjectHandlers;
}

export function ProjectDetailScreen({ project: p, state, ctx, handlers }: Props) {
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rowCtx: RowContext = { ...ctx, showProject: false };
  const blocked = ctx.disabledReason;
  const actions = state.actions.filter((a) => a.projectId === p.id);
  const waitings = state.waitingFors.filter((w) => w.projectId === p.id);
  const openActions = actions.filter((a) => a.status === "todo");
  const openWaitings = waitings.filter((w) => w.status === "waiting");
  const doneCount = actions.length - openActions.length + (waitings.length - openWaitings.length);
  const active = p.status === "active";

  // つながり（5.1）：置いた四半期があればその年度、無ければ今の年度の、同じテーマの年次目標
  const fy = p.placement?.fiscalYear ?? currentQuarter(ctx.now).fiscalYear;
  const goal = state.annualGoals.find((g) => g.fiscalYear === fy && g.themeId === p.themeId);
  const sheet = p.placement ? state.quarterSheets.find((s) => s.fiscalYear === p.placement?.fiscalYear && s.quarter === p.placement?.quarter) : undefined;
  const focus = sheet?.focusThemeIds.includes(p.themeId) ?? false;

  const toggleDone = () => {
    const e = active ? handlers.onCompleteProject(p.id) : handlers.onUncompleteProject(p.id);
    setError(e);
  };

  return (
    <>
      <p>
        <a href={routeHref("projects")}>← プロジェクトの一覧</a>
      </p>
      <h1 tabIndex={-1}>
        {p.name} <span className="project-status">{active ? "進行中" : "✓完了"}</span>
      </h1>
      <div className="project-ops">
        <button type="button" className={active ? "button--primary" : undefined} disabled={blocked !== null} onClick={toggleDone}>
          {active ? "完了にする" : "完了を取り消す"}
        </button>
        {active && (
          <button
            type="button"
            disabled={blocked !== null}
            onClick={() => {
              // 未完了の子があると移せない（D4）。押したときに理由と件数を出し、すぐ下の一覧で片付けられるようにする
              const open = openActions.length + openWaitings.length;
              if (open > 0) setError(`未完了の次のアクション・連絡待ちが${open}件あります。先に完了・移動・削除してください`);
              else setMoving(true);
            }}
          >
            移す…
          </button>
        )}
        <button type="button" className="button--danger" disabled={blocked !== null} onClick={() => setDeleting(true)}>
          削除…
        </button>
      </div>
      {active && openActions.length + openWaitings.length > 0 && (
        <p className="hint">完了にすると、未完了の次のアクション・連絡待ち（{openActions.length + openWaitings.length}件）も一緒に完了になります。</p>
      )}
      {error !== null && (
        <p className="message--error" role="alert">
          {error}
        </p>
      )}
      {blocked !== null && <p className="hint">{blocked}</p>}

      <section aria-labelledby="project-attrs">
        <div className="inbox__head">
          <h2 id="project-attrs">プロジェクト</h2>
          {!editing && (
            <button type="button" className="link-button" disabled={blocked !== null} onClick={() => setEditing(true)}>
              編集
            </button>
          )}
        </div>
        {editing ? (
          <ProjectForm
            title="プロジェクトの編集"
            initial={p}
            withPlacement={false}
            now={ctx.now}
            disabledReason={blocked}
            submitLabel="保存"
            onSubmit={(input) => {
              const e = handlers.onEditProject(p.id, input);
              if (e === null) setEditing(false);
              return e;
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <dl className="attrs">
            <dt>目的とする成果</dt>
            <dd className="pre-wrap">{p.outcome}</dd>
            <dt>テーマ</dt>
            <dd>{themeLabel(p.themeId)}</dd>
            <dt>メモ</dt>
            <dd className="pre-wrap">{p.note === "" ? "なし" : p.note}</dd>
          </dl>
        )}
        <dl className="attrs">
          <dt>置いた四半期</dt>
          <dd>
            {placing ? (
              <PlacementEdit
                project={p}
                now={ctx.now}
                blocked={blocked}
                onSave={(placement) => {
                  const e = handlers.onPlaceProject(p.id, placement);
                  if (e === null) setPlacing(false);
                  return e;
                }}
                onCancel={() => setPlacing(false)}
              />
            ) : (
              <>
                {p.placement ? quarterLabel(p.placement.fiscalYear, p.placement.quarter) : "置いていない"}{" "}
                <button type="button" className="link-button" disabled={blocked !== null} onClick={() => setPlacing(true)}>
                  変える
                </button>
              </>
            )}
          </dd>
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
            : "四半期に置いていません"}{" "}
          <a href={routeHref("plan")}>年次目標・四半期シート</a>
        </p>
      </section>
      <section aria-labelledby="project-next">
        <h2 id="project-next">
          次のアクション <strong>{openActions.length}</strong>件
        </h2>
        {(showDone ? actions : openActions).length === 0 ? <p>ありません</p> : <ItemRows kind="action" items={showDone ? [...openActions, ...actions.filter((a) => a.status === "done")] : openActions} ctx={rowCtx} />}
        {active && <AddAction blocked={blocked} onAdd={(text) => handlers.onAddAction(p.id, text)} />}
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
        {active && <AddWaiting blocked={blocked} now={ctx.now} onAdd={(input) => handlers.onAddWaiting(p.id, input)} />}
        <label className="show-done">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          完了した次のアクション・連絡待ちも表示（{doneCount}件）
        </label>
      </section>
      {!active && <p className="hint">完了したプロジェクトには、次のアクション・連絡待ちを足せません。足すときは、先に完了を取り消してください。</p>}

      {moving && (
        <MoveDialog
          state={state}
          source={{ kind: "project", id: p.id }}
          text={p.name}
          themeId={p.themeId}
          projectId={null}
          now={ctx.now}
          disabledReason={blocked}
          onClose={() => setMoving(false)}
          onMove={(target, input) => {
            const e = ctx.onMove({ kind: "project", id: p.id }, target, input);
            // 移したら、移した先の一覧へ移る（このプロジェクトの詳細はもう無い）
            if (e === null) replaceHash(routeHref(SCREEN_OF[target]));
            return e;
          }}
        />
      )}
      {deleting && (
        <DeleteProjectDialog
          project={p}
          state={state}
          onClose={() => setDeleting(false)}
          onDelete={(policy) => {
            const e = handlers.onDeleteProject(p.id, policy);
            // 削除したら一覧へ移る（「戻る」で消えたプロジェクトのURLに戻らないように、履歴を置き換える）
            if (e === null) replaceHash(routeHref("projects"));
            return e;
          }}
        />
      )}
    </>
  );
}

const SCREEN_OF: Record<PlaceKind, ScreenId> = { action: "next", waiting: "waiting", project: "projects", someday: "someday", reference: "reference" };

function PlacementEdit({
  project,
  now,
  blocked,
  onSave,
  onCancel,
}: {
  project: Project;
  now: Date;
  blocked: string | null;
  onSave: (p: Placement | null) => string | null;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<Placement | null>(project.placement);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="item-edit"
      aria-label="置く四半期を変える"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSave(value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <PlacementPicker value={value} onChange={setValue} now={now} idPrefix="project-placement" />
      {error !== null && (
        <p className="message--error" role="alert">
          {error}
        </p>
      )}
      <div className="item-edit__actions">
        <button type="submit" className="button--primary" disabled={blocked !== null}>
          保存
        </button>
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}

/** 次のアクションを足す（内容だけの1行。Enter で足し、続けて入れられるよう入力欄にフォーカスを残す） */
function AddAction({ blocked, onAdd }: { blocked: string | null; onAdd: (text: string) => string | null }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="add-child"
      aria-label="次のアクションを足す"
      onSubmit={(e) => {
        e.preventDefault();
        const err = onAdd(text);
        setError(err);
        if (err === null) setText("");
      }}
    >
      <Field name="add-action" spec={{ ...FIELDS.nextStep, label: "次のアクションを足す" }} value={text} onChange={setText} />
      {error !== null && (
        <p className="message--error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={blocked !== null || text.trim() === ""}>
        足す
      </button>
    </form>
  );
}

/** 連絡待ちを足す（内容・相手・依頼日。依頼日の初期値は今日） */
function AddWaiting({ blocked, now, onAdd }: { blocked: string | null; now: Date; onAdd: (input: { text: string; party: string; requestedOn: string }) => string | null }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [party, setParty] = useState("");
  const [requestedOn, setRequestedOn] = useState(() => toLocalDate(now));
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <p>
        <button type="button" disabled={blocked !== null} onClick={() => setOpen(true)}>
          連絡待ちを足す
        </button>
      </p>
    );
  }
  return (
    <form
      className="item-edit add-child"
      aria-label="連絡待ちを足す"
      onSubmit={(e) => {
        e.preventDefault();
        const err = onAdd({ text, party, requestedOn });
        setError(err);
        if (err === null) {
          setText("");
          setParty("");
          setOpen(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <Field name="add-waiting-text" spec={FIELDS.text} value={text} onChange={setText} autoFocus />
      <Field name="add-waiting-party" spec={FIELDS.party} value={party} onChange={setParty} />
      <div className="item-edit__field">
        <label htmlFor="add-waiting-date">
          依頼日 <FieldMark required />
        </label>
        <input id="add-waiting-date" type="date" value={requestedOn} aria-required onChange={(e) => setRequestedOn(e.target.value)} />
      </div>
      {error !== null && (
        <p className="message--error" role="alert">
          {error}
        </p>
      )}
      <div className="item-edit__actions">
        <button type="submit" className="button--primary" disabled={blocked !== null}>
          足す
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
