// 1件ずつの明確化（F02。CLAUDE.md 6.1、docs/design.md 3.5）。
// 収集箱の先頭（いちばん古い項目）を取り出し、3つの質問に答えて出口を決める。
// - 出口を確定するまで、データは何も変わらない。入力の途中の内容は、この画面の中だけで持つ（確定か［やめる］まで保つ）
// - 質問を進めるたびに履歴を1つ積む。スマホの「戻る」は［前の質問に戻る］と同じ動きになる（D14）
// - 判断は人間が行い、決めた結果を置き場に置くのは clarify()（src/domain/clarify.ts）の役目（1.3）
import { useEffect, useRef, useState } from "react";
import type { Decision } from "../domain/clarify";
import { FIELDS, fieldHint, readField } from "../domain/fields";
import { currentQuarter, quarterLabel, toLocalDate } from "../domain/fiscal";
import { THEMES, isThemeId, type ThemeId } from "../domain/themes";
import type { InboxItem, Placement, Project, Quarter } from "../domain/types";
import { FieldMark } from "../components/FieldMark";
import { formatDateTime } from "../labels";
import { clarifyHref, routeHref, type ClarifyStep } from "../route";
import { backThenReplace, pushHash } from "../state/navigate";

interface Props {
  items: readonly InboxItem[];
  projects: readonly Project[];
  /** URL が示す質問（1〜3） */
  step: ClarifyStep;
  now: Date;
  /** 振り分けを使えない理由（読み取り専用のタブなど）。null なら使える */
  disabledReason: string | null;
  /** 出口を確定する。できなければ理由を返す */
  onClarify: (itemId: string, decision: Decision) => string | null;
}

/** 質問3の選択肢（6.1）。プロジェクトの最初の一手は next・delegate の2つだけ */
type Choice = "twoMinutes" | "delegate" | "calendar" | "next";

/** 入力の途中の内容（画面の中だけで持つ） */
interface Draft {
  itemId: string;
  /** 進んだところまでの質問（URL がこれより先を示していても、ここまでしか出さない） */
  reached: ClarifyStep;
  /** 質問1で「いいえ」を選んだ（3つの出口を出す） */
  noAction: boolean;
  /** 質問2の答え。true ならプロジェクトにする */
  multi: boolean | null;
  name: string;
  outcome: string;
  themeId: ThemeId | null;
  /** 置く四半期（"2026-3" の形。空なら置かない） */
  placement: string;
  /** 次の一手（単独のとき。初期値は収集した文言） */
  text: string;
  /** プロジェクトの最初の一手（初期値は空欄。名称と同じ文の次のアクションができないように） */
  firstText: string;
  choice: Choice | null;
  party: string;
  requestedOn: string;
  /** 属するプロジェクト（空なら単独） */
  projectId: string;
  /** 単独の次のアクションのテーマ（任意。空なら持たない） */
  standaloneTheme: string;
  /** 確定できなかった理由 */
  error: string | null;
}

function initialDraft(item: InboxItem, now: Date): Draft {
  return {
    itemId: item.id,
    reached: 1,
    noAction: false,
    multi: null,
    name: item.text,
    outcome: "",
    themeId: null,
    placement: "",
    text: item.text,
    firstText: "",
    choice: null,
    party: "",
    requestedOn: toLocalDate(now),
    projectId: "",
    standaloneTheme: "",
    error: null,
  };
}

/** 置く四半期の選択肢：今の年度と次の年度の8つ（それより先・前は、節目3のプロジェクトの画面で直す） */
function placementOptions(now: Date): Placement[] {
  const { fiscalYear } = currentQuarter(now);
  const out: Placement[] = [];
  for (const fy of [fiscalYear, fiscalYear + 1]) for (const q of [1, 2, 3, 4] as Quarter[]) out.push({ fiscalYear: fy, quarter: q });
  return out;
}

function parsePlacement(value: string): Placement | null {
  const m = /^(\d{4})-([1-4])$/.exec(value);
  return m ? { fiscalYear: Number(m[1]), quarter: Number(m[2]) as Quarter } : null;
}

const CHOICES: { id: Choice; label: string; hint: string }[] = [
  { id: "twoMinutes", label: "今やる（2分以内で終わる）", hint: "2分以内で終わるなら、管理するより今やる方が早い（2分ルール）。やってから押してください" },
  { id: "delegate", label: "誰かに任せる", hint: "自分より適任の人に頼み、返事を待つもの" },
  { id: "calendar", label: "日時が決まっている", hint: "会議や約束など、その日時にやるものはカレンダーで管理します" },
  { id: "next", label: "自分で後でやる", hint: "次のアクションの一覧に置き、時間のあるときに選んでやります" },
];

export function ClarifyFlow({ items, projects, step: routeStep, now, disabledReason, onClarify }: Props) {
  const head = items[0] as InboxItem | undefined;
  const [draft, setDraft] = useState<Draft | null>(null);
  /** 確定した直後か（「収集箱は空になりました」と「収集箱は空です」を分けるため） */
  const [finished, setFinished] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const d = head ? (draft !== null && draft.itemId === head.id ? draft : initialDraft(head, now)) : null;
  const reached: ClarifyStep = d?.reached ?? 1;
  const step: ClarifyStep = Math.min(routeStep, reached) as ClarifyStep;

  // URL が、まだ進んでいない質問を示しているとき（再読み込み・「進む」など）は、進んだところに置き換える
  useEffect(() => {
    if (routeStep > reached) backThenReplace(0, clarifyHref(reached));
  }, [routeStep, reached]);

  // 確定の後に次の項目に移ったら、質問の見出しにフォーカスを移す（URL が変わらないときのため。docs/design.md 3.5）。開いた直後は動かさない
  const firstHead = useRef(true);
  useEffect(() => {
    if (firstHead.current) {
      firstHead.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [head?.id]);

  if (!head || !d) {
    return (
      <>
        <h1 tabIndex={-1}>明確化</h1>
        <section aria-labelledby="clarify-empty">
          <h2 id="clarify-empty" ref={headingRef} tabIndex={-1} data-route-focus>
            {finished ? "収集箱は空になりました" : "収集箱は空です"}
          </h2>
          <p className="clarify__actions">
            <a className="button" href={routeHref("home")}>
              ホームへ
            </a>
            <a className="button" href={routeHref("inbox")}>
              一覧へ
            </a>
          </p>
        </section>
      </>
    );
  }

  const update = (patch: Partial<Draft>) => setDraft({ ...d, error: null, ...patch });

  const goTo = (next: ClarifyStep) => {
    update({ reached: Math.max(d.reached, next) as ClarifyStep });
    pushHash(clarifyHref(next));
  };

  const back = () => window.history.back();
  /** やめる：一覧に戻る。項目は収集箱の先頭に残る。途中の質問の履歴は残さない */
  const cancel = () => backThenReplace(step - 1, routeHref("inbox"));

  const confirm = (decision: Decision) => {
    const error = onClarify(d.itemId, decision);
    if (error !== null) {
      update({ error });
      return;
    }
    setDraft(null);
    setFinished(true);
    // 次の項目は質問1から。確定の後に「戻る」で前の項目の質問に戻らないよう、途中の質問の履歴を戻す
    backThenReplace(step - 1, clarifyHref(1));
  };

  const disabled = disabledReason !== null;

  /** 質問2の［次へ］：プロジェクトの入力を確かめてから質問3へ */
  const projectNext = () => {
    const name = readField(d.name, FIELDS.projectName);
    const outcome = readField(d.outcome, FIELDS.outcome);
    const error = !name.ok ? name.error : !outcome.ok ? outcome.error : d.themeId === null ? "テーマを選んでください" : null;
    if (error !== null) {
      update({ error });
      return;
    }
    goTo(3);
  };

  const isProject = d.multi === true;
  const choices = isProject ? CHOICES.filter((c) => c.id === "next" || c.id === "delegate") : CHOICES;
  const stepText = isProject ? d.firstText : d.text;

  const decide = (): Decision | null => {
    if (d.choice === null) return null;
    if (isProject) {
      const project = { name: d.name, outcome: d.outcome, themeId: d.themeId, placement: parsePlacement(d.placement) };
      const first =
        d.choice === "delegate"
          ? ({ exit: "delegate", text: d.firstText, party: d.party, requestedOn: d.requestedOn } as const)
          : ({ exit: "next", text: d.firstText } as const);
      return { exit: "project", project, first };
    }
    switch (d.choice) {
      case "twoMinutes":
        return { exit: "twoMinutes", text: d.text };
      case "calendar":
        return { exit: "calendar" };
      case "delegate":
        return { exit: "delegate", text: d.text, party: d.party, requestedOn: d.requestedOn, projectId: d.projectId === "" ? null : d.projectId };
      case "next":
        return {
          exit: "next",
          text: d.text,
          projectId: d.projectId === "" ? null : d.projectId,
          themeId: d.projectId === "" && isThemeId(d.standaloneTheme) ? d.standaloneTheme : null,
        };
    }
  };

  const confirmLabel = isProject
    ? "プロジェクトを作る"
    : d.choice === "twoMinutes"
      ? "やった（完了として記録）"
      : d.choice === "delegate"
        ? "連絡待ちに置く"
        : d.choice === "calendar"
          ? "カレンダーに登録した"
          : "次のアクションに置く";

  const activeProjects = projects.filter((p) => p.status === "active");

  const errorBox = d.error !== null && (
    <p className="message--error" role="alert">
      {d.error}
    </p>
  );

  const heading = (text: string) => (
    <h2 id="clarify-question" className="clarify__question" ref={headingRef} tabIndex={-1} data-route-focus>
      {text}
    </h2>
  );

  return (
    <>
      <h1 tabIndex={-1}>
        明確化 <span className="clarify__remaining">残り {items.length}件</span>
      </h1>
      <section aria-labelledby="clarify-question" className="clarify">
        <div className="clarify__item">
          <p className="clarify__item-text">{head.text}</p>
          <p className="clarify__item-meta">
            収集 <time dateTime={head.capturedAt}>{formatDateTime(head.capturedAt, now)}</time>
          </p>
        </div>

        {disabledReason !== null && <p className="message--warn">{disabledReason}</p>}

        {step === 1 && (
          <>
            <p className="clarify__step">質問 1 / 3</p>
            {heading("これについて、何か行動が必要ですか？")}
            <p className="hint">
              行動とは、自分か誰かが実際に手を動かすこと（電話する、買う、書く、調べる など）。<strong>決められないものは「いつか・多分」へ。</strong>
            </p>
            <div className="clarify__options">
              <button type="button" className="clarify__option" onClick={() => goTo(2)}>
                はい、行動が必要
              </button>
              <button type="button" className="clarify__option" aria-expanded={d.noAction} onClick={() => update({ noAction: !d.noAction })}>
                いいえ、行動は要らない
              </button>
            </div>
            {d.noAction && (
              <div className="clarify__options clarify__options--sub" role="group" aria-label="行動が要らないもの">
                <button type="button" className="clarify__option" disabled={disabled} onClick={() => confirm({ exit: "delete" })}>
                  <span className="clarify__option-label">削除する</span>
                  <span className="clarify__option-hint">もう要らないもの</span>
                </button>
                <button type="button" className="clarify__option" disabled={disabled} onClick={() => confirm({ exit: "someday" })}>
                  <span className="clarify__option-label">いつか・多分に置く</span>
                  <span className="clarify__option-hint">今はやらないが、捨てたくないもの</span>
                </button>
                <button type="button" className="clarify__option" disabled={disabled} onClick={() => confirm({ exit: "reference" })}>
                  <span className="clarify__option-label">資料として残す</span>
                  <span className="clarify__option-hint">行動は要らないが、後で見返したい情報</span>
                </button>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <p className="clarify__step">質問 2 / 3</p>
            {heading("終わらせるまでに、2つ以上の行動が要りますか？")}
            <p className="hint">
              1回の行動では終わらないもの（例：旅行の準備、部屋の片付け）は「プロジェクト」にします。プロジェクトにしても、今決めるのは最初の一手だけです。
            </p>
            <div className="clarify__options">
              <button type="button" className="clarify__option" aria-pressed={d.multi === true} onClick={() => update({ multi: true })}>
                はい、プロジェクトにする
              </button>
              <button
                type="button"
                className="clarify__option"
                aria-pressed={d.multi === false}
                onClick={() => {
                  setDraft({ ...d, error: null, multi: false, choice: d.multi === false ? d.choice : null, reached: 3 });
                  pushHash(clarifyHref(3));
                }}
              >
                いいえ、1回の行動で終わる
              </button>
            </div>
            {d.multi === true && (
              <fieldset className="clarify__form">
                <legend>プロジェクト</legend>
                <TextInput id="clarify-name" label="プロジェクトの名称" spec={FIELDS.projectName} value={d.name} onChange={(name) => update({ name })} />
                <label htmlFor="clarify-outcome">
                  目的とする成果 <FieldMark required />
                </label>
                <p className="hint" id="clarify-outcome-desc">
                  終わったとき、どうなっていれば完了ですか？
                </p>
                <textarea id="clarify-outcome" aria-required="true" aria-describedby="clarify-outcome-desc" value={d.outcome} onChange={(e) => update({ outcome: e.target.value })} />
                <FieldHint value={d.outcome} spec={FIELDS.outcome} />
                <fieldset className="clarify__themes">
                  <legend>
                    テーマ <FieldMark required />
                  </legend>
                  {THEMES.map((t) => (
                    <label key={t.id} className="chip">
                      <input type="radio" name="clarify-theme" checked={d.themeId === t.id} onChange={() => update({ themeId: t.id })} />
                      {t.label}
                    </label>
                  ))}
                </fieldset>
                <label htmlFor="clarify-placement">
                  置く四半期 <FieldMark required={false} />
                </label>
                <select id="clarify-placement" aria-describedby="clarify-placement-desc" value={d.placement} onChange={(e) => update({ placement: e.target.value })}>
                  <option value="">置かない</option>
                  {placementOptions(now).map((p) => (
                    <option key={`${p.fiscalYear}-${p.quarter}`} value={`${p.fiscalYear}-${p.quarter}`}>
                      {quarterLabel(p.fiscalYear, p.quarter)}
                    </option>
                  ))}
                </select>
                <p className="hint" id="clarify-placement-desc">
                  この四半期に終わらせる主要なプロジェクトだけ置きます
                </p>
                {errorBox}
                <p>
                  <button type="button" className="button--primary" onClick={projectNext}>
                    次へ（最初の一手を決める）
                  </button>
                </p>
              </fieldset>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <p className="clarify__step">質問 3 / 3</p>
            {heading(isProject ? "このプロジェクトの、最初の一手は何ですか？" : "次の一手は何ですか？")}
            {isProject && (
              <p className="hint">
                プロジェクト「{d.name.trim()}」の最初の一手を書きます。2分で終わる一手はその場でやり、その次の一手を書いてください。日時が決まっている一手はカレンダーに登録し、その次の一手を書いてください。
              </p>
            )}
            <TextInput
              id="clarify-text"
              label="次の一手"
              description="目に見える具体的な行動で書きます（例：『〇〇さんに電話して日程を聞く』）"
              spec={FIELDS.nextStep}
              value={stepText}
              onChange={(v) => update(isProject ? { firstText: v } : { text: v })}
            />
            <fieldset className="clarify__choices">
              <legend>この一手をどうしますか？</legend>
              {choices.map((c) => (
                <label key={c.id} className="clarify__choice">
                  <input type="radio" name="clarify-choice" checked={d.choice === c.id} onChange={() => update({ choice: c.id })} />
                  <span>
                    <span className="clarify__option-label">{c.label}</span>
                    <span className="clarify__option-hint">{c.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {d.choice !== null && (
              <div className="clarify__form">
                {d.choice === "delegate" && (
                  <>
                    <TextInput id="clarify-party" label="相手" spec={FIELDS.party} value={d.party} onChange={(party) => update({ party })} />
                    <label htmlFor="clarify-requested">
                      依頼日 <FieldMark required />
                    </label>
                    <input id="clarify-requested" type="date" aria-required="true" value={d.requestedOn} onChange={(e) => update({ requestedOn: e.target.value })} />
                  </>
                )}
                {d.choice === "calendar" && (
                  <p className="message--info">
                    お使いのカレンダーに登録してください。登録したら『登録した』を押すと、収集箱から消えます。このツールには残りません。
                  </p>
                )}
                {!isProject && (d.choice === "delegate" || d.choice === "next") && (
                  <>
                    <label htmlFor="clarify-project">
                      属するプロジェクト <FieldMark required={false} />
                    </label>
                    <select id="clarify-project" value={d.projectId} onChange={(e) => update({ projectId: e.target.value })}>
                      <option value="">なし（単独）</option>
                      {THEMES.map((t) => {
                        const list = activeProjects.filter((p) => p.themeId === t.id);
                        return list.length === 0 ? null : (
                          <optgroup key={t.id} label={t.label}>
                            {list.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </>
                )}
                {!isProject && d.choice === "next" && d.projectId === "" && (
                  <>
                    <label htmlFor="clarify-theme">
                      テーマ <FieldMark required={false} />
                    </label>
                    <select id="clarify-theme" value={d.standaloneTheme} onChange={(e) => update({ standaloneTheme: e.target.value })}>
                      <option value="">なし</option>
                      {THEMES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {errorBox}
                <p>
                  <button
                    type="button"
                    className="button--primary"
                    disabled={disabled}
                    onClick={() => {
                      const decision = decide();
                      if (decision) confirm(decision);
                    }}
                  >
                    {confirmLabel}
                  </button>
                </p>
              </div>
            )}
          </>
        )}

        {step === 1 && errorBox}

        <div className="clarify__nav">
          {step > 1 ? (
            <button type="button" onClick={back}>
              ← 前の質問に戻る
            </button>
          ) : (
            <span />
          )}
          <span className="clarify__cancel">
            <span className="hint">途中でやめても、この項目は収集箱に残ります</span>
            <button type="button" onClick={cancel}>
              やめる
            </button>
          </span>
        </div>
      </section>
    </>
  );
}

/** 1行の入力欄と、上限・使えない文字の理由（入力の途中に出す） */
function TextInput({
  id,
  label,
  description,
  spec,
  value,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  spec: (typeof FIELDS)[keyof typeof FIELDS];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <label htmlFor={id}>
        {label} <FieldMark required={spec.required} />
      </label>
      {description && (
        <p className="hint" id={`${id}-desc`}>
          {description}
        </p>
      )}
      <input id={id} type="text" value={value} aria-required={spec.required} aria-describedby={description ? `${id}-desc` : undefined} onChange={(e) => onChange(e.target.value)} />
      <FieldHint value={value} spec={spec} />
    </>
  );
}

function FieldHint({ value, spec }: { value: string; spec: (typeof FIELDS)[keyof typeof FIELDS] }) {
  const hint = fieldHint(value, spec);
  return hint === null ? null : (
    <p className="message--error" role="status">
      {hint}
    </p>
  );
}
