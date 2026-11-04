import { describe, expect, it } from "vitest";
import { changedSinceTransfer, emptyDeviceMeta, isValidDeviceName, markChanged, markExported, markImported, stateFingerprint, validateDeviceMeta, validateDeviceName } from "./transfer";
import { emptyState } from "./types";
import { sampleState } from "./testData";

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


const at = new Date("2026-11-03T11:15:00.000Z");

describe("端末名の入力", () => {
  it("前後の空白を除き、NFC にしてから判定する", () => {
    expect(validateDeviceName("  PC ")).toEqual({ ok: true, name: "PC" });
    expect(validateDeviceName("ガ")).toEqual({ ok: true, name: "ガ" });
  });

  it("空・長すぎ・使えない文字は、理由を返す", () => {
    expect(validateDeviceName(" ")).toEqual({ ok: false, error: "名前を入れてください" });
    expect(validateDeviceName("あ".repeat(17))).toEqual({ ok: false, error: "16字までです（今 17字）" });
    expect(validateDeviceName("自宅 PC").ok).toBe(false);
  });
});

describe("状態の指紋と「書き出した後の変更」（docs/design.md 6.2）", () => {
  it("同じ内容なら同じ指紋、1字でも違えば違う指紋", () => {
    const a = sampleState();
    expect(stateFingerprint(a)).toBe(stateFingerprint(sampleState()));
    expect(stateFingerprint(a)).toMatch(/^[0-9a-f]{14}$/);
    a.inbox[0].text += "！";
    expect(stateFingerprint(a)).not.toBe(stateFingerprint(sampleState()));
  });

  it("一度も書き出していなければ、空の状態と比べる", () => {
    expect(changedSinceTransfer(emptyDeviceMeta(), stateFingerprint(emptyState()))).toBe(false);
    expect(changedSinceTransfer(emptyDeviceMeta(), stateFingerprint(sampleState()))).toBe(true);
  });

  it("書き出した後に変えると「変更あり」、読み込んだ直後は「変更なし」", () => {
    const fp = stateFingerprint(sampleState());
    const exported = markExported(emptyDeviceMeta(), fp, at);
    expect(exported.lastExportedAt).toBe(at.toISOString());
    expect(changedSinceTransfer(exported, fp)).toBe(false);
    const changed = sampleState();
    changed.someday = [];
    expect(changedSinceTransfer(exported, stateFingerprint(changed))).toBe(true);
    const imported = markImported(exported, { deviceName: "スマホ", exportedAt: "2026-11-03T10:58:00.000Z" }, stateFingerprint(changed), at);
    expect(imported.lastImport).toEqual({ at: at.toISOString(), fromDevice: "スマホ", fromExportedAt: "2026-11-03T10:58:00.000Z" });
    expect(changedSinceTransfer(imported, stateFingerprint(changed))).toBe(false);
  });

  it("変更した日時は表示のためだけに記録し、「変更あり」の判定には使わない", () => {
    const fp = stateFingerprint(sampleState());
    const meta = markChanged(markExported(emptyDeviceMeta(), fp, at), new Date("2026-11-04T00:00:00.000Z"));
    expect(changedSinceTransfer(meta, fp)).toBe(false);
  });
});

describe("[@security] ブラウザの設定の検証（docs/design.md 6.1）", () => {
  const good = { ...markImported(markExported(emptyDeviceMeta(), "0123456789abcd", at), { deviceName: "スマホ", exportedAt: at.toISOString() }, "0123456789abcd", at), deviceName: "PC" };

  it("[@security] 決まった形の値は、そのまま通す", () => {
    expect(validateDeviceMeta(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it("[@security] 項目の過不足・端末名・日時・指紋・書き出し元の形が違えば、既定値に戻す", () => {
    const bad: unknown[] = [
      null,
      [],
      "PC",
      { ...good, extra: 1 },
      { ...good, deviceName: "a/b" },
      { ...good, deviceName: "" },
      { ...good, lastExportedAt: "2026-11-03" },
      { ...good, lastChangedAt: 1 },
      { ...good, transferFingerprint: "xyz" },
      { ...good, introDismissed: "true" },
      { ...good, lastImport: { ...good.lastImport, fromDevice: "<b>" } },
      { ...good, lastImport: { ...good.lastImport, extra: 1 } },
    ];
    for (const v of bad) expect(validateDeviceMeta(v)).toEqual(emptyDeviceMeta());
  });
});
