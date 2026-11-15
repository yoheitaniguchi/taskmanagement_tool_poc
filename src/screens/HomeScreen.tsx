// ホーム（F08 の最小限。docs/design.md 3.2・3.10、docs/plans/milestone-2.md 2章）。
// 状態の表示だけを置き、結論・指示（「〜しましょう」「滞留しています」など）は出さない（CLAUDE.md 4.3）。
// 並びは、件数の小さなまとまり（収集箱 → 置き場 → 今の四半期）を先に、長いプロジェクトの表を最後にする（IMP-02。データが増えても最初の画面で全体の件数が分かるように）
import { quarterLabel, quarterShortLabel } from "../domain/fiscal";
import type { Counts, ProjectSummary, QuarterOverview } from "../domain/summaries";
import { FirstNextAction } from "../components/FirstNextAction";
import { ThemeLabel } from "../components/ThemeLabel";
import { clarifyHref, routeHref, type ScreenId } from "../route";

interface Props {
  counts: Counts;
  /** 進行中のプロジェクト（テーマの表示順 → 名称順で並べたもの） */
  projects: ProjectSummary[];
  /** 今の四半期（重点テーマと、置いたプロジェクトの件数） */
  quarter: QuarterOverview;
  now: Date;
  showIntro: boolean;
  onDismissIntro: () => void;
}

const OTHER_COUNTS: { key: keyof Counts; label: string; screen: ScreenId }[] = [
  { key: "nextActions", label: "次のアクション", screen: "next" },
  { key: "waiting", label: "連絡待ち", screen: "waiting" },
  { key: "someday", label: "いつか・多分", screen: "someday" },
  { key: "references", label: "資料", screen: "reference" },
];

export function HomeScreen({ counts, projects, quarter, now, showIntro, onDismissIntro }: Props) {
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
        {/* 件数を小さな枠で横に並べる。0件の枠も同じ見た目（強調しない。CLAUDE.md 4.3） */}
        <ul className="home__counts">
          {OTHER_COUNTS.map((c) => (
            <li key={c.key}>
              <a className="home__count-box" href={routeHref(c.screen)}>
                <span className="home__count-label">{c.label}</span>
                <span>
                  <strong>{counts[c.key]}</strong>件
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="home-quarter">
        <h2 id="home-quarter">今の四半期</h2>
        <p>{quarterLabel(quarter.fiscalYear, quarter.quarter)}</p>
        <p>
          重点テーマ：
          {quarter.focusThemeIds.length === 0
            ? "未設定"
            : quarter.focusThemeIds.map((id, i) => (
                <span key={id}>
                  {i > 0 && " "}
                  <ThemeLabel id={id} />
                </span>
              ))}
        </p>
        <p>
          主要プロジェクト <strong>{quarter.projects.length}</strong>件（うち完了 {quarter.doneCount}件）
        </p>
        <a href={routeHref("plan")}>四半期シートを開く</a>
      </section>
      <section aria-labelledby="home-projects">
        <h2 id="home-projects">
          進行中のプロジェクト <strong>{projects.length}</strong>件
        </h2>
        {projects.length > 0 && (
          // 件数は数字で出すだけで、0件を強調しない（CLAUDE.md 4.3、docs/design.md 3.2）
          <table className="project-table project-table--compact">
            <thead>
              <tr>
                <th scope="col">名称</th>
                <th scope="col">テーマ</th>
                <th scope="col">置いた四半期</th>
                <th scope="col">次のアクション</th>
                <th scope="col">次のアクション（先頭）</th>
                <th scope="col">連絡待ち</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(({ project: p, nextActions, waiting, firstNextAction }) => (
                <tr key={p.id}>
                  <th scope="row" className="project-table__name">
                    <a href={routeHref("projects", p.id)}>{p.name}</a>
                  </th>
                  <td className="project-table__theme" data-label="テーマ">
                    <ThemeLabel id={p.themeId} />
                  </td>
                  {/* 表のすぐ上に月を含む「今の四半期」があるので、ここでは月を省いた短い表記にする（IMP-02） */}
                  <td className="project-table__quarter" data-label="置いた四半期" data-unplaced={p.placement === null || undefined}>
                    {quarterShortLabel(p.placement, now)}
                  </td>
                  <td className="project-table__count" data-label="次のアクション">
                    {nextActions}件
                  </td>
                  {/* 並びの先頭の未着手の次のアクション。無ければ「—」だけで、文言・色・太字で強調しない（IMP-01。CLAUDE.md 4.3）。
                      「—」の意味が件数から読めるよう、次のアクションの件数のすぐ後ろに置く */}
                  <td className="project-table__first" data-label="次のアクション（先頭）" title={firstNextAction ?? undefined}>
                    <FirstNextAction text={firstNextAction} />
                  </td>
                  <td className="project-table__count" data-label="連絡待ち">
                    {waiting}件
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
