// 保存の状態の帯（docs/design.md 3.1・6.3）。問題があるときだけ、共通の画面の下に消えない帯を出す。正常なときは何も出さない
import type { StorageStatus } from "../state/usePersistedState";

interface Props {
  status: StorageStatus;
  onImport: () => void;
  onExportUnreadable: () => void;
  onClear: () => void;
}

export function StorageBanner({ status, onImport, onExportUnreadable, onClear }: Props) {
  const corrupt = status.corrupt !== null && !status.recovered;
  if (!status.unavailable && !corrupt && !status.saveError && !status.readOnly) return null;
  return (
    <div className="banner banner--warn" role="alert">
      {status.unavailable && (
        <p>このブラウザでは保存領域を使えないため、自動保存できません。ページを閉じる前に、JSONを書き出してください。</p>
      )}
      {corrupt && (
        <>
          <p>
            保存データを読めませんでした。自動保存を止めています。
            {status.corrupt?.backedUp
              ? "元のデータは消さずに退避しました。"
              : "元のデータは退避できませんでした（容量の不足など）。読み込み・消去の前に、読めなかったデータを書き出してください。"}
          </p>
          <p className="banner__actions">
            <button type="button" onClick={onImport}>
              JSONを読み込む
            </button>
            {/* 退避の有無によらず、元のキーにある値をそのまま書き出す（退避は書けないことがあるため） */}
            <button type="button" onClick={onExportUnreadable}>
              読めなかったデータを書き出す
            </button>
            <button type="button" className="button--danger" onClick={onClear}>
              保存データを消去
            </button>
          </p>
        </>
      )}
      {status.saveError && <p>{status.saveError}</p>}
      {status.readOnly && (
        <p className="banner__actions">
          別のタブで変更されました。このタブは読み取り専用です。{" "}
          <button type="button" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </p>
      )}
    </div>
  );
}
