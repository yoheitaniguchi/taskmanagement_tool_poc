// 起動時に読めなかった保存データが残っているときに、読み込み・消去の確認画面に出す表示（docs/design.md 6.3）。
// 読み込みは元のキーを上書きし、消去は退避も含めて消すので、その前に読めなかったデータをそのまま書き出せるようにする
interface Props {
  onExport: () => void;
  /** 読み込み（退避は残る）か、消去（退避も消える）か */
  purpose: "import" | "clear";
}

export function UnreadableWarning({ onExport, purpose }: Props) {
  return (
    <div className="message--warn">
      <p>
        <span aria-hidden="true">⚠ </span>
        {purpose === "import"
          ? "読めなかった保存データは、置き換えると元の場所から消えます（退避できていれば、退避した1件だけが残ります）"
          : "読めなかった保存データも、退避したデータも消えます"}
      </p>
      <button type="button" onClick={onExport}>
        読めなかったデータを書き出す
      </button>
    </div>
  );
}
