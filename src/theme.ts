// 表示の切替（ライト・ダーク。既存PoCから移したもの。docs/design.md 3.1・6.1）。業務データではないため、
// 状態（AppState）やJSONの書き出しには含めない。保存は src/domain/persistence.ts を通す（「このブラウザの保存データを消去」で一緒に消える）
import { readItem, storageKey, writeItem } from "./domain/persistence";

export type ThemePreference = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_KEY = storageKey("theme");

export const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "system", label: "端末に合わせる" },
  { id: "light", label: "ライト" },
  { id: "dark", label: "ダーク" },
];

/** 保存値を検証する。知らない値は「端末に合わせる」として扱う（同じオリジンのほかのアプリからも書けるため。docs/design.md 6.1） */
export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(pref: ThemePreference, systemDark: boolean): Theme {
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

const darkQuery = (): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function readThemePreference(): ThemePreference {
  return parseThemePreference(readItem("theme"));
}

/** 保存できなくても、この画面の表示は切り替える（設定は再読み込みで元に戻る） */
export function writeThemePreference(pref: ThemePreference): void {
  writeItem("theme", pref === "system" ? null : pref);
}

/** 画面にテーマを当てる（<html data-theme>）。CSS は data-theme の値で色を切り替える */
export function applyTheme(pref: ThemePreference): Theme {
  const theme = resolveTheme(pref, darkQuery()?.matches ?? false);
  document.documentElement.dataset.theme = theme;
  return theme;
}

/** 「端末に合わせる」のとき、端末の設定の変化に追従する。解除する関数を返す */
export function watchSystemTheme(onChange: () => void): () => void {
  const q = darkQuery();
  if (!q) return () => {};
  q.addEventListener("change", onChange);
  return () => q.removeEventListener("change", onChange);
}
