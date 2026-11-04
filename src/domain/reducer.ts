// 状態を変える操作（CLAUDE.md 8.1、docs/design.md 4.5・6.4）。データのルールはドメインの関数で守らせ、reducer はそれを呼ぶだけにする。
// 任意の状態を外から置く操作は、検証し直す JSON の読み込み（replaceState）と、消去（reset）だけにする（検証を迂回する経路を作らないため）。
// 今の時刻と新しい id は、操作（action）に入れて渡す（reducer を純粋に保つため。StrictMode では reducer が2回呼ばれる）
import { capture } from "./capture";
import { bulkMessage, clarify, clarifyBulk, EXIT_MESSAGES, type BulkExit, type Decision } from "./clarify";
import { completeItem, deleteItem, editItem, uncompleteItem, type CompletableKind, type ItemEdit, type ItemRef } from "./items";
import { emptyState, type AppState, type OpResult } from "./types";
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
      return applyResult(root, capture(root.state, action.text, new Date(action.at), () => action.id), null);
    case "clarify":
      // 明確化のすべての出口の直後に「元に戻す」を出す（D1。収集箱に戻るのは、この「元に戻す」だけ。5.3）
      return applyResult(root, clarify(root.state, action.itemId, action.decision, new Date(action.at), takeIds(action.ids)), EXIT_MESSAGES[action.decision.exit]);
    case "clarifyBulk":
      return applyResult(
        root,
        clarifyBulk(root.state, action.itemIds, action.exit, new Date(action.at), takeIds(action.ids)),
        bulkMessage(action.exit, action.itemIds.length),
      );
    case "editItem":
      return applyResult(root, editItem(root.state, action.edit, new Date(action.at)), null);
    case "completeItem":
      return applyResult(root, completeItem(root.state, action.ref, new Date(action.at)), "完了にしました");
    case "uncompleteItem":
      return applyResult(root, uncompleteItem(root.state, action.ref, new Date(action.at)), null);
    case "deleteItem":
      return applyResult(root, deleteItem(root.state, action.ref), "削除しました");
    case "undo":
      // 今の状態が、覚えておいた直後の状態と同じオブジェクトのときだけ戻す（ほかの変更が挟まっていたら戻さない）
      if (root.undo === null || root.state !== root.undo.after) return { ...root, undo: null };
      return { state: root.undo.before, undo: null };
    case "dismissUndo":
    case "forgetUndo":
      return root.undo === null ? root : { ...root, undo: null };
  }
}
