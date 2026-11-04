// 状態を変える操作（CLAUDE.md 8.1、docs/design.md 4.5・6.4）。データのルールはドメインの関数で守らせ、reducer はそれを呼ぶだけにする。
// 任意の状態を外から置く操作は、検証し直す JSON の読み込み（replaceState）と、消去（reset）だけにする（検証を迂回する経路を作らないため）。
// 画面の操作（収集・明確化など）は PR 3 以降で、ここに足す
import { emptyState, type AppState } from "./types";
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
  /** 「元に戻す」の表示を閉じる */
  | { type: "dismissUndo" }
  /** 別のタブの変更を検知したとき。覚えていた「元に戻す」を捨てる */
  | { type: "forgetUndo" };

export function initialRoot(state: AppState): Root {
  return { state, undo: null };
}

/** ドメインの関数の結果 */
export type OpResult = { ok: true; state: AppState } | { ok: false; error: string };

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
    case "undo":
      // 今の状態が、覚えておいた直後の状態と同じオブジェクトのときだけ戻す（ほかの変更が挟まっていたら戻さない）
      if (root.undo === null || root.state !== root.undo.after) return { ...root, undo: null };
      return { state: root.undo.before, undo: null };
    case "dismissUndo":
    case "forgetUndo":
      return root.undo === null ? root : { ...root, undo: null };
  }
}
