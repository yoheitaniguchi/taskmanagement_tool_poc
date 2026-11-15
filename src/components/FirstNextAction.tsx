// 一覧の「次のアクション（先頭）」の中身（IMP-01。docs/design.md 3.2・3.6）。
// 無いときは「—」だけを出し、文言・色・太字で強調しない（CLAUDE.md 4.3）。読み上げでは「なし」と伝える
export function FirstNextAction({ text }: { text: string | null }) {
  if (text !== null) return <>{text}</>;
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="visually-hidden">なし</span>
    </>
  );
}
