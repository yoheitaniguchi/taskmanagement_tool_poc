// テーマ名を、どの画面でも同じ小さなラベルの形で出す（IMP-12。docs/reviews/improvement-review-2026-11-09.md 5.4）。
// テーマが7件の決まった分類であることを形で示す。色は足さない（改善提案 Q1、企画書8章）
import type { ThemeId } from "../domain/themes";
import { themeLabel } from "../domain/themes";

export function ThemeLabel({ id }: { id: ThemeId }) {
  return <span className="theme-label">{themeLabel(id)}</span>;
}
