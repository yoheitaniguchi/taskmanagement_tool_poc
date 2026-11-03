import { describe, expect, it } from "vitest";

// 年度・四半期の境界のテスト（PR 2a 以降）が日本時間で動くことの前提を確かめる（CLAUDE.md 5.2。vite.config.ts の test.env）
describe("テストの実行環境", () => {
  it("タイムゾーンが Asia/Tokyo に固定されている（UTC の前日 15:00 が日本時間の 0:00）", () => {
    const d = new Date("2026-03-31T15:00:00.000Z");
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]).toEqual([2026, 4, 1, 0]);
    expect(d.getTimezoneOffset()).toBe(-540);
  });
});
