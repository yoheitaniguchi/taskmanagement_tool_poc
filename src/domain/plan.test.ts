import { describe, expect, it } from "vitest";
import { annualGoalFor, quarterSheetFor, setAnnualGoal, setWontDo, toggleFocusTheme } from "./plan";
import { initialRoot, reducer } from "./reducer";
import { placedProjectsByTheme, quarterOverview } from "./summaries";
import { emptyState, type AnnualGoal, type AppState, type OpResult, type Project, type QuarterSheet } from "./types";
import { LIMITS, validateState } from "./validate";

const T0 = "2026-11-01T00:00:00.000Z";
const NOW = new Date("2026-11-05T03:00:00.000Z");
const AT = NOW.toISOString();
/** 端末の時計が遅れているときの今（どの要素の日時よりも前） */
const BEHIND = new Date("2026-10-01T00:00:00.000Z");
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(900000 + ++seq).padStart(12, "0")}`;

function goal(over: Partial<AnnualGoal> = {}): AnnualGoal {
  return { id: uuid(), createdAt: T0, updatedAt: T0, fiscalYear: 2026, themeId: "health", text: "テストの到達状態", ...over };
}
function sheet(over: Partial<QuarterSheet> = {}): QuarterSheet {
  return { id: uuid(), createdAt: T0, updatedAt: T0, fiscalYear: 2026, quarter: 3, focusThemeIds: [], wontDo: "", ...over };
}
function project(over: Partial<Project> = {}): Project {
  const done = over.status === "done";
  return {
    id: uuid(),
    createdAt: T0,
    updatedAt: T0,
    capturedAt: null,
    movedAt: null,
    name: "テストのプロジェクト",
    outcome: "テストの成果",
    themeId: "work",
    placement: null,
    status: "active",
    completedAt: done ? T0 : null,
    note: "",
    ...over,
  };
}

function ok(r: OpResult): AppState {
  if (!r.ok) throw new Error(r.error);
  const v = validateState(r.state);
  expect(v.ok ? [] : v.errors).toEqual([]);
  return r.state;
}
function err(r: OpResult): string {
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error;
}

describe("年次目標（年度 × テーマで1件。到達状態を空にしたら消す）", () => {
  it("無ければ作る。前後の空白を除き、改行を揃える", () => {
    const id = uuid();
    const next = ok(setAnnualGoal(emptyState(), 2026, "health", "  よく眠れている\r\n体力がある  ", NOW, () => id));
    expect(next.annualGoals).toEqual([{ id, createdAt: AT, updatedAt: AT, fiscalYear: 2026, themeId: "health", text: "よく眠れている\n体力がある" }]);
    expect(annualGoalFor(next, 2026, "health")?.id).toBe(id);
    expect(annualGoalFor(next, 2027, "health")).toBeNull();
  });

  it("あれば書き直す（id・作成日時はそのまま）。同じ年度・テーマで2件目は作らない", () => {
    const g = goal();
    const next = ok(setAnnualGoal({ ...emptyState(), annualGoals: [g] }, 2026, "health", "書き直した", NOW, uuid));
    expect(next.annualGoals).toEqual([{ ...g, text: "書き直した", updatedAt: AT }]);
  });

  it("別の年度・別のテーマなら別の年次目標", () => {
    const g = goal();
    const s1 = ok(setAnnualGoal({ ...emptyState(), annualGoals: [g] }, 2027, "health", "翌年度", NOW, uuid));
    const s2 = ok(setAnnualGoal(s1, 2026, "work", "仕事", NOW, uuid));
    expect(s2.annualGoals).toHaveLength(3);
  });

  it("到達状態を空にしたら、年次目標そのものを消す。無いものを空にしても何も変えない", () => {
    const g = goal();
    const state = { ...emptyState(), annualGoals: [g] };
    expect(ok(setAnnualGoal(state, 2026, "health", "  \n ", NOW, uuid)).annualGoals).toEqual([]);
    const r = setAnnualGoal(state, 2026, "work", "", NOW, uuid);
    expect(r.ok && r.state).toBe(state);
  });

  it("同じ内容で保存し直しても、更新日時を変えない", () => {
    const state = { ...emptyState(), annualGoals: [goal()] };
    const r = setAnnualGoal(state, 2026, "health", " テストの到達状態 ", NOW, uuid);
    expect(r.ok && r.state).toBe(state);
  });

  it("2,000字まで。年度の範囲（2000〜2099）・知らないテーマ・型の外の値は失敗にする", () => {
    expect(ok(setAnnualGoal(emptyState(), 2026, "health", "あ".repeat(LIMITS.longTextLength), NOW, uuid)).annualGoals).toHaveLength(1);
    expect(err(setAnnualGoal(emptyState(), 2026, "health", "あ".repeat(LIMITS.longTextLength + 1), NOW, uuid))).toBe("到達状態は2,000字までです（今 2,001字）");
    expect(err(setAnnualGoal(emptyState(), 1999, "health", "x", NOW, uuid))).toBe("年度が正しくありません");
    expect(err(setAnnualGoal(emptyState(), 2100, "health", "x", NOW, uuid))).toBe("年度が正しくありません");
    expect(ok(setAnnualGoal(emptyState(), 2000, "health", "x", NOW, uuid)).annualGoals).toHaveLength(1);
    expect(ok(setAnnualGoal(emptyState(), 2099, "health", "x", NOW, uuid)).annualGoals).toHaveLength(1);
    expect(err(setAnnualGoal(emptyState(), 2026, "toString" as never, "x", NOW, uuid))).toBe("テーマが正しくありません");
    expect(err(setAnnualGoal(emptyState(), 2026.5, "health", "x", NOW, uuid))).toBe("年度が正しくありません");
    expect(err(setAnnualGoal(emptyState(), 2026, "health", 3 as never, NOW, uuid))).toBe("入力が正しくありません");
  });

  it("時計が遅れていても、更新日時は作成日時より前にならない", () => {
    const g = goal();
    const next = ok(setAnnualGoal({ ...emptyState(), annualGoals: [g] }, 2026, "health", "遅れた時計で", BEHIND, uuid));
    expect(next.annualGoals[0].updatedAt).toBe(T0);
  });
});

describe("四半期シート（年度 × 四半期で1件。重点テーマは最大3つで重複しない）", () => {
  it("シートが無ければ、重点テーマを最初に選んだときに作る", () => {
    const id = uuid();
    const next = ok(toggleFocusTheme(emptyState(), 2026, 3, "health", NOW, () => id));
    expect(next.quarterSheets).toEqual([{ id, createdAt: AT, updatedAt: AT, fiscalYear: 2026, quarter: 3, focusThemeIds: ["health"], wontDo: "" }]);
    expect(quarterSheetFor(next, 2026, 3)?.id).toBe(id);
  });

  it("選んだ順に並べ、もう一度押すと外す。外して0になってもシートは残す", () => {
    let s = ok(toggleFocusTheme(emptyState(), 2026, 3, "health", NOW, uuid));
    s = ok(toggleFocusTheme(s, 2026, 3, "work", NOW, uuid));
    expect(s.quarterSheets[0].focusThemeIds).toEqual(["health", "work"]);
    s = ok(toggleFocusTheme(s, 2026, 3, "health", NOW, uuid));
    s = ok(toggleFocusTheme(s, 2026, 3, "work", NOW, uuid));
    expect(s.quarterSheets).toHaveLength(1);
    expect(s.quarterSheets[0].focusThemeIds).toEqual([]);
  });

  it("4つ目は拒否し、状態を変えない", () => {
    const state = { ...emptyState(), quarterSheets: [sheet({ focusThemeIds: ["work", "health", "finance"] })] };
    expect(err(toggleFocusTheme(state, 2026, 3, "hobby_learning", NOW, uuid))).toBe("重点テーマは3つまでです。変えるときは、どれかを外してください");
    // 3つ選んでいても、外すことはできる
    expect(ok(toggleFocusTheme(state, 2026, 3, "health", NOW, uuid)).quarterSheets[0].focusThemeIds).toEqual(["work", "finance"]);
  });

  it("重複は作れない（同じテーマは外す操作になる）", () => {
    const state = { ...emptyState(), quarterSheets: [sheet({ focusThemeIds: ["work"] })] };
    expect(ok(toggleFocusTheme(state, 2026, 3, "work", NOW, uuid)).quarterSheets[0].focusThemeIds).toEqual([]);
  });

  it("別の四半期・年度は別のシートになり、同じ年度・四半期で2枚目は作らない", () => {
    let s = ok(toggleFocusTheme(emptyState(), 2026, 3, "work", NOW, uuid));
    s = ok(toggleFocusTheme(s, 2026, 4, "work", NOW, uuid));
    s = ok(setWontDo(s, 2027, 3, "やらない", NOW, uuid));
    s = ok(setWontDo(s, 2026, 3, "やらない", NOW, uuid));
    expect(s.quarterSheets.map((x) => [x.fiscalYear, x.quarter])).toEqual([
      [2026, 3],
      [2026, 4],
      [2027, 3],
    ]);
  });

  it("やらないことは空欄でも保存できる。空のまま保存しても空のシートは作らない", () => {
    const state = { ...emptyState(), quarterSheets: [sheet({ wontDo: "書いてあった" })] };
    expect(ok(setWontDo(state, 2026, 3, "  ", NOW, uuid)).quarterSheets[0]).toMatchObject({ wontDo: "", updatedAt: AT });
    const r = setWontDo(emptyState(), 2026, 3, "", NOW, uuid);
    expect(r.ok && r.state.quarterSheets).toEqual([]);
  });

  it("2,000字まで。年度・四半期・テーマの範囲と型の外の値は失敗にする", () => {
    expect(err(setWontDo(emptyState(), 2026, 3, "あ".repeat(LIMITS.longTextLength + 1), NOW, uuid))).toBe("やらないことは2,000字までです（今 2,001字）");
    expect(err(setWontDo(emptyState(), 2026, 5 as never, "x", NOW, uuid))).toBe("四半期が正しくありません");
    expect(err(toggleFocusTheme(emptyState(), 2100, 1, "work", NOW, uuid))).toBe("年度が正しくありません");
    expect(err(toggleFocusTheme(emptyState(), 2026, 1, "__proto__" as never, NOW, uuid))).toBe("テーマが正しくありません");
    expect(err(setWontDo(emptyState(), 2026, 3, null as never, NOW, uuid))).toBe("入力が正しくありません");
  });

  it("時計が遅れていても、更新日時は作成日時より前にならない", () => {
    const state = { ...emptyState(), quarterSheets: [sheet()] };
    expect(ok(toggleFocusTheme(state, 2026, 3, "work", BEHIND, uuid)).quarterSheets[0].updatedAt).toBe(T0);
  });

  it("reducer：年次目標・重点テーマ・やらないことを変えても「元に戻す」は出さない。読めない時刻なら何もしない", () => {
    const root = initialRoot(emptyState());
    const r1 = reducer(root, { type: "setAnnualGoal", fiscalYear: 2026, themeId: "work", text: "目標", at: AT, id: uuid() });
    const r2 = reducer(r1, { type: "toggleFocusTheme", fiscalYear: 2026, quarter: 3, themeId: "work", at: AT, id: uuid() });
    const r3 = reducer(r2, { type: "setWontDo", fiscalYear: 2026, quarter: 3, text: "やらない", at: AT, id: uuid() });
    expect(r3.state.annualGoals).toHaveLength(1);
    expect(r3.state.quarterSheets[0]).toMatchObject({ focusThemeIds: ["work"], wontDo: "やらない" });
    expect(r3.undo).toBeNull();
    // 年次目標を消したときだけ「元に戻す」を出し、戻すと消す前に戻る
    const r4 = reducer(r3, { type: "setAnnualGoal", fiscalYear: 2026, themeId: "work", text: " ", at: AT, id: uuid() });
    expect(r4.state.annualGoals).toEqual([]);
    expect(r4.undo?.message).toBe("年次目標を消しました");
    expect(reducer(r4, { type: "undo" }).state).toBe(r3.state);
    expect(reducer(root, { type: "setWontDo", fiscalYear: 2026, quarter: 3, text: "x", at: "読めない", id: uuid() })).toBe(root);
  });
});

describe("並べるだけの関数（年次目標の表・四半期シート・ホームの今の四半期）", () => {
  const a = project({ name: "い", themeId: "work", placement: { fiscalYear: 2026, quarter: 3 } });
  const b = project({ name: "あ", themeId: "work", placement: { fiscalYear: 2026, quarter: 3 }, status: "done" });
  const c = project({ name: "う", themeId: "work", placement: { fiscalYear: 2026, quarter: 1 } });
  const d = project({ name: "え", themeId: "health", placement: { fiscalYear: 2026, quarter: 3 } });
  const e = project({ name: "お", themeId: "work", placement: { fiscalYear: 2027, quarter: 1 } });
  const f = project({ name: "か", themeId: "work", placement: null });
  const state: AppState = { ...emptyState(), projects: [a, b, c, d, e, f], quarterSheets: [sheet({ focusThemeIds: ["health"] })] };

  it("placedProjectsByTheme：その年度に置いたものだけを、テーマごとに四半期の早い順 → 名前順で", () => {
    const m = placedProjectsByTheme(state, 2026);
    expect(m.get("work")?.map((p) => p.name)).toEqual(["う", "あ", "い"]);
    expect(m.get("health")?.map((p) => p.name)).toEqual(["え"]);
    expect(m.get("finance")).toEqual([]);
    expect(placedProjectsByTheme(state, 2027).get("work")?.map((p) => p.name)).toEqual(["お"]);
  });

  it("quarterOverview：その四半期に置いたもの（テーマ順 → 名前順）、完了の件数、重点テーマ。シートが無ければ空", () => {
    const o = quarterOverview(state, 2026, 3);
    expect(o.projects.map((p) => p.name)).toEqual(["あ", "い", "え"]);
    expect(o.doneCount).toBe(1);
    expect(o.focusThemeIds).toEqual(["health"]);
    const empty = quarterOverview(state, 2026, 2);
    expect(empty).toMatchObject({ sheet: null, focusThemeIds: [], projects: [], doneCount: 0 });
  });
});
