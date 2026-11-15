// 画面を確かめるための架空のデータ（計画 3章）。PRプレビューに読み込んで、ホーム・一覧・Android の行の高さを確かめる。
// 中身は架空の文言だけ（CLAUDE.md 8.3）
import { describe, expect, it } from "vitest";
import demo from "./__fixtures__/review-demo.json";
import { validateExport } from "./validate";

describe("画面の確かめ方の架空のデータ（review-demo.json）", () => {
  it("書き出した形のまま、検証に通る", () => {
    const v = validateExport(structuredClone(demo));
    expect(v.ok ? [] : v.errors).toEqual([]);
  });

  it("確かめたい形を含む：次のアクションが複数のプロジェクト、連絡待ちだけのプロジェクト、次のアクション20件以上、収集箱・いつか・多分・資料", () => {
    const s = demo.state;
    const todo = s.actions.filter((a) => a.status === "todo");
    const byProject = (id: string) => todo.filter((a) => a.projectId === id).length;
    expect(s.projects.some((p) => byProject(p.id) >= 2)).toBe(true);
    expect(s.projects.some((p) => byProject(p.id) === 0 && s.waitingFors.some((w) => w.projectId === p.id))).toBe(true);
    expect(todo.length).toBeGreaterThanOrEqual(20);
    expect(s.inbox.length).toBeGreaterThan(0);
    expect(s.someday.length).toBeGreaterThan(0);
    expect(s.references.length).toBeGreaterThan(0);
  });
});
