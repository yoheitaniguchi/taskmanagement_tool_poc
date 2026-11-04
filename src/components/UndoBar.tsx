// 「元に戻す」の帯（D1、docs/design.md 6.4）。
// 日常の操作は確認を出さず、直後にここで救う。次の操作をするか［×］で閉じるまで残す（時間で消さない）
interface Props {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoBar({ message, onUndo, onDismiss }: Props) {
  return (
    <div className="undo-bar" role="status">
      <span className="undo-bar__message">{message}</span>
      <button type="button" className="link-button undo-bar__undo" onClick={onUndo}>
        元に戻す
      </button>
      <button type="button" className="button--icon undo-bar__close" aria-label="閉じる" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
