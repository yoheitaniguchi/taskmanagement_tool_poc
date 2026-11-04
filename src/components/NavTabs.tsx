// 画面の切替（docs/design.md 2.1・2.3）。並びは週次レビューで見て回る順。
// PC（幅720px以上）は9つを横一列に、スマホは下部のタブバーに4つと「メニュー」を出す（残りはメニューの中に同じ順で並べる）。
// 切替は a 要素の href（#/...）で行い、ブラウザの「戻る」で前の画面に戻れるようにする（D14）
import { routeHref, SCREENS, type ScreenId } from "../route";
import { Icon, type IconName } from "./Icon";
import { MenuButton } from "./MenuButton";

const ICONS: Partial<Record<ScreenId, IconName>> = { home: "home", inbox: "inbox", next: "check", projects: "folder" };

interface Props {
  current: ScreenId;
  inboxCount: number;
}

export function NavTabs({ current, inboxCount }: Props) {
  const secondary = SCREENS.filter((s) => !s.phoneTab);
  const currentIsSecondary = secondary.some((s) => s.id === current);
  return (
    <nav className="tabs" aria-label="画面">
      {SCREENS.map((s) => {
        const icon = ICONS[s.id];
        return (
          <a
            key={s.id}
            href={routeHref(s.id)}
            className={s.phoneTab ? "tabs__tab" : "tabs__tab tabs__tab--secondary"}
            aria-current={s.id === current ? "page" : undefined}
          >
            {icon && <Icon name={icon} />}
            <span>{s.label}</span>
            {/* 収集箱の未処理の件数は、色ではなく数字で示す（docs/design.md 2.3・7章） */}
            {s.id === "inbox" && (
              <span className="tabs__count">
                <span className="visually-hidden">未処理</span>
                {inboxCount}
                <span className="visually-hidden">件</span>
              </span>
            )}
          </a>
        );
      })}
      {/* スマホだけ：タブバーに出さない画面を、週次レビューの順に並べたメニュー */}
      <MenuButton
        label="ほかの画面"
        className={currentIsSecondary ? "tabs__more tabs__more--current" : "tabs__more"}
        triggerClassName="tabs__tab"
        trigger={
          <>
            <Icon name="menu" />
            <span>メニュー</span>
            {currentIsSecondary && <span className="visually-hidden">（今の画面を含む）</span>}
          </>
        }
      >
        {secondary.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={s.id === current ? "page" : undefined}
            onClick={() => {
              window.location.hash = routeHref(s.id);
            }}
          >
            {s.label}
            {s.id === current && "（表示中）"}
          </button>
        ))}
      </MenuButton>
    </nav>
  );
}
