// 画面の移動（URL の #/...）を、コードから行うための小さな関数（docs/design.md 2.1、D14）。
// ふだんの切替は a 要素の href で行う。ここは明確化の質問の行き来のように、操作の結果で移るときに使う

/** 履歴を1つ積んで移る（ブラウザの「戻る」で今の画面に戻れる） */
export function pushHash(hash: string): void {
  if (window.location.hash === hash) return;
  window.location.hash = hash;
}

/** 今の履歴を置き換えて移る（「戻る」で今の画面には戻らない） */
export function replaceHash(hash: string): void {
  if (window.location.hash === hash) return;
  window.history.replaceState(window.history.state, "", hash);
  // replaceState では hashchange が起きないので、画面の切替（useRoute）に知らせる
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/**
 * 履歴を steps 個戻ってから、そこを hash に置き換える。
 * 明確化の確定・［やめる］で、途中の質問の履歴を残さないために使う（確定の後に「戻る」で前の項目の質問に戻らないように）
 */
export function backThenReplace(steps: number, hash: string): void {
  if (steps <= 0) {
    replaceHash(hash);
    return;
  }
  const onPop = () => {
    window.removeEventListener("popstate", onPop);
    replaceHash(hash);
  };
  window.addEventListener("popstate", onPop);
  window.history.go(-steps);
}
