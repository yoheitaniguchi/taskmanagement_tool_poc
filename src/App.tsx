// アプリの外枠（節目2）：共通の画面（収集の入力欄・書き出し・データのメニュー・受け渡しの状態）、画面の切替、各画面。
// 明確化と置き場の画面は、節目2の続きで足す（docs/plans/milestone-2.md 2章）
import { useMemo, useState } from "react";
import { PREVIEW_PR } from "./buildInfo";
import { AppHeader } from "./components/AppHeader";
import { CaptureBox } from "./components/CaptureBox";
import { NavTabs } from "./components/NavTabs";
import { ClearDialog } from "./components/ClearDialog";
import { DeviceNameDialog } from "./components/DeviceNameDialog";
import { ImportDialog } from "./components/ImportDialog";
import { StorageBanner } from "./components/StorageBanner";
import { capture } from "./domain/capture";
import { backupFileName } from "./domain/persistence";
import { counts } from "./domain/summaries";
import { downloadText } from "./files";
import { screenLabel } from "./route";
import { HomeScreen } from "./screens/HomeScreen";
import { InboxScreen } from "./screens/InboxScreen";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
import { usePersistedState } from "./state/usePersistedState";
import { useRoute } from "./state/useRoute";

type Dialog = null | "import" | "clear" | "rename" | "nameThenExport";

export default function App() {
  const store = usePersistedState();
  const route = useRoute();
  const [dialog, setDialog] = useState<Dialog>(null);
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

  const screen = (() => {
    switch (route.screen) {
      case "home":
        return <HomeScreen counts={c} showIntro={!store.meta.introDismissed} onDismissIntro={store.dismissIntro} />;
      case "inbox":
        return <InboxScreen items={state.inbox} now={now} />;
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
