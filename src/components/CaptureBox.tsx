// 共通の収集の入力欄（F01。CLAUDE.md 3章 G1・7.2、docs/design.md 3.1）。
// どの画面からでも、入力して Enter で収集箱に入れる。日本語入力の変換を確定する Enter では入れない（isComposing・keyCode 229）。
// 入れた後も入力欄にフォーカスを残し、続けて入れられるようにする
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { canCapture, captureTextError } from "../domain/capture";

interface Props {
  /** 今の収集箱の未処理の件数（入れた後の表示に使う） */
  inboxCount: number;
  /** 使えない理由（読み取り専用のタブなど）。使えるなら null */
  disabledReason: string | null;
  /** 入れる。入れられなければ理由を返す */
  onCapture: (text: string) => string | null;
}

/** 入れたことを知らせる表示を出しておく時間 */
const NOTICE_MS = 3000;

export function CaptureBox({ inboxCount, disabledReason, onCapture }: Props) {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const textError = captureTextError(value);
  const disabled = disabledReason !== null;
  const canSubmit = !disabled && canCapture(value);

  const show = (text: string, error: boolean) => {
    window.clearTimeout(timer.current);
    setNotice({ text, error });
    // 誤りの表示は、次に入力するまで残す（読み終える前に消さないため）
    if (!error) timer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  };

  const submit = () => {
    if (!canSubmit) return;
    const error = onCapture(value);
    if (error !== null) {
      show(`入れられませんでした：${error}`, true);
      return;
    }
    setValue("");
    show(`収集箱に入れました（未処理 ${inboxCount + 1}件）`, false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    // 変換の確定の Enter（Safari では keyCode 229 だけで分かることがある）では入れない
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  };

  const hintId = "capture-hint";
  const hint = disabledReason ?? textError ?? notice?.text ?? null;

  return (
    <div className="capture">
      <div className="capture__row">
        <label htmlFor="capture-input" className="visually-hidden">
          収集箱に入れる
        </label>
        <input
          id="capture-input"
          ref={inputRef}
          type="text"
          className="capture__input"
          value={value}
          placeholder="思いついたことを入力して Enter"
          autoComplete="off"
          enterKeyHint="done"
          disabled={disabled}
          aria-invalid={textError !== null}
          aria-describedby={hint !== null ? hintId : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            if (notice?.error) setNotice(null);
          }}
          onKeyDown={onKeyDown}
        />
        <button type="button" onClick={submit} disabled={!canSubmit}>
          入れる
        </button>
      </div>
      {/* 読み上げにも伝わるよう、表示の場所は常に置いておく（中身だけを変える） */}
      <p
        id={hintId}
        className={`capture__hint${textError !== null || notice?.error ? " capture__hint--error" : ""}`}
        role="status"
      >
        {hint}
      </p>
    </div>
  );
}
