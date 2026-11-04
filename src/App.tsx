// アプリの外枠（節目2）。保存と受け渡し（PR 2b）までを置く。
// 収集の入力欄・画面の切替・各画面は PR 3〜5 で足す（docs/plans/milestone-2.md 2章）
import { useMemo, useState } from "react";
import { PREVIEW_PR } from "./buildInfo";
import { AppHeader } from "./components/AppHeader";
import { ClearDialog } from "./components/ClearDialog";
import { DeviceNameDialog } from "./components/DeviceNameDialog";
import { ImportDialog } from "./components/ImportDialog";
import { StorageBanner } from "./components/StorageBanner";
import { backupFileName } from "./domain/persistence";
import { COUNT_LABELS, counts } from "./domain/summaries";
import { downloadText } from "./files";
import { usePersistedState } from "./state/usePersistedState";

type Dialog = null | "import" | "clear" | "rename" | "nameThenExport";

export default function App() {
  const store = usePersistedState();
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

  const c = counts(store.root.state);

  return (
    <>
      {PREVIEW_PR !== null && (
        // PR プレビューは誰でも開けるうえ、マージ前のコードで動く。実データを入れないよう常に知らせる（CLAUDE.md 8.3、docs/design.md 3.1）
        <div className="banner banner--warn preview-banner" role="note">
          <p>プレビュー（PR #{PREVIEW_PR}）：実際のデータを入れないでください。保存先は本番と別です。</p>
        </div>
      )}
      <AppHeader
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
      <main className="app page">
        <h1 tabIndex={-1}>準備中</h1>
        <section>
          <p>収集箱・明確化・置き場の画面は、これから順に足していきます。今は、データの保存と、JSONの書き出し・読み込みだけが動きます。</p>
          <p className="hint">
            今のデータ：{COUNT_LABELS.map(([k, label]) => `${label} ${c[k]}`).join("・")}
          </p>
        </section>
      </main>

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
