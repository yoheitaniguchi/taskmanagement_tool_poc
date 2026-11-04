// 「このブラウザの保存データを消去」の確認（docs/design.md 6.3）。読み込みと同じく、書き出した後の変更があればその事実と、書き出す操作を置く
import { useState } from "react";
import { Modal } from "./Modal";
import { TransferWarning } from "./TransferWarning";
import { UnreadableWarning } from "./UnreadableWarning";

interface Props {
  changed: boolean;
  onExportCurrent: () => string | null;
  exportBlocked: string | null;
  /** 読めなかった保存データを書き出す（残っていなければ null） */
  onExportUnreadable: (() => void) | null;
  onClear: () => boolean;
  onClose: () => void;
}

export function ClearDialog({ changed, onExportCurrent, exportBlocked, onExportUnreadable, onClear, onClose }: Props) {
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  return (
    <Modal title="このブラウザの保存データを消去" onClose={onClose}>
      <p>
        このブラウザに保存したデータ（収集箱・置き場・プロジェクトなど）と、このブラウザの名前・書き出しの記録を消します。
        <strong>元に戻せません。</strong>書き出したJSONファイルは消えません。
      </p>
      {onExportUnreadable && <UnreadableWarning purpose="clear" onExport={onExportUnreadable} />}
      <TransferWarning changed={changed} exportedAt={exportedAt} exportBlocked={exportBlocked} onExport={() => setExportedAt(onExportCurrent())} />
      <div className="modal__actions">
        <button type="button" data-autofocus onClick={onClose}>
          やめる
        </button>
        <button
          type="button"
          className="button--danger"
          onClick={() => {
            if (onClear()) onClose();
          }}
        >
          消去する
        </button>
      </div>
    </Modal>
  );
}
