import { describe, expect, it } from "vitest";
import { clarifyHref, documentTitle, HOME, parseRoute, routeHref, SCREENS } from "./route";

const ID = "00000000-0000-4000-8000-000000000001";

describe("画面の切替と URL（docs/design.md 2.1、D14）", () => {
  it("決まった値の画面を出す。空はホーム", () => {
    expect(parseRoute("")).toEqual(HOME);
    expect(parseRoute("#/")).toEqual(HOME);
    expect(parseRoute("#/inbox")).toEqual({ screen: "inbox", projectId: null, clarifyStep: null });
    expect(parseRoute("#/roadmap")).toEqual({ screen: "roadmap", projectId: null, clarifyStep: null });
    for (const s of SCREENS) expect(parseRoute(routeHref(s.id)).screen).toBe(s.id);
  });

  it("[@security] 知らない値・読めない値・余計な階層はホーム", () => {
    for (const hash of ["#/unknown", "#/INBOX", "#/inbox/x", "#/%E0%A4%A", "#/projects/a/b", "#javascript:alert(1)", "#/__proto__", "#/constructor"]) {
      expect(parseRoute(hash)).toEqual(HOME);
    }
  });

  it("[@security] プロジェクトの詳細は UUID の形の id だけ受け付け、そうでなければ一覧にする", () => {
    expect(parseRoute(`#/projects/${ID}`)).toEqual({ screen: "projects", projectId: ID, clarifyStep: null });
    for (const bad of ["123", "<script>", "AAAAAAAA-0000-4000-8000-000000000001", `${ID}x`]) {
      expect(parseRoute(`#/projects/${encodeURIComponent(bad)}`)).toEqual({ screen: "projects", projectId: null, clarifyStep: null });
    }
    expect(routeHref("projects", ID)).toBe(`#/projects/${ID}`);
    expect(routeHref("projects", "../inbox")).toBe("#/projects");
  });

  it("[@security] ブラウザのタブの名前には画面の名前だけを入れる（利用者の文字を入れない）", () => {
    expect(documentTitle({ screen: "projects", projectId: ID, clarifyStep: null })).toBe("プロジェクト - タスク管理");
    expect(documentTitle(HOME)).toBe("ホーム - タスク管理");
  });

  it("1件ずつの明確化は、質問ごとに URL を持つ（スマホの「戻る」で前の質問に戻れる。D14）", () => {
    for (const step of [1, 2, 3] as const) expect(parseRoute(clarifyHref(step))).toEqual({ screen: "inbox", projectId: null, clarifyStep: step });
    expect(clarifyHref(1)).toBe("#/inbox/clarify");
    for (const bad of ["#/inbox/clarify/1", "#/inbox/clarify/4", "#/inbox/clarify/2/x", "#/next/clarify"]) expect(parseRoute(bad)).toEqual(HOME);
  });

  it("スマホの下部のタブバーは、ホーム・収集箱・次のアクション・プロジェクトの4つ（残りはメニュー）", () => {
    expect(SCREENS.filter((s) => s.phoneTab).map((s) => s.label)).toEqual(["ホーム", "収集箱", "次のアクション", "プロジェクト"]);
  });
});
