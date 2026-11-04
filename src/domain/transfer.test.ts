import { describe, expect, it } from "vitest";
import { isValidDeviceName } from "./transfer";

describe("端末名（D11）", () => {
  it("文字（日本語を含む）・数字・「-」・「_」の16字まで", () => {
    for (const v of ["PC", "スマホ", "自宅PC_2", "pc-1", "あ".repeat(16)]) expect(isValidDeviceName(v)).toBe(true);
  });

  it("[@security] パスの区切り・空白・記号・制御文字・17字以上・空を拒否する（ファイル名に入るため）", () => {
    for (const v of ["", "a/b", "a\\b", "..", "a b", "a.b", "a:b", "a\u0000b", "a\nb", "<script>", "あ".repeat(17), "PC‮", null, 1]) {
      expect(isValidDeviceName(v)).toBe(false);
    }
  });

  it("[@security] NFC でない値は、そのままでは受け付けない", () => {
    expect(isValidDeviceName("ガ")).toBe(false);
  });
});
