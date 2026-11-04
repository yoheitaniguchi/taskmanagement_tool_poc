// URL の #/... と、出す画面をつなぐ（docs/design.md 2.1、D14）。
// 画面の切替は a 要素の href（#/...）で行い、ブラウザの「戻る」で前の画面に戻れるようにする
import { useEffect, useRef, useState } from "react";
import { documentTitle, parseRoute, type Route } from "../route";

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const first = useRef(true);

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  useEffect(() => {
    document.title = documentTitle(route);
    // 画面を切り替えたら、新しい画面の見出しにフォーカスを移す（読み上げで画面が変わったことが分かるように。docs/design.md 7章）。
    // 開いた直後は動かさない（収集の入力欄などを使い始めやすいように）
    if (first.current) {
      first.current = false;
      return;
    }
    // 画面の中で見出しを決めているとき（明確化の質問など）は、そちらを優先する
    (document.querySelector<HTMLElement>("main [data-route-focus]") ?? document.querySelector<HTMLElement>("main h1"))?.focus();
  }, [route]);

  return route;
}
