// このブラウザの名前（端末名。D11、docs/design.md 3.1）。初めて書き出すときと、⋯ の「このブラウザの名前を変える」で出す
import { useState } from "react";
import { DEVICE_NAME_MAX, validateDeviceName } from "../domain/transfer";
import { Modal } from "./Modal";

interface Props {
  current: string | null;
  /** 初めて書き出すときは、決めた後に続けて書き出す */
  purpose: "export" | "rename";
  onDecide: (name: string) => void;
  onClose: () => void;
}

export function DeviceNameDialog({ current, purpose, onDecide, onClose }: Props) {
  const [value, setValue] = useState(current ?? "");
  const [touched, setTouched] = useState(false);
  const result = validateDeviceName(value);
  const error = touched && !result.ok ? result.error : null;

  return (
    <Modal title={purpose === "export" ? "書き出す前に、このブラウザの名前を決めてください" : "このブラウザの名前を変える"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (result.ok) onDecide(result.name);
        }}
      >
        <p className="hint">
          書き出したファイルの名前と、読み込んだ側の画面に出ます（例：PC、スマホ）。{DEVICE_NAME_MAX}字まで。文字・数字・「-」・「_」が使えます。
        </p>
        <p>
          <label>
            このブラウザの名前{" "}
            <input
              value={value}
              data-autofocus
              maxLength={DEVICE_NAME_MAX * 2}
              aria-invalid={error !== null}
              aria-describedby={error ? "device-name-error" : undefined}
              onChange={(e) => {
                setValue(e.target.value);
                setTouched(true);
              }}
            />
          </label>
        </p>
        {error && (
          <p id="device-name-error" className="message--error">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" onClick={onClose}>
            やめる
          </button>
          <button type="submit" className="button--primary">
            {purpose === "export" ? "決めて書き出す" : "変える"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
