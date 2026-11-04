import { describe, expect, it } from "vitest";
import { shouldAutosave } from "./autosave";

describe("自動保存してよいか（docs/design.md 6.3）", () => {
  const base = { storageAvailable: true, corruptAtStart: false, recovered: false, changedInOtherTab: false };

  it("ふだんは保存する", () => {
    expect(shouldAutosave(base)).toBe(true);
  });

  it("[@security] 起動時に読めなかったら、回復するまで保存しない（元の値を空の状態で上書きしない）", () => {
    expect(shouldAutosave({ ...base, corruptAtStart: true })).toBe(false);
    expect(shouldAutosave({ ...base, corruptAtStart: true, recovered: true })).toBe(true);
  });

  it("[@security] 別のタブで変わったら保存しない（黙って上書きしない）。保存領域が無ければ保存しない", () => {
    expect(shouldAutosave({ ...base, changedInOtherTab: true })).toBe(false);
    expect(shouldAutosave({ ...base, storageAvailable: false })).toBe(false);
  });
});
