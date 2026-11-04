// 読み込み・消去の確認画面に置く「最後に書き出した後の変更」の表示と、今のデータを書き出す操作（docs/design.md 6.2・6.3）。
// 書き出した後も確認画面は閉じず、表示を「書き出しました（20:16）」に変える
import { formatTime } from "../labels";

interface Props {
  changed: boolean;
  exportedAt: string | null;
  onExport: () => void;
  /** 書き出せないときの理由（書き出せるなら null） */
  exportBlocked: string | null;
}

export function TransferWarning({ changed, exportedAt, onExport, exportBlocked }: Props) {
  if (exportedAt !== null) {
    return (
      <p className="message--info" role="status">
        書き出しました（{formatTime(exportedAt)}）
      </p>
    );
  }
  if (!changed) return null;
  return (
    <div className="message--warn">
      <p>
        <span aria-hidden="true">⚠ </span>最後に書き出した後に、このブラウザで変更があります
      </p>
      <button type="button" onClick={onExport} disabled={exportBlocked !== null} aria-describedby={exportBlocked ? "transfer-blocked" : undefined}>
        今のデータを書き出す
      </button>
      {exportBlocked && (
        <p id="transfer-blocked" className="hint">
          {exportBlocked}
        </p>
      )}
    </div>
  );
}
