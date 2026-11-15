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
import { capture } from "./domain/capture";
import { clarify, clarifyBulk, type BulkExit, type Decision } from "./domain/clarify";
import { addActionToProject, addWaitingToProject, completeItem, deleteItem, editItem, uncompleteItem } from "./domain/items";
import { moveItem } from "./domain/move";
import { setAnnualGoal, setWontDo, toggleFocusTheme } from "./domain/plan";
import { completeProject, createProject, deleteProject, editProject, placeProject, uncompleteProject } from "./domain/projects";
import { currentQuarter } from "./domain/fiscal";
import type { OpResult } from "./domain/types";
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

  /** 書き出す。書き出せたら日時を返す。端末名がまだ無ければ、先に名前を決める画面を出す */
  const exportNow = (): string | null => {
    if (store.meta.deviceName === null) {
      setDialog("nameThenExport");
      return null;
    }
    const out = store.prepareExport();
    if (!out) return null;
    downloadText(out.fileName, out.text);
    return out.at;
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

  /** 収集の入力欄を使えない理由（入れた内容が保存されないため。docs/design.md 6.3） */
  const captureBlocked = readOnly
    ? "このタブは読み取り専用です（別のタブで変更されたため）"
    : store.status.corrupt !== null && !store.status.recovered
      ? "保存データを読めなかったため、自動保存を止めています。上の帯の操作で直すと入れられます"
      : null;

  /** 収集箱に入れる。入れられなければ理由を返す */
  const onCapture = (text: string): string | null => {
    const at = new Date();
    const id = crypto.randomUUID();
    if (store.dispatch({ type: "capture", text, at: at.toISOString(), id })) return null;
    // 入れられなかった理由を、同じ関数で確かめ直して示す（読み取り専用になった直後など、関数の外の理由もある）
    const result = capture(state, text, at, () => id);
    return result.ok ? "このタブでは入れられません" : result.error;
  };

  /** 明確化・置き場の変更を使えない理由（収集と同じ。docs/design.md 6.3） */
  const changeBlocked = readOnly
    ? "このタブは読み取り専用です（別のタブで変更されたため）"
    : store.status.corrupt !== null && !store.status.recovered
      ? "保存データを読めなかったため、自動保存を止めています。上の帯の操作で直すと振り分けられます"
      : null;

  /** 1件ずつの明確化を確定する。できなければ理由を返す（プロジェクトは最初の一手と合わせて id を2つ使う） */
  const onClarify = (itemId: string, decision: Decision): string | null => {
    const at = new Date();
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    if (store.dispatch({ type: "clarify", itemId, decision, at: at.toISOString(), ids })) return null;
    let i = 0;
    const result = clarify(state, itemId, decision, at, () => ids[i++] ?? "");
    return result.ok ? "このタブでは振り分けられません" : result.error;
  };

  /** 一括振り分け。できなければ理由を返す */
  const onBulk = (itemIds: string[], exit: BulkExit): string | null => {
    const at = new Date();
    const ids = itemIds.map(() => crypto.randomUUID());
    if (store.dispatch({ type: "clarifyBulk", itemIds, exit, at: at.toISOString(), ids })) return null;
    let i = 0;
    const result = clarifyBulk(state, itemIds, exit, at, () => ids[i++] ?? "");
    return result.ok ? "このタブでは振り分けられません" : result.error;
  };

  /**
   * 操作を反映する。できなければ理由を返す（ドメインの関数で確かめ直す。読み取り専用になった直後など、関数の外の理由もある）
   */
  const run = (action: Parameters<typeof store.dispatch>[0], recheck: () => OpResult): string | null => {
    if (store.dispatch(action)) return null;
    const result = recheck();
    if (!result.ok) return result.error;
    // 変えるものが無かった（同じ四半期に置き直したなど）ときは、失敗ではない
    return result.state === state ? null : "このタブでは変更できません";
  };

  /** 置き場の一覧・プロジェクトの詳細の行で使う操作（docs/design.md 3.3） */
  const rowCtx: Omit<RowContext, "showProject"> = {
    state,
    projects: state.projects,
    now,
    disabledReason: changeBlocked,
    onEdit: (edit) => {
      const at = new Date();
      return run({ type: "editItem", edit, at: at.toISOString() }, () => editItem(state, edit, at));
    },
    onComplete: (ref) => {
      const at = new Date();
      return run({ type: "completeItem", ref, at: at.toISOString() }, () => completeItem(state, ref, at));
    },
    onUncomplete: (ref) => {
      const at = new Date();
      return run({ type: "uncompleteItem", ref, at: at.toISOString() }, () => uncompleteItem(state, ref, at));
    },
    onDelete: (ref) => run({ type: "deleteItem", ref }, () => deleteItem(state, ref)),
    onMove: (source, target, input) => {
      const at = new Date();
      return run({ type: "moveItem", source, target, input, at: at.toISOString() }, () => moveItem(state, source, target, input, at));
    },
  };

  /** プロジェクトそのものの操作（docs/design.md 3.6・4.4） */
  const projectHandlers: ProjectHandlers = {
    onEditProject: (id, input) => {
      const at = new Date();
      return run({ type: "editProject", id, input, at: at.toISOString() }, () => editProject(state, id, input, at));
    },
    onPlaceProject: (id, placement) => {
      const at = new Date();
      return run({ type: "placeProject", id, placement, at: at.toISOString() }, () => placeProject(state, id, placement, at));
    },
    onCompleteProject: (id) => {
      const at = new Date();
      return run({ type: "completeProject", id, at: at.toISOString() }, () => completeProject(state, id, at));
    },
    onUncompleteProject: (id) => {
      const at = new Date();
      return run({ type: "uncompleteProject", id, at: at.toISOString() }, () => uncompleteProject(state, id, at));
    },
    onDeleteProject: (id, policy) => {
      const at = new Date();
      return run({ type: "deleteProject", id, childPolicy: policy, at: at.toISOString() }, () => deleteProject(state, id, policy, at));
    },
    onAddAction: (projectId, text) => {
      const at = new Date();
      const id = crypto.randomUUID();
      return run({ type: "addActionToProject", projectId, text, at: at.toISOString(), id }, () => addActionToProject(state, projectId, text, at, () => id));
    },
    onAddWaiting: (projectId, input) => {
      const at = new Date();
      const id = crypto.randomUUID();
      return run({ type: "addWaitingToProject", projectId, input, at: at.toISOString(), id }, () => addWaitingToProject(state, projectId, input, at, () => id));
    },
  };

  /** 年次目標・四半期シートの操作（docs/design.md 3.7） */
  const planHandlers: PlanHandlers = {
    onSetGoal: (fiscalYear, themeId, text) => {
      const at = new Date();
      const id = crypto.randomUUID();
      return run({ type: "setAnnualGoal", fiscalYear, themeId, text, at: at.toISOString(), id }, () => setAnnualGoal(state, fiscalYear, themeId, text, at, () => id));
    },
    onToggleFocus: (fiscalYear, quarter, themeId) => {
      const at = new Date();
      const id = crypto.randomUUID();
      return run({ type: "toggleFocusTheme", fiscalYear, quarter, themeId, at: at.toISOString(), id }, () => toggleFocusTheme(state, fiscalYear, quarter, themeId, at, () => id));
    },
    onSetWontDo: (fiscalYear, quarter, text) => {
      const at = new Date();
      const id = crypto.randomUUID();
      return run({ type: "setWontDo", fiscalYear, quarter, text, at: at.toISOString(), id }, () => setWontDo(state, fiscalYear, quarter, text, at, () => id));
    },
    onPlaceProject: projectHandlers.onPlaceProject,
  };

  const onCreateProject = (input: Parameters<typeof createProject>[1], placement: Parameters<typeof createProject>[2]) => {
    const at = new Date();
    const id = crypto.randomUUID();
    const error = run({ type: "createProject", input, placement, at: at.toISOString(), id }, () => createProject(state, input, placement, at, () => id));
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
            onPlace={(id, placement, expectedThemeId) => {
              const at = new Date();
              return run({ type: "placeProject", id, placement, expectedThemeId, at: at.toISOString() }, () => placeProject(state, id, placement, at, expectedThemeId));
            }}
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
