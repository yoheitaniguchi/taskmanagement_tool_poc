import { describe, expect, it } from "vitest";
import { formatChars, formatDateTime, formatTime } from "./labels";

describe("表示の文言", () => {
  const now = new Date("2026-11-04T00:00:00.000Z");
  it("日時は端末のタイムゾーンで「11/3 20:15」。年が違えば年を付ける", () => {
    expect(formatDateTime("2026-11-03T11:15:00.000Z", now)).toBe("11/3 20:15");
    expect(formatDateTime("2025-12-31T23:05:00.000Z", now)).toBe("1/1 8:05");
    expect(formatDateTime("2025-11-03T11:15:00.000Z", now)).toBe("2025/11/3 20:15");
    expect(formatTime("2026-11-03T11:16:00.000Z")).toBe("20:16");
  });

  it("容量は「約120万字」「約3,400字」", () => {
    expect(formatChars(1_200_000)).toBe("約120万字");
    expect(formatChars(3_400)).toBe("約3,400字");
    expect(formatChars(12_345)).toBe("約1.2万字");
  });
});
