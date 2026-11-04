// ホーム（F08 の最小限。docs/design.md 3.2・3.10、docs/plans/milestone-2.md 2章）。
// 状態の表示だけを置き、結論・指示（「〜しましょう」「滞留しています」など）は出さない（CLAUDE.md 4.3）。
// 今の四半期と進行中のプロジェクトの表は、節目3で足す
import type { Counts } from "../domain/summaries";
import { clarifyHref, routeHref, type ScreenId } from "../route";

interface Props {
  counts: Counts;
  showIntro: boolean;
  onDismissIntro: () => void;
}

const OTHER_COUNTS: { key: keyof Counts; label: string; screen: ScreenId }[] = [
  { key: "nextActions", label: "次のアクション", screen: "next" },
  { key: "waiting", label: "連絡待ち", screen: "waiting" },
  { key: "activeProjects", label: "進行中のプロジェクト", screen: "projects" },
  { key: "someday", label: "いつか・多分", screen: "someday" },
  { key: "references", label: "資料", screen: "reference" },
];

export function HomeScreen({ counts, showIntro, onDismissIntro }: Props) {
  return (
    <>
      <h1 tabIndex={-1}>ホーム</h1>
      {showIntro && (
        // 初めて開いたときに1回だけ出す、保存の仕組みの説明（指示ではない。docs/design.md 3.10）
        <section className="intro" aria-label="保存の仕組み">
          <p>
            データはこのブラウザの中にだけ保存されます。別の端末で使うときや、ブラウザのデータを消すときに備えて、JSONを書き出して保存できます。
          </p>
          <button type="button" onClick={onDismissIntro}>
            閉じる
          </button>
        </section>
      )}
      <section aria-labelledby="home-inbox">
        <h2 id="home-inbox">収集箱</h2>
        <p className="home__count">
          未処理 <strong>{counts.inbox}</strong>件
        </p>
        {counts.inbox > 0 && (
          <a className="button button--primary" href={clarifyHref(1)}>
            明確化を始める
          </a>
        )}
      </section>
      <section aria-labelledby="home-others">
        <h2 id="home-others">置き場</h2>
        <ul className="home__counts">
          {OTHER_COUNTS.map((c) => (
            <li key={c.key}>
              <a href={routeHref(c.screen)}>{c.label}</a> {counts[c.key]}件
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
