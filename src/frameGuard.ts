// ほかのページの枠（iframe）の中で開かれたかの判定（クリックジャッキングの対策。SEC-003、docs/security/checklist.md）。
// GitHub Pages は応答のヘッダー（frame-ancestors・X-Frame-Options）を付けられないので、アプリ自身が枠の中では画面を出さない。
// 枠の中に押せるボタンが1つも無ければ、だまして押させることはできない。
// 防げないもの：同じオリジンの姉妹アプリからの枠（もともと保存データを直接読める。受け入れ済みのリスク）、
// ポップアップを使う「ダブルクリック」型のだまし

/** 判定に使う window の一部（テストで差し替えるため） */
export interface FrameWindow {
  readonly self: unknown;
  readonly top: unknown;
}

/** 枠の中で開かれていれば true。確かめられない（例外になる）ときも、安全な側に倒して true */
export function isFramed(win: FrameWindow): boolean {
  try {
    return win.top !== win.self;
  } catch {
    return true;
  }
}

/** 枠の中で開かれたときに、アプリの代わりに出す文言 */
export const FRAMED_MESSAGE = "このアプリは、ほかのページの中では開けません。ブラウザで直接開いてください。";
