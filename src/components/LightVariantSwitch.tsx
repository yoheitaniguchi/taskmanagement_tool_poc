// ライトモードの色の案を、PRプレビューの中だけで切り替えて比べる部品（振り返り 7.1、計画 2.1）。
// 本番（PREVIEW_PR が null）では何も出さない。選んだ案は保存しない（再読み込みで「今の色」に戻る。CLAUDE.md 8.2 の
// 「保存に触るのは1か所」を崩さないため）。発注者が案を選んだら、この部品と index.css の案の値を消してからマージする
import { useState } from "react";
import { PREVIEW_PR } from "../buildInfo";

export const LIGHT_VARIANTS = [
  { id: "", label: "今の色" },
  { id: "a", label: "A 少し暗く" },
  { id: "b", label: "B やや暗く" },
  { id: "c", label: "C いちばん暗く" },
  { id: "d", label: "D クリーム（淡い）" },
  { id: "e", label: "E クリーム（しっかり）" },
] as const;

export type LightVariant = (typeof LIGHT_VARIANTS)[number]["id"];

/** <html data-light-variant> を付け外しする。値は上の固定の6つだけ */
export function applyLightVariant(id: LightVariant): void {
  if (id === "") delete document.documentElement.dataset.lightVariant;
  else document.documentElement.dataset.lightVariant = id;
}

export function LightVariantSwitch({ previewPr = PREVIEW_PR }: { previewPr?: number | null }) {
  const [current, setCurrent] = useState<LightVariant>("");
  if (previewPr === null) return null;
  return (
    <fieldset className="light-variant">
      <legend>ライトモードの案（ライトのときだけ変わります。［⋯］の「表示」でライトにすると比べられます。C がいちばん暗い案です（これより暗いと文字が読みにくくなるため）。D・E は B と同じ明るさで、色合いをクリーム寄りにした案です）</legend>
      {LIGHT_VARIANTS.map((v) => (
        <label key={v.id} className="chip">
          <input
            type="radio"
            name="light-variant"
            checked={current === v.id}
            onChange={() => {
              setCurrent(v.id);
              applyLightVariant(v.id);
            }}
          />
          {v.label}
        </label>
      ))}
    </fieldset>
  );
}
