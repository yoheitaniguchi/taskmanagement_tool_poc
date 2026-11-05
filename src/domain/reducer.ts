// 状態を変える操作（CLAUDE.md 8.1、docs/design.md 4.5・6.4）。データのルールはドメインの関数で守らせ、reducer はそれを呼ぶだけにする。
// 任意の状態を外から置く操作は、検証し直す JSON の読み込み（replaceState）と、消去（reset）だけにする（検証を迂回する経路を作らないため）。
// 今の時刻と新しい id は、操作（action）に入れて渡す（reducer を純粋に保つため。StrictMode では reducer が2回呼ばれる）
import { capture } from "./capture";
import { parseAt } from "./common";
import { bulkMessage, clarify, clarifyBulk, EXIT_MESSAGES, type BulkExit, type Decision } from "./clarify";
import { quarterLabel } from "./fiscal";
import { moveItem, PLACE_LABELS, type MoveInput, type MoveRef, type PlaceKind } from "./move";
import { addActionToProject, addWaitingToProject, completeItem, deleteItem, editItem, uncompleteItem, type CompletableKind, type ItemEdit, type ItemRef } from "./items";
import {
  completeProject,
  createProject,
  deleteProject,
  editProject,
  openChildCount,
  placeProject,
  uncompleteProject,
  type ChildPolicy,
  type ProjectInput,
} from "./projects";
import { setAnnualGoal, setWontDo, toggleFocusTheme } from "./plan";
import { emptyState, type AppState, type OpResult, type Placement, type Quarter, type ThemeId } from "./types";
import { validateState } from "./validate";

/** 「元に戻す」で覚えておく、直前の1つの操作（保存はしない。docs/design.md 6.4） */
export interface UndoEntry {
  before: AppState;
  after: AppState;
  /** 「〇〇しました」 */
  message: string;
}

export interface Root {
  state: AppState;
  undo: UndoEntry | null;
}

export type Action =
  /** JSON の読み込みによる置き換え。reducer の中で検証し直し、通らなければ何もしない。覚えていた「元に戻す」は捨てる */
  | { type: "replaceState"; state: AppState }
  /** 「このブラウザの保存データを消去」と同時に、画面の状態も空にする。覚えていた「元に戻す」は捨てる */
  | { type: "reset" }
  /** 直前の操作を元に戻す。値は受け取らない */
  | { type: "undo" }
  /** 収集（F01）。at は ISO 8601 の今の時刻、id は新しい UUID */
  | { type: "capture"; text: string; at: string; id: string }
  /** 明確化（1件ずつ）。ids は新しい要素に使う UUID（使う分だけ先頭から使う。プロジェクトなら2つ） */
  | { type: "clarify"; itemId: string; decision: Decision; at: string; ids: string[] }
  /** 一括振り分け。ids は選んだ件数以上 */
  | { type: "clarifyBulk"; itemIds: string[]; exit: BulkExit; at: string; ids: string[] }
  /** 置き場の要素の編集（「元に戻す」は出さない。その場で直せるため） */
  | { type: "editItem"; edit: ItemEdit; at: string }
  /** 次のアクション・連絡待ちを完了にする */
  | { type: "completeItem"; ref: ItemRef<CompletableKind>; at: string }
  /** 完了の取り消し（「元に戻す」は出さない。docs/design.md 6.4） */
  | { type: "uncompleteItem"; ref: ItemRef<CompletableKind>; at: string }
  /** 置き場の要素の削除 */
  | { type: "deleteItem"; ref: ItemRef }
  /** プロジェクトを直接作る（D12）。id は新しい UUID */
  | { type: "createProject"; input: ProjectInput; placement: Placement | null; at: string; id: string }
  /** プロジェクトの属性の編集（「元に戻す」は出さない） */
  | { type: "editProject"; id: string; input: ProjectInput; at: string }
  /** 置く四半期を変える（D16 で「元に戻す」を出す）。expectedThemeId はロードマップのドラッグで落としたセルのテーマ */
  | { type: "placeProject"; id: string; placement: Placement | null; expectedThemeId?: ThemeId; at: string }
  /** プロジェクトを完了にする（未完了の子も一緒に。D2） */
  | { type: "completeProject"; id: string; at: string }
  /** プロジェクトの完了の取り消し（「元に戻す」は出さない） */
  | { type: "uncompleteProject"; id: string; at: string }
  /** プロジェクトの削除（確認画面を通してから。「元に戻す」は出さない。D3） */
  | { type: "deleteProject"; id: string; childPolicy: ChildPolicy; at: string }
  /** プロジェクトの画面から次のアクションを足す */
  | { type: "addActionToProject"; projectId: string; text: string; at: string; id: string }
  /** プロジェクトの画面から連絡待ちを足す */
  | { type: "addWaitingToProject"; projectId: string; input: { text: string; party: string; requestedOn: string }; at: string; id: string }
  /** 置き場の間の移動（docs/design.md 4.3。「元に戻す」を出す。D1） */
  | { type: "moveItem"; source: MoveRef; target: PlaceKind; input: MoveInput; at: string }
  /**
   * 年次目標を書く（空なら消す）・重点テーマを選ぶ／外す・やらないことを書く（docs/design.md 3.7）。
   * 「元に戻す」は、年次目標を消したときだけ出す（削除の直後と同じ。D1）
   */
  | { type: "setAnnualGoal"; fiscalYear: number; themeId: ThemeId; text: string; at: string; id: string }
  | { type: "toggleFocusTheme"; fiscalYear: number; quarter: Quarter; themeId: ThemeId; at: string; id: string }
  | { type: "setWontDo"; fiscalYear: number; quarter: Quarter; text: string; at: string; id: string }
  /** 「元に戻す」の表示を閉じる */
  | { type: "dismissUndo" }
  /** 別のタブの変更を検知したとき。覚えていた「元に戻す」を捨てる */
  | { type: "forgetUndo" };

/** 操作に入れて渡した id を、先頭から1つずつ使う。足りなければ空の文字列（id の検証に通らないので、状態は変わらない） */
function takeIds(ids: readonly string[]): () => string {
  let i = 0;
  return () => ids[i++] ?? "";
}

export function initialRoot(state: AppState): Root {
  return { state, undo: null };
}

export type { OpResult };

/**
 * ドメインの関数の結果を反映する（PR 3 以降の操作の case から呼ぶ）。失敗、または検証に通らない結果なら何も変えない。
 * undoMessage を渡した操作は、直前・直後の状態を1組だけ覚えて「元に戻す」を出せるようにする
 */
export function applyResult(root: Root, result: OpResult, undoMessage: string | null): Root {
  if (!result.ok || result.state === root.state) return root;
  if (!validateState(result.state).ok) return root;
  return { state: result.state, undo: undoMessage === null ? null : { before: root.state, after: result.state, message: undoMessage } };
}

/** 時刻を持つ操作：読めない時刻なら何もしない（型の外の値でも例外にしない。SEC-006） */
function timed(root: Root, at: string, run: (now: Date) => Root): Root {
  const now = parseAt(at);
  return now === null ? root : run(now);
}

/** プロジェクトの完了の「元に戻す」の文言（未完了の子の件数は、完了にする前の状態から数える。docs/design.md 4.4） */
export function completeProjectMessage(openChildren: number): string {
  return openChildren === 0 ? "プロジェクトを完了にしました" : `プロジェクトと、未完了の${openChildren}件を完了にしました`;
}

/** 四半期を移したときの文言（D16）。移した先が今の表示の外でも分かるように、年度まで書く */
export function placeMessage(state: AppState, projectId: string, placement: Placement | null): string {
  if (placement == null) return "四半期から外しました";
  const before = state.projects.find((p) => p.id === projectId)?.placement ?? null;
  if (typeof placement !== "object") return "";
  return `${quarterLabel(placement.fiscalYear, placement.quarter)}${before === null ? "に置きました" : "に移しました"}`;
}

export function reducer(root: Root, action: Action): Root {
  switch (action.type) {
    case "replaceState": {
      const checked = validateState(action.state);
      return checked.ok ? { state: checked.state, undo: null } : root;
    }
    case "reset":
      return { state: emptyState(), undo: null };
    case "capture":
      // 収集は「元に戻す」の対象にしない（docs/design.md 6.4。間違えたら明確化で削除する）
      return timed(root, action.at, (now) => applyResult(root, capture(root.state, action.text, now, () => action.id), null));
    case "clarify":
      // 明確化のすべての出口の直後に「元に戻す」を出す（D1。収集箱に戻るのは、この「元に戻す」だけ。5.3）
      return timed(root, action.at, (now) =>
        applyResult(root, clarify(root.state, action.itemId, action.decision, now, takeIds(action.ids)), EXIT_MESSAGES[action.decision.exit]),
      );
    case "clarifyBulk":
      return timed(root, action.at, (now) =>
        applyResult(
          root,
          clarifyBulk(root.state, action.itemIds, action.exit, now, takeIds(action.ids)),
          bulkMessage(action.exit, action.itemIds.length),
        ),
      );
    case "editItem":
      return timed(root, action.at, (now) => applyResult(root, editItem(root.state, action.edit, now), null));
    case "completeItem":
      return timed(root, action.at, (now) => applyResult(root, completeItem(root.state, action.ref, now), "完了にしました"));
    case "uncompleteItem":
      return timed(root, action.at, (now) => applyResult(root, uncompleteItem(root.state, action.ref, now), null));
    case "deleteItem":
      return applyResult(root, deleteItem(root.state, action.ref), "削除しました");
    case "createProject":
      return timed(root, action.at, (now) => applyResult(root, createProject(root.state, action.input, action.placement, now, () => action.id), null));
    case "editProject":
      return timed(root, action.at, (now) => applyResult(root, editProject(root.state, action.id, action.input, now), null));
    case "placeProject":
      return timed(root, action.at, (now) =>
        applyResult(root, placeProject(root.state, action.id, action.placement, now, action.expectedThemeId), placeMessage(root.state, action.id, action.placement)),
      );
    case "completeProject":
      return timed(root, action.at, (now) => applyResult(root, completeProject(root.state, action.id, now), completeProjectMessage(openChildCount(root.state, action.id))));
    case "uncompleteProject":
      return timed(root, action.at, (now) => applyResult(root, uncompleteProject(root.state, action.id, now), null));
    case "deleteProject":
      return timed(root, action.at, (now) => applyResult(root, deleteProject(root.state, action.id, action.childPolicy, now), null));
    case "addActionToProject":
      return timed(root, action.at, (now) => applyResult(root, addActionToProject(root.state, action.projectId, action.text, now, () => action.id), null));
    case "addWaitingToProject":
      return timed(root, action.at, (now) => applyResult(root, addWaitingToProject(root.state, action.projectId, action.input, now, () => action.id), null));
    case "moveItem":
      return timed(root, action.at, (now) =>
        applyResult(root, moveItem(root.state, action.source, action.target, action.input, now), `${PLACE_LABELS[action.target] ?? ""}に移しました`),
      );
    case "setAnnualGoal":
      return timed(root, action.at, (now) => {
        const result = setAnnualGoal(root.state, action.fiscalYear, action.themeId, action.text, now, () => action.id);
        // 消えたかどうかは前後の件数で見る（文章を長く書いた年次目標を誤って消しても救えるように）
        const removed = result.ok && result.state.annualGoals.length < root.state.annualGoals.length;
        return applyResult(root, result, removed ? "年次目標を消しました" : null);
      });
    case "toggleFocusTheme":
      return timed(root, action.at, (now) => applyResult(root, toggleFocusTheme(root.state, action.fiscalYear, action.quarter, action.themeId, now, () => action.id), null));
    case "setWontDo":
      return timed(root, action.at, (now) => applyResult(root, setWontDo(root.state, action.fiscalYear, action.quarter, action.text, now, () => action.id), null));
    case "undo":
      // 今の状態が、覚えておいた直後の状態と同じオブジェクトのときだけ戻す（ほかの変更が挟まっていたら戻さない）
      if (root.undo === null || root.state !== root.undo.after) return { ...root, undo: null };
      return { state: root.undo.before, undo: null };
    case "dismissUndo":
    case "forgetUndo":
      return root.undo === null ? root : { ...root, undo: null };
    default:
      // 知らない操作は何もしない（SEC-006）
      return root;
  }
}
