// アプリの外枠：共通の画面（収集の入力欄・書き出し・データのメニュー・受け渡しの状態）、画面の切替、各画面。
import { useEffect, useMemo, useState } from "react";
import { PREVIEW_PR } from "./buildInfo";
import { AppHeader } from "./components/AppHeader";
import { CaptureBox } from "./components/CaptureBox";
import { NavTabs } from "./components/NavTabs";
import { ClearDialog } from "./components/ClearDialog";
import { DeviceNameDialog } from "./components/DeviceNameDialog";
import { ImportDialog } from "./components/ImportDialog";
import { StorageBanner } from "./components/StorageBanner";
import { UndoBar } from "./components/UndoBar";
import type { BulkExit, Decision } from "./domain/clarify";
import type { createProject } from "./domain/projects";
import { currentQuarter } from "./domain/fiscal";
import { operate, type Operation } from "./domain/reducer";
import type { RowContext } from "./components/ItemRows";
import { backupFileName } from "./domain/persistence";
import { counts, projectSummaries, quarterOverview, sortProjects } from "./domain/summaries";
import { downloadText } from "./files";
import { screenLabel } from "./route";
import { HomeScreen } from "./screens/HomeScreen";
import { ClarifyFlow } from "./screens/ClarifyFlow";
import { InboxScreen } from "./screens/InboxScreen";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
import { PlaceListScreen } from "./screens/PlaceListScreen";
import { PlanScreen, type PlanHandlers } from "./screens/PlanScreen";
import { RoadmapScreen } from "./screens/RoadmapScreen";
import { ProjectDetailScreen, type ProjectHandlers } from "./screens/ProjectDetailScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { usePersistedState } from "./state/usePersistedState";
import { useRoute } from "./state/useRoute";

type Dialog = null | "import" | "clear" | "rename" | "nameThenExport";

export default function App() {
  const store = usePersistedState();
  const route = useRoute();
  const [dialog, setDialog] = useState<Dialog>(null);
  // 年次目標・四半期シートで表示する年度（URLには持たない。null は今の年度）。画面を離れたら今の年度に戻す
  // （プロジェクトの詳細から、置いた年度を渡して開くときだけ使う。docs/plans/milestone-3.md 2.2）
  const [planYear, setPlanYear] = useState<number | null>(null);
  const [prevScreen, setPrevScreen] = useState(route.screen);
  useEffect(() => {
    // 画面のどこにファイルやリンクを落としても、ブラウザがそれを開いてアプリから離れないようにする（docs/design.md 3.8）。
    // 入力欄に文字を落とすことはできるよう、入力欄の上では止めない。ロードマップのセルは自分で受け取る
    // ファイルは入力欄の上でも止める（ブラウザによっては、入力欄に落としたファイルも開いてしまうため）
    const editable = (t: EventTarget | null) => t instanceof HTMLElement && t.closest("input, textarea, [contenteditable='true']") !== null;
    const hasFiles = (e: globalThis.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onOver = (e: globalThis.DragEvent) => {
      if (e.defaultPrevented || (editable(e.target) && !hasFiles(e))) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    };
    const onDrop = (e: globalThis.DragEvent) => {
      if (!editable(e.target) || hasFiles(e)) e.preventDefault();
    };
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
  if (prevScreen !== route.screen) {
    setPrevScreen(route.screen);
    if (prevScreen === "plan") setPlanYear(null);
  }
  const readOnly = store.status.readOnly;
  // 退避は起動時と消去のときにしか変わらない（毎回の描画で大きな値を読まないため）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hasBackup = useMemo(() => store.readCorruptBackup() !== null, [store.status.recovered]);
  /** 今のデータを書き出せないときの理由。端末名が無いのは、確認画面の中から名前を付けられないので理由に含める */
  const dialogExportBlocked = store.exportBlocked ?? (store.meta.deviceName === null ? "書き出すには、先に ⋯ の［このブラウザの名前を変える］で名前を付けてください" : null);

  /** 書き出す。書き出せたら日時とファイル名を返す。端末名がまだ無ければ、先に名前を決める画面を出す */
  const exportNow = (): { at: string; fileName: string } | null => {
    if (store.meta.deviceName === null) {
      setDialog("nameThenExport");
      return null;
    }
    const out = store.prepareExport();
    if (!out) return null;
    downloadText(out.fileName, out.text);
    return { at: out.at, fileName: out.fileName };
  };

  const exportBackup = () => {
    const text = store.readCorruptBackup();
    if (text !== null) downloadText(backupFileName(new Date()), text);
  };

  /** 起動時に読めなかった保存データを、そのまま書き出す（回復した後は無い） */
  const exportUnreadable = () => {
    const text = store.readUnreadable();
    if (text !== null) downloadText(backupFileName(new Date()), text);
  };
  const unreadableExport = store.status.corrupt !== null && !store.status.recovered ? exportUnreadable : null;

  const state = store.root.state;
  const c = counts(state);
  const now = new Date();

  /** 収集・明確化・置き場の変更を使えない理由（入れた内容が保存されないため。docs/design.md 6.3）。verb は「入れられます」など */
  const blockedReason = (verb: string): string | null =>
    readOnly
      ? "このタブは読み取り専用です（別のタブで変更されたため）"
      : store.status.corrupt !== null && !store.status.recovered
        ? `保存データを読めなかったため、自動保存を止めています。下の帯の操作で直すと${verb}`
        : null;
  const captureBlocked = blockedReason("入れられます");
  const changeBlocked = blockedReason("振り分けられます");

  /** 今の時刻（ISO 8601）。操作に入れて渡す（reducer を純粋に保つため） */
  const stamp = () => new Date().toISOString();

  /**
   * 操作を反映する。できなければ理由を返す。理由は、反映に使うのと同じ対応（operate）で確かめ直して得る
   * （読み取り専用になった直後など、ドメインの関数の外の理由なら refused）。変えるものが無かった（同じ四半期に置き直したなど）ときは、失敗ではない
   */
  const run = (op: Operation, refused = "このタブでは変更できません"): string | null => {
    if (store.dispatch(op)) return null;
    const outcome = operate(state, op);
    if (outcome === null) return refused;
    if (!outcome.result.ok) return outcome.result.error;
    return outcome.result.state === state ? null : refused;
  };

  /** 収集箱に入れる。入れられなければ理由を返す */
  const onCapture = (text: string): string | null =>
    run({ type: "capture", text, at: stamp(), id: crypto.randomUUID() }, "このタブでは入れられません");

  /** 1件ずつの明確化を確定する。できなければ理由を返す（プロジェクトは最初の一手と合わせて id を2つ使う） */
  const onClarify = (itemId: string, decision: Decision): string | null =>
    run({ type: "clarify", itemId, decision, at: stamp(), ids: [crypto.randomUUID(), crypto.randomUUID()] }, "このタブでは振り分けられません");

  /** 一括振り分け。できなければ理由を返す */
  const onBulk = (itemIds: string[], exit: BulkExit): string | null =>
    run({ type: "clarifyBulk", itemIds, exit, at: stamp(), ids: itemIds.map(() => crypto.randomUUID()) }, "このタブでは振り分けられません");

  /** 置き場の一覧・プロジェクトの詳細の行で使う操作（docs/design.md 3.3） */
  const rowCtx: Omit<RowContext, "showProject"> = {
    state,
    projects: state.projects,
    now,
    disabledReason: changeBlocked,
    onEdit: (edit) => run({ type: "editItem", edit, at: stamp() }),
    onComplete: (ref) => run({ type: "completeItem", ref, at: stamp() }),
    onUncomplete: (ref) => run({ type: "uncompleteItem", ref, at: stamp() }),
    onDelete: (ref) => run({ type: "deleteItem", ref }),
    onMove: (source, target, input) => run({ type: "moveItem", source, target, input, at: stamp() }),
  };

  /** プロジェクトそのものの操作（docs/design.md 3.6・4.4） */
  const projectHandlers: ProjectHandlers = {
    onEditProject: (id, input) => run({ type: "editProject", id, input, at: stamp() }),
    onPlaceProject: (id, placement) => run({ type: "placeProject", id, placement, at: stamp() }),
    onCompleteProject: (id) => run({ type: "completeProject", id, at: stamp() }),
    onUncompleteProject: (id) => run({ type: "uncompleteProject", id, at: stamp() }),
    onDeleteProject: (id, policy) => run({ type: "deleteProject", id, childPolicy: policy, at: stamp() }),
    onAddAction: (projectId, text) => run({ type: "addActionToProject", projectId, text, at: stamp(), id: crypto.randomUUID() }),
    onAddWaiting: (projectId, input) => run({ type: "addWaitingToProject", projectId, input, at: stamp(), id: crypto.randomUUID() }),
  };

  /** 年次目標・四半期シートの操作（docs/design.md 3.7） */
  const planHandlers: PlanHandlers = {
    onSetGoal: (fiscalYear, themeId, text) => run({ type: "setAnnualGoal", fiscalYear, themeId, text, at: stamp(), id: crypto.randomUUID() }),
    onToggleFocus: (fiscalYear, quarter, themeId) => run({ type: "toggleFocusTheme", fiscalYear, quarter, themeId, at: stamp(), id: crypto.randomUUID() }),
    onSetWontDo: (fiscalYear, quarter, text) => run({ type: "setWontDo", fiscalYear, quarter, text, at: stamp(), id: crypto.randomUUID() }),
    onPlaceProject: projectHandlers.onPlaceProject,
  };

  const onCreateProject = (input: Parameters<typeof createProject>[1], placement: Parameters<typeof createProject>[2]) => {
    const id = crypto.randomUUID();
    const error = run({ type: "createProject", input, placement, at: stamp(), id });
    return error === null ? { id } : { error };
  };

  const undo = store.root.undo;
  const onUndo = () => {
    store.dispatch({ type: "undo" });
    // 帯が消えるので、フォーカスを画面の見出し（明確化なら質問）に移す
    (document.querySelector<HTMLElement>("main [data-route-focus]") ?? document.querySelector<HTMLElement>("main h1"))?.focus();
  };

  const screen = (() => {
    switch (route.screen) {
      case "home":
        return (
          <HomeScreen
            counts={c}
            projects={sortProjects(
              projectSummaries(state).filter((x) => x.project.status === "active"),
              "theme",
            )}
            quarter={(() => {
              const q = currentQuarter(now);
              return quarterOverview(state, q.fiscalYear, q.quarter);
            })()}
            now={now}
            showIntro={!store.meta.introDismissed}
            onDismissIntro={store.dismissIntro}
          />
        );
      case "inbox":
        return route.clarifyStep !== null ? (
          <ClarifyFlow
            items={state.inbox}
            projects={state.projects}
            step={route.clarifyStep}
            now={now}
            disabledReason={changeBlocked}
            onClarify={onClarify}
          />
        ) : (
          <InboxScreen items={state.inbox} now={now} disabledReason={changeBlocked} onBulk={onBulk} />
        );
      case "next":
        return <PlaceListScreen kind="action" state={state} ctx={rowCtx} />;
      case "waiting":
        return <PlaceListScreen kind="waiting" state={state} ctx={rowCtx} />;
      case "someday":
        return <PlaceListScreen kind="someday" state={state} ctx={rowCtx} />;
      case "reference":
        return <PlaceListScreen kind="reference" state={state} ctx={rowCtx} />;
      case "projects": {
        // id が無い（削除した・別の端末のURL）ときは一覧を出す（D14）
        const project = route.projectId === null ? undefined : state.projects.find((p) => p.id === route.projectId);
        return project ? (
          <ProjectDetailScreen key={project.id} project={project} state={state} ctx={rowCtx} handlers={projectHandlers} onOpenPlan={setPlanYear} />
        ) : (
          <ProjectsScreen state={state} now={now} disabledReason={changeBlocked} onCreate={onCreateProject} />
        );
      }
      case "plan":
        return (
          <PlanScreen
            state={state}
            now={now}
            fiscalYear={planYear ?? currentQuarter(now).fiscalYear}
            onChangeYear={setPlanYear}
            disabledReason={changeBlocked}
            handlers={planHandlers}
          />
        );
      case "roadmap":
        return (
          <RoadmapScreen
            state={state}
            now={now}
            disabledReason={changeBlocked}
            onPlace={(id, placement, expectedThemeId) => run({ type: "placeProject", id, placement, expectedThemeId, at: stamp() })}
          />
        );
      default:
        return <PlaceholderScreen title={screenLabel(route.screen)} />;
    }
  })();

  return (
    <>
      {PREVIEW_PR !== null && (
        // PR プレビューは誰でも開けるうえ、マージ前のコードで動く。実データを入れないよう常に知らせる（CLAUDE.md 8.3、docs/design.md 3.1）
        <div className="banner banner--warn preview-banner" role="note">
          <p>プレビュー（PR #{PREVIEW_PR}）：実際のデータを入れないでください。保存先は本番と別です。</p>
        </div>
      )}
      <AppHeader
        capture={<CaptureBox inboxCount={c.inbox} disabledReason={captureBlocked} onCapture={onCapture} />}
        meta={store.meta}
        changed={store.changed}
        readOnly={readOnly}
        exportBlocked={store.exportBlocked}
        hasBackup={hasBackup}
        usage={store.storageUsage}
        persistence={store.persistence}
        onExport={() => void exportNow()}
        onImport={() => setDialog("import")}
        onExportBackup={exportBackup}
        onRename={() => setDialog("rename")}
        onClear={() => setDialog("clear")}
      />
      <StorageBanner
        status={store.status}
        onImport={() => setDialog("import")}
        onExportUnreadable={exportUnreadable}
        onClear={() => setDialog("clear")}
      />
      <NavTabs current={route.screen} inboxCount={c.inbox} />
      <main className="app page">{screen}</main>
      {undo !== null && <UndoBar message={undo.message} onUndo={onUndo} onDismiss={() => store.dispatch({ type: "dismissUndo" })} />}

      {dialog === "import" && (
        <ImportDialog
          current={store.root.state}
          meta={store.meta}
          changed={store.changed}
          exportBlocked={dialogExportBlocked}
          onExportUnreadable={unreadableExport}
          onExportCurrent={exportNow}
          onImport={store.importFile}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "clear" && (
        <ClearDialog
          changed={store.changed}
          exportBlocked={dialogExportBlocked}
          onExportUnreadable={unreadableExport}
          onExportCurrent={exportNow}
          onClear={store.clearSavedData}
          onClose={() => setDialog(null)}
        />
      )}
      {(dialog === "rename" || dialog === "nameThenExport") && (
        <DeviceNameDialog
          current={store.meta.deviceName}
          purpose={dialog === "rename" ? "rename" : "export"}
          onClose={() => setDialog(null)}
          onDecide={(name) => {
            const thenExport = dialog === "nameThenExport";
            setDialog(null);
            if (!store.setDeviceName(name) || !thenExport) return;
            // 名前を決めた直後は、まだ画面の値に反映されていないので、決めた名前で書き出す
            const out = store.prepareExport(name);
            if (out) downloadText(out.fileName, out.text);
          }}
        />
      )}
    </>
  );
}
