// 置き場の一覧の行（次のアクション・連絡待ち・いつか・多分・資料。docs/design.md 3.3）。
// 1行に1件。行の末尾の［編集］で、その行がその場で編集の形に開く。完了の状態を持つものは、行の先頭のチェックボックスで完了にする。
// 編集の形の［移す…］で、置き場の間を移す（docs/design.md 4.3。完了したものは移せないので出さない）
import { useState, type ReactNode } from "react";
import { FIELDS } from "../domain/fields";
import type { CompletableKind, ItemEdit, ItemRef } from "../domain/items";
import type { MoveInput, MoveRef, PlaceKind } from "../domain/move";
import { THEMES, isThemeId, themeLabel } from "../domain/themes";
import type { Action, AppState, Project, ReferenceItem, SomedayItem, WaitingFor } from "../domain/types";
import { formatDate } from "../labels";
import { FieldMark } from "./FieldMark";
import { Field, useFieldId } from "./Field";
import { MoveDialog } from "./MoveDialog";
import { routeHref } from "../route";

export interface ItemHandlers {
  /** どれも、できなければ理由を返す */
  onEdit: (edit: ItemEdit) => string | null;
  onComplete: (ref: ItemRef<CompletableKind>) => string | null;
  onUncomplete: (ref: ItemRef<CompletableKind>) => string | null;
  onDelete: (ref: ItemRef) => string | null;
  onMove: (source: MoveRef, target: PlaceKind, input: MoveInput) => string | null;
}

export interface RowContext extends ItemHandlers {
  /** 移動の画面で「引き継がれないもの」を出すために使う */
  state: AppState;
  projects: readonly Project[];
  now: Date;
  /** 変更できない理由（読み取り専用のタブなど）。null なら変更できる */
  disabledReason: string | null;
  /** 属するプロジェクトの名称を出すか（プロジェクトの詳細の中では出さない） */
  showProject: boolean;
}

type Props =
  | { kind: "action"; items: readonly Action[]; ctx: RowContext }
  | { kind: "waiting"; items: readonly WaitingFor[]; ctx: RowContext }
  | { kind: "someday"; items: readonly SomedayItem[]; ctx: RowContext }
  | { kind: "reference"; items: readonly ReferenceItem[]; ctx: RowContext };

export function ItemRows(props: Props) {
  return (
    <ul className="item-list">
      {props.kind === "action" && props.items.map((x) => <ActionRow key={x.id} item={x} ctx={props.ctx} />)}
      {props.kind === "waiting" && props.items.map((x) => <WaitingRow key={x.id} item={x} ctx={props.ctx} />)}
      {props.kind === "someday" && props.items.map((x) => <SomedayRow key={x.id} item={x} ctx={props.ctx} />)}
      {props.kind === "reference" && props.items.map((x) => <ReferenceRow key={x.id} item={x} ctx={props.ctx} />)}
    </ul>
  );
}

/** 行が消える操作（完了・削除）の後に、フォーカスを画面の見出しに戻す（押したボタンが消えて、フォーカスが迷子にならないように） */
function focusHeading() {
  document.querySelector<HTMLElement>("main h1")?.focus();
}

/** 行の共通の外枠：表示と編集の切替、理由の表示 */
function useRowState() {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return { editing, setEditing, error, setError };
}

function CompleteBox({ kind, item, ctx, setError }: { kind: CompletableKind; item: Action | WaitingFor; ctx: RowContext; setError: (e: string | null) => void }) {
  const done = item.status === "done";
  return (
    <input
      type="checkbox"
      className="item-row__check"
      checked={done}
      disabled={ctx.disabledReason !== null}
      aria-label={done ? `「${item.text}」の完了を取り消す` : `「${item.text}」を完了にする`}
      onChange={() => {
        const ref = { kind, id: item.id };
        const error = done ? ctx.onUncomplete(ref) : ctx.onComplete(ref);
        setError(error);
        if (error === null && !done) focusHeading();
      }}
    />
  );
}

function ProjectLink({ projectId, ctx }: { projectId: string | null; ctx: RowContext }) {
  if (projectId === null || !ctx.showProject) return null;
  const p = ctx.projects.find((x) => x.id === projectId);
  return p ? <a href={routeHref("projects", p.id)}>{p.name}</a> : null;
}

function DoneMark({ item, now }: { item: { status: string; completedAt: string | null }; now: Date }) {
  return item.status === "done" && item.completedAt !== null ? <span>✓完了 {formatDate(item.completedAt, now)}</span> : null;
}

function RowView({
  done,
  check,
  text,
  meta,
  onEdit,
  ctx,
  error,
  extra,
}: {
  done: boolean;
  check: ReactNode;
  text: ReactNode;
  meta: ReactNode[];
  onEdit: () => void;
  ctx: RowContext;
  error: string | null;
  extra?: ReactNode;
}) {
  const shown = meta.filter((m) => m !== null && m !== false && m !== "");
  return (
    <li className={done ? "item-row item-row--done" : "item-row"}>
      <div className="item-row__main">
        {check}
        <span className="item-row__text">{text}</span>
      </div>
      <div className="item-row__sub">
        <span className="item-row__meta">
          {shown.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </span>
        <button type="button" className="link-button" disabled={ctx.disabledReason !== null} onClick={onEdit}>
          編集
        </button>
      </div>
      {extra}
      {error !== null && (
        <p className="message--error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function captured(item: { capturedAt: string | null }, now: Date) {
  return item.capturedAt === null ? null : `収集 ${formatDate(item.capturedAt, now)}`;
}

function ActionRow({ item, ctx }: { item: Action; ctx: RowContext }) {
  const s = useRowState();
  if (s.editing) return <ActionEdit item={item} ctx={ctx} onClose={() => s.setEditing(false)} />;
  return (
    <RowView
      done={item.status === "done"}
      check={<CompleteBox kind="action" item={item} ctx={ctx} setError={s.setError} />}
      text={item.text}
      meta={[
        <ProjectLink key="p" projectId={item.projectId} ctx={ctx} />,
        item.projectId === null && item.themeId !== null ? themeLabel(item.themeId) : null,
        captured(item, ctx.now),
        <DoneMark key="d" item={item} now={ctx.now} />,
      ]}
      onEdit={() => s.setEditing(true)}
      ctx={ctx}
      error={s.error}
    />
  );
}

function WaitingRow({ item, ctx }: { item: WaitingFor; ctx: RowContext }) {
  const s = useRowState();
  if (s.editing) return <WaitingEdit item={item} ctx={ctx} onClose={() => s.setEditing(false)} />;
  return (
    <RowView
      done={item.status === "done"}
      check={<CompleteBox kind="waiting" item={item} ctx={ctx} setError={s.setError} />}
      text={item.text}
      meta={[
        `相手 ${item.party}`,
        `依頼 ${formatDate(item.requestedOn, ctx.now)}`,
        <ProjectLink key="p" projectId={item.projectId} ctx={ctx} />,
        <DoneMark key="d" item={item} now={ctx.now} />,
      ]}
      onEdit={() => s.setEditing(true)}
      ctx={ctx}
      error={s.error}
    />
  );
}

function SomedayRow({ item, ctx }: { item: SomedayItem; ctx: RowContext }) {
  const s = useRowState();
  if (s.editing) return <SomedayEdit item={item} ctx={ctx} onClose={() => s.setEditing(false)} />;
  return <RowView done={false} check={null} text={item.text} meta={[captured(item, ctx.now)]} onEdit={() => s.setEditing(true)} ctx={ctx} error={s.error} />;
}

function ReferenceRow({ item, ctx }: { item: ReferenceItem; ctx: RowContext }) {
  const s = useRowState();
  if (s.editing) return <ReferenceEdit item={item} ctx={ctx} onClose={() => s.setEditing(false)} />;
  const firstLine = item.body.split("\n", 1)[0];
  return (
    <RowView
      done={false}
      check={null}
      text={item.title}
      meta={[firstLine]}
      onEdit={() => s.setEditing(true)}
      ctx={ctx}
      error={s.error}
      extra={
        item.body !== "" && (
          // 本文はただの文字として出す（URL もリンクにしない。CLAUDE.md 8.3）
          <details className="item-row__details">
            <summary>本文を開く</summary>
            <p className="item-row__body">{item.body}</p>
          </details>
        )
      }
    />
  );
}

// ---- 編集の形 ----

function EditFrame({
  title,
  ctx,
  error,
  onSave,
  onCancel,
  onDelete,
  move,
  dirty,
  children,
}: {
  title: string;
  ctx: RowContext;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  /** 移す画面の中身（完了したものは null で、［移す…］を出さない） */
  move: Omit<MoveProps, "ctx"> | null;
  /** 書き換えて、まだ保存していない（移す画面は保存済みの内容を使うので、先に保存してもらう） */
  dirty: boolean;
  children: ReactNode;
}) {
  const [moving, setMoving] = useState(false);
  return (
    <li className="item-row item-row--editing">
      <form
        className="item-edit"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      >
        {children}
        {error !== null && (
          <p className="message--error" role="alert">
            {error}
          </p>
        )}
        <div className="item-edit__actions">
          <button type="submit" className="button--primary" disabled={ctx.disabledReason !== null}>
            保存
          </button>
          <button type="button" onClick={onCancel}>
            キャンセル
          </button>
          {move !== null && (
            <button type="button" disabled={ctx.disabledReason !== null || dirty} onClick={() => setMoving(true)}>
              移す…
            </button>
          )}
          <button type="button" className="button--danger item-edit__delete" disabled={ctx.disabledReason !== null} onClick={onDelete}>
            削除
          </button>
        </div>
        {move !== null && dirty && <p className="hint">書き換えた内容は、保存してから移してください。</p>}
      </form>
      {/* フォームの入れ子にならないよう、移す画面はフォームの外に置く */}
      {moving && move !== null && <MoveFromRow {...move} ctx={ctx} onClose={() => setMoving(false)} />}
    </li>
  );
}

interface MoveProps {
  source: MoveRef;
  text: string;
  themeId: Action["themeId"];
  projectId: string | null;
  ctx: RowContext;
}

function MoveFromRow({ source, text, themeId, projectId, ctx, onClose }: MoveProps & { onClose: () => void }) {
  return (
    <MoveDialog
      state={ctx.state}
      source={source}
      text={text}
      themeId={themeId}
      projectId={projectId}
      now={ctx.now}
      disabledReason={ctx.disabledReason}
      onMove={(target, input) => ctx.onMove(source, target, input)}
      onClose={onClose}
    />
  );
}

/** 属するプロジェクトの選択肢：進行中のプロジェクトをテーマごとにまとめる。今属しているのが完了したプロジェクトなら、それも出す */
function ProjectSelect({ value, current, ctx, onChange }: { value: string; current: string | null; ctx: RowContext; onChange: (v: string) => void }) {
  const id = useFieldId("project");
  const currentDone = ctx.projects.find((p) => p.id === current && p.status === "done");
  return (
    <div className="item-edit__field">
      <label htmlFor={id}>
        属するプロジェクト <FieldMark required={false} />
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">なし（単独）</option>
        {currentDone && <option value={currentDone.id}>{currentDone.name}（完了）</option>}
        {THEMES.map((t) => {
          const list = ctx.projects.filter((p) => p.status === "active" && p.themeId === t.id);
          return list.length === 0 ? null : (
            <optgroup key={t.id} label={t.label}>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}

/** 編集の形の共通：保存・削除の結果を受けて閉じる */
function useEdit(ctx: RowContext, ref: ItemRef, onClose: () => void) {
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    save: (edit: ItemEdit) => {
      const e = ctx.onEdit(edit);
      if (e === null) onClose();
      else setError(e);
    },
    remove: () => {
      const e = ctx.onDelete(ref);
      if (e === null) focusHeading();
      else setError(e);
    },
  };
}

function ActionEdit({ item, ctx, onClose }: { item: Action; ctx: RowContext; onClose: () => void }) {
  const [text, setText] = useState(item.text);
  const [note, setNote] = useState(item.note);
  const [projectId, setProjectId] = useState(item.projectId ?? "");
  const [theme, setTheme] = useState<string>(item.themeId ?? "");
  const themeId = useFieldId("theme");
  const e = useEdit(ctx, { kind: "action", id: item.id }, onClose);
  return (
    <EditFrame
      title="次のアクションの編集"
      ctx={ctx}
      error={e.error}
      onCancel={onClose}
      onDelete={e.remove}
      move={item.status === "done" ? null : { source: { kind: "action", id: item.id }, text: item.text, themeId: item.themeId, projectId: item.projectId }}
      dirty={text !== item.text || note !== item.note || projectId !== (item.projectId ?? "") || theme !== (item.themeId ?? "")}
      onSave={() =>
        e.save({ kind: "action", id: item.id, text, note, projectId: projectId === "" ? null : projectId, themeId: projectId === "" && isThemeId(theme) ? theme : null })
      }
    >
      <Field name="text" spec={FIELDS.text} value={text} onChange={setText} autoFocus />
      <ProjectSelect value={projectId} current={item.projectId} ctx={ctx} onChange={setProjectId} />
      {projectId === "" && (
        <div className="item-edit__field">
          <label htmlFor={themeId}>
            テーマ <FieldMark required={false} />
          </label>
          <select id={themeId} value={theme} onChange={(ev) => setTheme(ev.target.value)}>
            <option value="">なし</option>
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <Field name="note" spec={FIELDS.note} value={note} onChange={setNote} />
    </EditFrame>
  );
}

function WaitingEdit({ item, ctx, onClose }: { item: WaitingFor; ctx: RowContext; onClose: () => void }) {
  const [text, setText] = useState(item.text);
  const [party, setParty] = useState(item.party);
  const [requestedOn, setRequestedOn] = useState(item.requestedOn);
  const [note, setNote] = useState(item.note);
  const [projectId, setProjectId] = useState(item.projectId ?? "");
  const dateId = useFieldId("requested");
  const e = useEdit(ctx, { kind: "waiting", id: item.id }, onClose);
  return (
    <EditFrame
      title="連絡待ちの編集"
      ctx={ctx}
      error={e.error}
      onCancel={onClose}
      onDelete={e.remove}
      move={item.status === "done" ? null : { source: { kind: "waiting", id: item.id }, text: item.text, themeId: null, projectId: item.projectId }}
      dirty={text !== item.text || party !== item.party || requestedOn !== item.requestedOn || note !== item.note || projectId !== (item.projectId ?? "")}
      onSave={() => e.save({ kind: "waiting", id: item.id, text, party, requestedOn, note, projectId: projectId === "" ? null : projectId })}
    >
      <Field name="text" spec={FIELDS.text} value={text} onChange={setText} autoFocus />
      <Field name="party" spec={FIELDS.party} value={party} onChange={setParty} />
      <div className="item-edit__field">
        <label htmlFor={dateId}>
          依頼日 <FieldMark required />
        </label>
        <input id={dateId} type="date" aria-required="true" value={requestedOn} onChange={(ev) => setRequestedOn(ev.target.value)} />
      </div>
      <ProjectSelect value={projectId} current={item.projectId} ctx={ctx} onChange={setProjectId} />
      <Field name="note" spec={FIELDS.note} value={note} onChange={setNote} />
    </EditFrame>
  );
}

function SomedayEdit({ item, ctx, onClose }: { item: SomedayItem; ctx: RowContext; onClose: () => void }) {
  const [text, setText] = useState(item.text);
  const [note, setNote] = useState(item.note);
  const e = useEdit(ctx, { kind: "someday", id: item.id }, onClose);
  return (
    <EditFrame
      title="いつか・多分の編集"
      ctx={ctx}
      error={e.error}
      onCancel={onClose}
      onDelete={e.remove}
      move={{ source: { kind: "someday", id: item.id }, text: item.text, themeId: null, projectId: null }}
      dirty={text !== item.text || note !== item.note}
      onSave={() => e.save({ kind: "someday", id: item.id, text, note })}>
      <Field name="text" spec={FIELDS.text} value={text} onChange={setText} autoFocus />
      <Field name="note" spec={FIELDS.note} value={note} onChange={setNote} />
    </EditFrame>
  );
}

function ReferenceEdit({ item, ctx, onClose }: { item: ReferenceItem; ctx: RowContext; onClose: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const e = useEdit(ctx, { kind: "reference", id: item.id }, onClose);
  return (
    <EditFrame
      title="資料の編集"
      ctx={ctx}
      error={e.error}
      onCancel={onClose}
      onDelete={e.remove}
      move={{ source: { kind: "reference", id: item.id }, text: item.title, themeId: null, projectId: null }}
      dirty={title !== item.title || body !== item.body}
      onSave={() => e.save({ kind: "reference", id: item.id, title, body })}>
      <Field name="title" spec={FIELDS.title} value={title} onChange={setTitle} autoFocus />
      <Field name="body" spec={FIELDS.body} value={body} onChange={setBody} />
    </EditFrame>
  );
}
