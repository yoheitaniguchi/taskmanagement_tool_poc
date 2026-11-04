// テーマ（7件固定。CLAUDE.md 5.1・5.3、docs/design.md 4.2）。
// 状態や JSON には持たず、コードの定数とする（追加・改名はしない。4.2）。並びは画面の表示順
export const THEMES = [
  { id: "work", label: "仕事" },
  { id: "startup", label: "起業" },
  { id: "health", label: "健康" },
  { id: "relationships", label: "人間関係" },
  { id: "finance", label: "家計" },
  { id: "hobby_learning", label: "趣味・学び" },
  { id: "other", label: "その他" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const THEME_IDS: ReadonlySet<string> = new Set(THEMES.map((t) => t.id));

/** 知らないテーマID（JSON に書かれた値など）を拒否するための型ガード */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.has(value);
}

export function themeLabel(id: ThemeId): string {
  return THEMES.find((t) => t.id === id)?.label ?? "";
}
