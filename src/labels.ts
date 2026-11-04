// 画面の表示の文言（docs/design.md 4.1。表示の対応はここに1つだけ置く）

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * 日時を「11/3 20:15」の形で、端末のタイムゾーンで表示する。今と年が違うときは「2025/11/3 20:15」。
 * now は引数で受け取る（テストで固定できるように）
 */
export function formatDateTime(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = `${d.getMonth() + 1}/${d.getDate()}`;
  const time = `${d.getHours()}:${pad2(d.getMinutes())}`;
  return d.getFullYear() === now.getFullYear() ? `${date} ${time}` : `${d.getFullYear()}/${date} ${time}`;
}

/** 時刻だけ「20:16」 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${pad2(d.getMinutes())}`;
}

/** 使っている容量「約120万字」「約3,400字」 */
export function formatChars(n: number): string {
  if (n >= 10_000) return `約${(Math.round(n / 1000) / 10).toLocaleString("ja-JP")}万字`;
  return `約${n.toLocaleString("ja-JP")}字`;
}
