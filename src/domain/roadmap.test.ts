import { describe, expect, it } from "vitest";
import demo from "./__fixtures__/roadmap-demo.json";
import { placeProject } from "./projects";
import { droppedProject, isProjectDrag, PROJECT_DRAG_TYPE, type DragData } from "./roadmap";
import { activeProjectsPlacedBefore, roadmapCells, unplacedProjects } from "./summaries";
import { validateExport } from "./validate";

/** 架空のデータ（D20。PRプレビューでも読み込んで確かめる） */
function demoState() {
  const v = validateExport(structuredClone(demo));
  if (!v.ok) throw new Error(v.errors.join("\n"));
  return v.file.state;
}
const NOW = new Date("2026-11-05T03:00:00.000Z");

function drag(values: Record<string, unknown>): DragData {
  return { types: Object.keys(values), getData: (t) => (Object.hasOwn(values, t) ? (values[t] as string) : "") };
}

describe("ロードマップの架空のデータ（D20）", () => {
  it("書き出した形のまま、検証に通る", () => {
    expect(validateExport(structuredClone(demo)).ok).toBe(true);
  });

  it("G5 を確かめる形を含む：1つのセルに5枚、名称が長いもの、置いていないもの、前の年度の進行中のもの、完了したもの", () => {
    const s = demoState();
    const cells = roadmapCells(s, 2026);
    expect(cells.work[3]).toHaveLength(5);
    expect(cells.work[3].some((p) => p.name.length > 30)).toBe(true);
    expect(unplacedProjects(s).length).toBeGreaterThanOrEqual(5);
    expect(activeProjectsPlacedBefore(s, 2026).length).toBeGreaterThanOrEqual(2);
    expect(s.projects.some((p) => p.status === "done")).toBe(true);
  });
});

describe("並べるだけの関数（docs/design.md 3.8）", () => {
  it("roadmapCells：その年度のプロジェクトを、テーマ × 四半期のセルに名前順で振り分ける。完了したものも含める（D8）", () => {
    const s = demoState();
    const cells = roadmapCells(s, 2026);
    const names = cells.work[3].map((p) => p.name);
    expect([...names].sort((a, b) => a.localeCompare(b, "ja"))).toEqual(names);
    expect(cells.work[3].some((p) => p.status === "done")).toBe(true);
    expect(cells.relationships[1]).toEqual([]);
    // 年度の境目：2025年度・2027年度に置いたものは入らない
    const all = Object.values(cells).flatMap((row) => Object.values(row).flat());
    expect(all.every((p) => p.placement?.fiscalYear === 2026)).toBe(true);
    expect(roadmapCells(s, 2027).work[1].map((p) => p.name)).toEqual(["架空の次の年度の仕事"]);
  });

  it("unplacedProjects：置いていない進行中のものだけ。テーマ順 → 名前順", () => {
    const list = unplacedProjects(demoState());
    expect(list.every((p) => p.placement === null && p.status === "active")).toBe(true);
    expect(list.map((p) => p.themeId)).toEqual(["work", "relationships", "finance", "hobby_learning", "other"]);
  });

  it("activeProjectsPlacedBefore：表示している年度より前に置いた、進行中のものだけ。置いた四半期の早い順", () => {
    const s = demoState();
    expect(activeProjectsPlacedBefore(s, 2026).map((p) => p.name)).toEqual(["架空の前年度の健康", "架空の前年度からの続き"]);
    expect(activeProjectsPlacedBefore(s, 2025)).toEqual([]);
    // 2027年度から見ると、2026年度に置いた進行中のものも入る（完了したものは入らない）
    expect(activeProjectsPlacedBefore(s, 2027).every((p) => p.status === "active")).toBe(true);
  });
});

describe("ドラッグで受け取る値の検証 @security（docs/plans/milestone-3.md 2.3）", () => {
  const s = demoState();
  const target = s.projects[0];

  it("このアプリの種類の値で、存在するプロジェクトの id のときだけ受け取る", () => {
    expect(droppedProject(s, drag({ [PROJECT_DRAG_TYPE]: target.id }))?.id).toBe(target.id);
    expect(isProjectDrag(drag({ [PROJECT_DRAG_TYPE]: target.id }))).toBe(true);
  });

  it("ほかのアプリから落とされた文字・URL・ファイルは無視する（text/plain に id があっても受け取らない）", () => {
    expect(droppedProject(s, drag({ "text/plain": target.id }))).toBeNull();
    expect(droppedProject(s, drag({ "text/uri-list": "https://example.com/" }))).toBeNull();
    expect(droppedProject(s, drag({ Files: "" }))).toBeNull();
    expect(isProjectDrag(drag({ "text/plain": target.id }))).toBe(false);
  });

  it("知らない id・空・長すぎる値・文字列でない値・読めない値は受け取らない", () => {
    expect(droppedProject(s, drag({ [PROJECT_DRAG_TYPE]: "00000000-0000-4000-8000-999999999999" }))).toBeNull();
    expect(droppedProject(s, drag({ [PROJECT_DRAG_TYPE]: "" }))).toBeNull();
    expect(droppedProject(s, drag({ [PROJECT_DRAG_TYPE]: target.id + "x".repeat(100) }))).toBeNull();
    expect(droppedProject(s, drag({ [PROJECT_DRAG_TYPE]: 1 as never }))).toBeNull();
    expect(droppedProject(s, drag({ [PROJECT_DRAG_TYPE]: "__proto__" }))).toBeNull();
    const throwing: DragData = { types: [PROJECT_DRAG_TYPE], getData: () => { throw new Error("読めない"); } };
    expect(droppedProject(s, throwing)).toBeNull();
  });

  it("移す先のテーマ・年度・四半期は落としたセルから取り、placeProject がテーマを変えない移動・範囲外の年度を拒否する", () => {
    // ほかのテーマの行に落とした
    const r1 = placeProject(s, target.id, { fiscalYear: 2026, quarter: 1 }, NOW, "health");
    expect(r1.ok ? "" : r1.error).toBe("ほかのテーマの行には移せません（テーマはプロジェクトの編集で変えてください）");
    // 同じテーマの行なら移せる
    const r2 = placeProject(s, target.id, { fiscalYear: 2026, quarter: 1 }, NOW, target.themeId);
    expect(r2.ok && r2.state.projects.find((p) => p.id === target.id)?.placement).toEqual({ fiscalYear: 2026, quarter: 1 });
    expect(placeProject(s, target.id, { fiscalYear: 2100, quarter: 1 }, NOW, target.themeId).ok).toBe(false);
    expect(placeProject(s, target.id, { fiscalYear: 2026, quarter: 5 as never }, NOW, target.themeId).ok).toBe(false);
  });
});
