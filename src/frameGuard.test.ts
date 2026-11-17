import { describe, expect, it } from "vitest";
import { isFramed } from "./frameGuard";

describe("[@security] 枠（iframe）の中で開かれたかの判定（SEC-003）", () => {
  it("[@security] 直接開いたとき（top と self が同じ）は、枠の外", () => {
    const self = {};
    expect(isFramed({ self, top: self })).toBe(false);
  });

  it("[@security] 枠の中（top と self が違う）は、枠の中", () => {
    expect(isFramed({ self: {}, top: {} })).toBe(true);
  });

  it("[@security] top を確かめると例外になるときは、安全な側に倒して枠の中", () => {
    const win = {
      self: {},
      get top(): unknown {
        throw new Error("SecurityError");
      },
    };
    expect(isFramed(win)).toBe(true);
  });
});
