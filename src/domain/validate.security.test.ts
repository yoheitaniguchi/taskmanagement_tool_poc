// 読み込みの検証のセキュリティテスト（CLAUDE.md 8.2、docs/design.md 4.6、docs/security/checklist.md C）
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/export-v1.json";
import { SCHEMA_VERSION } from "./types";
import { validateExport, validateState } from "./validate";

type Mutable = Record<string, unknown>;
const sampleFile = (): Mutable => structuredClone(fixture) as unknown as Mutable;
const sampleState = (): Mutable => structuredClone(fixture.state) as unknown as Mutable;

describe("[@security] 読み込みの検証", () => {
  it("[@security] __proto__・constructor・prototype のキーを、どの階層でも拒否する（外枠を含む）", () => {
    for (const text of [
      '{"__proto__": {"polluted": true}}',
      `{"app":"taskmanagement_tool_poc","exportedAt":"2026-11-07T00:00:00.000Z","deviceName":"PC","state":{"schemaVersion":1,"inbox":[{"constructor":{}}]}}`,
      `{"app":"taskmanagement_tool_poc","prototype":1}`,
    ]) {
      const r = validateExport(JSON.parse(text));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join()).toMatch(/使えない項目名/);
    }
    expect(({} as Mutable).polluted).toBeUndefined();
  });

  it("[@security] 深すぎる入れ子を拒否する", () => {
    let deep: unknown = 1;
    for (let i = 0; i < 50; i++) deep = [deep];
    const s = sampleState();
    s.inbox = deep;
    const r = validateState(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/入れ子が深すぎます/);
  });

  it("[@security] 知らない項目・欠けた項目を拒否する（状態にも、要素にも）", () => {
    const a = sampleState();
    a.extra = 1;
    expect(validateState(a).ok).toBe(false);
    const b = sampleState();
    (b.actions as Mutable[])[0].dueDate = "2026-11-10";
    const rb = validateState(b);
    expect(!rb.ok && rb.errors.join()).toMatch("アクションの1件目：知らない項目「dueDate」があります");
    const c = sampleState();
    delete (c.projects as Mutable[])[0].outcome;
    const rc = validateState(c);
    expect(!rc.ok && rc.errors.join()).toMatch("プロジェクトの1件目：項目「outcome」がありません");
  });

  it("[@security] 未来の版を拒否する。版の無いもの・違う型の版も拒否する", () => {
    const future = sampleState();
    future.schemaVersion = SCHEMA_VERSION + 1;
    expect(validateState(future)).toEqual({ ok: false, errors: ["このアプリより新しい版のデータです。アプリを更新してから読み込んでください"] });
    for (const v of [undefined, 0, "1", 1.5]) {
      const s = sampleState();
      s.schemaVersion = v;
      expect(validateState(s).ok).toBe(false);
    }
  });

  it("[@security] id は UUID の形だけを受け付ける", () => {
    for (const id of ["1", "00000000-0000-4000-8000-00000000000G", "00000000-0000-1000-8000-000000000001", "00000000-0000-4000-8000-000000000001 ", null]) {
      const s = sampleState();
      (s.someday as Mutable[])[0].id = id;
      const r = validateState(s);
      expect(r.ok).toBe(false);
    }
  });

  it("[@security] 改行とタブのほかの制御文字を拒否する", () => {
    const s = sampleState();
    (s.references as Mutable[])[0].body = "本文\u0000";
    const r = validateState(s);
    expect(!r.ok && r.errors.join()).toMatch("資料の1件目：本文に使えない制御文字があります");
  });

  it("[@security] 状態ではないもの（配列・文字列・null）を拒否する", () => {
    for (const v of [null, "state", 1, [], [sampleState()]]) expect(validateState(v).ok).toBe(false);
  });

  it("[@security] 読み込んだ値は、検証した項目だけで組み立て直す（入力のオブジェクトを状態に使わない）", () => {
    const input = sampleState();
    const r = validateState(input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state).not.toBe(input);
      expect(r.state.projects[0]).not.toBe((input.projects as Mutable[])[0]);
      expect(r.state.projects[0].placement).not.toBe((input.projects as Mutable[])[0].placement);
      expect(r.state.quarterSheets[0].focusThemeIds).not.toBe((input.quarterSheets as Mutable[])[0].focusThemeIds);
      expect(Object.getPrototypeOf(r.state.projects[0])).toBe(Object.prototype);
    }
  });

  it("[@security] クラスのインスタンスは拒否し、プロトタイプの無いオブジェクトは中身を検証して詰め替える", () => {
    class Fake {}
    const a = sampleState();
    (a.someday as unknown[])[0] = new Fake();
    expect(validateState(a).ok).toBe(false);
    const b = sampleState();
    const bare = Object.assign(Object.create(null) as Mutable, (b.someday as Mutable[])[0]);
    (b.someday as unknown[])[0] = bare;
    const r = validateState(b);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.getPrototypeOf(r.state.someday[0])).toBe(Object.prototype);
  });
});

describe("[@security] 書き出したファイルの外枠（docs/design.md 6.2）", () => {
  it("[@security] app が完全に一致しないファイルを拒否する（既存PoC のファイルなど）", () => {
    for (const app of ["project_management_poc", "taskmanagement_tool_poc ", "TASKMANAGEMENT_TOOL_POC", undefined]) {
      const f = sampleFile();
      f.app = app;
      expect(validateExport(f)).toEqual({ ok: false, errors: ["このアプリが書き出したファイルではありません"] });
    }
  });

  it("[@security] 外枠の無い生の状態は受け付けない", () => {
    expect(validateExport(fixture.state).ok).toBe(false);
  });

  it("[@security] 外枠の項目は4つだけ。知らない項目を拒否する", () => {
    const f = sampleFile();
    f.note = "x";
    const r = validateExport(f);
    expect(!r.ok && r.errors.join()).toMatch("知らない項目「note」があります");
  });

  it("[@security] 書き出した日時と端末名を検証する", () => {
    const a = sampleFile();
    a.exportedAt = "2026-11-07";
    expect(validateExport(a).ok).toBe(false);
    for (const name of ["../PC", "PC/", "", "a b", "あ".repeat(17), 1]) {
      const b = sampleFile();
      b.deviceName = name;
      const r = validateExport(b);
      expect(!r.ok && r.errors.join()).toMatch("書き出した端末の名前が正しくありません");
    }
  });

  it("[@security] 中の状態に問題があれば、外枠が正しくても拒否する", () => {
    const f = sampleFile();
    ((f.state as Mutable).projects as Mutable[])[0].themeId = "unknown";
    expect(validateExport(f).ok).toBe(false);
  });
});
