// 「その他」メニュー（⋯。既存PoCから移したもの。docs/design.md 3.1）。使う頻度が低い操作と、取り消せない操作をたたんでおく。
// 開いたらメニューの最初の項目にフォーカスし、Esc・外側のクリックで閉じる。項目を押したら閉じる
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

interface Props {
  label: string;
  children: ReactNode;
  /** 開くボタンの中身（省略すると ⋯ のアイコンだけ）とクラス。スマホのタブバーの「メニュー」で使う */
  trigger?: ReactNode;
  triggerClassName?: string;
  /** 外側の要素のクラス */
  className?: string;
}

export function MenuButton({ label, children, trigger, triggerClassName = "button--icon", className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLButtonElement>(".menu__list button:not(:disabled)")?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={className ? `menu ${className}` : "menu"} ref={ref}>
      <button ref={buttonRef} type="button" className={triggerClassName} aria-expanded={open} onClick={() => setOpen((v) => !v)} title={label}>
        {trigger ?? (
          <>
            <Icon name="more" />
            <span className="visually-hidden">{label}</span>
          </>
        )}
      </button>
      {open && (
        // 項目のボタンを押したら閉じる（押した操作自体はそのまま動く）
        <div className="menu__list" onClick={(e) => (e.target as HTMLElement).closest("button") && setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
