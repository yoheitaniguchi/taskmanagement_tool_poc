import { describe, expect, it } from "vitest";
import { currentQuarter, fiscalQuarterOf, fiscalYearLabel, isFiscalYear, isQuarter, isValidDate, quarterLabel, toLocalDate } from "./fiscal";

// テストのタイムゾーンは Asia/Tokyo（vite.config.ts）。CI は UTC で動くため、ここで日本時間の境界を確かめる（CLAUDE.md 5.2）
describe("年度と四半期（CLAUDE.md 5.2）", () => {
  it.each([
    ["2026-03-31", 2025, 4],
    ["2026-04-01", 2026, 1],
    ["2026-06-30", 2026, 1],
    ["2026-07-01", 2026, 2],
    ["2026-09-30", 2026, 2],
    ["2026-10-01", 2026, 3],
    ["2026-11-03", 2026, 3],
    ["2026-12-31", 2026, 3],
    ["2027-01-01", 2026, 4],
    ["2027-03-31", 2026, 4],
    ["2027-04-01", 2027, 1],
  ])("%s は %i年度の第%i四半期", (date, fiscalYear, quarter) => {
    expect(fiscalQuarterOf(date)).toEqual({ fiscalYear, quarter });
  });

  it("「今」は端末のタイムゾーンの日付で判定する（UTC の前日 15:00 が日本時間の 0:00）", () => {
    // 2026-04-01 0:00（日本時間）＝ 2026-03-31 15:00（UTC）。UTC で判定すると前の年度になってしまう
    expect(toLocalDate(new Date("2026-03-31T15:00:00.000Z"))).toBe("2026-04-01");
    expect(currentQuarter(new Date("2026-03-31T15:00:00.000Z"))).toEqual({ fiscalYear: 2026, quarter: 1 });
    expect(currentQuarter(new Date("2026-03-31T14:59:59.999Z"))).toEqual({ fiscalYear: 2025, quarter: 4 });
    // 年をまたぐ境界
    expect(currentQuarter(new Date("2026-12-31T15:00:00.000Z"))).toEqual({ fiscalYear: 2026, quarter: 4 });
    expect(currentQuarter(new Date("2026-12-31T14:59:59.999Z"))).toEqual({ fiscalYear: 2026, quarter: 3 });
    // 四半期の境界
    expect(currentQuarter(new Date("2026-06-30T15:00:00.000Z"))).toEqual({ fiscalYear: 2026, quarter: 2 });
    expect(currentQuarter(new Date("2026-09-30T15:00:00.000Z"))).toEqual({ fiscalYear: 2026, quarter: 3 });
  });

  it("表示は年度と暦の月の両方が分かる形", () => {
    expect(quarterLabel(2026, 4)).toBe("2026年度 第4四半期（2027年1〜3月）");
    expect(quarterLabel(2026, 1)).toBe("2026年度 第1四半期（2026年4〜6月）");
    expect(quarterLabel(2026, 3, { short: true })).toBe("第3四半期（10〜12月）");
    expect(fiscalYearLabel(2026)).toBe("2026年度");
  });

  it("実在しない日付・形の違う日付を拒否する", () => {
    expect(isValidDate("2028-02-29")).toBe(true);
    for (const d of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-4-1", "2026-04-01T00:00:00Z", "", "20260401"]) {
      expect(isValidDate(d)).toBe(false);
    }
    expect(() => fiscalQuarterOf("2026-02-30")).toThrow();
  });

  it("年度は 2000〜2099 の整数、四半期は 1〜4", () => {
    expect([1999, 2000, 2099, 2100].map(isFiscalYear)).toEqual([false, true, true, false]);
    for (const v of [2026.5, "2026", null, Number.NaN]) expect(isFiscalYear(v)).toBe(false);
    expect([0, 1, 4, 5, "1", 1.5].map(isQuarter)).toEqual([false, true, true, false, false, false]);
  });
});
