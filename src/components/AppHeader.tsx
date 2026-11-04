// 共通の画面の上部（docs/design.md 3.1）：書き出す、⋯（データのメニュー）、受け渡しの状態。
// 受け渡しの状態は事実だけを書き、「書き出しましょう」などの指示は出さない（CLAUDE.md 12.2）。
// 収集の入力欄と画面の切替は PR 3 で足す
import type { DeviceMeta } from "../domain/transfer";
import { formatChars, formatDateTime } from "../labels";
import { Icon } from "./Icon";
import { MenuButton } from "./MenuButton";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  meta: DeviceMeta;
  changed: boolean;
  readOnly: boolean;
  /** 今のデータを書き出せないときの理由（書き出せるなら null） */
  exportBlocked: string | null;
  hasBackup: boolean;
  usage: () => number;
  onExport: () => void;
  onImport: () => void;
  onExportBackup: () => void;
  onRename: () => void;
  onClear: () => void;
}

export function AppHeader({ meta, changed, readOnly, exportBlocked, hasBackup, usage, onExport, onImport, onExportBackup, onRename, onClear }: Props) {
  const now = new Date();
  return (
    <header className="app-header">
      <div className="app-header__row">
        <p className="app-header__title">
          <span className="app-header__logo" aria-hidden="true" />
          タスク管理
        </p>
        <nav className="app-header__menu" aria-label="データの保存">
          {/* 読み取り専用のタブ（古い内容を別の端末に渡さないため。docs/design.md 3.1）と、読めなかった保存データが残っている間（今のデータは空）は書き出さない */}
          <button type="button" className="button--primary" onClick={onExport} disabled={exportBlocked !== null} title={exportBlocked ?? undefined}>
            <Icon name="download" />
            <span className="app-header__export-label">書き出す</span>
          </button>
          <MenuButton label="データのメニュー">
            <button type="button" onClick={onImport} disabled={readOnly}>
              JSONを読み込む
            </button>
            {hasBackup && (
              <button type="button" onClick={onExportBackup}>
                退避したデータを書き出す
              </button>
            )}
            <button type="button" onClick={onRename} disabled={readOnly}>
              このブラウザの名前を変える
            </button>
            <div className="menu__section">
              <span>表示</span>
              <ThemeToggle />
            </div>
            <p className="menu__note">このアプリの保存データ：{formatChars(usage())}</p>
            <button type="button" className="button--danger" onClick={onClear} disabled={readOnly}>
              このブラウザの保存データを消去
            </button>
          </MenuButton>
        </nav>
      </div>
      <dl className="app-header__status">
        <div>
          <dt>このブラウザ</dt>
          <dd>{meta.deviceName ?? "名前なし"}</dd>
        </div>
        <div>
          <dt>最後に書き出した</dt>
          <dd>
            {meta.lastExportedAt ? formatDateTime(meta.lastExportedAt, now) : "まだありません"}
            {meta.lastExportedAt && changed ? "（書き出し後の変更あり）" : ""}
          </dd>
        </div>
        <div>
          <dt>最後に読み込んだ</dt>
          <dd>
            {meta.lastImport
              ? `${formatDateTime(meta.lastImport.at, now)}（${meta.lastImport.fromDevice} が ${formatDateTime(meta.lastImport.fromExportedAt, now)} に書き出したもの）`
              : "まだありません"}
          </dd>
        </div>
      </dl>
    </header>
  );
}
