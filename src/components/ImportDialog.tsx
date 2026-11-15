// JSON の読み込み（docs/design.md 6.2）。ファイルを検証してから、読み込むファイルとこのブラウザを並べて見せる。
// 読み込みは置き換えで取り消せないので、確認を出し、置き換える前に今のデータを書き出せるようにする（CLAUDE.md 8.2・8.5）
import { useRef, useState } from "react";
import { parseExportText, tooLargeMessage } from "../domain/persistence";
import { COUNT_LABELS, counts, type Counts } from "../domain/summaries";
import { importActions, type DeviceMeta } from "../domain/transfer";
import type { AppState, ExportFile } from "../domain/types";
import { LIMITS } from "../domain/validate";
import { formatDateTime } from "../labels";
import { Modal } from "./Modal";
import { TransferWarning } from "./TransferWarning";
import { UnreadableWarning } from "./UnreadableWarning";

interface Props {
  current: AppState;
  meta: DeviceMeta;
  changed: boolean;
  /** 今のデータを書き出す。書き出せたら、その日時とファイル名 */
  onExportCurrent: () => { at: string; fileName: string } | null;
  exportBlocked: string | null;
  /** 読めなかった保存データを書き出す（残っていなければ null） */
  onExportUnreadable: (() => void) | null;
  onImport: (file: ExportFile) => boolean;
  onClose: () => void;
}

const countText = (c: Counts) => COUNT_LABELS.map(([k, label]) => `${label} ${c[k]}`).join("・");

export function ImportDialog({ current, meta, changed, onExportCurrent, exportBlocked, onExportUnreadable, onImport, onClose }: Props) {
  const [errors, setErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<ExportFile | null>(null);
  const [exported, setExported] = useState<{ at: string; fileName: string } | null>(null);
  const exportedAt = exported?.at ?? null;
  const [failed, setFailed] = useState(false);
  // 読み込みの途中で別のファイルを選んだとき、古い結果で上書きしないための番号
  const selection = useRef(0);
  const now = new Date();
  // 書き出しと置き換えを2段に分ける（IMP-08）。ボタンの決め方は src/domain/transfer.ts の importActions
  const actions = importActions(changed, exportBlocked, exportedAt);
  // もう一度書き出して取り消されたときも、前に書き出した記録は残す（書き出せた事実は変わらないため）
  const exportCurrent = () => {
    const out = onExportCurrent();
    if (out) setExported(out);
  };

  const onFile = async (file: File | undefined) => {
    const mine = ++selection.current;
    setLoaded(null);
    setErrors([]);
    if (!file) return;
    // 大きすぎるファイルは読む前に断る（全体をメモリに読み込まないため。docs/design.md 4.7）
    if (file.size > LIMITS.importBytes) {
      setErrors([tooLargeMessage()]);
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      if (mine === selection.current) setErrors(["ファイルを読めませんでした"]);
      return;
    }
    const result = parseExportText(text);
    if (mine !== selection.current) return;
    if (result.ok) setLoaded(result.file);
    else setErrors(result.errors);
  };

  return (
    <Modal title="JSONを読み込む" onClose={onClose}>
      <p>このアプリで書き出したJSONファイルを選んでください。</p>
      <p>
        <label>
          ファイル{" "}
          <input type="file" accept="application/json,.json" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
      </p>

      {errors.length > 0 && (
        <div className="message--error" role="alert">
          <p>このファイルは読み込めません。今のデータは変わっていません。</p>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {loaded && (
        <>
          <p>
            <strong>今のデータは置き換えられ、元に戻せません。</strong>
          </p>
          <div className="table-scroll">
            <table>
              <caption className="visually-hidden">読み込むファイルと、このブラウザのデータ</caption>
              <thead>
                <tr>
                  <th scope="col"></th>
                  <th scope="col">読み込むファイル</th>
                  <th scope="col">このブラウザ（{meta.deviceName ?? "名前なし"}）</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">書き出し</th>
                  <td>
                    {loaded.deviceName} が {formatDateTime(loaded.exportedAt, now)} に書き出し
                  </td>
                  <td>最後に書き出した：{meta.lastExportedAt ? formatDateTime(meta.lastExportedAt, now) : "まだありません"}</td>
                </tr>
                <tr>
                  <th scope="row">最終更新</th>
                  <td>―</td>
                  <td>最後に変更した：{meta.lastChangedAt ? formatDateTime(meta.lastChangedAt, now) : "まだありません"}</td>
                </tr>
                <tr>
                  <th scope="row">件数</th>
                  <td>{countText(counts(loaded.state))}</td>
                  <td>{countText(counts(current))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {onExportUnreadable && <UnreadableWarning purpose="import" onExport={onExportUnreadable} />}
          <TransferWarning
            changed={changed}
            exportedAt={exportedAt}
            exportBlocked={exportBlocked}
            onExport={exportCurrent}
            exportInActions={actions.showExport}
            exportedFileName={exported?.fileName ?? null}
          />
          {actions.exportPrimary && <p className="hint">［今のデータを書き出す］を押すと、置き換えのボタンが［置き換える］に変わります。</p>}
          {exported !== null && (
            <p className="hint">
              画面の下か通知の欄に、このファイル名の「ダウンロード完了」が出たことを確かめてから、［置き換える］を押してください。保存の画面で取り消したときは、もう一度［今のデータを書き出す］を押してください。書き出しが保存し終えたかは、このアプリからは分かりません。
            </p>
          )}
        </>
      )}
      {failed && (
        <p className="message--error" role="alert">
          読み込めませんでした（このタブが読み取り専用になったなど）。今のデータは変わっていません。
        </p>
      )}

      <div className="modal__actions">
        <button type="button" data-autofocus onClick={onClose}>
          やめる
        </button>
        <button
          type="button"
          className="button--danger"
          disabled={loaded === null}
          onClick={() => {
            if (loaded && onImport(loaded)) onClose();
            else setFailed(true);
          }}
        >
          {loaded === null ? "置き換える" : actions.replaceLabel}
        </button>
        {/* 書き出した後も、同じ文言・同じ位置に残す（押した位置に［置き換える］が来ないように。transfer.ts の importActions） */}
        {loaded !== null && actions.showExport && (
          <button type="button" className={actions.exportPrimary ? "button--primary" : undefined} onClick={exportCurrent}>
            今のデータを書き出す
          </button>
        )}
      </div>
    </Modal>
  );
}
