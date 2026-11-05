// 年次目標と四半期シート（F05・F06。CLAUDE.md 5.3、docs/design.md 3.7・4.5）。
// - 年次目標は、年度 × テーマで1件まで。到達状態を空にしたら、年次目標そのものを消す（到達状態は必須なので、空の年次目標を残さない）
// - 四半期シートは、年度 × 四半期で1件まで。シートが無い四半期は空のシートとして見せ、重点テーマ・やらないことを最初に変えたときに作る
// - 重点テーマは最大3つで、重複しない。4つ目は拒否する（画面でも選べなくする）
// - やらないことは空欄でも保存できる（警告しない。12.2）
// - 主要プロジェクトは、プロジェクトの「置いた四半期」で表す（QuarterSheet には持たない。5.1）。置く・外すのは placeProject
import { checkCount, checkSize, fail, stampFor, type Fail } from "./common";
import { readField, type FieldSpec } from "./fields";
import { isFiscalYear, isQuarter } from "./fiscal";
import { isThemeId, type ThemeId } from "./themes";
import type { AnnualGoal, AppState, OpResult, Quarter, QuarterSheet } from "./types";
import { LIMITS } from "./validate";

/** 入力欄の決まり（保存の検証 validate.ts と同じ上限） */
export const PLAN_FIELDS = {
  goal: { label: "年次目標", max: LIMITS.longTextLength, required: false, multiline: true },
  wontDo: { label: "やらないこと", max: LIMITS.longTextLength, required: false, multiline: true },
} as const satisfies Record<string, FieldSpec>;

/** 1つの年度に選べる重点テーマの数（CLAUDE.md 5.3） */
export const FOCUS_MAX = 3;

function checkYear(fiscalYear: unknown): Fail | null {
  return isFiscalYear(fiscalYear) ? null : fail("年度が正しくありません");
}

function readText(value: unknown, spec: FieldSpec): { ok: true; value: string } | Fail {
  // 型の外の値（今のコードからは作れない）でも、例外にせず失敗を返す（SEC-006）
  if (typeof value !== "string") return fail("入力が正しくありません");
  return readField(value, spec);
}

export function annualGoalFor(state: AppState, fiscalYear: number, themeId: ThemeId): AnnualGoal | null {
  return state.annualGoals.find((g) => g.fiscalYear === fiscalYear && g.themeId === themeId) ?? null;
}

export function quarterSheetFor(state: AppState, fiscalYear: number, quarter: Quarter): QuarterSheet | null {
  return state.quarterSheets.find((s) => s.fiscalYear === fiscalYear && s.quarter === quarter) ?? null;
}

/**
 * 年次目標（到達状態）を書く。無ければ作り、空にしたら消す。
 * 変わらなければ状態をそのまま返す（保存し直しても更新日時を変えない）
 */
export function setAnnualGoal(state: AppState, fiscalYear: number, themeId: ThemeId, text: string, now: Date, newId: () => string): OpResult {
  const ye = checkYear(fiscalYear);
  if (ye) return ye;
  if (!isThemeId(themeId)) return fail("テーマが正しくありません");
  const t = readText(text, PLAN_FIELDS.goal);
  if (!t.ok) return t;
  const current = annualGoalFor(state, fiscalYear, themeId);
  if (t.value === "") {
    return current === null ? { ok: true, state } : { ok: true, state: { ...state, annualGoals: state.annualGoals.filter((g) => g !== current) } };
  }
  if (current !== null) {
    if (current.text === t.value) return { ok: true, state };
    const next: AnnualGoal = { ...current, text: t.value, updatedAt: stampFor(current, now) };
    return checkSize({ ...state, annualGoals: state.annualGoals.map((g) => (g === current ? next : g)) });
  }
  const ce = checkCount(state.annualGoals, "年次目標");
  if (ce) return ce;
  const at = now.toISOString();
  const goal: AnnualGoal = { id: newId(), createdAt: at, updatedAt: at, fiscalYear, themeId, text: t.value };
  return checkSize({ ...state, annualGoals: [...state.annualGoals, goal] });
}

/** 四半期シートを変える。無ければ空のシートを作ってから変える */
function updateSheet(
  state: AppState,
  fiscalYear: number,
  quarter: Quarter,
  now: Date,
  newId: () => string,
  change: (sheet: QuarterSheet) => QuarterSheet | Fail,
): OpResult {
  const ye = checkYear(fiscalYear);
  if (ye) return ye;
  if (!isQuarter(quarter)) return fail("四半期が正しくありません");
  const current = quarterSheetFor(state, fiscalYear, quarter);
  if (current === null) {
    const ce = checkCount(state.quarterSheets, "四半期シート");
    if (ce) return ce;
  }
  const at = now.toISOString();
  const before: QuarterSheet = current ?? { id: newId(), createdAt: at, updatedAt: at, fiscalYear, quarter, focusThemeIds: [], wontDo: "" };
  const changed = change(before);
  if ("ok" in changed) return changed;
  const same = changed.wontDo === before.wontDo && changed.focusThemeIds.join() === before.focusThemeIds.join();
  // 変わらないなら、空のシートも作らない
  if (same) return { ok: true, state };
  if (current === null) return checkSize({ ...state, quarterSheets: [...state.quarterSheets, changed] });
  const next = { ...changed, updatedAt: stampFor(current, now) };
  return checkSize({ ...state, quarterSheets: state.quarterSheets.map((s) => (s === current ? next : s)) });
}

/** 重点テーマを選ぶ・外す（選んだ順に並べる）。4つ目は拒否する */
export function toggleFocusTheme(state: AppState, fiscalYear: number, quarter: Quarter, themeId: ThemeId, now: Date, newId: () => string): OpResult {
  if (!isThemeId(themeId)) return fail("テーマが正しくありません");
  return updateSheet(state, fiscalYear, quarter, now, newId, (sheet) => {
    if (sheet.focusThemeIds.includes(themeId)) return { ...sheet, focusThemeIds: sheet.focusThemeIds.filter((t) => t !== themeId) };
    if (sheet.focusThemeIds.length >= FOCUS_MAX) return fail(`重点テーマは${FOCUS_MAX}つまでです。変えるときは、どれかを外してください`);
    return { ...sheet, focusThemeIds: [...sheet.focusThemeIds, themeId] };
  });
}

/** やらないことを書く（空欄でもよい） */
export function setWontDo(state: AppState, fiscalYear: number, quarter: Quarter, text: string, now: Date, newId: () => string): OpResult {
  const t = readText(text, PLAN_FIELDS.wontDo);
  if (!t.ok) return t;
  return updateSheet(state, fiscalYear, quarter, now, newId, (sheet) => ({ ...sheet, wontDo: t.value }));
}
