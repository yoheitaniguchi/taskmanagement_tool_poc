// 置き場の間の移動の画面（docs/design.md 4.3）。移動先を選ぶ → 必須の入力 → 引き継がれないものの表示 → ［移す］の順。
// 移した後は「〇〇に移しました［元に戻す］」で救う（D1）。正規化と検証はドメインの関数（move.ts）で行う
import { useState } from "react";
import { FIELDS, type FieldSpec } from "../domain/fields";
import { toLocalDate } from "../domain/fiscal";
import { appendedOnMove, droppedOnMove, moveTargets, PLACE_LABELS, type MoveInput, type MoveRef, type PlaceKind } from "../domain/move";
import { THEMES, isThemeId, themeLabel, type ThemeId } from "../domain/themes";
import type { AppState, Placement } from "../domain/types";
import { FieldMark } from "./FieldMark";
import { Field } from "./Field";
import { Modal } from "./Modal";
import { PlacementPicker } from "./ProjectForm";

interface Props {
  state: AppState;
  source: MoveRef;
  /** 移動元の文言（移動先の内容・名称・件名の初期値） */
  text: string;
  /** 移動元のテーマ（単独のアクションのテーマ・プロジェクトのテーマ。プロジェクトへ移すときの初期値） */
  themeId: ThemeId | null;
  /** 連絡待ちから移すときの、属するプロジェクト（次のアクションへ移すと引き継ぐ） */
  projectId: string | null;
  now: Date;
  disabledReason: string | null;
  /** できなければ理由を返す */
  onMove: (target: PlaceKind, input: MoveInput) => string | null;
  onClose: () => void;
}

/** 移動先ごとの「内容」欄の名前と上限 */
function textSpec(target: PlaceKind): FieldSpec {
  if (target === "project") return FIELDS.projectName;
  if (target === "reference") return FIELDS.title;
  return FIELDS.text;
}

export function MoveDialog({ state, source, text: initialText, themeId: sourceTheme, projectId, now, disabledReason, onMove, onClose }: Props) {
  const targets = moveTargets(source.kind);
  const [target, setTarget] = useState<PlaceKind | null>(null);
  const [text, setText] = useState(initialText);
  const [outcome, setOutcome] = useState("");
  const [theme, setTheme] = useState<string>(sourceTheme ?? "");
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [party, setParty] = useState("");
  const [requestedOn, setRequestedOn] = useState(() => toLocalDate(now));
  const [error, setError] = useState<string | null>(null);

  const dropped = target ? droppedOnMove(state, source, target) : [];
  const appended = target ? appendedOnMove(source, target) : null;
  // 次のアクションへ移すとき、単独になるならテーマを任意で選べる（プロジェクトから移すときは、そのテーマを引き継ぐ）
  const standaloneTheme = target === "action" && source.kind !== "project" && !(source.kind === "waiting" && projectId !== null);

  return (
    <Modal title={`「${initialText}」を移す`} onClose={onClose}>
      <form
        className="item-edit move-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (target === null) {
            setError("移す先を選んでください");
            return;
          }
          const input: MoveInput = { text, outcome, themeId: isThemeId(theme) ? theme : null, placement, party, requestedOn };
          const err = onMove(target, input);
          if (err === null) onClose();
          else setError(err);
        }}
      >
        <fieldset className="move-dialog__targets">
          <legend>
            移す先 <FieldMark required />
          </legend>
          {targets.map((t, i) => (
            <label key={t} className="chip">
              <input type="radio" name="move-target" data-autofocus={i === 0 ? true : undefined} checked={target === t} onChange={() => setTarget(t)} />
              {PLACE_LABELS[t]}
            </label>
          ))}
        </fieldset>
        {target !== null && (
          <>
            <Field name="move-text" spec={textSpec(target)} value={text} onChange={setText} />
            {target === "project" && (
              <>
                <Field name="move-outcome" spec={FIELDS.outcome} value={outcome} onChange={setOutcome} />
                <fieldset className="clarify__themes">
                  <legend>
                    テーマ <FieldMark required />
                  </legend>
                  {THEMES.map((t) => (
                    <label key={t.id} className="chip">
                      <input type="radio" name="move-theme" checked={theme === t.id} onChange={() => setTheme(t.id)} />
                      {t.label}
                    </label>
                  ))}
                </fieldset>
                <PlacementPicker value={placement} onChange={setPlacement} now={now} idPrefix="move-placement" />
              </>
            )}
            {target === "waiting" && (
              <>
                <Field name="move-party" spec={FIELDS.party} value={party} onChange={setParty} />
                <div className="item-edit__field">
                  <label htmlFor="move-requested">
                    依頼日 <FieldMark required />
                  </label>
                  <input id="move-requested" type="date" aria-required="true" value={requestedOn} onChange={(e) => setRequestedOn(e.target.value)} />
                </div>
              </>
            )}
            {standaloneTheme && (
              <div className="item-edit__field">
                <label htmlFor="move-action-theme">
                  テーマ <FieldMark required={false} />
                </label>
                <select id="move-action-theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
                  <option value="">なし</option>
                  {THEMES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {target === "action" && source.kind === "project" && sourceTheme !== null && <p className="hint">テーマ「{themeLabel(sourceTheme)}」を引き継ぎます。</p>}
            {appended !== null && <p className="hint">{appended}。</p>}
            <p className="hint">{dropped.length === 0 ? "引き継がれないものはありません。" : `次のものは引き継がれません：${dropped.join("、")}`}</p>
          </>
        )}
        {error !== null && (
          <p className="message--error" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" onClick={onClose}>
            やめる
          </button>
          <button type="submit" className="button--primary" disabled={disabledReason !== null || target === null}>
            移す
          </button>
        </div>
      </form>
    </Modal>
  );
}
