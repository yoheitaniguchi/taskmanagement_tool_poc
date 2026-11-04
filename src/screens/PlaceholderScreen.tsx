// まだ作っていない画面（節目2・3で順に作る。docs/plans/milestone-2.md 2章）
interface Props {
  title: string;
}

export function PlaceholderScreen({ title }: Props) {
  return (
    <>
      <h1 tabIndex={-1}>{title}</h1>
      <section>
        <p>この画面は準備中です。</p>
      </section>
    </>
  );
}
