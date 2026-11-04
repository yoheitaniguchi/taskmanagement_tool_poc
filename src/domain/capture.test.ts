import { describe, expect, it } from "vitest";
import { canCapture, capture, CAPTURE_MAX_CHARS, captureTextError } from "./capture";
import { initialRoot, reducer } from "./reducer";
import { fullState, sampleState } from "./testData";
import { emptyState, type AppState } from "./types";
import { LIMITS, validateState } from "./validate";

const NOW = new Date("2026-11-05T01:02:03.000Z");
let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(900000 + ++seq).padStart(12, "0")}`;

function ok(r: ReturnType<typeof capture>): AppState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe("収集（CLAUDE.md 4.1 F01・5.3、docs/design.md 4.5・8章）", () => {
  it("収集箱の末尾に足す。収集日時＝作成日時＝更新日時＝今の時刻で、結果は検証を通る", () => {
    const before = sampleState();
    const after = ok(capture(before, "テスト用の思いつき", NOW, newId));
    expect(after.inbox).toHaveLength(before.inbox.length + 1);
    expect(after.inbox.slice(0, -1)).toEqual(before.inbox);
    const item = after.inbox.at(-1)!;
    expect(item).toMatchObject({ text: "テスト用の思いつき", capturedAt: NOW.toISOString(), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
    expect(validateState(after).ok).toBe(true);
    // 元の状態は変えない
    expect(before.inbox).toHaveLength(after.inbox.length - 1);
  });

  it("前後の空白を除き、NFC に正規化して保存する", () => {
    // 「カ」＋結合用の濁点（NFD）は「ガ」1文字（NFC）にする。前後の全角空白も除く
    const after = ok(capture(emptyState(), "\u3000 テスト カ\u3099 \u3000", NOW, newId));
    expect(after.inbox[0].text).toBe("テスト ガ");
  });

  it("空・空白だけは入れない（理由は出さず、ボタンを押せなくするだけ）", () => {
    for (const text of ["", "   ", "　\t"]) {
      expect(capture(emptyState(), text, NOW, newId).ok).toBe(false);
      expect(captureTextError(text)).toBeNull();
      expect(canCapture(text)).toBe(false);
    }
  });

  it(`${CAPTURE_MAX_CHARS}字までは入れられ、超えたら今の文字数を添えて断る（絵文字は1文字と数える）`, () => {
    const max = "😀".repeat(CAPTURE_MAX_CHARS);
    expect(canCapture(max)).toBe(true);
    expect(ok(capture(emptyState(), max, NOW, newId)).inbox).toHaveLength(1);
    const over = "あ".repeat(CAPTURE_MAX_CHARS + 12);
    expect(captureTextError(over)).toBe(`${CAPTURE_MAX_CHARS}字までです（今 ${CAPTURE_MAX_CHARS + 12}字）`);
    expect(capture(emptyState(), over, NOW, newId)).toEqual({ ok: false, error: captureTextError(over) });
  });

  it("[@security] 改行と制御文字は入れない（保存の検証と同じ約束）", () => {
    for (const text of ["一行目\n二行目", "テスト\u0000", "テスト\u001b[31m"]) {
      expect(capture(emptyState(), text, NOW, newId).ok).toBe(false);
    }
  });

  it("[@security] 収集箱の件数の上限を超えない", () => {
    const state = emptyState();
    state.inbox = Array.from({ length: LIMITS.itemsPerList }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      text: "テスト",
      capturedAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    }));
    const r = capture(state, "もう1件", NOW, newId);
    expect(r.ok).toBe(false);
  });

  it("[@security] 状態全体の大きさの上限（600万字）を超えない", () => {
    const r = capture(fullState(), "もう1件", NOW, newId);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("上限") });
  });

  it("reducer の capture は、渡した時刻と id で収集し、「元に戻す」を出さない。読み込みの検証に通らない結果は反映しない", () => {
    const root = initialRoot(emptyState());
    const id = newId();
    const next = reducer(root, { type: "capture", text: "テスト用の項目", at: NOW.toISOString(), id });
    expect(next.state.inbox).toEqual([{ id, text: "テスト用の項目", capturedAt: NOW.toISOString(), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }]);
    expect(next.undo).toBeNull();
    // 同じ id で2回入れると、id の一意の検証に通らないので変えない
    expect(reducer(next, { type: "capture", text: "もう1件", at: NOW.toISOString(), id })).toBe(next);
    // 空白だけは変えない
    expect(reducer(next, { type: "capture", text: "  ", at: NOW.toISOString(), id: newId() })).toBe(next);
  });
});
