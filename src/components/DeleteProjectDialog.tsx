// プロジェクトの削除の確認（D3。確認を出す3つの操作の1つ。docs/design.md 3.10・4.4）。
// 子の扱いを選ぶ。初期値は消える量が少ない「単独のものとして残す」。初期のフォーカスは［やめる］
import { useState } from "react";
import type { ChildPolicy } from "../domain/projects";
import { themeLabel } from "../domain/themes";
import type { AppState, Project } from "../domain/types";
import { Modal } from "./Modal";

interface Props {
  project: Project;
  state: AppState;
  /** できなければ理由を返す */
  onDelete: (policy: ChildPolicy) => string | null;
  onClose: () => void;
}

export function DeleteProjectDialog({ project, state, onDelete, onClose }: Props) {
  const [policy, setPolicy] = useState<ChildPolicy>("detach");
  const [error, setError] = useState<string | null>(null);
  const actions = state.actions.filter((a) => a.projectId === project.id);
  const waitings = state.waitingFors.filter((w) => w.projectId === project.id);
  const done = actions.filter((a) => a.status === "done").length + waitings.filter((w) => w.status === "done").length;
  const hasChildren = actions.length + waitings.length > 0;
  return (
    <Modal title={`プロジェクト「${project.name}」を削除`} onClose={onClose}>
      <p>
        このプロジェクトを削除します。<strong>元に戻せません。</strong>
      </p>
      {hasChildren ? (
        <fieldset className="delete-project__policy">
          <legend>
            次のアクション {actions.length}件・連絡待ち {waitings.length}件（完了したもの {done}件を含む）の扱い
          </legend>
          <label>
            <input type="radio" name="delete-project-policy" checked={policy === "detach"} onChange={() => setPolicy("detach")} />
            単独のものとして残す（次のアクションには、このプロジェクトのテーマ「{themeLabel(project.themeId)}」を付けます）
          </label>
          <label>
            <input type="radio" name="delete-project-policy" checked={policy === "delete"} onChange={() => setPolicy("delete")} />
            一緒に削除する
          </label>
        </fieldset>
      ) : (
        <p>次のアクション・連絡待ちはありません。</p>
      )}
      {error !== null && (
        <p className="message--error" role="alert">
          {error}
        </p>
      )}
      <div className="modal__actions">
        <button type="button" data-autofocus onClick={onClose}>
          やめる
        </button>
        <button
          type="button"
          className="button--danger"
          onClick={() => {
            const e = onDelete(policy);
            if (e === null) onClose();
            else setError(e);
          }}
        >
          削除する
        </button>
      </div>
    </Modal>
  );
}
