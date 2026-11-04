// 年度と四半期（CLAUDE.md 5.2、docs/design.md 5章）。
// 年度は4月始まり。「今日」「今の四半期」は、今の時刻（引数）を端末のタイムゾーンで YYYY-MM-DD に直してから決める。
// 関数の中で new Date() を呼ばない（テストで日時を固定できるように）
import type { Placement, Quarter } from "./types";

/** 扱う年度の範囲（検証の範囲と、年度の切替の範囲） */
export const FISCAL_YEAR_MIN = 2000;
export const FISCAL_YEAR_MAX = 2099;

const pad2 = (n: number) => String(n).padStart(2, "0");

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** 実在する UTC の日時で、toISOString() と同じ書き方か（2月30日や、ミリ秒の無い書き方を拒否する） */
export function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !DATETIME_RE.test(value)) return false;
  const t = Date.parse(value);
  return !Number.isNaN(t) && new Date(t).toISOString() === value;
}

/** 端末のタイムゾーンでの日付（YYYY-MM-DD）。UTC に直さない（日本時間の 0:00〜8:59 が前日にならないように） */
export function toLocalDate(now: Date): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 実在する日付（YYYY-MM-DD）か。2月30日などを拒否する */
export function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** 日付（YYYY-MM-DD）が属する年度と四半期。1〜3月は前の年の年度の第4四半期 */
export function fiscalQuarterOf(date: string): Placement {
  if (!isValidDate(date)) throw new Error(`日付の形が正しくありません: ${date}`);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (month <= 3) return { fiscalYear: year - 1, quarter: 4 };
  return { fiscalYear: year, quarter: (Math.floor((month - 4) / 3) + 1) as Quarter };
}

/** 今の年度と四半期（端末のタイムゾーンで判定する） */
export function currentQuarter(now: Date): Placement {
  return fiscalQuarterOf(toLocalDate(now));
}

export function isFiscalYear(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= FISCAL_YEAR_MIN && (value as number) <= FISCAL_YEAR_MAX;
}

export function isQuarter(value: unknown): value is Quarter {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

/** 四半期の暦の月（開始月・終了月）と、その暦の年 */
export function quarterMonths(fiscalYear: number, quarter: Quarter): { year: number; startMonth: number; endMonth: number } {
  if (quarter === 4) return { year: fiscalYear + 1, startMonth: 1, endMonth: 3 };
  const startMonth = 4 + (quarter - 1) * 3;
  return { year: fiscalYear, startMonth, endMonth: startMonth + 2 };
}

/** 「2026年度」 */
export function fiscalYearLabel(fiscalYear: number): string {
  return `${fiscalYear}年度`;
}

/**
 * 「2026年度 第4四半期（2027年1〜3月）」。年度と暦の月の両方が分かる形（CLAUDE.md 5.2）。
 * short のときは年度を省いた「第4四半期（1〜3月）」（年度の見出しの下など、狭い場所で使う）
 */
export function quarterLabel(fiscalYear: number, quarter: Quarter, options: { short?: boolean } = {}): string {
  const { year, startMonth, endMonth } = quarterMonths(fiscalYear, quarter);
  if (options.short) return `第${quarter}四半期（${startMonth}〜${endMonth}月）`;
  return `${fiscalYearLabel(fiscalYear)} 第${quarter}四半期（${year}年${startMonth}〜${endMonth}月）`;
}
