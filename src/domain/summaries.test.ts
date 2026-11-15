// プロジェクトの一覧の「次のアクション（先頭）」（IMP-01。docs/design.md 3.2・3.6）。
// 並びの先頭を出すだけで、どれを先にやるべきかの判定や、0件の強調はしない（CLAUDE.md 4.3）
import { describe, expect, it } from "vitest";
import { projectSummaries } from "./summaries";
import { emptyState, type Action, type AppState, type Project, type WaitingFor } from "./types";
import { validateState } from "./validate";

const T0 = "2026-11-01T00:00:00.000Z";
const T1 = "2026-11-10T00:00:00.000Z";
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(800000 + ++seq).padStart(12, "0")}`;
const base = (at = T0) => ({ id: uuid(), createdAt: at, updatedAt: at, capturedAt: at, movedAt: null });

function project(name: string): Project {
  return { ...base(), capturedAt: null, name, outcome: "架空の成果", themeId: "work", placement: null, status: "active", completedAt: null, note: "" };
}
function action(text: string, projectId: string | null, over: Partial<Action> = {}): Action {
  const done = over.status === "done";
  return { ...base(), text, projectId, themeId: null, status: "todo", completedAt: done ? T0 : null, note: "", ...over };
}
function waiting(projectId: string): WaitingFor {
  return { ...base(), text: "架空の連絡待ち", party: "架空の相手", requestedOn: "2026-11-01", projectId, status: "waiting", completedAt: null, note: "" };
}

function firstOf(state: AppState, p: Project): string | null {
  expect(validateState(state).ok).toBe(true);
  const s = projectSummaries(state).find((x) => x.project.id === p.id);
  return s ? s.firstNextAction : null;
}

describe("次のアクション（先頭）（IMP-01。projectSummaries の firstNextAction）", () => {
  it("未着手が複数あるときは、並び（配列の順）の先頭の内容", () => {
    const p = project("架空のA");
    const state = { ...emptyState(), projects: [p], actions: [action("一つ目", p.id), action("二つ目", p.id)] };
    expect(firstOf(state, p)).toBe("一つ目");
  });

  it("完了したものだけなら null（完了したものは先頭にしない）", () => {
    const p = project("架空のA");
    const state = { ...emptyState(), projects: [p], actions: [action("済んだ", p.id, { status: "done" })] };
    expect(firstOf(state, p)).toBeNull();
  });

  it("完了したものの後ろの未着手を先頭にする", () => {
    const p = project("架空のA");
    const state = { ...emptyState(), projects: [p], actions: [action("済んだ", p.id, { status: "done" }), action("残り", p.id)] };
    expect(firstOf(state, p)).toBe("残り");
  });

  it("単独のアクションは数えない", () => {
    const p = project("架空のA");
    const state = { ...emptyState(), projects: [p], actions: [action("単独", null), action("属する", p.id)] };
    expect(firstOf(state, p)).toBe("属する");
  });

  it("別のプロジェクトのものを拾わない", () => {
    const p = project("架空のA");
    const q = project("架空のB");
    const state = { ...emptyState(), projects: [p, q], actions: [action("Bの一手", q.id), action("Aの一手", p.id)] };
    expect(firstOf(state, p)).toBe("Aの一手");
    expect(firstOf(state, q)).toBe("Bの一手");
  });

  it("後から移して足したものは、作成日時が古くても先頭にならない（配列の末尾に入るため）", () => {
    const p = project("架空のA");
    const moved = { ...action("移したもの", p.id), createdAt: T0, updatedAt: T1, capturedAt: T0, movedAt: T1 };
    const later = { ...action("先にあった", p.id), createdAt: T1, updatedAt: T1, capturedAt: T1 };
    const state = { ...emptyState(), projects: [p], actions: [later, moved] };
    expect(firstOf(state, p)).toBe("先にあった");
  });

  it("連絡待ちだけなら null（連絡待ちは件数の列で示す）", () => {
    const p = project("架空のA");
    const state = { ...emptyState(), projects: [p], waitingFors: [waiting(p.id)] };
    expect(firstOf(state, p)).toBeNull();
  });
});
