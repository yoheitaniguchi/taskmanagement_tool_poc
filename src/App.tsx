// アプリの外枠（節目2の PR 1：初期構築）。
// 共通の画面（収集の入力欄・書き出し・受け渡しの状態）と各画面は、PR 2b〜5 で足す（docs/plans/milestone-2.md 2章）
import { PREVIEW_PR } from "./buildInfo";
import { ThemeToggle } from "./components/ThemeToggle";

export default function App() {
  return (
    <>
      {PREVIEW_PR !== null && (
        // PR プレビューは誰でも開けるうえ、マージ前のコードで動く。実データを入れないよう常に知らせる（CLAUDE.md 8.3、docs/design.md 3.1）
        <div className="banner banner--warn preview-banner" role="note">
          <p>プレビュー（PR #{PREVIEW_PR}）：実際のデータを入れないでください。保存先は本番と別です。</p>
        </div>
      )}
      <header className="app-header">
        <div className="app-header__row">
          <p className="app-header__title">
            <span className="app-header__logo" aria-hidden="true" />
            タスク管理
          </p>
          <div className="app-header__actions">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="app page">
        <h1>準備中</h1>
        <section>
          <p>このアプリは初期構築の段階です。収集箱・明確化・置き場の画面は、これから順に足していきます。</p>
          <p className="hint">まだ実際のデータを入れないでください（データの保存と書き出し・読み込みが入るまで）。</p>
        </section>
      </main>
    </>
  );
}
