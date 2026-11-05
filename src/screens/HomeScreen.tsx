// ホーム（F08 の最小限。docs/design.md 3.2・3.10、docs/plans/milestone-2.md 2章）。
// 状態の表示だけを置き、結論・指示（「〜しましょう」「滞留しています」など）は出さない（CLAUDE.md 4.3）。
// 今の四半期の欄は、節目3の PR 8 で足す
import { quarterLabel } from "../domain/fiscal";
import type { Counts, ProjectSummary } from "../domain/summaries";
import { themeLabel } from "../domain/themes";
import { clarifyHref, routeHref, type ScreenId } from "../route";

interface Props {
  counts: Counts;
  /** 進行中のプロジェクト（テーマの表示順 → 名称順で並べたもの） */
  projects: ProjectSummary[];
  showIntro: boolean;
  onDismissIntro: () => void;
}

const OTHER_COUNTS: { key: keyof Counts; label: string; screen: ScreenId }[] = [
  { key: "nextActions", label: "次のアクション", screen: "next" },
  { key: "waiting", label: "連絡待ち", screen: "waiting" },
  { key: "someday", label: "いつか・多分", screen: "someday" },
  { key: "references", label: "資料", screen: "reference" },
];

export function HomeScreen({ counts, projects, showIntro, onDismissIntro }: Props) {
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
      <section aria-labelledby="home-projects">
        <h2 id="home-projects">
          進行中のプロジェクト <strong>{projects.length}</strong>件
        </h2>
        {projects.length > 0 && (
          // 件数は数字で出すだけで、0件を強調しない（CLAUDE.md 4.3、docs/design.md 3.2）
          <table className="project-table">
            <thead>
              <tr>
                <th scope="col">名称</th>
                <th scope="col">テーマ</th>
                <th scope="col">置いた四半期</th>
                <th scope="col">次のアクション</th>
                <th scope="col">連絡待ち</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(({ project: p, nextActions, waiting }) => (
                <tr key={p.id}>
                  <th scope="row" className="project-table__name">
                    <a href={routeHref("projects", p.id)}>{p.name}</a>
                  </th>
                  <td data-label="テーマ">{themeLabel(p.themeId)}</td>
                  <td data-label="置いた四半期">{p.placement ? quarterLabel(p.placement.fiscalYear, p.placement.quarter) : "置いていない"}</td>
                  <td data-label="次のアクション">{nextActions}件</td>
                  <td data-label="連絡待ち">{waiting}件</td>
                </tr>
              ))}
            </tbody>
          </table>
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
