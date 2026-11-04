import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/export-v1.json";
import { emptyState, type AppState } from "./types";
import { LIMITS, stateSize, validateExport, validateState } from "./validate";

// 架空の v1 データ（__fixtures__/export-v1.json）。テストごとに写しを作って書き換える
type Mutable = Record<string, unknown>;
const sample = (): Mutable => structuredClone(fixture.state) as unknown as Mutable;
const list = (s: Mutable, key: string) => s[key] as Mutable[];

function expectRejected(s: unknown, message: string | RegExp) {
  const r = validateState(s);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.join("\n")).toMatch(message);
}

describe("スキーマ v1 の回帰（docs/plans/milestone-2.md 2.2）", () => {
  it("架空の v1 データを、外枠ごと読み込める（後の節目で検証を足しても、この形が読めること）", () => {
    const r = validateExport(fixture);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.file.deviceName).toBe("テスト端末");
      expect(r.file.state).toEqual(fixture.state);
    }
  });

  it("空の状態も通る", () => {
    expect(validateState(emptyState())).toEqual({ ok: true, state: emptyState() });
  });

  it("JSON の文字列にして戻しても同じ（往復）", () => {
    const r = validateState(JSON.parse(JSON.stringify(fixture.state)));
    expect(r.ok && r.state).toEqual(fixture.state);
  });
});

describe("文字列（4.6・4.7）", () => {
  it("必須の文字列が空白だけなら拒否する", () => {
    const s = sample();
    list(s, "actions")[0].text = " 　";
    expectRejected(s, "アクションの1件目：内容が空です");
  });

  it("上限の文字数を超えたら拒否し、ちょうどなら通す", () => {
    const ok = sample();
    list(ok, "projects")[0].name = "あ".repeat(LIMITS.nameLength);
    list(ok, "references")[0].body = "あ".repeat(LIMITS.bodyLength);
    expect(validateState(ok).ok).toBe(true);
    const ng = sample();
    list(ng, "projects")[0].name = "あ".repeat(LIMITS.nameLength + 1);
    expectRejected(ng, "プロジェクトの1件目：名称が長すぎます（101字。上限は100字）");
  });

  it("改行を許さない項目に改行があれば拒否し、メモ・成果・本文では許す", () => {
    const s = sample();
    list(s, "waitingFors")[0].party = "相手\n2行目";
    expectRejected(s, "連絡待ちの1件目：相手に改行があります");
    const ok = sample();
    list(ok, "actions")[0].note = "1行目\n2行目";
    expect(validateState(ok).ok).toBe(true);
  });

  it("改行を許さない項目でも、タブは許し、ほかの制御文字は拒否する", () => {
    const ok = sample();
    list(ok, "someday")[0].text = "列1\t列2";
    expect(validateState(ok).ok).toBe(true);
    const ng = sample();
    list(ng, "someday")[0].text = "内容\u001b[31m";
    expectRejected(ng, "いつか・多分の1件目：内容に使えない制御文字があります");
  });

  it("空でよい項目（メモ・本文・やらないこと）は空で通る", () => {
    const s = sample();
    list(s, "references")[0].body = "";
    list(s, "quarterSheets")[0].wontDo = "";
    expect(validateState(s).ok).toBe(true);
  });

  it("年次目標の到達状態は必須（空にしたら年次目標そのものを消す）", () => {
    const s = sample();
    list(s, "annualGoals")[0].text = "";
    expectRejected(s, "年次目標の1件目：到達状態が空です");
  });
});

describe("列挙値・年度・四半期（4.6）", () => {
  it("テーマ・状態・四半期・年度の範囲を外れたら拒否する", () => {
    const cases: [(s: Mutable) => void, string][] = [
      [(s) => (list(s, "projects")[0].themeId = "sports"), "プロジェクトの1件目：テーマが正しくありません"],
      [(s) => (list(s, "actions")[0].status = "doing"), "アクションの1件目：状態が正しくありません"],
      [(s) => (list(s, "projects")[0].placement = { fiscalYear: 2026, quarter: 5 }), "四半期が正しくありません"],
      [(s) => (list(s, "projects")[0].placement = { fiscalYear: 2100, quarter: 1 }), "年度が正しくありません"],
      [(s) => (list(s, "annualGoals")[0].fiscalYear = 1999), "年次目標の1件目：年度が正しくありません"],
      [(s) => (list(s, "quarterSheets")[0].quarter = "3"), "四半期シートの1件目：四半期が正しくありません"],
      [(s) => (list(s, "annualGoals")[0].fiscalYear = 2026.5), "年度が正しくありません"],
    ];
    for (const [mutate, message] of cases) {
      const s = sample();
      mutate(s);
      expectRejected(s, message);
    }
  });

  it("置く四半期は無し（null）か1つ", () => {
    const s = sample();
    list(s, "projects")[0].placement = [{ fiscalYear: 2026, quarter: 1 }];
    expectRejected(s, "置く四半期：形が正しくありません");
  });

  it("重点テーマは3つまで、重複なし", () => {
    const four = sample();
    list(four, "quarterSheets")[0].focusThemeIds = ["work", "health", "finance", "other"];
    expectRejected(four, "重点テーマが多すぎます（4つ。上限は3つ）");
    const dup = sample();
    list(dup, "quarterSheets")[0].focusThemeIds = ["work", "work"];
    expectRejected(dup, "重点テーマが重複しています");
    const empty = sample();
    list(empty, "quarterSheets")[0].focusThemeIds = [];
    expect(validateState(empty).ok).toBe(true);
  });
});

describe("日時（4.6・D15）", () => {
  it("UTC の ISO 8601（toISOString() の形）で実在する日時だけを受け付ける", () => {
    for (const v of ["2026-11-04T09:00:00Z", "2026-11-04T09:00:00.000+09:00", "2026-02-30T00:00:00.000Z", "2026-11-04", "", 0]) {
      const s = sample();
      list(s, "someday")[0].updatedAt = v;
      expectRejected(s, "いつか・多分の1件目：更新日時が日時（UTC の ISO 8601）ではありません");
    }
  });

  it("依頼日は実在する YYYY-MM-DD", () => {
    const s = sample();
    list(s, "waitingFors")[0].requestedOn = "2026-11-31";
    expectRejected(s, "連絡待ちの1件目：依頼日が日付（YYYY-MM-DD）ではありません");
  });

  it("収集日時 ≦ 作成日時 ≦ 更新日時", () => {
    const a = sample();
    list(a, "actions")[0].capturedAt = "2026-11-05T00:00:00.000Z";
    expectRejected(a, "アクションの1件目：収集日時が作成日時より後になっています");
    const b = sample();
    list(b, "actions")[0].updatedAt = "2026-11-01T00:00:00.000Z";
    expectRejected(b, "アクションの1件目：作成日時が更新日時より後になっています");
  });

  it("作成日時 ≦ 完了日時 ≦ 更新日時、作成日時 ≦ 移動日時 ≦ 更新日時", () => {
    const a = sample();
    list(a, "actions")[1].completedAt = "2026-11-07T00:00:00.000Z";
    expectRejected(a, "アクションの2件目：完了日時が更新日時より後になっています");
    const b = sample();
    list(b, "projects")[1].movedAt = "2026-11-01T00:00:00.000Z";
    expectRejected(b, "プロジェクトの2件目：作成日時が移動日時より後になっています");
  });

  it("移動日時 ≦ 更新日時", () => {
    const s = sample();
    list(s, "projects")[1].movedAt = "2026-11-07T00:00:00.000Z";
    expectRejected(s, "プロジェクトの2件目：移動日時が更新日時より後になっています");
  });

  it("連絡待ち・プロジェクトでも、作成日時 ≦ 完了日時 ≦ 更新日時", () => {
    const a = sample();
    Object.assign(list(a, "waitingFors")[0], { status: "done", completedAt: "2026-11-03T00:00:00.000Z" });
    expectRejected(a, "連絡待ちの1件目：作成日時が完了日時より後になっています");
    const b = sample();
    list(b, "projects")[1].completedAt = "2026-11-07T00:00:00.000Z";
    expectRejected(b, "プロジェクトの2件目：完了日時が更新日時より後になっています");
  });

  it("収集箱の項目は収集日時＝作成日時", () => {
    const s = sample();
    list(s, "inbox")[0].capturedAt = "2026-11-03T00:00:00.000Z";
    expectRejected(s, "収集箱の項目の1件目：収集日時が作成日時と違います");
  });

  it("日時の比較は文字列ではなく時刻で行う（同じ時刻なら通る）", () => {
    const s = sample();
    const a = list(s, "actions")[1];
    a.completedAt = a.updatedAt;
    expect(validateState(s).ok).toBe(true);
  });
});

describe("状態と完了日時（5.3）", () => {
  it("完了のものだけが完了日時を持つ", () => {
    const a = sample();
    list(a, "actions")[1].completedAt = null;
    expectRejected(a, "アクションの2件目：完了なのに完了日時がありません");
    const b = sample();
    list(b, "waitingFors")[0].completedAt = "2026-11-04T00:00:00.000Z";
    expectRejected(b, "連絡待ちの1件目：未完了なのに完了日時があります");
  });
});

describe("参照と一意（5.3）", () => {
  it("属するプロジェクトが存在しなければ拒否する", () => {
    const s = sample();
    list(s, "waitingFors")[0].projectId = "00000000-0000-4000-8000-000000000999";
    expectRejected(s, "連絡待ちの1件目：属するプロジェクトが見つかりません");
  });

  it("プロジェクトに属するアクションはテーマを持たない", () => {
    const s = sample();
    list(s, "actions")[0].themeId = "work";
    expectRejected(s, "アクションの1件目：プロジェクトに属するアクションがテーマを持っています");
  });

  it("完了したプロジェクトに、未着手のアクション・待ちの連絡待ちを残さない", () => {
    const a = sample();
    Object.assign(list(a, "actions")[2], { status: "todo", completedAt: null });
    expectRejected(a, "アクションの3件目：完了したプロジェクトに、未完了のまま属しています");
    const b = sample();
    list(b, "waitingFors")[0].projectId = list(b, "projects")[1].id;
    expectRejected(b, "連絡待ちの1件目：完了したプロジェクトに、未完了のまま属しています");
  });

  it("id は種類をまたいでも一意", () => {
    const s = sample();
    list(s, "someday")[0].id = list(s, "inbox")[0].id;
    expectRejected(s, "いつか・多分の1件目：id が収集箱の項目の1件目と重複しています");
  });

  it("年次目標は年度 × テーマで1件、四半期シートは年度 × 四半期で1件", () => {
    const a = sample();
    list(a, "annualGoals").push({ ...list(a, "annualGoals")[0], id: "00000000-0000-4000-8000-000000000061" });
    expectRejected(a, "年次目標の2件目：同じ年度・テーマの年次目標がほかにもあります");
    const b = sample();
    list(b, "quarterSheets").push({ ...list(b, "quarterSheets")[0], id: "00000000-0000-4000-8000-000000000071" });
    expectRejected(b, "四半期シートの2件目：同じ年度・四半期の四半期シートがほかにもあります");
    const ok = sample();
    list(ok, "annualGoals").push({ ...list(ok, "annualGoals")[0], id: "00000000-0000-4000-8000-000000000062", themeId: "health" });
    expect(validateState(ok).ok).toBe(true);
  });
});

describe("件数と大きさ（4.7）", () => {
  it("一覧の件数が上限を超えたら拒否する", () => {
    const s = sample();
    s.someday = new Array(LIMITS.itemsPerList + 1).fill(null);
    expectRejected(s, `いつか・多分：件数が多すぎます（${LIMITS.itemsPerList + 1}件。上限は${LIMITS.itemsPerList}件）`);
  });

  it("年次目標は700件、四半期シートは400件まで（年度の範囲 × テーマ・四半期）", () => {
    expect([LIMITS.annualGoals, LIMITS.quarterSheets]).toEqual([700, 400]);
    const a = sample();
    a.annualGoals = new Array(701).fill(null);
    expectRejected(a, "年次目標：件数が多すぎます（701件。上限は700件）");
    const b = sample();
    b.quarterSheets = new Array(401).fill(null);
    expectRejected(b, "四半期シート：件数が多すぎます（401件。上限は400件）");
  });

  it("状態全体が 600万字を超えたら拒否し、ちょうどなら通す", () => {
    // 資料を並べて、JSON にしたときにちょうど 600万字になる状態を作る（項目名・日時の分も数える）
    const reference = (i: number, bodyLength: number) => ({
      id: `00000000-0000-4000-8000-${String(100000 + i).padStart(12, "0")}`,
      createdAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:00:00.000Z",
      capturedAt: null,
      movedAt: null,
      title: `テスト用の資料${i}`,
      body: "あ".repeat(bodyLength),
    });
    const state: AppState = emptyState();
    let size = JSON.stringify(state).length;
    for (let i = 0; size < LIMITS.stateChars; i++) {
      const empty = reference(i, 0);
      const overhead = JSON.stringify(empty).length + (state.references.length > 0 ? 1 : 0);
      const bodyLength = Math.min(LIMITS.bodyLength, LIMITS.stateChars - size - overhead);
      if (bodyLength < 0) break;
      state.references.push(reference(i, bodyLength));
      size += overhead + bodyLength;
    }
    expect(stateSize(state)).toBe(LIMITS.stateChars);
    expect(validateState(state).ok).toBe(true);

    state.references[state.references.length - 1].title += "あ";
    expectRejected(state, "データ全体が大きすぎます（6,000,001字。上限は6,000,000字）");
  });

  it("理由は最初の20件までにまとめる", () => {
    const s = sample();
    s.someday = Array.from({ length: 30 }, () => ({}));
    const r = validateState(s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(21);
      expect(r.errors[20]).toMatch(/^ほかに\d+件の問題があります$/);
    }
  });
});
