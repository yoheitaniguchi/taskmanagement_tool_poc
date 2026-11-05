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

/** 日付だけ「11/3」（今と年が違うときは「2025/11/3」）。日時（ISO）は端末のタイムゾーンで、依頼日（YYYY-MM-DD）はそのまま読む */
export function formatDate(value: string, now: Date): string {
  let y: number, mo: number, da: number;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) {
    [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    [y, mo, da] = [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  }
  return y === now.getFullYear() ? `${mo}/${da}` : `${y}/${mo}/${da}`;
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
