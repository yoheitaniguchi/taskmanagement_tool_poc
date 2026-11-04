// 収集箱（F01 の未処理の一覧。docs/design.md 3.4）。並びは古い順（先頭がいちばん古い）。
// 1件ずつの明確化と一括振り分けは、次の作業（明確化）で足す
import type { InboxItem } from "../domain/types";
import { formatDateTime } from "../labels";

interface Props {
  items: readonly InboxItem[];
  now: Date;
}

export function InboxScreen({ items, now }: Props) {
  return (
    <>
      <h1 tabIndex={-1}>収集箱</h1>
      <section aria-labelledby="inbox-list">
        <h2 id="inbox-list">
          未処理 <strong>{items.length}</strong>件
        </h2>
        {items.length === 0 ? (
          <p>収集箱は空です</p>
        ) : (
          <ol className="item-list">
            {items.map((item) => (
              <li key={item.id} className="item-list__row">
                <span className="item-list__text">{item.text}</span>
                <span className="item-list__meta">
                  <time dateTime={item.capturedAt}>{formatDateTime(item.capturedAt, now)}</time>
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="hint">明確化（置き場への振り分け）は準備中です。</p>
      </section>
    </>
  );
}
