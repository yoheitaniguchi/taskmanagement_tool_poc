// 収集箱（F01 の未処理の一覧と、F02 の一括振り分け。docs/design.md 3.4）。並びは古い順（先頭がいちばん古い）。
// 1件ずつの明確化（#/inbox/clarify）は ClarifyFlow が出す
import { useState } from "react";
import { type BulkExit } from "../domain/clarify";
import type { InboxItem } from "../domain/types";
import { formatDateTime } from "../labels";
import { clarifyHref } from "../route";

interface Props {
  items: readonly InboxItem[];
  now: Date;
  /** 振り分けを使えない理由（読み取り専用のタブなど）。null なら使える */
  disabledReason: string | null;
  /** 選んだ項目を1つの出口にまとめて送る。できなければ理由を返す */
  onBulk: (itemIds: string[], exit: BulkExit) => string | null;
}

/** 一括振り分けの出口（追加の入力が要らない4つ。D9） */
const BULK_EXITS: { exit: BulkExit; label: string }[] = [
  { exit: "next", label: "次のアクションへ" },
  { exit: "someday", label: "いつか・多分へ" },
  { exit: "reference", label: "資料へ" },
  { exit: "delete", label: "削除" },
];

export function InboxScreen({ items, now, disabledReason, onBulk }: Props) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // 別のタブ・「元に戻す」などで無くなった項目は、選んだものから外す
  const selected = items.filter((x) => picked.has(x.id)).map((x) => x.id);
  const all = items.length > 0 && selected.length === items.length;

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
    setError(null);
  };

  const bulk = (exit: BulkExit) => {
    const reason = onBulk(selected, exit);
    if (reason !== null) {
      setError(reason);
      return;
    }
    setPicked(new Set());
    setError(null);
  };

  return (
    <>
      <h1 tabIndex={-1}>収集箱</h1>
      <section aria-labelledby="inbox-list">
        <div className="inbox__head">
          <h2 id="inbox-list">
            未処理 <strong>{items.length}</strong>件
          </h2>
          {items.length > 0 && (
            <a className="button button--primary" href={clarifyHref(1)}>
              1件ずつ明確化する
            </a>
          )}
        </div>
        {items.length === 0 ? (
          <p>収集箱は空です</p>
        ) : (
          <>
            <label className="inbox__all">
              <input
                type="checkbox"
                checked={all}
                ref={(el) => {
                  if (el) el.indeterminate = selected.length > 0 && !all;
                }}
                onChange={() => {
                  setPicked(all ? new Set() : new Set(items.map((x) => x.id)));
                  setError(null);
                }}
              />
              すべて選ぶ
            </label>
            <ol className="item-list">
              {items.map((item) => (
                <li key={item.id} className="item-list__row item-list__row--check">
                  <label className="item-list__check">
                    <input type="checkbox" checked={picked.has(item.id)} onChange={() => toggle(item.id)} />
                    <span className="item-list__text">{item.text}</span>
                  </label>
                  <span className="item-list__meta">
                    <time dateTime={item.capturedAt}>{formatDateTime(item.capturedAt, now)}</time>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
        {selected.length > 0 && (
          <div className="bulk-bar" role="group" aria-label="選んだ項目の振り分け">
            <span className="bulk-bar__label">選んだ {selected.length}件を</span>
            {BULK_EXITS.map((b) => (
              <button
                key={b.exit}
                type="button"
                className={b.exit === "delete" ? "button--danger" : undefined}
                disabled={disabledReason !== null}
                onClick={() => bulk(b.exit)}
              >
                {b.label}
              </button>
            ))}
            {disabledReason !== null && <p className="message--warn">{disabledReason}</p>}
            {error !== null && (
              <p className="message--error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
        {items.length > 0 && (
          <p className="hint">プロジェクト・連絡待ち・2分でやったもの・カレンダーへ送るものは、［1件ずつ明確化する］で振り分けます。</p>
        )}
      </section>
    </>
  );
}
